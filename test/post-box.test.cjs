'use strict';

/**
 * The text a draft is meant to post or send (owner, 2026-11-10: Copy took a
 * LinkedIn draft's notes along with the post). Members put it in a fenced
 * block tagged `post`; the file tab shows it as a box with its own Copy, and
 * the header Copy takes only it when the page has exactly one. The rules are
 * pure (fileTabCopy.ts); the wiring is pinned in the source, as the repo's
 * renderer tests do.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const C = loadTs('src/renderer/src/components/fileTabCopy.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

const POST = [
  'Here is a test worth running before your next campaign. Opt one test contact out.',
  '',
  'Read the post: https://example.com/blog/opted-out',
  '',
  '#ContactPreferences #Salesforce #HubSpot'
].join('\n');

test('only a block tagged post is a post box', () => {
  // Value: protects=a post box is opted into by its tag, so every other code block stays code; fails_when=untagged or other languages render as a post, or the tag is missed in any case form; why_new=new block; seam=pure; no_claim=react-markdown's class naming (pinned below)
  assert.equal(C.isPostLang(['language-post']), true);
  assert.equal(C.isPostLang('language-POST'), true);
  assert.equal(C.isPostLang(['hljs', 'language-post']), true);
  for (const no of [undefined, null, '', [], ['language-json'], 'language-poster', ['post']]) assert.equal(C.isPostLang(no), false, String(no));
});

test('Copy puts the post on the clipboard exactly as written', () => {
  // Value: protects=hashtags, links and paragraph breaks paste into LinkedIn untouched, and a rich editor gets the same paragraphs; fails_when=a hashtag line is lost, text is reflowed, HTML is unescaped, or line breaks vanish; why_new=new copy; seam=pure; no_claim=the system clipboard (copyRich, tested in copy-document)
  const out = C.postCopy(POST);
  assert.equal(out.text, POST);
  assert.equal(out.html, '<p>Here is a test worth running before your next campaign. Opt one test contact out.</p><p>Read the post: https://example.com/blog/opted-out</p><p>#ContactPreferences #Salesforce #HubSpot</p>');
  // A single line break stays one; Windows line ends and blank edges are tidied.
  assert.deepEqual(C.postCopy('Best,\r\nVikram\r\n\r\n\r\nP.S. <soon> & more\n\n'), {
    text: 'Best,\nVikram\n\nP.S. <soon> & more',
    html: '<p>Best,<br>Vikram</p><p>P.S. &lt;soon&gt; &amp; more</p>'
  });
  assert.deepEqual(C.postParagraphs('a\n \nb'), [['a'], ['b']], 'a line of spaces parts paragraphs too');
});

test('the header Copy takes the one post box, and the whole page otherwise', () => {
  // Value: protects=a draft with one post copies just the post, and pages with none or several keep the old whole page copy; fails_when=notes ride along, or several boxes are silently merged or one picked; why_new=new choice; seam=pure; no_claim=the DOM query (pinned below)
  assert.equal(C.onePost([]), null);
  assert.equal(C.onePost(['a', 'b']), null);
  assert.deepEqual(C.onePost([POST]), C.postCopy(POST));
});

test('the whole page copy never pastes the box\'s Copy button', () => {
  // Value: protects=a page with several boxes copies their words, not the word Copy; fails_when=the button text leaks into a paste; why_new=new control inside the page; seam=fake nodes through the shared serializer; no_claim=the real DOM
  const t = (s) => ({ nodeType: 3, nodeName: '#text', childNodes: [], textContent: s });
  const el = (name, attrs, ...kids) => {
    const childNodes = kids.map((k) => (typeof k === 'string' ? t(k) : k));
    return { nodeType: 1, nodeName: name.toUpperCase(), childNodes, get textContent() { return childNodes.map((c) => c.textContent).join(''); }, getAttribute: (n) => (attrs && n in attrs ? attrs[n] : null) };
  };
  const box = el('div', { class: 'cth-md-post', 'data-post-text': 'Hello' },
    el('div', { class: 'cth-md-post-bar' }, el('button', { type: 'button' }, 'Copy')),
    el('p', null, 'Hello', el('br', null), 'world'));
  const out = C.cleanCopy(el('div', null, el('p', null, 'Notes'), box));
  assert.equal(out.text, 'Notes\n\nHello\nworld');
  assert.ok(!/Copy/.test(out.html));
});

test('the page draws a post block as the box, and the header Copy reads it', () => {
  // Value: protects=the box renders from a post tagged fence, copies its own text, and the header picks it; fails_when=the pre override, the data attribute or the header choice drift; why_new=new wiring; seam=source pins; no_claim=a rendered page (renderer not run)
  const md = read('src/renderer/src/markdown/MarkdownPreview.tsx');
  assert.match(md, /pre: \(\{ node, \.\.\.props \}\) => \{[\s\S]{0,400}isPostLang\(code\.properties\?\.className\)[\s\S]{0,200}<PostBox text=\{hastText\(code\)\.replace\(\/\\n\$\/, ''\)\} \/>/);
  const box = read('src/renderer/src/markdown/PostBox.tsx');
  assert.match(box, /window\.cth\.copyRich\(postCopy\(text\)\)/);
  assert.match(box, /data-post-text=\{text\}/);
  assert.match(box, /<button type="button"/, 'a button, so the page copy drops it');
  const tab = read('src/renderer/src/components/FileTabView.tsx');
  assert.match(tab, /querySelectorAll<HTMLElement>\('\[data-post-text\]'\)/);
  assert.match(tab, /data = onePost\(postTexts\(\)\) \?\? cleanCopy\(scroller\.current\)/);
  assert.match(tab, /t\(posts === 1 \? 'fileTab\.copyPost' : 'fileTab\.copy'\)/);
  for (const loc of ['en', 'ar', 'zh-CN']) {
    const d = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`));
    for (const v of [d.fileTab?.copyPost, d.markdown?.copyPost]) {
      assert.ok(typeof v === 'string' && v, `${loc} copyPost`);
      assert.ok(!/[–—]|\s-\s/.test(v), `${loc}: no dashes`);
    }
  }
});

test('every member and Michael are told to put the text to post in one post block', () => {
  // Value: protects=agents write drafts the box can find; fails_when=the rule is dropped from the folder line or loses its fence or its notes outside instruction; why_new=new agent rule (owner, 2026-11-10); seam=source pin; no_claim=whether agents follow it
  const hive = read('src/main/hive.ts');
  assert.match(hive, /Save documents, drafts and other work outside it\. You can open PDFs and images directly\. \$\{POST_BLOCK_RULE\}`/);
  const rule = hive.slice(hive.indexOf('export const POST_BLOCK_RULE'), hive.indexOf('const HOP_CAP'));
  assert.match(rule, /one fenced block tagged post: a line with ```post, the text, then a line with ```/);
  assert.match(rule, /keep the status, sources and notes for the owner outside it/);
  assert.ok(!/[–—]/.test(rule), 'no dashes in agent text the owner may read');
});
