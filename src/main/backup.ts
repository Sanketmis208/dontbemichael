/**
 * Back up everything on this computer, and restore it on a new one
 * (docs/designs/backup-restore.md; owner 2026-11-19: everything on this Mac in
 * one file, the team's working folders included, passwords and keys sealed
 * with a backup password).
 *
 *   Back up                                   Restore (a new computer)
 *   ─────────────────────────────────         ─────────────────────────────────
 *   roots: the app's data folder (an           the backup password opens the
 *     allow list, no caches), each office       secrets first: wrong, nothing is
 *     folder, each business and team folder,    written
 *     the team's Claude conversations          every file to its root's place,
 *   the database as a consistent snapshot       paths under the old home folder
 *   secrets: decrypted here, sealed with the    moved to this one's; a document
 *     backup password                           already there is kept
 *   one .dbmbackup file (backupArchive.ts)     paths inside the app's own JSON
 *                                               and the database follow; the
 *                                               secrets are locked to this Mac
 *
 * What cannot move: the Claude sign in (Keychain) and its connectors (the
 * claude.ai account). After a restore the owner signs in again, and the
 * connectors come back with the account.
 *
 * No electron import here: the caller hands in where things are and how to
 * reach the secrets and the database, so it tests as a node module.
 */
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { BackupWriter, readEntries, readManifest, safeTarget, type EntryHeader } from './backupArchive';
import { openSecrets, sealSecrets, type SealedSecrets } from './backupSecrets';
import { isUsableTeamFolder } from './officeFile';
import { APP_DATA_ENTRIES, APP_DATA_KEPT, CHECK_FOLDERS } from './factoryReset';

export type RootKind = 'userData' | 'office' | 'folder' | 'claude';

export interface BackupManifest {
  v: 1;
  createdAt: number;
  appVersion: string;
  platform: string;
  /** The home folder it was made under: paths under it move to the new one's. */
  home: string;
  roots: Record<string, { kind: RootKind; path: string }>;
  /** Business names, for the restore screen. */
  businesses: string[];
  secrets?: SealedSecrets;
}

/** What the restore screen shows before anything is written. */
export interface BackupSummary {
  createdAt: number;
  appVersion: string;
  businesses: string[];
  hasSecrets: boolean;
  fromOtherHome: boolean;
}

/** The app's own files a backup carries: those a reset erases or keeps on
 *  purpose (factoryReset.ts, so a new one is never forgotten), each business's
 *  place, and the window's saved state; not the secrets file (sealed apart),
 *  the database (a snapshot), caches, or scratch folders. */
const LEFT_OUT = new Set<string>([
  'integration-secrets.json', 'harness.db', 'harness.db-wal', 'harness.db-shm', 'opened-attachments',
  'last-run-version', 'updater.log', 'hero.json', 'model-catalog.json', 'skill-catalog.json', 'trigger-history.json',
  ...CHECK_FOLDERS
]);
export const USER_DATA_ITEMS: readonly string[] = [
  ...new Set([...APP_DATA_ENTRIES, ...APP_DATA_KEPT, 'offices', 'Local Storage', 'config.before-offices.json'])
].filter((n) => !LEFT_OUT.has(n));

/** Never carried, wherever they are. `.credentials.json` is where Claude Code
 *  keeps its sign in off macOS (a business with its own Claude login has one
 *  in its place): a sign in is never in a backup, the owner signs in again. */
const SKIP_NAMES = new Set(['.DS_Store', 'node_modules', 'hooks.sock', 'Thumbs.db', '.credentials.json']);
/** A backup file is never carried, so a backup saved in a business's folder
 *  holds neither itself nor the ones before it. */
const isBackupFile = (n: string): boolean => n.toLowerCase().endsWith('.dbmbackup');

export interface BackupSource {
  userData: string;
  home: string;
  appVersion: string;
  platform: string;
  /** config.json as stored. */
  config: Record<string, unknown>;
  /** Where Claude keeps a folder's conversations, when it has any. */
  claudeDirFor: (folder: string) => string | null;
  /** Write a consistent copy of the database to `dest`; false when there is none. */
  dbSnapshot: (dest: string) => Promise<boolean>;
  /** Every saved secret, decrypted. */
  secrets: () => Record<string, string>;
  onProgress?: (files: number, bytes: number) => void;
}

const holdsOffice = (p: string): boolean => existsSync(join(p, 'hive', 'registry.json'));
const isDir = (p: string): boolean => { try { return statSync(p).isDirectory(); } catch { return false; } };
const inside = (child: string, parent: string): boolean => {
  const c = resolve(child), p = resolve(parent);
  return c === p || c.startsWith(p + sep);
};

/** Each business's settings: per office once moved, else the top of config.json. */
function businessSettings(cfg: Record<string, unknown>): Array<Record<string, unknown>> {
  const offices = cfg.offices as Record<string, { settings?: Record<string, unknown> }> | undefined;
  if (cfg.officesMigrated && offices) return Object.values(offices).map((e) => e?.settings ?? {});
  return [cfg];
}

/** The folders a backup carries: offices, then business and team folders that
 *  are not inside one already taken. */
export function backupRoots(src: Pick<BackupSource, 'config' | 'home'>): { offices: string[]; folders: string[]; names: string[] } {
  const cfg = src.config;
  const offices: string[] = [];
  const add = (list: string[], p: unknown): void => {
    if (typeof p !== 'string' || !p.trim()) return;
    const r = resolve(p);
    if (!list.some((x) => resolve(x) === r)) list.push(r);
  };
  add(offices, cfg.harnessHome);
  for (const h of (cfg.recentHives as unknown[] | undefined) ?? []) add(offices, h);
  for (const e of Object.values((cfg.offices as Record<string, { home?: string }> | undefined) ?? {})) add(offices, e?.home);
  // Only folders a restore puts back (restorableFolder), so a backup never
  // carries one that would be left out on the other computer.
  const officeRoots = offices.filter((o) => holdsOffice(o) && restorableFolder(o, src.home));

  const wanted: string[] = [];
  const names: string[] = [];
  for (const s of businessSettings(cfg)) {
    if (typeof s.businessName === 'string' && s.businessName.trim()) names.push(s.businessName.trim());
    add(wanted, s.businessFolder);
    for (const m of (s.businessTeam as Array<{ folder?: string }> | undefined) ?? []) add(wanted, m?.folder);
    for (const r of (s.registeredRepos as unknown[] | undefined) ?? []) add(wanted, r);
  }
  // Outermost first, so a team folder inside the business folder is not taken twice.
  const folders: string[] = [];
  for (const f of wanted.sort((a, b) => a.length - b.length)) {
    if (!isDir(f) || !restorableFolder(f, src.home)) continue;
    if (folders.some((x) => inside(f, x)) || officeRoots.some((o) => inside(f, o))) continue;
    folders.push(f);
  }
  return { offices: officeRoots, folders, names: [...new Set(names)] };
}

/** Every regular file under `dir`, skipping links, sockets, SKIP_NAMES and any
 *  folder in `except` (another root, carried on its own). */
function* walk(dir: string, except: string[]): Generator<string> {
  let names: string[] = [];
  try { names = readdirSync(dir); } catch { return; }
  for (const n of names) {
    if (SKIP_NAMES.has(n) || isBackupFile(n)) continue;
    const p = join(dir, n);
    if (except.some((x) => resolve(x) === resolve(p))) continue;
    let st;
    try { st = lstatSync(p); } catch { continue; }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) yield* walk(p, except);
    else if (st.isFile()) yield p;
  }
}

/** Agents' working folders, for their Claude conversations: the business and
 *  team folders, and each office's members (its registry). */
function agentFolders(offices: string[], folders: string[], cfg: Record<string, unknown>): string[] {
  const out = new Set<string>(folders.map((f) => resolve(f)));
  for (const s of businessSettings(cfg)) for (const m of (s.businessTeam as Array<{ folder?: string }> | undefined) ?? []) if (m?.folder) out.add(resolve(m.folder));
  for (const o of offices) {
    try {
      const reg = JSON.parse(readFileSync(join(o, 'hive', 'registry.json'), 'utf8')) as { agents?: Record<string, { cwd?: string }> };
      for (const a of Object.values(reg.agents ?? {})) if (typeof a?.cwd === 'string' && a.cwd) out.add(resolve(a.cwd));
    } catch { /* an office without a readable registry */ }
  }
  return [...out];
}

/** Write the backup. Throws when it cannot be written (the partial file is the caller's to remove). */
export async function writeBackup(outPath: string, password: string, src: BackupSource): Promise<{ files: number; bytes: number }> {
  const { offices, folders, names } = backupRoots(src);
  const roots: BackupManifest['roots'] = { u: { kind: 'userData', path: src.userData } };
  offices.forEach((o, i) => { roots[`o${i}`] = { kind: 'office', path: o }; });
  folders.forEach((f, i) => { roots[`f${i}`] = { kind: 'folder', path: f }; });
  const claude: Array<[string, string]> = [];
  agentFolders(offices, folders, src.config).filter((f) => restorableFolder(f, src.home)).forEach((folder) => {
    const dir = src.claudeDirFor(folder);
    if (dir && isDir(dir)) { const id = `c${claude.length}`; roots[id] = { kind: 'claude', path: folder }; claude.push([id, dir]); }
  });
  const secrets = src.secrets();
  const manifest: BackupManifest = {
    v: 1, createdAt: Date.now(), appVersion: src.appVersion, platform: src.platform, home: src.home, roots,
    businesses: names,
    ...(Object.keys(secrets).length ? { secrets: sealSecrets(secrets, password) } : {})
  };

  const w = new BackupWriter(outPath, manifest);
  const tick = (): void => { const c = w.counts; src.onProgress?.(c.files, c.bytes); };
  const put = async (root: string, base: string, abs: string): Promise<void> => {
    let st;
    try { st = statSync(abs); } catch { return; }
    await w.addFile(root, relative(base, abs), abs, st.mode, st.mtimeMs, st.size);
    if (w.counts.files % 50 === 0) tick();
  };
  // The app's own files, then the database as one consistent snapshot.
  for (const item of USER_DATA_ITEMS) {
    const p = join(src.userData, item);
    if (!existsSync(p)) continue;
    if (statSync(p).isDirectory()) { for (const f of walk(p, [])) await put('u', src.userData, f); }
    else await put('u', src.userData, p);
  }
  const snap = join(src.userData, `harness.db.backup-${process.pid}.tmp`);
  try {
    if (await src.dbSnapshot(snap)) await w.addBuffer('u', 'harness.db', readFileSync(snap), 0o600);
  } finally {
    rmSync(snap, { force: true });
  }
  const everyRoot = [...offices, ...folders];
  for (const [id, r] of Object.entries(roots)) {
    if (r.kind === 'office' || r.kind === 'folder') {
      for (const f of walk(r.path, everyRoot.filter((x) => resolve(x) !== resolve(r.path)))) await put(id, r.path, f);
    }
  }
  for (const [id, dir] of claude) for (const f of walk(dir, [])) await put(id, dir, f);
  const done = await w.finish();
  src.onProgress?.(done.files, done.bytes);
  return done;
}

/** Throws 'wrong password' when the backup's secrets do not open with it (and
 *  'not a backup file' when it is not one); a backup without secrets needs none. */
export async function checkBackupPassword(path: string, password: string): Promise<void> {
  const m = await readManifest<BackupManifest>(path);
  if (!m || m.v !== 1 || !m.roots) throw new Error('not a backup file');
  if (m.secrets) openSecrets(m.secrets, password);
}

/** The backup file's suggested name: letters, digits and underscores only
 *  (owner, 2026-11-19), so it moves through any drive, cloud or email intact:
 *  Dont_Be_Michael_backup_2026_11_19.dbmbackup. */
export function backupFileName(now: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `Dont_Be_Michael_backup_${now.getFullYear()}_${pad(now.getMonth() + 1)}_${pad(now.getDate())}.dbmbackup`;
}

/** What is in a backup, for the restore screen. Throws 'not a backup file'. */
export async function inspectBackup(path: string, home: string): Promise<BackupSummary> {
  const m = await readManifest<BackupManifest>(path);
  if (!m || m.v !== 1 || !m.roots || typeof m.home !== 'string') throw new Error('not a backup file');
  return {
    createdAt: m.createdAt, appVersion: m.appVersion, businesses: Array.isArray(m.businesses) ? m.businesses : [],
    hasSecrets: !!m.secrets, fromOtherHome: resolve(m.home) !== resolve(home)
  };
}

/** A path from the backup's computer, moved to this one: under the old home
 *  folder, it goes under this home folder; anywhere else, it stays. */
export function movePath(p: string, oldHome: string, newHome: string): string {
  const o = resolve(oldHome);
  const r = resolve(p);
  if (r === o) return resolve(newHome);
  return r.startsWith(o + sep) ? join(resolve(newHome), r.slice(o.length + 1)) : r;
}

/** The old home folder in text (JSON), moved to the new one, only where it is a
 *  whole folder: "/Users/sam/" and "/Users/sam\"" but never "/Users/samuel". */
export function movePathsInText(text: string, oldHome: string, newHome: string): string {
  if (resolve(oldHome) === resolve(newHome)) return text;
  const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const forms = [[oldHome, newHome], [JSON.stringify(oldHome).slice(1, -1), JSON.stringify(newHome).slice(1, -1)]];
  let out = text;
  for (const [from, to] of forms) out = out.replace(new RegExp(`${esc(from)}(?=[\\\\/"])`, 'g'), to);
  return out;
}

/** A path with its links followed as far as it exists on the disk; the parts
 *  not there yet are added as written (they cannot be links). */
function onDisk(p: string): string | null {
  let d = resolve(p);
  const rest: string[] = [];
  while (!existsSync(d) && dirname(d) !== d) { rest.unshift(basename(d)); d = dirname(d); }
  try { return join(realpathSync.native(d), ...rest); } catch { return null; }
}

/** Whether `target` is still inside `base` once links already on the disk are
 *  followed: a folder there that is a link elsewhere never takes a file. */
function staysInside(base: string, target: string): boolean {
  const root = onDisk(base);
  const at = onDisk(dirname(target));
  if (!root || !at) return false;
  return at === root || at.startsWith(root + sep);
}

const ROOT_KINDS = new Set<RootKind>(['userData', 'office', 'folder', 'claude']);

/** A folder a restore may write into: one setup could choose for a team
 *  (isUsableTeamFolder), and not a dot folder anywhere under home. */
export function restorableFolder(folder: string, home: string): boolean {
  if (!isAbsolute(folder)) return false;
  // Checked as written and where it really leads: a link, a junction or a
  // Windows short name that ends in a kept folder is that folder.
  const real = onDisk(folder);
  const realHome = onDisk(home);
  if (!real || !realHome) return false;
  const fold = process.platform === 'darwin' || process.platform === 'win32' ? (p: string) => p.toLowerCase() : (p: string) => p;
  for (const [f, h] of [[resolve(folder), resolve(home)], [real, realHome]]) {
    if (!isUsableTeamFolder(f, h)) return false;
    const rel = relative(fold(h), fold(f));
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) continue;
    const parts = rel.split(sep);
    // Windows keeps settings and login items in AppData, as a Mac does in Library.
    if (parts[0] === 'appdata' || parts[0] === 'AppData' || parts.some((part) => part.startsWith('.'))) return false;
  }
  return true;
}

export interface RestoreTarget {
  userData: string;
  home: string;
  claudeDirFor: (folder: string) => string;
  /** Lock the secrets to this computer. False when it cannot. */
  importSecrets: (secrets: Record<string, string>) => boolean;
  /** Move office paths kept in the database (the Pulse office column). */
  moveDbPaths: (dbPath: string, oldHome: string, newHome: string) => void;
}

/**
 * Put a backup back. The secrets are opened first, so a wrong password writes
 * nothing. Returns what was written and skipped; throws 'wrong password',
 * 'not a backup file', 'the backup file is cut short' or 'secrets not saved'.
 * The caller stops the app's services before and reopens the app after.
 */
export async function restoreBackup(path: string, password: string, t: RestoreTarget): Promise<{ written: number; skipped: number }> {
  const m = await readManifest<BackupManifest>(path);
  if (!m || m.v !== 1 || !m.roots || typeof m.home !== 'string') throw new Error('not a backup file');
  const secrets = m.secrets ? openSecrets(m.secrets, password) : {};
  const to = (p: string): string => movePath(p, m.home, t.home);
  const bases: Record<string, { kind: RootKind; base: string }> = {};
  for (const [id, r] of Object.entries(m.roots)) {
    if (!r || typeof r.path !== 'string' || !ROOT_KINDS.has(r.kind)) continue;
    if (r.kind === 'userData') { bases[id] = { kind: r.kind, base: t.userData }; continue; }
    // The backup names its own folders: each must be one a team could work
    // in, never the home folder, a dot folder in it or Library, so a crafted
    // file cannot write into the owner's settings, keys or login items.
    const folder = to(r.path);
    if (!restorableFolder(folder, t.home)) continue;
    if (r.kind === 'claude') { bases[id] = { kind: r.kind, base: t.claudeDirFor(folder) }; continue; }
    // An office's files replace the office they came from; a folder that is
    // there and is not that office keeps what it holds, like a business folder.
    const isOffice = r.kind === 'office' && (!existsSync(folder) || existsSync(join(folder, 'hive', 'registry.json')));
    bases[id] = { kind: isOffice ? 'office' : 'folder', base: folder };
  }
  const counts = await readEntries(path, (h: EntryHeader) => {
    const b = bases[h.r];
    if (!b) return null;
    const target = safeTarget(b.base, h.p);
    if (!target || !staysInside(b.base, target)) return null;
    // A document already on this computer is the owner's: it stays as it is.
    if (b.kind === 'folder' && existsSync(target)) return null;
    return target;
  });

  // Paths the app keeps in its own files and its database follow the move.
  if (resolve(m.home) !== resolve(t.home)) {
    const textRoots = Object.values(bases).filter((b) => b.kind === 'userData' || b.kind === 'office').map((b) => b.base);
    for (const root of textRoots) {
      for (const f of walk(root, [])) {
        if (!/\.(json|jsonl)$/.test(f) || basename(f) === 'harness.db') continue;
        try {
          if (statSync(f).size > 50 * 1024 * 1024) continue;
          const before = readFileSync(f, 'utf8');
          const after = movePathsInText(before, m.home, t.home);
          if (after !== before) writeFileSync(f, after);
        } catch { /* left as it was */ }
      }
    }
    const db = join(t.userData, 'harness.db');
    if (existsSync(db)) t.moveDbPaths(db, m.home, t.home);
  }
  if (Object.keys(secrets).length && !t.importSecrets(secrets)) throw new Error('secrets not saved');
  return counts;
}
