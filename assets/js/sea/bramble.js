// Barnaby Bramble, the in-game 3D model, in his rowboat. He breathes, blinks, turns his head to whatever you point
// at, and when poked he waves and talks, all posed the way the game poses him (shop.js). Every part gets the game's
// inked outline (an inverted hull, a constant number of pixels wide).
const INK = [0.16, 0.09, 0.04];
const YAW = 0.6, PITCH = 0.25, EASE = 4;          // head limits (rad) and easing rate (per second)
const WAVE = 1.8, TALK = 2.5;                      // seconds

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createBramble(models, THREE, { outline = 1.5 } = {}) {
  const P = models.bramble.meta.pivots;
  const ink = new THREE.Color().setRGB(...INK, THREE.SRGBColorSpace);
  const outlines = [];

  function geometry(part) {
    const g = new THREE.BufferGeometry(), A = part.attrs;
    g.setAttribute('position', new THREE.BufferAttribute(A.position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(A.normal, 3, true));
    // the game's colours are sRGB; three.js lights in linear
    const c = new Float32Array(A.color.length), col = new THREE.Color();
    for (let i = 0; i < c.length; i += 3) { col.setRGB(A.color[i] / 255, A.color[i + 1] / 255, A.color[i + 2] / 255, THREE.SRGBColorSpace); c[i] = col.r; c[i + 1] = col.g; c[i + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    if (part.index) g.setIndex(new THREE.BufferAttribute(part.index, 1));
    return g;
  }
  const skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 });
  function outlineMaterial(px) {
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide, toneMapped: false,
      uniforms: { uInk: { value: ink }, uWidth: { value: px }, uRes: { value: new THREE.Vector2(1, 1) } },
      vertexShader: `uniform float uWidth; uniform vec2 uRes;
        void main() {
          vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          vec2 d = (projectionMatrix * vec4(normalize(normalMatrix * normal), 0.0)).xy;
          float l = length(d); if (l > 1e-5) d /= l;
          clip.xy += d * uWidth * 2.0 / uRes * clip.w;
          gl_Position = clip;
        }`,
      fragmentShader: `uniform vec3 uInk; void main() { gl_FragColor = vec4(uInk, 1.0);
        #include <colorspace_fragment>
      }`,
    });
    outlines.push(m);
    return m;
  }
  // a part: the mesh plus its outline (width as a share of the usual one, like the game's), under a pivot
  function part(name, parent, width = 1) {
    const g = geometry(models.bramble.parts[name] || models.boat.parts[name]);
    const mesh = new THREE.Mesh(g, skin);
    mesh.receiveShadow = true;
    parent.add(mesh);
    if (!width) return [mesh];
    const line = new THREE.Mesh(g, outlineMaterial(outline * width));
    line.onBeforeRender = setRes;
    parent.add(line);
    return [mesh, line];
  }
  const res = new THREE.Vector2();
  function setRes(renderer) {
    renderer.getDrawingBufferSize(res);
    const k = renderer.getPixelRatio();
    for (const m of outlines) { m.uniforms.uRes.value.copy(res); m.uniforms.uWidth.value = m.userData.css * k; }
  }

  // the boat (white with a blue trim), across his lap, and Bramble sitting in it, as in the game's own render
  const group = new THREE.Group();                    // origin on the water, Bramble facing +z
  const bob = new THREE.Group(); group.add(bob);
  const boat = new THREE.Group(); boat.rotation.y = Math.PI / 2; boat.scale.setScalar(1.35); bob.add(boat);
  part('boat', boat);
  const body = new THREE.Group(); body.position.set(0, 0.1, 0); body.rotation.order = 'YXZ'; bob.add(body);
  part('body', body);
  const arm = new THREE.Group(); arm.position.fromArray(P.shoulder); arm.rotation.order = 'YXZ'; body.add(arm);
  part('rarm', arm);
  const head = new THREE.Group(); head.position.fromArray(P.neck); head.rotation.order = 'YXZ'; body.add(head);
  part('head', head);
  const lids = part('lids', head, 0.8);
  for (const m of lids) m.visible = false;
  const brows = new THREE.Group(); head.add(brows); part('brows', brows, 0.9);
  const mouth = new THREE.Group(); mouth.position.fromArray(P.mouth); head.add(mouth); part('mouth', mouth, 0);
  const hat = new THREE.Group(); hat.position.fromArray(P.hatPose.pos); hat.rotation.order = 'YXZ';
  hat.rotation.set(P.hatPose.rot[1], P.hatPose.rot[0], P.hatPose.rot[2]); head.add(hat);
  part('hat', hat);
  for (const m of outlines) m.userData.css = m.uniforms.uWidth.value;

  // ---------------------------------------------------------------- behaviour
  let yaw = 0, pitch = 0, target = null, blink = 0, blinkT = 2, wave = 0, talk = 0;
  const v = new THREE.Vector3(), inv = new THREE.Matrix4();

  function update(dt, t) {
    // where to look: the pointer's point, in his own frame (head height), or a slow idle wander
    let ty = Math.sin(t * 0.37) * 0.25 + Math.sin(t * 0.13) * 0.15, tp = Math.sin(t * 0.29) * 0.06;
    if (target) {
      inv.copy(body.matrixWorld).invert();
      v.copy(target).applyMatrix4(inv).sub(head.position);
      ty = Math.atan2(v.x, v.z);
      tp = -Math.atan2(v.y, Math.hypot(v.x, v.z));
    }
    const k = 1 - Math.exp(-dt * EASE);
    yaw += (clamp(ty, -YAW, YAW) - yaw) * k;
    pitch += (clamp(tp, -PITCH, PITCH) - pitch) * k;

    blinkT -= dt; if (blinkT <= 0) { blink = 0.14; blinkT = 1.8 + Math.random() * 3.2; }
    blink = Math.max(0, blink - dt);
    wave = Math.max(0, wave - dt); talk = Math.max(0, talk - dt);
    const talking = talk > 0;

    // the game's pose (shop.js): a gentle sway and breath, the head nodding while he talks
    body.rotation.set(0, Math.sin(t * 0.4) * 0.05, Math.sin(t * 0.8) * 0.015);
    body.scale.set(1, 1 + Math.sin(t * 1.7) * 0.012, 1);
    if (wave > 0) arm.rotation.set(-0.4, 0, 2.3 + Math.sin(t * 10) * 0.35);
    else if (talking) arm.rotation.set(-0.25 - Math.max(0, Math.sin(t * 5)) * 0.25, 0, 0.25);
    else arm.rotation.set(0, 0, 0);
    head.rotation.set(pitch + (talking ? Math.sin(t * 9) * 0.05 : 0), yaw, Math.sin(t * 0.6) * 0.04);
    brows.position.y = talking ? 0.02 + Math.max(0, Math.sin(t * 6.5)) * 0.03 : 0;
    mouth.scale.set(1.15, talking ? 0.35 + Math.abs(Math.sin(t * 15)) * 0.9 : 0.12, 1);
    for (const m of lids) m.visible = blink > 0;

    // bobbing in the bay's small waves
    bob.position.y = Math.sin(t * 1.3) * 0.05 + Math.sin(t * 2.1 + 1) * 0.03;
    bob.rotation.set(Math.sin(t * 1.1) * 0.025, 0, Math.sin(t * 0.9 + 0.5) * 0.03);
  }

  return {
    group, update,
    lookAt(point) { target = point ? (target || new THREE.Vector3()).copy(point) : null; },
    poke() { wave = WAVE; talk = TALK; },
    get yaw() { return yaw; },
    get waving() { return wave > 0; },
    headPosition(out = new THREE.Vector3()) { return head.localToWorld(out.set(0, 0.1, 0)); },
  };
}
