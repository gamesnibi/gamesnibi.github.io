// The live 3D sea: the archipelago from world.bin (textured land, trees, palms, boulders, Señor Orange's beach bar),
// big soft clouds round the misty edges, the water, sunlight, and the camera that flies between the islands.
// createSea() resolves once the first frame is drawn. Tasks that add creatures use sea.add() and sea.onFrame().
import * as THREE from '../../3d/three.module.min.js';
import { loadBin } from './format.js';
import { fbm, vnoise, rng, sstep, grove, CLEARINGS } from './world.js';
import { createWater } from './water.js';
import { FLIGHT, INTRO, INTRO_FROM, fit, lerpPose, applyPose } from './views.js';
import { createBramble } from './bramble.js';
import { createMossback } from './mossback.js';

const BASE = new URL('../../3d/', import.meta.url);
const MIST = [175, 300];
const SUN = new THREE.Vector3(-0.5, 0.6, 0.48).normalize();
const HORIZON = new THREE.Color('#cfe4ee');
const BRAMBLE = { at: [-72, 0, 30], scale: 3, hit: 0.8 };   // in the Pond Reels bay; storybook size, so you can see him
const MOSSBACK = [-70, 0, 24];                               // Old Mossback leaps in the same bay

// fog measured outward from the middle of the archipelago (not from the camera), so the edges sink into the mist
THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
  vec4 fogW = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    fogW = instanceMatrix * fogW;
  #endif
  fogW = modelMatrix * fogW;
  vFogDepth = length( fogW.xz ) - max( fogW.y, 0.0 ) * 0.6;
#endif`;

// ------------------------------------------------------------------ textures (world-space triplanar, no UVs needed)
async function loadTextures() {
  const L = new THREE.TextureLoader();
  const names = ['sand', 'grass', 'rock', 'leaves', 'bark', 'thatch', 'planks', 'frond'];
  const list = await Promise.all(names.map((n) => L.loadAsync(new URL('tex/' + n + '.webp', BASE).href)));
  const T = {};
  names.forEach((n, i) => {
    const t = list[i];
    t.colorSpace = THREE.SRGBColorSpace;
    if (n !== 'frond') t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    T[n] = t;
  });
  return T;
}

// `splat` blends sand / grass / rock by a per-vertex weight; each material gets its own program cache key, or
// three.js would reuse one material's patched program for another (the bar once came out black that way)
let triId = 0;
function triplanar(mat, tex, { splat = false, scale = [0.15, 0.1, 0.07] } = {}) {
  const key = 'tri' + (splat ? 'S' : 'N') + ++triId;
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tA: { value: tex[0] }, tB: { value: tex[1] || tex[0] }, tC: { value: tex[2] || tex[0] }, tScale: { value: new THREE.Vector3(...scale, 0, 0) } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTW; varying vec3 vTN;' + (splat ? '\nattribute vec3 splat; varying vec3 vSplat;' : ''))
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n{ vec4 tw = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\n tw = instanceMatrix * tw;\n#endif\n tw = modelMatrix * tw; vTW = tw.xyz; vTN = normalize(mat3(modelMatrix) * objectNormal); }' + (splat ? '\nvSplat = splat;' : ''));
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tA; uniform sampler2D tB; uniform sampler2D tC; uniform vec3 tScale; varying vec3 vTW; varying vec3 vTN;' + (splat ? ' varying vec3 vSplat;' : '') + `
vec3 tri(sampler2D t, float s){ vec3 b = pow(abs(vTN), vec3(4.0)); b /= (b.x + b.y + b.z);
  return texture2D(t, vTW.zy * s).rgb * b.x + texture2D(t, vTW.xz * s).rgb * b.y + texture2D(t, vTW.xy * s).rgb * b.z; }`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + (splat
        ? 'diffuseColor.rgb *= tri(tA, tScale.x) * vSplat.x + tri(tB, tScale.y) * vSplat.y + tri(tC, tScale.z) * vSplat.z;'
        : 'diffuseColor.rgb *= tri(tA, tScale.x) * 1.12;'));
  };
  return mat;
}

// ------------------------------------------------------------------ the baked heights
function heightGrid(world) {
  const { size, res, hmin, hmax } = world.meta, q = world.parts.height.attrs.h;
  const h = new Float32Array(res * res), k = (hmax - hmin) / 65535;
  for (let i = 0; i < h.length; i++) h[i] = hmin + q[i] * k;
  const at = (x, z) => {                       // bilinear, like the water's texture
    const gx = (x / size + 0.5) * (res - 1), gz = (z / size + 0.5) * (res - 1);
    if (gx < 0 || gz < 0 || gx > res - 1 || gz > res - 1) return hmin;
    const i = Math.min(res - 2, Math.floor(gx)), j = Math.min(res - 2, Math.floor(gz)), fx = gx - i, fz = gz - j;
    const a = h[j * res + i], b = h[j * res + i + 1], c = h[(j + 1) * res + i], d = h[(j + 1) * res + i + 1];
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
  return { h, res, size, at };
}

function buildTerrain(G, T, step) {
  const n = (G.res - 1) / step + 1;
  const geo = new THREE.PlaneGeometry(G.size, G.size, n - 1, n - 1).rotateX(-Math.PI / 2);   // row 0 is z = -size/2
  const P = geo.attributes.position;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) P.setY(j * n + i, G.h[j * step * G.res + i * step]);
  // the sea is opaque, so the sea floor under it is never seen: keep only the squares that reach near the surface
  const idx = [];
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + n, c = b + 1, d = a + 1;
    if (Math.max(P.getY(a), P.getY(b), P.getY(c), P.getY(d)) > -0.6) idx.push(a, b, d, b, c, d);
  }
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const N = geo.attributes.normal, tint = new Float32Array(P.count * 3), spl = new Float32Array(P.count * 3);
  for (let v = 0; v < P.count; v++) {
    const x = P.getX(v), y = P.getY(v), z = P.getZ(v), slope = 1 - N.getY(v);
    const ws = 1 - sstep(0.8, 1.5, y), wr = y > 1.0 ? sstep(0.6, 0.85, slope) * (0.5 + 0.5 * fbm(x * 0.08, z * 0.08, 3)) : 0;
    const wg = Math.max(0, 1 - ws - wr), tot = ws + wg + wr;
    spl[v * 3] = ws / tot; spl[v * 3 + 1] = wg / tot; spl[v * 3 + 2] = wr / tot;
    const g = wg > 0 ? 1 - 0.32 * grove(x, z) * wg : 1, wet = y < 0.15;   // darker ground under the groves
    tint[v * 3] = (wet ? 0.86 : 1) * g; tint[v * 3 + 1] = (wet ? 0.84 : 1) * g; tint[v * 3 + 2] = (wet ? 0.8 : 1) * g;   // wet sand at the waterline
  }
  geo.setAttribute('color', new THREE.BufferAttribute(tint, 3));
  geo.setAttribute('splat', new THREE.BufferAttribute(spl, 3));
  const mesh = new THREE.Mesh(geo, triplanar(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), [T.sand, T.grass, T.rock], { splat: true, scale: [0.16, 0.11, 0.06] }));
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// split instances into square patches of the map, so three.js can skip (frustum-cull) the patches out of view
function patches(n, posOf, cell = 150) {
  const by = new Map();
  for (let k = 0; k < n; k++) { const [x, z] = posOf(k), key = Math.floor(x / cell) + ',' + Math.floor(z / cell); if (!by.has(key)) by.set(key, []); by.get(key).push(k); }
  return [...by.values()];
}

// broadleaf trees: instanced trunks and leafy crowns (three per tree)
function buildTrees(inst, T, every, detail) {
  const crownGeo = new THREE.IcosahedronGeometry(1, detail);
  const cp = crownGeo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < cp.count; i++) { v.fromBufferAttribute(cp, i); v.multiplyScalar(0.9 + vnoise(v.x * 1.8 + 5, v.z * 1.8 + v.y * 1.4) * 0.22); cp.setXYZ(i, v.x, v.y * 0.8, v.z); }
  crownGeo.computeVertexNormals();
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 1, 7).translate(0, 0.5, 0);
  const crownMat = triplanar(new THREE.MeshStandardMaterial({ roughness: 0.85 }), [T.leaves], { scale: [0.55] });
  const trunkMat = new THREE.MeshStandardMaterial({ map: T.bark, roughness: 0.9 });
  const TINTS = ['#ffffff', '#e8f6d8', '#d8f0c8', '#f4ffe0', '#c8e8b8', '#fff8d0'].map((h) => new THREE.Color(h));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), e = new THREE.Euler();
  const picked = []; for (let k = 0; k < inst.length / 8; k += every) picked.push(k);
  const out = [];
  for (const group of patches(picked.length, (i) => [inst[picked[i] * 8], inst[picked[i] * 8 + 2]])) {
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, group.length * 3);
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, group.length);
    crowns.castShadow = trunks.castShadow = crowns.receiveShadow = trunks.receiveShadow = true;
    let nt = 0, nc = 0;
    for (const i of group) {
      const k = picked[i];
      const [x, y, z, rotY, hgt, r, tint, seed] = inst.subarray(k * 8, k * 8 + 8);
      const R = rng(Math.floor(seed * 4294967295));
      q.setFromEuler(e.set((R() - 0.5) * 0.12, rotY, (R() - 0.5) * 0.12));
      m.compose(p.set(x, y - 0.3, z), q, s.set(1 + r * 0.15, hgt, 1 + r * 0.15)); trunks.setMatrixAt(nt++, m);
      const base = TINTS[Math.min(TINTS.length - 1, Math.floor(tint * TINTS.length))];
      for (let j = 0; j < 3; j++) {
        const rr = r * (j ? 0.62 + R() * 0.15 : 1), ox = j ? (R() - 0.5) * r * 1.3 : 0, oz = j ? (R() - 0.5) * r * 1.3 : 0;
        m.compose(p.set(x + ox, y + hgt + rr * (j ? 0.7 : 0.3), z + oz), q, s.set(rr, rr * 0.85, rr)); crowns.setMatrixAt(nc, m);
        c.copy(base).offsetHSL(0, 0, (j ? 0.03 : 0) + (R() - 0.5) * 0.05); crowns.setColorAt(nc++, c);
      }
    }
    trunks.count = nt; crowns.count = nc;
    out.push(trunks, crowns);
  }
  return out;
}

// palms: a curved trunk (bark, fibres running up) and drooping cut-out fronds
function makePalm() {
  const curve = new THREE.CatmullRomCurve3([0, 0.33, 0.66, 1].map((t) => new THREE.Vector3(0.4 * t * t, t * 2.2, 0)));
  const trunk = new THREE.TubeGeometry(curve, 12, 0.06, 7, false);
  { const uv = trunk.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * 0.3, uv.getX(i) * 3); }
  const top = curve.getPoint(1), leaves = [];
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2 + (k % 2) * 0.2, Lf = 0.95 + (k % 3) * 0.14;
    const leaf = new THREE.PlaneGeometry(Lf, Lf * 0.25, 8, 1);
    const lp = leaf.attributes.position;
    for (let i = 0; i < lp.count; i++) { const x = lp.getX(i) + Lf / 2, zz = lp.getY(i); lp.setXYZ(i, x, -x * x * 0.42 + Math.abs(zz) * 0.3, zz); }
    leaf.computeVertexNormals();
    leaf.rotateY(a); leaf.translate(top.x, top.y + 0.03, top.z);
    leaves.push(leaf);
  }
  return { trunk, leaves: mergeGeos(leaves) };
}
function mergeGeos(list) {
  const pos = [], nor = [], uv = [], idx = []; let base = 0;
  for (const g of list) {
    const P = g.attributes.position, Nn = g.attributes.normal, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(Nn.getX(i), Nn.getY(i), Nn.getZ(i)); uv.push(U.getX(i), U.getY(i)); }
    for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
    base += P.count;
  }
  const b = new THREE.BufferGeometry();
  b.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); b.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); b.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); b.setIndex(idx);
  return b;
}
function buildPalms(inst, T) {
  const pg = makePalm(), n = inst.length / 6;
  const trunks = new THREE.InstancedMesh(pg.trunk, new THREE.MeshStandardMaterial({ map: T.bark, roughness: 0.9 }), n);
  const leaves = new THREE.InstancedMesh(pg.leaves, new THREE.MeshStandardMaterial({ map: T.frond, color: new THREE.Color(1.3, 1.32, 1.22), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75 }), n);
  leaves.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: T.frond, alphaTest: 0.5 });
  trunks.castShadow = leaves.castShadow = trunks.receiveShadow = leaves.receiveShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  for (let k = 0; k < n; k++) {
    const [x, y, z, lean, rotY, sz] = inst.subarray(k * 6, k * 6 + 6);
    q.setFromEuler(e.set(lean, rotY, lean * 0.7));
    m.compose(p.set(x, y, z), q, s.set(sz, sz, sz)); trunks.setMatrixAt(k, m); leaves.setMatrixAt(k, m);
  }
  return [trunks, leaves];
}

// granite boulders along the rocky shores
function buildRocks(inst, T) {
  const geo = new THREE.IcosahedronGeometry(1, 3), pp = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pp.count; i++) { v.fromBufferAttribute(pp, i); v.multiplyScalar(0.85 + fbm(v.x * 1.1 + 3, v.z * 1.1 + v.y * 0.7, 3) * 0.3); pp.setXYZ(i, v.x * 1.1, v.y * 0.8, v.z); }
  geo.computeVertexNormals();
  const n = inst.length / 6;
  const rocks = new THREE.InstancedMesh(geo, triplanar(new THREE.MeshStandardMaterial({ roughness: 0.7 }), [T.rock], { scale: [0.35] }), n);
  rocks.castShadow = rocks.receiveShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), e = new THREE.Euler();
  for (let k = 0; k < n; k++) {
    const [x, y, z, rotY, sz, squash] = inst.subarray(k * 6, k * 6 + 6);
    const R = rng(k + 101);
    q.setFromEuler(e.set(R() * 0.5, rotY, R() * 0.5));
    m.compose(p.set(x, y, z), q, s.set(sz, sz * squash, sz)); rocks.setMatrixAt(k, m);
    c.setRGB(0.85, 0.85, 0.85).offsetHSL(0, 0, (R() - 0.5) * 0.1); rocks.setColorAt(k, c);
  }
  return rocks;
}

// a model part from a .bin file: float positions, int8 normals, uint8 colours
export function partGeometry(part) {
  const g = new THREE.BufferGeometry(), A = part.attrs;
  g.setAttribute('position', new THREE.BufferAttribute(A.position, 3));
  if (A.normal) g.setAttribute('normal', new THREE.BufferAttribute(A.normal, 3, A.normal instanceof Int8Array));
  if (A.color) g.setAttribute('color', new THREE.BufferAttribute(A.color, 3, A.color instanceof Uint8Array));
  if (A.uv) g.setAttribute('uv', new THREE.BufferAttribute(A.uv, 2));
  if (part.index) g.setIndex(new THREE.BufferAttribute(part.index, 1));
  if (!A.normal) g.computeVertexNormals();
  return g;
}

// Señor Orange's beach bar (built with the Pond Reels prop helpers), on its stretch of beach
function buildBar(model, T, G) {
  const C = CLEARINGS[0], bar = new THREE.Group();
  const body = new THREE.Mesh(partGeometry(model.parts.body), triplanar(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), [T.planks], { scale: [1.1] }));
  const roof = new THREE.Mesh(partGeometry(model.parts.roof), triplanar(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), [T.thatch], { scale: [0.9] }));
  for (const mesh of [body, roof]) { mesh.castShadow = mesh.receiveShadow = true; bar.add(mesh); }
  bar.position.set(C.x, G.at(C.x, C.z) - 0.1, C.z); bar.rotation.y = 0.35; bar.scale.setScalar(2.6);
  return bar;
}

// big, round, soft 3D clouds in a ring round the misty edges
function buildClouds(count, detail) {
  const puff = new THREE.IcosahedronGeometry(1, detail);
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: new THREE.Color('#c4dbea'), emissiveIntensity: 0.78 });
  const R = rng(77), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const group = new THREE.Group(), SECTORS = 8;
  let puffs = null, n = 0, MAXP = 0;
  for (let k = 0; k < count; k++) {
    if (k % Math.ceil(count / SECTORS) === 0) {                         // a new sector of the ring
      if (puffs) { puffs.count = n; group.add(puffs); }
      MAXP = Math.ceil(count / SECTORS) * 19; puffs = new THREE.InstancedMesh(puff, mat, MAXP); n = 0;
    }
    const a = (k / count) * Math.PI * 2 + R() * 0.1, rr = 168 + R() * 120;
    const cx = Math.cos(a) * rr, cz = Math.sin(a) * rr, cy = 22 + R() * 34, size = 14 + R() * 16;
    const nP = 11 + Math.floor(R() * 8);
    for (let j = 0; j < nP && n < MAXP; j++) {
      const u = (j / (nP - 1)) * 2 - 1, top = j % 3 === 2;           // a flat base, bigger in the middle, a few on top
      const r = size * (1 - 0.45 * Math.abs(u)) * (0.75 + R() * 0.35) * (top ? 0.8 : 1);
      const along = u * size * 1.25, side = (R() - 0.5) * size * 0.6;
      p.set(cx + Math.cos(a + Math.PI / 2) * along + Math.cos(a) * side, cy + (top ? r * 0.75 : r * 0.25), cz + Math.sin(a + Math.PI / 2) * along + Math.sin(a) * side);
      m.compose(p, q, s.set(r, r * 0.78, r)); puffs.setMatrixAt(n++, m);
    }
  }
  puffs.count = n; group.add(puffs);
  return group;
}

// ------------------------------------------------------------------ the sea
export async function createSea(canvas, { quality = 'high', reducedMotion = false, view: first = 'overview', pixelRatio = 0 } = {}) {
  const low = quality === 'low';
  const [world, barModel, brambleModel, boatModel, fishModel, T, fishTex] = await Promise.all(
    ['world.bin', 'models/bar.bin', 'models/bramble.bin', 'models/boat.bin', 'models/mossback.bin'].map((f) => loadBin(new URL(f, BASE)))
      .concat(loadTextures(), new THREE.TextureLoader().loadAsync(new URL('models/mossback.webp', BASE).href)));
  fishTex.colorSpace = THREE.SRGBColorSpace;   // (uvs run up from the bottom, three.js's usual way)
  const G = heightGrid(world), VIEWS = world.meta.views;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatio || Math.min(window.devicePixelRatio || 1, low ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;                     // the islands stand still: draw the shadows once
  renderer.shadowMap.needsUpdate = true;
  for (const t of Object.values(T)) t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(HORIZON, MIST[0], MIST[1]);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#3a9ff0') }, hor: { value: HORIZON } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 hor; varying vec3 vP; void main(){ float k = pow(clamp(vP.y,0.,1.),0.5); gl_FragColor = vec4(mix(hor, top, k), 1.0); }',
  }));
  sky.renderOrder = -2;
  scene.add(sky);

  const sun = new THREE.DirectionalLight('#ffe7b8', 3.8);
  sun.position.copy(SUN).multiplyScalar(320);
  sun.castShadow = true;
  sun.shadow.mapSize.set(low ? 2048 : 4096, low ? 2048 : 4096);
  Object.assign(sun.shadow.camera, { left: -220, right: 220, top: 220, bottom: -220, near: 10, far: 800 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.3;
  scene.add(sun, new THREE.HemisphereLight('#a9dcff', '#c8b488', 0.8));

  const I = world.parts;
  scene.add(buildTerrain(G, T, low ? 2 : 1));
  scene.add(...buildTrees(I.trees.attrs.inst, T, low ? 2 : 1, low ? 2 : 3));
  scene.add(...buildPalms(I.palms.attrs.inst, T));
  scene.add(buildRocks(I.rocks.attrs.inst, T));
  scene.add(buildBar(barModel, T, G));
  const clouds = buildClouds(low ? 35 : 58, low ? 3 : 4);
  scene.add(clouds);
  const water = createWater(THREE, { heights: G.h, res: G.res, size: G.size, sun: SUN, horizon: HORIZON, sky: new THREE.Color('#7cc4ee'), fog: MIST, low });
  water.mesh.renderOrder = -1;     // the sea first, so the sea floor under it is never shaded (it fails the depth test)
  scene.add(water.mesh);

  // Barnaby Bramble in his rowboat, turned to face the Pond Reels view
  const bramble = createBramble({ bramble: brambleModel, boat: boatModel }, THREE);
  bramble.group.position.fromArray(BRAMBLE.at);
  bramble.group.scale.setScalar(BRAMBLE.scale);
  { const c = VIEWS.pondreels.pos; bramble.group.rotation.y = Math.atan2(c[0] - BRAMBLE.at[0], c[2] - BRAMBLE.at[2]); }
  scene.add(bramble.group);
  const fishFacing = [VIEWS.pondreels.pos[0] - MOSSBACK[0], VIEWS.pondreels.pos[2] - MOSSBACK[2]];
  const mossback = createMossback(fishModel, fishTex, THREE, { reducedMotion, at: MOSSBACK, facing: fishFacing });
  scene.add(mossback.group);

  // ---------------------------------------------------------------- camera, flights and the render loop
  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 4000);
  const state = { view: first, flying: false, fps: 0, frames: 0, pointer: null, brambleYaw: 0, waving: false, brambleHead: [0, 0, 0] };
  let W = 1, H = 1;
  const posed = (id) => fit(VIEWS[id], W / H, id);
  let cur = posed(first), flight = null;
  const frameCbs = [], lostCbs = [];

  function resize() {
    watch();
    W = Math.max(1, canvas.clientWidth); H = Math.max(1, canvas.clientHeight);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    if (!flight) cur = posed(state.view);
    applyPose(camera, cur);
    requestFrame();
  }

  function view(id, { instant = reducedMotion } = {}) {
    if (!VIEWS[id]) return;
    state.view = id;
    if (instant) { flight = null; state.flying = false; cur = posed(id); applyPose(camera, cur); }
    else { flight = { from: cur, id, dur: FLIGHT, rise: 0.25, t0: null }; state.flying = true; }   // from wherever we are now
    requestFrame();
  }

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), look = new THREE.Vector3(), hp = new THREE.Vector3(), hit = new THREE.Sphere();
  let ready = false, time = 0, last = 0, raf = 0, oneOff = 0, started = false, onScreen = true, lost = false, fpsN = 0, fpsT = 0;
  function update(now, dt) {
    if (!reducedMotion) { time += dt; water.setTime(time); clouds.rotation.y = time * 0.004; }
    if (flight) {
      if (flight.t0 === null) flight.t0 = now;
      const p = (now - flight.t0) / 1000 / flight.dur;
      cur = lerpPose(flight.from, posed(flight.id), p, flight.rise);
      if (p >= 1) { flight = null; state.flying = false; }
    }
    applyPose(camera, cur);
    // Bramble looks at what you point at: a point half way along the pointer's ray from the camera to him
    if (state.pointer) {
      camera.updateMatrixWorld();
      ray.setFromCamera(ndc.set(state.pointer[0], state.pointer[1]), camera);
      bramble.lookAt(ray.ray.at(camera.position.distanceTo(bramble.headPosition(hp)) * 0.5, look));
    } else bramble.lookAt(null);
    bramble.update(dt, time);
    mossback.update(dt);
    state.brambleYaw = bramble.yaw; state.waving = bramble.waving;
    bramble.headPosition(hp).toArray(state.brambleHead);
    for (const cb of frameCbs) cb(dt, time);
  }
  function draw(now) {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    update(now, dt);
    renderer.render(scene, camera);
    state.frames++;
    fpsN++; if (now - fpsT >= 1000) { state.fps = Math.round((fpsN * 1000) / (now - fpsT)); fpsN = 0; fpsT = now; }
  }
  const minGap = low ? 1000 / 30 - 2 : 0;                    // phones: 30 frames a second
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last >= minGap) draw(now);
  }
  const running = () => ready && started && onScreen && !document.hidden && !lost;
  function sync() {
    const go = running() && !reducedMotion;
    if (go && !raf) { last = 0; fpsT = performance.now(); fpsN = 0; raf = requestAnimationFrame(loop); }
    if (!go && raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  // without the loop (reduced motion), draw single frames on demand
  function requestFrame() {
    if (!ready || raf || oneOff || lost || !onScreen) return;
    oneOff = requestAnimationFrame((now) => { oneOff = 0; draw(now); if (flight) requestFrame(); });
  }

  // The stage counts as off-screen once no more of it shows than the strip under the top bar (the browser's jump to
  // #beta leaves exactly that), so the observer's top edge sits just below the bar; re-made if the bar changes size.
  let io = null, barH = -1;
  function watch() {
    const bar = document.querySelector('.topbar'), h = bar ? bar.offsetHeight : 0;
    if (h === barH) return;
    barH = h;
    if (io) io.disconnect();
    io = new IntersectionObserver((entries) => { onScreen = entries[entries.length - 1].isIntersecting; sync(); if (onScreen) requestFrame(); }, { rootMargin: `-${h + 1}px 0px -1px 0px` });
    io.observe(canvas.closest('section') || canvas);
  }
  watch();
  const onVis = () => sync();
  document.addEventListener('visibilitychange', onVis);
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; sync(); lostCbs.forEach((cb) => cb()); });

  resize();
  // the opening: glide in low over the water to the first view
  if (!reducedMotion) {
    cur = fit(INTRO_FROM, W / H, 'overview');
    flight = { from: cur, id: first, dur: INTRO, rise: 0, t0: null }; state.flying = true;
    applyPose(camera, cur);
  }
  await renderer.compileAsync(scene, camera);
  renderer.render(scene, camera);
  state.frames++;
  ready = true;

  const v3 = new THREE.Vector3();
  return {
    THREE, scene, camera, renderer, state,
    view,
    pointer(x, y) { state.pointer = x === null ? null : [x, y]; },   // -1..1 across the canvas, or null when it leaves
    // Bramble waves and talks
    greet() { bramble.poke(); state.waving = true; requestFrame(); },
    // a tap at (x, y) (-1..1): true if it touched Bramble (a sphere round his head)
    tap(x, y) {
      camera.updateMatrixWorld();
      ray.setFromCamera(ndc.set(x, y), camera);
      return ray.ray.intersectsSphere(hit.set(bramble.headPosition(hp), BRAMBLE.hit * BRAMBLE.scale));
    },
    // where his head is on the canvas (css px), or null when he's behind the camera
    brambleScreen() {
      bramble.headPosition(v3).project(camera);
      return v3.z > 1 ? null : [((v3.x + 1) / 2) * W, ((1 - v3.y) / 2) * H];
    },
    start() { started = true; sync(); },
    stop() { started = false; sync(); },
    onLost(cb) { lostCbs.push(cb); },
    onFrame(cb) { frameCbs.push(cb); },
    add(obj) { scene.add(obj); renderer.shadowMap.needsUpdate = true; },
    heightAt: G.at,
    project(x, y, z) { v3.set(x, y, z).project(camera); return [((v3.x + 1) / 2) * W, ((1 - v3.y) / 2) * H]; },
    dispose() {
      started = false; sync(); if (io) io.disconnect(); ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      scene.traverse((o) => { o.geometry?.dispose(); [].concat(o.material || []).forEach((m) => m.dispose()); });
      Object.values(T).forEach((t) => t.dispose());
      renderer.dispose();
    },
  };
}
