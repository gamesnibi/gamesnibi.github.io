// The island world and its baked file. Run: node --test tools/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ISLANDS, CLEARINGS, height, islandAt } from '../../assets/js/sea/world.js';
import { readBin, inflateBin } from '../../assets/js/sea/format.js';
import { writeBin, deflateBin } from '../binfmt.mjs';
import { bakeWorld } from '../bake-world.mjs';

test('the open sea is deep', () => { assert.equal(height(1000, 1000), -9); });

test('every island has land inside its first shape', () => {
  for (const I of ISLANDS) {
    const L = I.land[0];
    const [x, z] = L.c || (L.seg ? [(L.seg[0][0] + L.seg[1][0]) / 2, (L.seg[0][1] + L.seg[1][1]) / 2] : L.arc[Math.floor(L.arc.length / 2)]);
    assert.ok(height(x, z) > 0.5, `${I.id} at ${x},${z} is ${height(x, z)}`);
    assert.equal(islandAt(x, z), I.id);
  }
});

test('the Pond Reels bay is shallow water', () => {
  const h = height(-72, 26);
  assert.ok(h > -3.5 && h < -0.2, String(h));
});

test('the beach bar stands on a flat stretch of beach', () => {
  const C = CLEARINGS[0];
  assert.deepEqual([C.x, C.z], [70, 9]);
  const h = height(70, 9);
  assert.ok(h > 0.3 && h < 0.9, String(h));
});

test('the bin format round-trips', async () => {
  const parts = { a: { attrs: { position: Object.assign(new Float32Array([1, 2, 3, 4, 5, 6]), { itemSize: 3 }) }, index: new Uint16Array([0, 1, 0]) } };
  const back = readBin(writeBin({ hello: 1 }, parts));
  assert.deepEqual(back.meta, { hello: 1 });
  assert.deepEqual([...back.parts.a.attrs.position], [1, 2, 3, 4, 5, 6]);
  assert.equal(back.parts.a.attrs.position.itemSize, 3);
  assert.deepEqual([...back.parts.a.index], [0, 1, 0]);
  const z = await inflateBin(deflateBin(writeBin({ hello: 2 }, parts)));
  assert.deepEqual(readBin(z).meta, { hello: 2 });
});

test('baking is repeatable, small, and carries the views', async () => {
  const a = bakeWorld(), b = bakeWorld();
  assert.ok(Buffer.compare(a, b) === 0, 'two bakes differ');
  assert.ok(a.length <= 600 * 1024, `world.bin is ${a.length} bytes`);
  const w = readBin(await inflateBin(a));
  assert.equal(w.meta.size, 600); assert.equal(w.meta.res, 513);
  assert.deepEqual(Object.keys(w.meta.views).sort(), ['lockin', 'nibi', 'overview', 'pondreels', 'soon']);
  for (const [k, n] of [['trees', 8], ['palms', 6], ['rocks', 6]]) assert.ok(w.parts[k].attrs.inst.length % n === 0 && w.parts[k].attrs.inst.length > 60 * n, k);
  assert.equal(w.parts.height.attrs.h.length, 513 * 513);
});
