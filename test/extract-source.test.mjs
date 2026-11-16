import test from 'node:test';
import assert from 'node:assert/strict';
import { extractConst, extractFunction } from './helpers/extract-source.mjs';

/**
 * A fixture that would break a naive brace counter: `}` and `{` inside strings,
 * a template literal, and both comment styles. This guards the extractor itself,
 * because a truncated slice would silently test the wrong code.
 */
const FIXTURE = [
  'const LIMIT = 3;',
  '',
  'function tricky(a) {',
  "  const s = 'brace } inside';",
  '  const t = "another }";',
  '  const u = `template ${a} } end`;',
  '  // a line comment with } and {',
  '  /* a block comment with } and {',
  '     spanning } two lines',
  '  */',
  '  if (a) {',
  '    return s + t + u + LIMIT;',
  '  }',
  '  return "no-branch }";',
  '}',
  '',
  'function after() {',
  "  return 'ok';",
  '}',
  ''
].join('\n');

test('extractConst slices exactly one declaration', () => {
  assert.equal(extractConst(FIXTURE, 'LIMIT'), 'const LIMIT = 3;');
  assert.throws(() => extractConst(FIXTURE, 'MISSING'), /no longer declares MISSING/);
});

test('braces inside strings, templates and comments do not truncate the slice', () => {
  const slice = extractFunction(FIXTURE, 'tricky');
  assert.ok(slice.startsWith('function tricky(a) {'), 'slice starts at the declaration');
  assert.ok(slice.includes('return "no-branch }";'), 'the last statement survives');
  assert.ok(slice.trimEnd().endsWith('}'), 'slice ends at the real closing brace');
  assert.ok(!slice.includes('function after'), 'the next declaration is not swallowed');
});

test('the sliced fixture still evaluates and behaves', () => {
  const code = `${extractConst(FIXTURE, 'LIMIT')}\n${extractFunction(FIXTURE, 'tricky')}`;
  // eslint-disable-next-line no-new-func
  const fn = new Function(`${code}\nreturn tricky;`)();
  assert.equal(fn(0), 'no-branch }');
  assert.equal(fn(1), 'brace } insideanother }template 1 } end3');
});

test('a missing function fails loudly instead of returning nothing', () => {
  assert.throws(() => extractFunction(FIXTURE, 'nope'), /no longer declares function nope/);
});

test('unbalanced source is reported rather than silently cut', () => {
  assert.throws(() => extractFunction('function broken(a) { return a;', 'broken'), /unbalanced braces/);
});
