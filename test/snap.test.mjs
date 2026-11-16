import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure } from './helpers/extract-source.mjs';

const { nearestEdge, snapTo } = loadPure(['SNAP'], ['nearestEdge', 'snapTo']);

const BOX = { w: 1400, h: 800, top: 32 };
const W = 380;
const H = 210;

test('each edge wins when the card is within the snap distance', () => {
  assert.equal(nearestEdge(20, 300, W, H, BOX), 'left');
  assert.equal(nearestEdge(BOX.w - W - 30, 300, W, H, BOX), 'right');
  assert.equal(nearestEdge(500, BOX.top + 20, W, H, BOX), 'top');
  assert.equal(nearestEdge(500, BOX.h - H - 10, W, H, BOX), 'bottom');
});

test('nothing snaps in the middle of the window', () => {
  assert.equal(nearestEdge(500, 300, W, H, BOX), null);
});

test('the threshold really is exclusive beyond 64px', () => {
  assert.equal(nearestEdge(64, 300, W, H, BOX), 'left');
  assert.equal(nearestEdge(65, 300, W, H, BOX), null);
});

test('the top edge is measured from the chrome band, not from y=0', () => {
  // y = 0 would be the window top; the card may only sit under the 32px band.
  assert.equal(nearestEdge(500, BOX.top, W, H, BOX), 'top');
  assert.equal(nearestEdge(500, BOX.top + 60, W, H, BOX), 'top');
  assert.equal(nearestEdge(500, 0, W, H, BOX), 'top');
});

test('ties resolve in edge order left, right, top, bottom', () => {
  assert.equal(nearestEdge(20, BOX.top + 20, W, H, BOX), 'left');
});

test('snapTo only moves the axis of the chosen edge', () => {
  assert.deepEqual(snapTo('left', 100, 200, W, H, BOX), { x: 0, y: 200 });
  assert.deepEqual(snapTo('right', 100, 200, W, H, BOX), { x: BOX.w - W, y: 200 });
  assert.deepEqual(snapTo('top', 100, 200, W, H, BOX), { x: 100, y: BOX.top });
  assert.deepEqual(snapTo('bottom', 100, 200, W, H, BOX), { x: 100, y: BOX.h - H });
});
