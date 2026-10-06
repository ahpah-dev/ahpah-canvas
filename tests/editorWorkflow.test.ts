import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSourceMatches, markSourceMatches, normalizeEditorSource, replaceSourceMatches, searchWorkspaceCommands } from '../src/components/engineering/editorSearch.ts';
import { highlightSource } from '../src/utils/sourceHighlight.ts';

test('find treats regex punctuation literally and preserves Unicode source offsets', () => {
  assert.deepEqual(findSourceMatches('a.b A.B a?b', 'a.b'), [{ start: 0, end: 3 }, { start: 4, end: 7 }]);
  assert.deepEqual(findSourceMatches('a.b A.B', 'a.b', true), [{ start: 0, end: 3 }]);
  assert.deepEqual(findSourceMatches('İI i 😀 I', 'i'), [{ start: 1, end: 2 }, { start: 3, end: 4 }, { start: 8, end: 9 }]);
  assert.deepEqual(findSourceMatches('hello', ''), []);
  assert.deepEqual(findSourceMatches('aaaa', 'aa'), [{ start: 0, end: 2 }, { start: 2, end: 4 }]);
});

test('Windows line endings use the same search offsets as the native editor without changing the project', () => {
  const imported = 'first\r\nconst total = 1;\r\nlast';
  const displayed = normalizeEditorSource(imported);
  assert.equal(displayed, 'first\nconst total = 1;\nlast');
  assert.deepEqual(findSourceMatches(displayed, 'total'), [{ start: 12, end: 17 }]);
  assert.equal(imported, 'first\r\nconst total = 1;\r\nlast');
  assert.equal(normalizeEditorSource('a\rb'), 'a\nb');
});

test('replacement uses original matches once and inserts dollar syntax literally', () => {
  const source = 'const total = total + total;';
  const matches = findSourceMatches(source, 'total', true);
  assert.equal(replaceSourceMatches(source, matches, '$&total'), 'const $&total = $&total + $&total;');
  assert.equal(replaceSourceMatches(source, [matches[1]], ''), 'const total =  + total;');
  assert.equal(replaceSourceMatches('aaaa', findSourceMatches('aaaa', 'aa'), 'aaa'), 'aaaaaa');
});

test('find highlights can cross syntax boundaries without changing source text', () => {
  const source = 'const message = "hello";\nconst name = "<hello>";';
  const tokens = highlightSource(source, 'JavaScript');
  const matches = findSourceMatches(source, '= "hello"');
  const marked = markSourceMatches(tokens, matches, 0);
  assert.equal(marked.map(token => token.text).join(''), source);
  assert.equal(marked.filter(token => token.match === 0).map(token => token.text).join(''), '= "hello"');
  const dense = 'x'.repeat(2000);
  const denseMarked = markSourceMatches([{ text: dense }], findSourceMatches(dense, 'x'), 1700);
  assert.equal(denseMarked.map(token => token.text).join(''), dense);
  assert.equal(denseMarked.length, 3);
  assert.equal(denseMarked[1].match, 1700);
});

test('commands match all query words and rank exact names without mutating entries', () => {
  const commands = [
    { id: 'nested', label: 'src/index.html', detail: 'HTML source file' },
    { id: 'preview', label: 'Open project preview', keywords: 'website browser' },
    { id: 'root', label: 'index.html', detail: 'HTML source file' },
  ];
  assert.deepEqual(searchWorkspaceCommands(commands, 'index.html').map(command => command.id), ['root', 'nested']);
  assert.deepEqual(searchWorkspaceCommands(commands, 'html src').map(command => command.id), ['nested']);
  assert.deepEqual(searchWorkspaceCommands(commands, 'website').map(command => command.id), ['preview']);
  assert.deepEqual(commands.map(command => command.id), ['nested', 'preview', 'root']);
  assert.deepEqual(searchWorkspaceCommands(commands, 'nothing matches'), []);
});
