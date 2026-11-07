// The models exported from Pond Reels (Bramble, his boat, the beach bar, Old Mossback). Run: node --test tools/tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { readBin, inflateBin } from '../../assets/js/sea/format.js';

const DIR = new URL('../../assets/3d/models/', import.meta.url);
const load = async (n) => readBin(await inflateBin(readFileSync(new URL(n, DIR))));
const bbox = (pos) => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pos[i + k]); hi[k] = Math.max(hi[k], pos[i + k]); } return { lo, hi }; };

test('Bramble has all his parts', async () => {
  const b = await load('bramble.bin');
  for (const p of ['body', 'rarm', 'head', 'lids', 'brows', 'mouth', 'hat']) {
    assert.ok(b.parts[p], p);
    assert.ok(b.parts[p].attrs.position.length / 3 > 60, p);
    for (const a of ['normal', 'color']) assert.equal(b.parts[p].attrs[a].length, b.parts[p].attrs.position.length, p + ' ' + a);
    assert.ok(b.parts[p].index && b.parts[p].index.length % 3 === 0, p + ' index');
  }
  const h = bbox(b.parts.head.attrs.position); const w = h.hi[0] - h.lo[0];
  assert.ok(w > 0.35 && w < 0.7, 'head width ' + w);
  assert.deepEqual(b.meta.pivots.shoulder, [0.285, 0.555, 0]);
  assert.deepEqual(b.meta.pivots.neck, [0, 0.7, 0]);
});

test('the boat and the beach bar', async () => {
  const boat = await load('boat.bin'); assert.ok(boat.parts.boat.attrs.position.length > 300);
  const bar = await load('bar.bin');
  const top = (p) => bbox(bar.parts[p].attrs.position).hi[1];
  assert.ok(top('roof') > 0 && bbox(bar.parts.roof.attrs.position).lo[1] > 1.5, 'roof sits up high');
  assert.ok(bbox(bar.parts.body.attrs.position).lo[1] >= -0.01);
  void top;
});

test('Old Mossback has his body and colour map', async () => {
  const f = await load('mossback.bin');
  assert.ok(f.meta.bodyCount > 0);
  const uv = f.parts.fish.attrs.uv; assert.ok(uv && uv.length > 0);
  for (const v of uv) assert.ok(v >= -0.001 && v <= 1.001, 'uv ' + v);
  assert.ok(statSync(new URL('mossback.webp', DIR)).size > 1000);
});

test('all the models together stay small', () => {
  const total = ['bramble.bin', 'boat.bin', 'bar.bin', 'mossback.bin', 'mossback.webp'].reduce((s, n) => s + statSync(new URL(n, DIR)).size, 0);
  assert.ok(total <= 700 * 1024, 'models total ' + total);
});
