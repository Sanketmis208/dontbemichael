'use strict';

/**
 * The attach picker (Ask me cards, the message bar, the queue composer) lets
 * the owner pick any file. Owner 2026-11-27: it opened on an Images filter, so
 * on macOS every PDF was greyed out and a bank statement could not be attached.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('the attach picker has no file type filter', () => {
  // Value: protects=the owner can attach a PDF or any document; fails_when=a filter comes back and macOS greys out files outside its first group; why_new=owner 2026-11-27; seam=source pin (the native dialog cannot run in node); no_claim=Windows or Linux dialog behavior
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');
  const start = main.indexOf("ipcMain.handle('dialog:attachFiles'");
  assert.ok(start > 0, 'the attach handler is there');
  const handler = main.slice(start, main.indexOf('\n});', start));
  assert.match(handler, /properties: \['openFile', 'multiSelections'\]/);
  assert.doesNotMatch(handler, /filters/, 'no filter, so no file is greyed out');
});
