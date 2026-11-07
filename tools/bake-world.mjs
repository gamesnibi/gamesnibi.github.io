// Bake the archipelago into assets/3d/world.bin: the height grid (for the land and the water's depth colours),
// where every tree, palm and boulder goes, and the camera views. Run: node tools/bake-world.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { height, clearK, grove, fbm, rng } from '../assets/js/sea/world.js';
import { writeBin, deflateBin } from './binfmt.mjs';

export const SIZE = 600, RES = 513;
// tuned in the prototype (Josh approved the look on Nov 7)
export const VIEWS = {
  overview: { pos: [0, 230, 210], target: [0, 0, -10], fov: 42 },
  pondreels: { pos: [-56, 70, 96], target: [-74, 6, 14], fov: 42 },
  lockin: { pos: [60, 55, 80], target: [82, 6, -4], fov: 42 },
  nibi: { pos: [30, 80, -10], target: [0, 18, -100], fov: 42 },
  soon: { pos: [28, 34, 108], target: [10, 0, 64], fov: 40 },
};

const slope = (x, z, e) => Math.hypot(height(x + e, z) - height(x - e, z), height(x, z + e) - height(x, z - e)) / (2 * e);

export function bakeWorld() {
  // heights, quantised to 16 bits
  const hs = new Float32Array(RES * RES);
  for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) hs[j * RES + i] = height((i / (RES - 1) - 0.5) * SIZE, (j / (RES - 1) - 0.5) * SIZE);
  let hmin = Infinity, hmax = -Infinity; for (const v of hs) { if (v < hmin) hmin = v; if (v > hmax) hmax = v; }
  const hq = new Uint16Array(RES * RES); for (let k = 0; k < hs.length; k++) hq[k] = Math.round((hs[k] - hmin) / (hmax - hmin) * 65535);

  // broadleaf trees: [x, y, z, rotY, trunk height, crown radius, tint 0..1, seed 0..1]
  const trees = []; { const R = rng(31), CELL = 3.3;
    for (let gz = -SIZE / 2; gz < SIZE / 2; gz += CELL) for (let gx = -SIZE / 2; gx < SIZE / 2; gx += CELL) {
      const x = gx + R() * CELL, z = gz + R() * CELL, y = height(x, z);
      if (y < 1.6) continue;
      const sl = slope(x, z, 0.8);
      if (sl > 2.2 || clearK(x, z) > 0.1) continue;
      const g = grove(x, z);
      if (R() > (y > 2.5 ? 0.62 + g * 0.35 : 0.3 + g * 0.6) * (sl > 1.4 ? 0.4 : 1)) continue;   // groves, lone meadow trees, trees clinging to slopes
      trees.push(x, y, z, R() * 6.28, 2.0 + R() * 2.4, 2.0 + R() * 1.5, R(), R());
    } }
  // palms: [x, y, z, lean, rotY, scale], mostly along the beaches
  const palms = []; { const R = rng(7), C = 2.9;
    for (let gz = -SIZE / 2; gz < SIZE / 2; gz += C) for (let gx = -SIZE / 2; gx < SIZE / 2; gx += C) {
      const x = gx + R() * C, z = gz + R() * C, y = height(x, z);
      if (y < 0.75 || y > 4.5 || slope(x, z, 0.6) > 0.5) continue;
      if (R() > (y < 2.4 ? 0.55 : 0.2) * (clearK(x, z) > 0.3 ? 0.35 : 1)) continue;
      palms.push(x, y - 0.15, z, (R() - 0.5) * 0.3, R() * Math.PI * 2, 2.8 + R() * 2.4);
    } }
  // granite boulders: [x, y, z, rotY, scale, squash], in clusters where the shore is steep or rocky
  const rocks = []; { const R = rng(17);
    for (let k = 0; k < 60000 && rocks.length < 260 * 6; k++) {
      const x = (R() - 0.5) * SIZE, z = (R() - 0.5) * SIZE, y = height(x, z);
      if (y < -0.9 || y > 1.6 || clearK(x, z) > 0.2) continue;
      if (slope(x, z, 0.6) < 0.08 && R() > 0.04) continue;
      if (fbm(x * 0.05 + 9, z * 0.05, 3) < 0.55) continue;
      const sz = 0.8 + R() * 2.2;
      rocks.push(x, y - sz * 0.15, z, R() * 6.28, sz, 0.6 + R() * 0.35);
    } }
  const inst = (arr, n) => ({ attrs: { inst: Object.assign(new Float32Array(arr), { itemSize: n }) } });
  const meta = { size: SIZE, res: RES, hmin, hmax, views: VIEWS, counts: { trees: trees.length / 8, palms: palms.length / 6, rocks: rocks.length / 6 } };
  return deflateBin(writeBin(meta, { height: { attrs: { h: hq } }, trees: inst(trees, 8), palms: inst(palms, 6), rocks: inst(rocks, 6) }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = new URL('../assets/3d/world.bin', import.meta.url);
  const buf = bakeWorld(); writeFileSync(out, buf);
  console.log('world.bin', (buf.length / 1024).toFixed(0), 'KB');
}
