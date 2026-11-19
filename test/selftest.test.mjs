import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure } from './helpers/extract-source.mjs';

const {
  runSelfTestChecks,
  selfTestSummary,
  selfTestMarkdown,
  SELF_TEST_REGISTRATION,
  SELF_TEST_TIMEOUT
} = loadPure(
  ['SELF_TEST_REGISTRATION', 'SELF_TEST_TIMEOUT'],
  ['runSelfTestChecks', 'selfTestSummary', 'selfTestMarkdown']
);

const words = { pass: '通过', fail: '失败', idle: '未运行' };

const ok = (id, label = id) => ({ id, label, run: () => ({ ok: true }) });
const bad = (id, detail = 'boom', label = id) => ({ id, label, run: () => ({ ok: false, detail }) });

/* ---------------------------------------------------------------- registration */

test('registration metadata matches the shared self-test spec', () => {
  assert.equal(SELF_TEST_REGISTRATION.name, 'plugins.detail.section');
  assert.equal(SELF_TEST_REGISTRATION.id, 'dsh-notepad.selftest');
  assert.equal(SELF_TEST_REGISTRATION.order, 90);
  assert.equal(typeof SELF_TEST_TIMEOUT, 'number');
  assert.ok(SELF_TEST_TIMEOUT > 0 && SELF_TEST_TIMEOUT <= 2000);
});

/* ---------------------------------------------------------------- results */

test('all checks passing produce all-pass results', async () => {
  const results = await runSelfTestChecks([ok('a'), ok('b'), ok('c')], { wait: 50 });
  assert.deepEqual(results.map((result) => result.ok), [true, true, true]);
  assert.deepEqual(results.map((result) => result.id), ['a', 'b', 'c']);
  assert.deepEqual(results.map((result) => result.detail), ['', '', '']);
});

test('one failing check does not affect the others', async () => {
  const results = await runSelfTestChecks([ok('a'), bad('b', 'localStorage unavailable'), ok('c')], { wait: 50 });
  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, false);
  assert.equal(results[1].detail, 'localStorage unavailable');
  assert.equal(results[2].ok, true);
});

test('a throwing check becomes a failure instead of rejecting the run', async () => {
  const checks = [
    { id: 'boom', label: 'boom', run: () => { throw new Error('kaboom'); } },
    ok('fine')
  ];
  const results = await runSelfTestChecks(checks, { wait: 50 });
  assert.equal(results[0].ok, false);
  assert.equal(results[0].detail, 'kaboom');
  assert.equal(results[1].ok, true);
});

test('a hanging check is cut off at the timeout and reported as such', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const checks = [ok('fast'), { id: 'slow', label: 'slow', run: () => new Promise(() => {}) }];
  const pending = runSelfTestChecks(checks, { wait: 2000 });
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(2000);
  const results = await pending;
  const slow = results.filter((result) => result.id === 'slow')[0];
  assert.equal(slow.ok, false);
  assert.equal(slow.detail, 'timeout');
  assert.equal(results.filter((result) => result.id === 'fast')[0].ok, true);
});

test('a non-conforming return value counts as a failure', async () => {
  const results = await runSelfTestChecks([
    { id: 'weird', label: 'weird', run: () => 'yes' },
    { id: 'nullish', label: 'nullish', run: () => undefined }
  ], { wait: 50 });
  assert.equal(results[0].ok, false);
  assert.equal(results[1].ok, false);
});

/* ---------------------------------------------------------------- reporting */

test('summary counts passes and failures, and says "not run" before any run', () => {
  assert.equal(selfTestSummary(null, words), '未运行');
  assert.equal(selfTestSummary([], words), '0 通过 · 0 失败');
  assert.equal(selfTestSummary([{ ok: true }, { ok: true }, { ok: false }], words), '2 通过 · 1 失败');
});

test('markdown follows the shared - [x] label — result shape', () => {
  const markdown = selfTestMarkdown([
    { label: '协议', ok: true, detail: '' },
    { label: '存储', ok: false, detail: 'quota' },
    { label: '菜单', ok: false, detail: '' }
  ], words);
  assert.deepEqual(markdown.split('\n'), [
    '- [x] 协议 — 通过',
    '- [ ] 存储 — 失败：quota',
    '- [ ] 菜单 — 失败：-'
  ]);
  assert.equal(selfTestMarkdown(null, words), '');
  assert.equal(selfTestMarkdown([], words), '');
});

test('markdown falls back to neutral words without a dictionary', () => {
  assert.equal(
    selfTestMarkdown([{ label: 'x', ok: true, detail: '' }, { label: 'y', ok: false, detail: 'e' }], null),
    '- [x] x — pass\n- [ ] y — fail：e'
  );
});
