import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure } from './helpers/extract-source.mjs';

const {
  parseSessionNotes,
  previewOf,
  withSessionNote,
  createSessionNotes,
  installGlobal,
  sessionMenuLabelKey
} = loadPure(
  ['SESSION_NOTES_KEY', 'SESSION_PREVIEW'],
  ['parseSessionNotes', 'previewOf', 'withSessionNote', 'createSessionNotes', 'installGlobal', 'sessionMenuLabelKey']
);

/** Fake storage: a plain map plus a switch to make writes throw. */
function makeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    read(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    write(key, value) {
      if (this.failing) throw new Error('QuotaExceededError');
      data[key] = value;
    },
    failing: false
  };
}

function makeStore(storage, wait = 10) {
  return createSessionNotes({
    read: () => storage.read('dsh-notepad:session-notes:v1'),
    write: (payload) => storage.write('dsh-notepad:session-notes:v1', payload),
    now: () => 1000,
    wait
  });
}

/* ------------------------------------------------------------------ parsing */

test('garbage storage reads as an empty map', () => {
  for (const raw of [null, undefined, '', 'null', '[]', '"text"', '{"a":1}', '{"a":{"text":42}}', '{broken']) {
    assert.deepEqual(parseSessionNotes(raw), {}, `input ${String(raw)}`);
  }
});

test('entries keep text and updatedAt, and missing updatedAt becomes 0', () => {
  assert.deepEqual(parseSessionNotes('{"s1":{"text":"hi","updatedAt":5},"s2":{"text":"yo"}}'), {
    s1: { text: 'hi', updatedAt: 5 },
    s2: { text: 'yo', updatedAt: 0 }
  });
});

test('preview is one line, first 40 characters', () => {
  assert.equal(previewOf('a\nb\r\nc'), 'a b c');
  assert.equal(previewOf('x'.repeat(60)).length, 40);
  assert.equal(previewOf('   '), '');
});

test('withSessionNote does not mutate its input and ignores empty ids', () => {
  const base = { s1: { text: 'a', updatedAt: 1 } };
  const next = withSessionNote(base, 's2', 'b', 2);
  assert.deepEqual(base, { s1: { text: 'a', updatedAt: 1 } });
  assert.deepEqual(next.s2, { text: 'b', updatedAt: 2 });
  assert.equal(withSessionNote(base, '', 'x', 3), base);
});

test('menu wording distinguishes a first note from an existing one', () => {
  assert.equal(sessionMenuLabelKey(true), 'menuOpenNote');
  assert.equal(sessionMenuLabelKey(false), 'menuNewNote');
  assert.equal(sessionMenuLabelKey(undefined), 'menuNewNote');
});

/* ------------------------------------------------------------------ store behaviour */

test('writes are debounced, then persisted once and announced', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const storage = makeStorage();
  const store = makeStore(storage, 10);
  const seen = [];
  store.subscribe((sessionId) => seen.push(sessionId));

  store.set('s1', 'first');
  store.set('s1', 'second');
  assert.equal(storage.read('dsh-notepad:session-notes:v1'), null, 'nothing written before the wait');

  t.mock.timers.tick(10);
  const stored = JSON.parse(storage.read('dsh-notepad:session-notes:v1'));
  assert.equal(stored.s1.text, 'second');
  assert.deepEqual(seen, ['s1'], 'one notification per debounce window');
});

test('flush persists without waiting for the debounce', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const storage = makeStorage();
  const store = makeStore(storage, 10);
  store.set('s1', 'x');
  store.flush();
  assert.equal(JSON.parse(storage.read('dsh-notepad:session-notes:v1')).s1.text, 'x');
  t.mock.timers.tick(10);
  assert.equal(store.get('s1'), 'x');
});

test('unsubscribe stops notifications', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const store = makeStore(makeStorage(), 10);
  const seen = [];
  const off = store.subscribe((id) => seen.push(id));
  store.set('s1', 'a');
  t.mock.timers.tick(10);
  off();
  store.set('s1', 'b');
  t.mock.timers.tick(10);
  assert.deepEqual(seen, ['s1']);
});

test('list is sorted by updatedAt and carries previews', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const storage = makeStorage({
    'dsh-notepad:session-notes:v1': JSON.stringify({
      old: { text: 'older', updatedAt: 1 },
      fresh: { text: 'first line\nsecond line', updatedAt: 9 }
    })
  });
  const store = makeStore(storage, 10);
  assert.deepEqual(store.list(), [
    { sessionId: 'fresh', updatedAt: 9, preview: 'first line second line' },
    { sessionId: 'old', updatedAt: 1, preview: 'older' }
  ]);
});

test('a failing storage degrades to memory instead of losing the text', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const storage = makeStorage();
  const store = makeStore(storage, 10);
  storage.failing = true;
  store.set('s1', 'kept in memory');
  t.mock.timers.tick(10);
  assert.equal(store.isDegraded(), true);
  assert.equal(store.get('s1'), 'kept in memory');
  assert.equal(store.list()[0].preview, 'kept in memory');
  assert.equal(storage.read('dsh-notepad:session-notes:v1'), null);
});

test('session notes never write the main document key', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const storage = makeStorage({ 'dsh-notepad:v1': '{"text":"main"}' });
  const store = makeStore(storage, 10);
  store.set('s1', 'session only');
  t.mock.timers.tick(10);
  assert.equal(storage.read('dsh-notepad:v1'), '{"text":"main"}');
  assert.ok(storage.read('dsh-notepad:session-notes:v1').includes('session only'));
});

/* ------------------------------------------------------------------ global cleanup */

test('installGlobal removes exactly the object it installed', () => {
  const scope = {};
  const api = { version: 1 };
  const dispose = installGlobal(scope, api);
  assert.equal(scope.dshNotepad, api);
  dispose();
  assert.equal('dshNotepad' in scope, false);
});

test('installGlobal restores a previous owner instead of deleting it', () => {
  const previous = { version: 0 };
  const scope = { dshNotepad: previous };
  const api = { version: 1 };
  const dispose = installGlobal(scope, api);
  assert.equal(scope.dshNotepad, api);
  dispose();
  assert.equal(scope.dshNotepad, previous);
});

test('a stale disposer leaves the current owner alone', () => {
  const scope = {};
  const first = { version: 1 };
  const disposeFirst = installGlobal(scope, first);
  const second = { version: 1 };
  installGlobal(scope, second);
  disposeFirst(); // simulates a hot reload where the old instance unloads late
  assert.equal(scope.dshNotepad, second);
});
