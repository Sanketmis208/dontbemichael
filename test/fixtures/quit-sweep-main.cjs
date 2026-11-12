'use strict';
/**
 * Electron main fixture for test/quit-sweep.electron.test.cjs — runs INSIDE
 * Electron (real lifecycle, real ConPTY-patched node-pty, which is rebuilt for
 * Electron's ABI and therefore unloadable from plain Node).
 *
 * Mirrors the app's REAL quit flow (src/main/index.ts) to pin two Windows quit
 * bugs at once:
 *
 * 1. The tree leak: spawn a real PTY whose child has a child of its own,
 *    record the live tree's PIDs to --pid-file, then run PtyManager.killAll()
 *    on the quit path. Pre-fix, ensureKilled's 4s unref'd taskkill timer could
 *    never fire before the process exited, so the tree survived the app; the
 *    synchronous win32 sweep must kill it here.
 *
 * 2. The quit hang: in the real app, quitting teardownAndQuit-style (killAll +
 *    app.quit() inside the confirm-close IPC invoke, window still open) once
 *    left Electron's internal is-quitting state wedged, through a will-quit
 *    handler that deferred the quit to flush usage stats. That handler is gone
 *    with the usage stats, so the app quits on Electron's own path. This
 *    fixture runs the same flow end-to-end (window, IPC-triggered teardown)
 *    and the outer test requires a clean exit 0.
 */
const { app, BrowserWindow } = require('electron');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { descendantsFromSnapshot } = require('./process-tree.cjs');

const pidFile = process.argv.find((a) => a.startsWith('--pid-file='))?.slice('--pid-file='.length);

function bail(code, message) {
  try {
    if (pidFile) fs.writeFileSync(pidFile, JSON.stringify({ error: message }), 'utf8');
  } catch { /* the outer test will report the missing file instead */ }
  console.error(`[fixture] ${message}`);
  app.exit(code);
}

/** All live descendants of `root`, walked from one Win32_Process snapshot.
 *  Each row carries its creation time, so a process that only names a reused
 *  id as its parent is not taken for a child (see process-tree.cjs). */
function descendantsOf(root) {
  const raw = execFileSync('powershell.exe', [
    '-NoProfile', '-Command',
    'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,' +
      '@{n=\'Created\';e={if ($_.CreationDate) { ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() } else { 0 }}} ' +
      '| ConvertTo-Json -Compress'
  ], { encoding: 'utf8', timeout: 30_000, windowsHide: true });
  return descendantsFromSnapshot(JSON.parse(raw), root);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Belt-and-braces: if anything below wedges, die loudly instead of hanging the
// outer test until its own timeout. A clean quit on the happy path preempts this.
setTimeout(() => bail(4, 'fixture timed out'), 45_000);

// Mirror src/main/index.ts's quit-adjacent handler set. Their PRESENCE matters:
// a registered window-all-closed listener suppresses Electron's own
// default-quit path, which changes the internal quit state flow.
let teardown = () => app.quit(); // rebound once the PtyManager exists
app.on('before-quit', () => { /* app checks allowQuit + pty count here */ });
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') teardown();
});

app.whenReady().then(async () => {
  if (!pidFile) return bail(2, 'missing --pid-file argument');

  // Match the app's trigger conditions: a window OPEN when quit starts, with
  // the quit invoked over IPC from that window — the "kill all & quit" confirm
  // dialog runs teardownAndQuit inside app:confirmClose while the window is
  // still up.
  const win = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  await win.loadURL('data:text/html,<html><body>quit fixture</body></html>');

  const loadTs = require('../load-ts.cjs');
  const { PtyManager } = loadTs('src/main/pty.ts');
  const mgr = new PtyManager();

  // powershell (PTY root) that starts a hidden child powershell — a minimal
  // stand-in for an agent CLI with helper processes of its own.
  const psExe = path.join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'
  );
  const script =
    `Start-Process -WindowStyle Hidden -FilePath '${psExe}' ` +
    `-ArgumentList '-NoProfile','-Command','Start-Sleep 300'; Start-Sleep 300`;
  const res = mgr.spawn({
    id: 'quit-sweep-fixture',
    cwd: os.tmpdir(),
    command: psExe,
    args: ['-NoProfile', '-Command', script]
  });
  if (!res.ok) return bail(2, `pty spawn failed: ${res.error}`);
  const rootPid = mgr.list()[0]?.pid;
  if (!rootPid) return bail(2, 'pty spawned but reported no pid');

  // Wait until the grandchild exists — killing a tree of one proves nothing.
  let pids = [];
  for (let i = 0; i < 30 && pids.length < 2; i++) {
    await sleep(500);
    pids = [rootPid, ...descendantsOf(rootPid)];
  }
  if (pids.length < 2) return bail(2, `tree never grew a descendant (root ${rootPid})`);
  fs.writeFileSync(pidFile, JSON.stringify({ root: rootPid, pids }), 'utf8');

  // The quit path under test, exactly as the app runs it: the renderer invokes
  // a handle (app:confirmClose), and INSIDE that pending invoke main runs
  // killAll + app.quit() with the window still open.
  const { ipcMain } = require('electron');
  teardown = () => { mgr.killAll(); app.quit(); };
  ipcMain.handle('fixture:confirmClose', () => teardown());
  void win.webContents.executeJavaScript(
    `require('electron').ipcRenderer.invoke('fixture:confirmClose')`
  );
}).catch((e) => bail(3, `fixture threw: ${e?.stack || e}`));
