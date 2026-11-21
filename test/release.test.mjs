import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure } from './helpers/extract-source.mjs';

/**
 * `resolveRelease(pos, size, box)` is the pure release decision behind the drag
 * gesture: no DOM, no storage, no React. It answers one question — where does the
 * card go when the pointer is released?
 *
 *   kind 'peek' — dropped more than PEEK_TRIGGER outside an edge: tuck into a handle
 *   kind 'snap' — within SNAP of an edge: sit flush against it
 *   kind 'free' — otherwise: stay, clamped inside the viewport
 */
const { resolveRelease, fitSize, fitPos } = loadPure(
  ['SNAP', 'PEEK', 'PEEK_TRIGGER', 'MIN_W', 'MAX_W', 'MIN_H', 'MAX_H'],
  ['clampAxis', 'fitSize', 'fitPos', 'nearestEdge', 'snapTo', 'resolveRelease']
);

const BOX = { w: 1400, h: 800, top: 32 };
const SIZE = { w: 380, h: 210 };

/* ---------------------------------------------------------------- 1. left edge */

test('dropped within 64px of the left edge snaps flush to it', () => {
  const result = resolveRelease({ x: 20, y: 300 }, SIZE, BOX);
  assert.equal(result.kind, 'snap');
  assert.equal(result.side, 'left');
  assert.deepEqual(result.pos, { x: 0, y: 300 });
});

test('the right edge snaps to the frame width, not to the pointer', () => {
  const result = resolveRelease({ x: BOX.w - SIZE.w - 30, y: 300 }, SIZE, BOX);
  assert.equal(result.kind, 'snap');
  assert.equal(result.side, 'right');
  assert.equal(result.pos.x, BOX.w - SIZE.w);
  assert.equal(result.pos.y, 300);
});

/* ---------------------------------------------------------------- 2. tie-breaking */

test('when two edges are in range the closer one wins', () => {
  // 40px from the left, 12px from the top band → top is closer.
  const result = resolveRelease({ x: 40, y: BOX.top + 12 }, SIZE, BOX);
  assert.equal(result.side, 'top');
});

test('equal distances resolve to left, because that is the declared order', () => {
  const result = resolveRelease({ x: 20, y: BOX.top + 20 }, SIZE, BOX);
  assert.equal(result.side, 'left');
  // Same tie, mirrored: 20px from the right and 20px from the bottom band.
  const mirrored = resolveRelease({
    x: BOX.w - SIZE.w - 20,
    y: BOX.h - SIZE.h - 20
  }, SIZE, BOX);
  assert.equal(mirrored.side, 'right', 'right comes before bottom in edge order');
});

/* ---------------------------------------------------------------- 3. size rule (actual) */

test('oversized requests are clamped by the viewport, and there is no 80% rule', () => {
  const fitted = fitSize(BOX.w * 2, BOX.h * 2, BOX);
  // max width is MAX_W; max height is min(MAX_H, viewport - top band - 16)
  assert.deepEqual(fitted, { w: 760, h: Math.min(760, BOX.h - BOX.top - 16) });
  assert.ok(fitted.w <= BOX.w && fitted.h <= BOX.h - BOX.top);

  const placed = fitPos(99999, 99999, fitted.w, fitted.h, BOX);
  assert.equal(placed.x, BOX.w - fitted.w - 8);
  assert.equal(placed.y, BOX.h - fitted.h - 8);
  assert.ok(placed.x >= 8 && placed.y >= BOX.top + 8);
});

/* ---------------------------------------------------------------- 4. tuck outside */

test('dropped more than 40px outside an edge tucks into a handle there', () => {
  const result = resolveRelease({ x: -60, y: 300 }, SIZE, BOX);
  assert.equal(result.kind, 'peek');
  assert.equal(result.side, 'left');
  // The caller keeps the position: the handle is placed from it.
  assert.deepEqual(result.pos, { x: -60, y: 300 });
});

test('40px outside is still a snap, only more than 40 tucks away', () => {
  assert.equal(resolveRelease({ x: -40, y: 300 }, SIZE, BOX).kind, 'snap');
  assert.equal(resolveRelease({ x: -41, y: 300 }, SIZE, BOX).kind, 'peek');
});

test('tucking works on all four edges', () => {
  const cases = [
    { pos: { x: -60, y: 300 }, side: 'left' },
    { pos: { x: BOX.w + 20, y: 300 }, side: 'right' },
    { pos: { x: 500, y: BOX.top - 60 }, side: 'top' },
    { pos: { x: 500, y: BOX.h + 20 }, side: 'bottom' }
  ];
  for (const entry of cases) {
    const result = resolveRelease(entry.pos, SIZE, BOX);
    assert.equal(result.kind, 'peek', `expected peek for ${entry.side}`);
    assert.equal(result.side, entry.side);
  }
});

/* ---------------------------------------------------------------- 5. free + purity */

test('dropped in the middle stays where it is', () => {
  const result = resolveRelease({ x: 500, y: 300 }, SIZE, BOX);
  assert.equal(result.kind, 'free');
  assert.equal(result.side, null);
  assert.deepEqual(result.pos, { x: 500, y: 300 });
});

test('the decision is pure: inputs untouched and every call returns a fresh result', () => {
  const pos = { x: 500, y: 300 };
  const size = { w: 380, h: 210 };
  const first = resolveRelease(pos, size, BOX);
  const second = resolveRelease(pos, size, BOX);
  assert.deepEqual(pos, { x: 500, y: 300 }, 'pos is not mutated');
  assert.deepEqual(size, { w: 380, h: 210 }, 'size is not mutated');
  assert.notEqual(first, second, 'no cached/global result object');
  assert.notEqual(first.pos, second.pos, 'the returned position is a new object each time');
});

test('three different corners produce three independent decisions', () => {
  const corners = [
    resolveRelease({ x: 10, y: 200 }, SIZE, BOX),
    resolveRelease({ x: BOX.w - SIZE.w - 10, y: 200 }, SIZE, BOX),
    resolveRelease({ x: 10, y: BOX.top + 10 }, SIZE, BOX)
  ];
  assert.deepEqual(corners.map((entry) => entry.side), ['left', 'right', 'left']);
  assert.equal(new Set(corners.map((entry) => entry.kind)).size, 1, 'all became snaps');
  assert.notEqual(corners[0].pos, corners[1].pos);
  assert.notEqual(corners[0].pos, corners[2].pos);
});
