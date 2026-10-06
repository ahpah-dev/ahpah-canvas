import { test } from 'node:test';
import assert from 'node:assert/strict';
import { highlightSource, sourceLanguage } from '../src/utils/sourceHighlight.ts';

test('the visible editor mirror preserves literal source, including incomplete edits', () => {
  const samples = [
    ['HTML', '<!-- comment -->\n<div data-name="<&>">你好 &amp; hello</div>\n<a href="unfinished'],
    ['JavaScript', 'const label = `hello ${name}`;\n// comment\nfunction run() { return "<script>"; }\n'],
    ['CSS', '.card { color: #abc; padding: 1.5rem; content: "}"; } /* unfinished'],
    ['JSON', '{"name": "canvas", "ready": true, "list": [1, 2]}'],
    ['Python', '# comment\ndef build():\n  return "hello"\n'],
  ];
  for (const [language, source] of samples) {
    assert.equal(highlightSource(source, language).map(token => token.text).join(''), source);
  }
});

test('large files avoid thousands of syntax elements without losing source', () => {
  const longSource = 'const value = "hello";\n'.repeat(3000);
  assert.deepEqual(highlightSource(longSource, 'JavaScript'), [{ text: longSource }]);
  const denseSource = '{}'.repeat(3000);
  assert.deepEqual(highlightSource(denseSource, 'JavaScript'), [{ text: denseSource }]);
});

test('source labels identify nested files and matching highlighting modes', () => {
  assert.equal(sourceLanguage('src/components/App.tsx'), 'TSX');
  assert.equal(sourceLanguage('styles/main.CSS'), 'CSS');
  assert.equal(sourceLanguage('index.html'), 'HTML');
});
