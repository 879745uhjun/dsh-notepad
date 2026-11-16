import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure } from './helpers/extract-source.mjs';

const {
  continueLine,
  startTodo,
  toggleTodoAt,
  parseTodos,
  renumberAll,
  clearDoneTodos
} = loadPure(
  ['RE_NUMBER', 'RE_TODO'],
  [
    'lineStartAt',
    'lineEndAt',
    'parseTodos',
    'toggleTodoAt',
    'renumberAll',
    'clearDoneTodos',
    'continueLine',
    'startNumbering',
    'startTodo'
  ]
);

/* ------------------------------------------------------------------ 编号续号 */

test('Enter after a numbered item continues the sequence', () => {
  const text = '1. 买牛奶';
  assert.deepEqual(continueLine(text, text.length, true), {
    text: '1. 买牛奶\n2. ',
    caret: '1. 买牛奶\n'.length + '2. '.length
  });
});

test('Enter on an empty numbered item ends the list and strips the marker', () => {
  const text = '1. 买牛奶\n2. ';
  const result = continueLine(text, text.length, true);
  assert.equal(result.text, '1. 买牛奶\n');
  assert.equal(result.caret, '1. 买牛奶\n'.length);
});

test('the "1)" style is preserved and keeps counting', () => {
  const text = 'a\n3) item';
  const result = continueLine(text, text.length, true);
  assert.equal(result.text, 'a\n3) item\n4) ');
});

test('indentation is carried to the next item', () => {
  const seeded = '  1. nested';
  assert.equal(continueLine(seeded, seeded.length, true).text, `${seeded}\n  2. `);
  // A bare indented line has no marker, so Enter is left to the browser.
  assert.equal(continueLine('  ', 2, true), null);
});

test('numbering stays off when the toggle is off', () => {
  const text = '1. only';
  assert.equal(continueLine(text, text.length, false), null);
});

test('unmarked lines never start a list implicitly', () => {
  const text = 'plain sentence';
  assert.equal(continueLine(text, text.length, true), null);
});

/* ------------------------------------------------------------------ 待办标记 */

test('Enter after an open to-do adds the next unticked one', () => {
  const text = '- [ ] 写周报';
  assert.deepEqual(continueLine(text, text.length, false), {
    text: '- [ ] 写周报\n- [ ] ',
    caret: '- [ ] 写周报\n- [ ] '.length
  });
});

test('ticking and unticking rewrites the same line', () => {
  const text = '标题\n- [ ] 买牛奶\nnote';
  const done = toggleTodoAt(text, 1);
  assert.equal(done, '标题\n- [x] 买牛奶\nnote');
  assert.equal(toggleTodoAt(done, 1), '标题\n- [ ] 买牛奶\nnote');
});

test('an uppercase X counts as ticked', () => {
  assert.equal(toggleTodoAt('- [X] done', 0), '- [ ] done');
});

test('non-to-do lines and bad indexes are left alone', () => {
  const text = '标题\n- [ ] 任务';
  assert.equal(toggleTodoAt(text, 0), null);
  assert.equal(toggleTodoAt(text, 9), null);
});

test('turning a plain line into a to-do keeps its indent and text', () => {
  assert.deepEqual(startTodo('hello', 5), { text: '- [ ] hello', caret: 11 });
  assert.deepEqual(startTodo('  缩进行', 4), { text: '  - [ ] 缩进行', caret: 12 });
});

test('startTodo toggles an existing to-do instead of doubling the marker', () => {
  assert.equal(startTodo('- [ ] 任务', 7).text, '- [x] 任务');
});

test('parsing reports line numbers, indent and done state', () => {
  const text = '标题\n- [ ] 买牛奶\nnote\n  - [x] 交周报';
  assert.deepEqual(parseTodos(text), [
    { line: 1, indent: '', done: false, label: '买牛奶' },
    { line: 3, indent: '  ', done: true, label: '交周报' }
  ]);
});

test('clearDoneTodos drops only ticked items', () => {
  const text = '- [ ] keep\n- [x] drop\nnote\n- [X] drop2';
  assert.deepEqual(clearDoneTodos(text), { text: '- [ ] keep\nnote', removed: 2 });
  assert.equal(clearDoneTodos('- [ ] a\n- [ ] b'), null);
});

/* ------------------------------------------------------------------ 重新编号 */

test('renumberAll counts per indent level and keeps the style', () => {
  const text = '1. a\n5. b\n  1. x\n  9. y\n2) c';
  assert.equal(renumberAll(text), '1. a\n2. b\n  1. x\n  2. y\n3) c');
});

test('renumberAll is a no-op when the list is already sequential', () => {
  assert.equal(renumberAll('1. a\n2. b'), null);
  assert.equal(renumberAll('no numbers here'), null);
});
