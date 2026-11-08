// Camera views and flights (assets/js/sea/views.js). Run: node --test tools/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../assets/3d/three.module.min.js';
import { ease, fit, lerpPose, flyTo, FLIGHT, INTRO, INTRO_FROM } from '../../assets/js/sea/views.js';

const A = { pos: [0, 230, 210], target: [0, 0, -10], fov: 42, ox: 0, oy: 0 };
const B = { pos: [-56, 70, 96], target: [-74, 6, 14], fov: 42, ox: 0.1, oy: 0 };
const close = (a, b, eps = 1e-6) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < eps, `${a} vs ${b}`));

test('flights take 1.6 s and the intro 2.4 s, starting low over the water', () => {
  assert.equal(FLIGHT, 1.6); assert.equal(INTRO, 2.4);
  close(INTRO_FROM.pos, [0, 60, 380]);
});

test('easing starts and ends still', () => {
  assert.equal(ease(0), 0); assert.equal(ease(1), 1); assert.equal(ease(0.5), 0.5);
  assert.ok(ease(0.05) < 0.05 && ease(0.95) > 0.95);
});

test('a flight starts at the start pose and ends at the end pose', () => {
  const p0 = lerpPose(A, B, 0), p1 = lerpPose(A, B, 1);
  close(p0.pos, A.pos); close(p0.target, A.target); close(p1.pos, B.pos); close(p1.target, B.target);
  assert.equal(p1.fov, 42); assert.equal(p1.ox, 0.1);
});

test('half way, the camera rises above the straight line by a quarter of the distance', () => {
  const d = Math.hypot(...A.pos.map((v, i) => v - B.pos[i]));
  const mid = lerpPose(A, B, 0.5), straightY = (A.pos[1] + B.pos[1]) / 2;
  assert.ok(Math.abs(mid.pos[1] - (straightY + 0.25 * d)) < 1e-6, mid.pos[1]);
  assert.ok(Math.abs(lerpPose(A, B, 0.5, 0).pos[1] - straightY) < 1e-6, 'no rise when asked for none');
});

test('flyTo puts a real camera on the path and looking at the target', () => {
  const cam = new THREE.PerspectiveCamera(42, 1.6, 0.5, 4000);
  flyTo(cam, A, B, 1);
  close(cam.position.toArray(), B.pos, 1e-4);
  const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
  const want = new THREE.Vector3(...B.target).sub(new THREE.Vector3(...B.pos)).normalize();
  assert.ok(dir.distanceTo(want) < 1e-4);
  assert.ok(cam.view && cam.view.enabled && Math.abs(cam.view.offsetX / cam.view.fullWidth - 0.1) < 1e-9, 'the view offset is applied');
  assert.equal(cam.aspect, 1.6, 'the shift keeps the screen shape');
});

test('wide screens keep the designed pose; tall phones widen the view and step back to show the same width', () => {
  const v = { pos: [-56, 70, 96], target: [-74, 6, 14], fov: 42 };
  const wide = fit(v, 1.6, 'pondreels');
  close(wide.pos, v.pos); assert.equal(wide.fov, 42);
  const tall = fit(v, 390 / 844, 'pondreels');
  assert.ok(tall.fov > 42 && tall.fov <= 60, tall.fov);
  const dist = (p) => Math.hypot(...p.pos.map((x, i) => x - p.target[i]));
  const halfW = (p, aspect) => dist(p) * Math.tan((p.fov * Math.PI) / 360) * aspect;
  assert.ok(halfW(tall, 390 / 844) >= halfW(v, 1.25) - 1e-6, 'the island fits across the phone');
  close(tall.target, v.target);
  // the island sits clear of the card: right of it on wide screens, above the sheet on phones
  assert.ok(wide.ox < 0 && tall.oy > 0);
});
