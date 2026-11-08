// Old Mossback's leap (assets/js/sea/mossback.js). Run: node --test tools/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../../assets/3d/three.module.min.js';
import { readBin, inflateBin } from '../../assets/js/sea/format.js';
import { createMossback, leapPose, LEAP } from '../../assets/js/sea/mossback.js';

const model = readBin(await inflateBin(readFileSync(new URL('../../assets/3d/models/mossback.bin', import.meta.url))));

test('the leap lasts 1.4 s and peaks 3.5 m up', () => {
  assert.equal(LEAP.duration, 1.4); assert.equal(LEAP.height, 3.5);
  assert.equal(leapPose(-0.5).visible, false);
  assert.equal(leapPose(0).visible, false, 'not before the leap starts');
  assert.ok(leapPose(0.7).y > 3, leapPose(0.7).y);
  assert.ok(Math.abs(leapPose(0.7).y - 3.5) < 1e-9);
  assert.equal(leapPose(0.7).visible, true);
  assert.equal(leapPose(1.5).visible, false, 'back under after the leap');
});

test('he pitches nose up on the way out and nose down on the way back in', () => {
  assert.ok(leapPose(0.1).pitch > 0);
  assert.ok(leapPose(1.3).pitch < 0);
  let last = Infinity;
  for (let t = 0.05; t < 1.4; t += 0.05) { const p = leapPose(t).pitch; assert.ok(p < last); last = p; }
});

function run(m, seconds) {
  let seen = false;
  for (let t = 0; t < seconds; t += 0.05) { m.update(0.05, t); m.group.updateMatrixWorld(); if (m.fish.visible) seen = true; }
  return seen;
}

test('he leaps within 14 s, and again', () => {
  const m = createMossback(model, null, THREE, {});
  assert.ok(run(m, 14.5), 'no leap in the first 14 s');
  const m2 = createMossback(model, null, THREE, {}); run(m2, 16);
  assert.ok(run(m2, 15), 'no second leap');
});

test('with reduced motion he never shows', () => {
  const m = createMossback(model, null, THREE, { reducedMotion: true });
  assert.equal(run(m, 60), false);
});
