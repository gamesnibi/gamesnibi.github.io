// Old Mossback, the Pond Reels boss fish, leaping out of the bay now and then: a parabolic arc, nose up on the way
// out and down on the way back, his tail wagging (the game's own fish wag, in the vertex shader), a foam ring and
// a burst of droplets where he leaves the water and where he comes back down.
import { rng } from './world.js';

export const LEAP = { duration: 1.4, height: 3.5, distance: 6 };   // seconds, metres up, metres across
const EVERY = [8, 14], FIRST = [5, 8];                             // seconds between leaps; the first comes sooner
const SIZE = 5;                                                    // metres, nose to tail: a legend
const INK = [0.16, 0.09, 0.04];

// where he is tLocal seconds into a leap: height of his middle, nose pitch (up is positive), shown or not
export function leapPose(tLocal) {
  const u = tLocal / LEAP.duration;
  if (!(u > 0 && u < 1)) return { y: 0, pitch: 0, visible: false, u };
  const y = 4 * LEAP.height * u * (1 - u);
  return { y, pitch: Math.atan2(4 * LEAP.height * (1 - 2 * u), LEAP.distance), visible: true, u };
}

// the game's fish wag (FISH_VS): a travelling wave down the body, a C-bend, and fluttering paired fins
const WAG = `
uniform vec4 uWag; uniform vec2 uBody; uniform float uClock;
attribute vec3 info;
void fishWag(inout vec3 p, inout vec3 n) {
  if (info.x > 1.5) p += n * sin(uClock * 6.5 + info.z * 0.7) * 0.022 * info.y * uWag.w;
  float f = clamp((uBody.x - p.x) / uBody.y, 0.0, 1.0);
  float k = f * f;
  float ph = uWag.x - f * 5.2;
  p.z += uWag.y * k * sin(ph) + uWag.z * k;
  float dodf = uWag.y * (2.0 * f * sin(ph) - k * 5.2 * cos(ph)) + uWag.z * 2.0 * f;
  float m = -dodf / uBody.y;
  float cphi = inversesqrt(1.0 + m * m), sphi = m * cphi;
  n = vec3(n.x * cphi - n.z * sphi, n.y, n.x * sphi + n.z * cphi);
}`;

export function createMossback(model, texture, THREE, { reducedMotion = false, at = [0, 0, 0], facing = [0, 1], seed = 9 } = {}) {
  const part = model.parts.fish, A = part.attrs, meta = model.meta;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(A.position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(A.normal, 3, true));
  geo.setAttribute('uv', new THREE.BufferAttribute(A.uv, 2));
  geo.setAttribute('info', new THREE.BufferAttribute(A.info, 3));
  geo.setIndex(new THREE.BufferAttribute(part.index, 1));
  // the outline goes round the body only (the fins are cut-outs), as in the game
  const hull = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'info']) hull.setAttribute(k, geo.getAttribute(k));
  hull.setIndex(new THREE.BufferAttribute(part.index.subarray(0, meta.bodyCount || part.index.length), 1));

  const uniforms = { uWag: { value: new THREE.Vector4() }, uBody: { value: new THREE.Vector2(...(meta.body || [0.5, 1])) }, uClock: { value: 0 } };
  const skin = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.45, metalness: 0, side: THREE.DoubleSide });
  skin.customProgramCacheKey = () => 'mossback';
  skin.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>' + WAG + '\nvarying float vFin;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvec3 wagP = position; fishWag(wagP, objectNormal); vFin = info.x;')
      .replace('#include <begin_vertex>', 'vec3 transformed = wagP;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFin;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n#ifdef USE_MAP\n if (vFin > 0.5 && sampledDiffuseColor.a < 0.5) discard;\n#endif');
  };
  const line = new THREE.ShaderMaterial({
    side: THREE.BackSide, toneMapped: false,
    uniforms: { ...uniforms, uInk: { value: new THREE.Color().setRGB(...INK, THREE.SRGBColorSpace) }, uWidth: { value: 1.3 }, uRes: { value: new THREE.Vector2(1, 1) } },
    vertexShader: WAG + `
      uniform float uWidth; uniform vec2 uRes;
      void main() {
        vec3 p = position, n = normal; fishWag(p, n);
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        vec2 d = (projectionMatrix * vec4(normalize(normalMatrix * n), 0.0)).xy;
        float l = length(d); if (l > 1e-5) d /= l;
        clip.xy += d * uWidth * 2.0 / uRes * clip.w;
        gl_Position = clip;
      }`,
    fragmentShader: `uniform vec3 uInk; void main() { gl_FragColor = vec4(uInk, 1.0);
      #include <colorspace_fragment>
    }`,
  });

  const group = new THREE.Group();
  group.position.fromArray(at);
  const fish = new THREE.Group();
  fish.rotation.order = 'YZX';
  fish.scale.setScalar(SIZE);
  const body = new THREE.Mesh(geo, skin), outline = new THREE.Mesh(hull, line);
  const res = new THREE.Vector2();
  outline.onBeforeRender = (renderer) => { renderer.getDrawingBufferSize(res); line.uniforms.uRes.value.copy(res); line.uniforms.uWidth.value = 1.3 * renderer.getPixelRatio(); };
  body.frustumCulled = outline.frustumCulled = false;   // (the wag moves the tail outside the bounds)
  fish.add(body, outline);
  fish.visible = false;
  group.add(fish);

  // ---------------------------------------------------------------- splashes: a foam ring and a burst of droplets
  const ringGeo = new THREE.RingGeometry(0.55, 1, 40).rotateX(-Math.PI / 2);
  const rings = [0, 1].map(() => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xf4fbff, transparent: true, depthWrite: false }));
    m.visible = false; group.add(m); return m;
  });
  const N = 14;
  const drops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, emissive: 0x9fd8ee, emissiveIntensity: 0.35 }), N * 2);
  drops.frustumCulled = false; drops.visible = false; group.add(drops);
  const dropV = new Float32Array(N * 2 * 4);           // vx, vy, vz, size
  const splashes = [{ at: null, t0: -9 }, { at: null, t0: -9 }];
  const R = rng(seed);
  function splash(i, x, z, now) {
    splashes[i].at = [x, z]; splashes[i].t0 = now;
    for (let k = i * N; k < (i + 1) * N; k++) {
      const a = R() * Math.PI * 2, s = 1 + R() * 2.2;
      dropV.set([Math.cos(a) * s, 3.5 + R() * 3, Math.sin(a) * s, 0.1 + R() * 0.14], k * 4);
    }
  }

  // ---------------------------------------------------------------- the schedule
  let clock = 0, start = -99, next = FIRST[0] + R() * (FIRST[1] - FIRST[0]);
  const dir = new THREE.Vector2(), side = new THREE.Vector2(facing[1], -facing[0]).normalize();   // across the view
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
  const SPLASH = 1.0;

  function update(dt) {
    clock += dt;
    if (reducedMotion) { fish.visible = false; return; }
    if (clock >= next) {
      start = next; next = start + EVERY[0] + R() * (EVERY[1] - EVERY[0]);
      const s = R() < 0.5 ? 1 : -1, j = (R() - 0.5) * 0.8;               // side-on to the view, either way, a little off
      dir.copy(side).multiplyScalar(s).rotateAround({ x: 0, y: 0 }, j);
      splash(0, -dir.x * LEAP.distance / 2, -dir.y * LEAP.distance / 2, start);
    }
    const tl = clock - start, pose = leapPose(tl);
    fish.visible = pose.visible;
    if (pose.visible) {
      const u = pose.u;
      fish.position.set(dir.x * LEAP.distance * (u - 0.5), pose.y, dir.y * LEAP.distance * (u - 0.5));
      fish.rotation.set(Math.sin(clock * 3) * 0.08, Math.atan2(-dir.y, dir.x), pose.pitch);
      uniforms.uWag.value.set(clock * 14, 0.12, Math.sin(clock * 3) * 0.05, 1);
      uniforms.uClock.value = clock;
    }
    if (tl >= LEAP.duration && splashes[1].t0 < start) splash(1, dir.x * LEAP.distance / 2, dir.y * LEAP.distance / 2, start + LEAP.duration);
    // the splashes: rings spread and fade, droplets fly and fall
    let anyDrop = false;
    splashes.forEach((sp, i) => {
      const age = clock - sp.t0, live = sp.at && age >= 0 && age < SPLASH;
      const ring = rings[i];
      ring.visible = live;
      if (live) {
        ring.position.set(sp.at[0], 0.06, sp.at[1]);
        ring.scale.setScalar(0.8 + age * 3.2);
        ring.material.opacity = 0.85 * (1 - age / SPLASH);
        for (let k = i * N; k < (i + 1) * N; k++) {
          const [vx, vy, vz, r] = dropV.subarray(k * 4, k * 4 + 4), y = vy * age - 4.9 * age * age;
          m4.compose(pv.set(sp.at[0] + vx * age, y, sp.at[1] + vz * age), q, sv.setScalar(y > -0.2 ? r : 0));
          drops.setMatrixAt(k, m4);
        }
        anyDrop = true;
      } else for (let k = i * N; k < (i + 1) * N; k++) drops.setMatrixAt(k, m4.makeScale(0, 0, 0));
    });
    drops.visible = anyDrop;
    if (anyDrop) drops.instanceMatrix.needsUpdate = true;
  }

  return { group, fish, update };
}
