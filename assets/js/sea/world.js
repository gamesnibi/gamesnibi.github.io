// The NiBi archipelago: every island's shape and the height of the land and sea floor at any point.
// Shared by the site (the live sea) and tools/bake-world.mjs (which bakes heights and plant spots into world.bin).
// Land is a signed-distance outline (blobs, capsules and arcs, minus bays); hills follow ridge lines; crags are
// steep rock towers. Outside the outline is a shallow shelf, then the deep sea.

// ------------------------------------------------------------------ noise
export function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, o = 5) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }
export const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ------------------------------------------------------------------ islands, each with its own shape
// Land is a signed-distance outline (union of blobs and capsules, minus bays); hills follow ridge lines; crags are
// steep rock towers with flat-ish tops (karst). Outside the outline: a shallow shelf, then the deep sea.
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
function sdSeg(x, z, a, b) { const px = x - a[0], pz = z - a[1], bx = b[0] - a[0], bz = b[1] - a[1]; const h = Math.min(1, Math.max(0, (px * bx + pz * bz) / (bx * bx + bz * bz))); return Math.hypot(px - bx * h, pz - bz * h); }
function sdPoly(x, z, pts) { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, sdSeg(x, z, pts[i], pts[i + 1])); return d; }
const arc = (cx, cz, R, a0, a1, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + Math.cos(a) * R, cz + Math.sin(a) * R]; });

export const ISLANDS = [
  // Pond Reels: a horseshoe of jungle hills wrapped round a calm turquoise bay that opens to the south
  { id: 'pondreels', x: -72, z: 20, seed: 3, shelf: 13,
    land: [{ arc: arc(-72, 18, 25, 0.55 * Math.PI, 2.45 * Math.PI, 14), r: 11 }],
    bays: [{ c: [-72, 21], r: 15 }, { seg: [[-72, 22], [-72, 52]], r: 10 }],
    ridges: [{ pts: arc(-72, 18, 27, 1.05 * Math.PI, 2.0 * Math.PI, 12), h: 24, w: 17 }, { pts: [[-98, 6], [-104, -2]], h: 14, w: 11 }],
    crags: [{ c: [-50, 32], r: 6, h: 22 }, { c: [-88, -10], r: 7, h: 34 }] },
  // Señor Orange: a long, low beach island with a karst tower at its east end and a smaller one offshore
  { id: 'senor', x: 74, z: -2, seed: 8, shelf: 15,
    land: [{ seg: [[52, 2], [96, -6]], r: 12 }, { c: [99, -9], r: 11 }],
    bays: [{ c: [64, 18], r: 9 }],
    ridges: [{ pts: [[56, -4], [86, -10]], h: 6, w: 10 }],
    crags: [{ c: [101, -10], r: 10, h: 34 }, { c: [93, -17], r: 6, h: 20 }, { c: [114, 8], r: 4.5, h: 15, sea: true }] },
  // NiBi HQ: a big mountainous island with cliffs, several peaks and a crescent cove on its south shore
  { id: 'nibi', x: 0, z: -100, seed: 5, shelf: 16,
    land: [{ c: [-14, -104], r: 30 }, { c: [20, -98], r: 26 }, { seg: [[-40, -118], [44, -116]], r: 18 }],
    bays: [{ c: [4, -66], r: 15 }],
    ridges: [{ pts: [[-40, -116], [-14, -110], [12, -112], [40, -110]], h: 44, w: 30 }, { pts: [[-16, -106], [-20, -84]], h: 24, w: 18 }],
    crags: [{ c: [-24, -114], r: 10, h: 66 }, { c: [22, -112], r: 9, h: 56 }, { c: [32, -84], r: 6, h: 30 }] },
  // far out in the mist: islands still to come
  { id: 'mist1', x: 215, z: -150, seed: 21, shelf: 14, land: [{ c: [215, -150], r: 30 }, { seg: [[190, -170], [240, -128]], r: 16 }], ridges: [{ pts: [[195, -165], [235, -135]], h: 50, w: 26 }], crags: [{ c: [222, -152], r: 9, h: 70 }] },
  { id: 'mist2', x: -225, z: 135, seed: 22, shelf: 14, land: [{ c: [-225, 135], r: 26 }, { c: [-200, 152], r: 14 }], ridges: [{ pts: [[-238, 128], [-212, 142]], h: 40, w: 22 }], crags: [{ c: [-200, 152], r: 8, h: 46 }] },
  { id: 'mist3', x: -60, z: -240, seed: 23, shelf: 12, land: [{ seg: [[-90, -238], [-30, -246]], r: 15 }], ridges: [{ pts: [[-86, -238], [-36, -246]], h: 34, w: 16 }], crags: [{ c: [-48, -244], r: 7, h: 52 }] },
  // "More on the way": a bare sandbar with room for a new island
  { id: 'soon', x: 10, z: 64, seed: 11, shelf: 10, land: [{ seg: [[2, 62], [18, 66]], r: 5 }], low: 1.0 },
  // rocky islets: tree-topped karst towers
  { id: 'islet2', x: 140, z: 80, seed: 12, shelf: 10, land: [{ c: [140, 80], r: 7 }], crags: [{ c: [140, 80], r: 7, h: 26 }, { c: [150, 70], r: 3.5, h: 12, sea: true }] },
  { id: 'islet3', x: -146, z: -76, seed: 13, shelf: 12, land: [{ c: [-146, -76], r: 9 }, { c: [-134, -84], r: 5 }], crags: [{ c: [-146, -76], r: 9, h: 30 }, { c: [-134, -84], r: 5, h: 16 }] },
];
export const CLEARINGS = [{ x: 70, z: 9, r: 11, h: 0.55 }];   // the beach bar's stretch of beach
const SEA = -9;

function islandSD(I, x, z) {
  let d = 1e9;
  for (const L of I.land) {
    const dd = L.arc ? sdPoly(x, z, L.arc) - L.r : L.seg ? sdSeg(x, z, L.seg[0], L.seg[1]) - L.r : Math.hypot(x - L.c[0], z - L.c[1]) - L.r;
    d = smin(d, dd, 8);
  }
  for (const B of I.bays || []) { const bd = B.seg ? sdSeg(x, z, B.seg[0], B.seg[1]) - B.r : Math.hypot(x - B.c[0], z - B.c[1]) - B.r; d = smax(d, -bd, 5); }
  // a ragged coastline
  return d + (fbm(x * 0.06 + I.seed, z * 0.06 - I.seed, 3) - 0.5) * 7 + (fbm(x * 0.2, z * 0.2, 2) - 0.5) * 1.6;
}
function rawHeight(x, z) {
  let h = SEA;
  for (const I of ISLANDS) {
    if (Math.abs(x - I.x) > 100 || Math.abs(z - I.z) > 100) continue;
    const d = islandSD(I, x, z);
    // the shelf: shallow turquoise water, with sand and coral, then a drop to the deep
    const ds = d / I.shelf;
    let shelf = -0.35 - 2.4 * sstep(0.0, 1.0, ds);
    shelf = shelf + (SEA - shelf) * sstep(0.8, 2.6, ds);
    shelf += (fbm(x * 0.15, z * 0.15, 3) - 0.5) * 0.9 * (1 - sstep(0.9, 1.3, ds));
    h = Math.max(h, shelf);
    // land
    let land = -1e9;
    if (d < 4) {
      const inland = Math.max(0, -d);
      land = 0.9 * sstep(2.5, -2.5, d) - 1.6 * sstep(0, 4, d);                                     // the beach
      const fade = sstep(0, I.low ? 2 : 9, inland);                                                  // hills start a little way inland
      let hills = 0;
      for (const R of I.ridges || []) {
        const dr = sdPoly(x, z, R.pts), t = Math.max(0, 1 - dr / R.w);
        const rg = 1 - Math.abs(fbm(x * 0.05 + I.seed * 3, z * 0.05, 4) * 2 - 1);
        hills = Math.max(hills, R.h * (Math.pow(t, 1.3) * 0.7 + Math.pow(t, 2.6) * 0.3) * (0.6 + 0.4 * rg));
      }
      hills += (fbm(x * 0.09, z * 0.09, 3) - 0.4) * 3 * fade;                                         // knolls and gullies
      land += Math.max(0, hills) * fade;
      if (I.low) land = Math.min(land, I.low);
      h = Math.max(h, land);
    }
    // crags: steep rock towers (also standing in the sea)
    for (const C of I.crags || []) {
      const dc = Math.hypot(x - C.c[0], z - C.c[1]) / C.r;
      if (dc > 1.25) continue;
      const wob = (fbm(x * 0.18 + C.r, z * 0.18, 3) - 0.5) * 0.35;
      const side = sstep(1.05 + wob, 0.82 + wob, dc);                                                 // near-vertical walls
      const top = C.h * (0.86 + 0.14 * sstep(0.9, 0.0, dc)) + (fbm(x * 0.3, z * 0.3, 2) - 0.5) * C.h * 0.12;
      h = Math.max(h, (C.sea ? -2 : 0.6) + (top - (C.sea ? -2 : 0.6)) * side);
    }
  }
  return h;
}
export function clearK(x, z) { let k = 0; for (const C of CLEARINGS) k = Math.max(k, sstep(C.r, C.r * 0.55, Math.hypot(x - C.x, z - C.z))); return k; }
export function height(x, z) {
  const h = rawHeight(x, z);
  let out = h;
  for (const C of CLEARINGS) { const dd = Math.hypot(x - C.x, z - C.z), k = sstep(C.r, C.r * 0.55, dd); if (k > 0 && h > -0.5) out = out + (Math.min(h, C.h + 0.3 * sstep(C.r * 0.6, 0, Math.hypot(x - C.x, z - C.z + C.r * 0.5))) - out) * k; }
  return out;
}


// where tree groves grow (patches), 0..1
export const grove = (x, z) => sstep(0.4, 0.56, fbm(x * 0.03 + 40, z * 0.03 - 13, 4));

// which island (if any) has land at x, z
export function islandAt(x, z) {
  for (const I of ISLANDS) if (Math.abs(x - I.x) < 100 && Math.abs(z - I.z) < 100 && islandSD(I, x, z) < 0) return I.id;
  return null;
}
