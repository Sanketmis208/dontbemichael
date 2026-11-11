'use strict';

// The voice completion toast was English only, in an app that ships Arabic and Chinese.
// Structural checks: the renderer has no DOM test harness here.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('the completion toast has no English written in', () => {
  const toast = read('src/renderer/src/realtime/CompletionToast.tsx');
  assert.doesNotMatch(toast, /aria-label="|· completed|'the orchestrator'/);
  assert.match(toast, /t\('completionToast\.completed', \{ name: godName \}\)/);
});

test('the new strings are in each language', () => {
  for (const locale of ['en', 'zh-CN', 'ar']) {
    const d = JSON.parse(read(`src/renderer/src/i18n/locales/${locale}.json`));
    for (const k of ['orchestrator', 'completed', 'dismiss']) assert.ok(d.completionToast?.[k], `${locale} completionToast.${k}`);
    assert.match(d.completionToast.completed, /\{\{name\}\}/, `${locale} names Michael`);
  }
});
