'use strict';

/**
 * ⌘-click on a path in terminal output shows it in the file browser. The
 * matcher is the part that actually breaks: agent output is full of version strings and decimals
 * that look like filenames if the extension rule is loose.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const {
  isPathToken, pathTokenMatcher, stripPathToken
} = loadTs('src/shared/terminalPaths.ts');

/** Every token the provider would underline on one line of output. */
function tokensIn(line) {
  const re = pathTokenMatcher();
  const out = [];
  let m;
  while ((m = re.exec(line)) !== null) {
    const p = stripPathToken(m[0]);
    if (isPathToken(p)) out.push(p);
  }
  return out;
}

/* ---------------------------------------------------------------- *
 * matching — the part that goes wrong
 * ---------------------------------------------------------------- */

test('version strings and decimals are not files', () => {
  assert.deepEqual(tokensIn('bumped to v0.4.5 after 1.5 hours, cost $0.92'), []);
  assert.deepEqual(tokensIn('electron 43.0 and vite 7.1.2'), []);
});

test('a bare unknown extension needs a separator to count as a path', () => {
  // No separator and an extension we do not know: could be prose. Left alone.
  assert.deepEqual(tokensIn('the release is codenamed spring.thaw'), []);
  // Same extension, now unambiguously a path.
  assert.deepEqual(tokensIn('wrote out/spring.thaw'), ['out/spring.thaw']);
});

test('a known extension is a path with or without a separator', () => {
  assert.deepEqual(tokensIn('see RELEASE.md'), ['RELEASE.md']);
  assert.deepEqual(tokensIn('edited package.json'), ['package.json']);
});

test('several tokens on one line all resolve independently', () => {
  assert.deepEqual(
    tokensIn('moved src/main/updater.ts and build/icon.png, see RELEASE.md'),
    ['src/main/updater.ts', 'build/icon.png', 'RELEASE.md']
  );
});

test('shell and prose wrapping comes off, and so does :line', () => {
  assert.equal(stripPathToken('`src/main/index.ts`'), 'src/main/index.ts');
  assert.equal(stripPathToken('"docs/a.md",'), 'docs/a.md');
  assert.equal(stripPathToken('(build/icon.png)'), 'build/icon.png');
  assert.equal(stripPathToken('src/main/updater.ts:165'), 'src/main/updater.ts');
});

test('a :line suffix survives matching', () => {
  assert.deepEqual(tokensIn('fails at src/main/updater.ts:165'), ['src/main/updater.ts']);
});

test('absolute, home, and Windows paths are all recognised', () => {
  assert.deepEqual(tokensIn('at /Users/x/notes.md'), ['/Users/x/notes.md']);
  assert.deepEqual(tokensIn('at ~/HarnessAgents/board.md'), ['~/HarnessAgents/board.md']);
  assert.deepEqual(tokensIn('at C:\\Users\\x\\a.ts'), ['C:\\Users\\x\\a.ts']);
});

test('quoted paths with spaces keep their entire path, including the Windows drive', () => {
  assert.deepEqual(
    tokensIn('saved "C:\\Users\\Jane\\Business Reports\\summary.md"'),
    ['C:\\Users\\Jane\\Business Reports\\summary.md']
  );
  assert.deepEqual(tokensIn("saved '/Users/Jane/Business Reports/summary.md'"), ['/Users/Jane/Business Reports/summary.md']);
  assert.deepEqual(tokensIn('saved `~/Business Reports/summary.md`'), ['~/Business Reports/summary.md']);
  assert.deepEqual(tokensIn('saved "./Business Reports/summary.md"'), ['./Business Reports/summary.md']);
  assert.deepEqual(tokensIn('saved "../Business Reports/summary.md"'), ['../Business Reports/summary.md']);
  assert.deepEqual(tokensIn('saved "\\Business Reports\\summary.md"'), ['\\Business Reports\\summary.md']);
});

test('quoted paths coexist with unquoted paths and preserve line suffix handling', () => {
  assert.deepEqual(
    tokensIn('see "./src/my folder/index.ts:42", build/icon.png and \'./docs/my notes.md\''),
    ['./src/my folder/index.ts', 'build/icon.png', './docs/my notes.md']
  );
});

test('quoted prose keeps linking the file name inside it', () => {
  assert.deepEqual(tokensIn('git commit -m "Update README.md"'), ['README.md']);
  assert.deepEqual(tokensIn('error: "Could not read config.yml"'), ['config.yml']);
  assert.deepEqual(tokensIn("Michael's notes: see plan.md' later"), ['plan.md']);
});

test('quoted prose that starts with a slash links only the file name inside it', () => {
  assert.deepEqual(tokensIn('note: "/ see notes.md"'), ['notes.md']);
  assert.deepEqual(tokensIn("note: '/ see notes.md'"), ['notes.md']);
  assert.deepEqual(tokensIn('note: `./ then open plan.md`'), ['plan.md']);
  // a real path with spaces inside its folder names still links whole
  assert.deepEqual(tokensIn('saved "/Users/Jane/Business Reports/summary.md"'), ['/Users/Jane/Business Reports/summary.md']);
});

test('quoted versions and prose do not become file paths', () => {
  assert.deepEqual(tokensIn('version "v0.4.5", cost \'0.92\', called `spring.thaw`'), []);
});

test('a dotted directory name cannot masquerade as an extension', () => {
  // extensionOf looks at the LAST segment only, so v1.2 here is not the extension.
  assert.deepEqual(tokensIn('see reports/v1.2/summary.md'), ['reports/v1.2/summary.md']);
});

test('case does not decide whether a bare name is a path', () => {
  assert.equal(isPathToken('README.MD'), true);
  assert.equal(isPathToken('App.TSX'), true);
});

test('a link covers the cells of its path, past wide characters and inside its quotes', () => {
  // Value: protects=the underline and click land on the path when the line holds Chinese text or quotes; fails_when=string offsets are used as cell columns or the quotes are underlined; why_new=design review of #280; seam=none
  const { linkCellRange } = loadTs('src/shared/terminalPaths.ts');
  const cellsFor = (s) => [...s].flatMap((ch) => (/[一-鿿]/.test(ch) ? [{ chars: ch, width: 2 }, { chars: '', width: 0 }] : [{ chars: ch, width: 1 }]));
  const line = '报告 "/tmp/a b.md"';
  const raw = '"/tmp/a b.md"';
  const start = line.indexOf(raw);
  assert.deepEqual(linkCellRange(cellsFor(line), start, start + raw.length, raw), { startX: 7, endX: 17 });
  const plain = 'see notes.md';
  assert.deepEqual(linkCellRange(cellsFor(plain), 4, 12, 'notes.md'), { startX: 5, endX: 12 });
});

test('a dotfile is named by its type: .gitignore, .env and .npmrc are paths alone', () => {
  // Value: protects=a bare known dotfile links without a separator; fails_when=the dotfile rule is dropped or extensionOf's no-extension answer wins; why_new=gitignore, dockerignore, env and npmrc never matched a real dotfile; seam=none; no_claim=a long dotfile name as a token, which waits on the longer extension fix (#190)
  for (const p of ['.gitignore', '.dockerignore', '.env', '.npmrc', '.editorconfig']) {
    assert.equal(isPathToken(p), true, p);
  }
  assert.deepEqual(tokensIn('wrote ./.env and ~/.npmrc'), ['./.env', '~/.npmrc']);
  // A bare dotfile that is not on the list needs a separator, and a name with
  // a real extension after the dot keeps it.
  assert.equal(isPathToken('.bashrc'), false);
  assert.equal(isPathToken('~/.bashrc'), true);
  assert.equal(isPathToken('.env.local'), false);
  assert.equal(isPathToken('.eslintrc.json'), true);
});

test('extensions longer than 8 characters match without truncation', () => {
  // Bare properties file (10-char extension in KNOWN_EXTS)
  assert.deepEqual(tokensIn('check application.properties for db config'), ['application.properties']);

  // Quoted path containing spaces and explicit path prefix
  assert.deepEqual(tokensIn('saved "./My Docs/app.properties" in project'), ['./My Docs/app.properties']);

  // Windows path with long extension
  assert.deepEqual(tokensIn('configured C:\\proj\\settings.properties successfully'), ['C:\\proj\\settings.properties']);

  // Existing short extensions and version-like strings behave correctly
  assert.deepEqual(tokensIn('built src/index.ts in v0.4.5 after 1.5 hours'), ['src/index.ts']);
});
