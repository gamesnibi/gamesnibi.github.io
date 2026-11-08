// Camera views and the flights between them. A pose is { pos: [x,y,z], target: [x,y,z], fov, ox, oy }, where
// ox and oy shift the picture sideways and up (a fraction of the screen) so the island sits clear of its card.
export const FLIGHT = 1.6;   // seconds for a flight between islands
export const INTRO = 2.4;    // seconds for the opening glide
export const INTRO_FROM = { pos: [0, 60, 380], target: [0, 8, -20], fov: 42 };   // low over the water, looking in

const DESIGN_ASPECT = 1.25;   // every screen shows at least the width a 5:4 screen shows
const MAX_FOV = 60;

export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const rad = (deg) => (deg * Math.PI) / 180;

// Fit a designed view to the screen: on narrow screens widen the lens (up to 60°) and step back along the line of
// sight until the island fits across; then nudge the picture clear of the card (right of it on wide screens, above
// the bottom sheet on phones). The overview has no card, only the hero at the top left.
export function fit(view, aspect, id = '') {
  const tall = aspect < 1;
  const island = id !== 'overview';
  // a tall screen steps far back for the overview; look down more steeply so the ring of clouds stays out of the way
  // (and frame it a little tighter: the far mist islands may fall off the sides, the islands themselves stay bigger)
  if (tall && !island) view = steepen(view, 64);
  const need = Math.tan(rad(view.fov) / 2) * (tall && !island ? 0.95 : DESIGN_ASPECT);
  let fov = view.fov, k = 1;
  if (aspect * Math.tan(rad(fov) / 2) < need) {
    fov = Math.min(MAX_FOV, (2 * Math.atan(need / aspect) * 180) / Math.PI);
    k = need / (aspect * Math.tan(rad(fov) / 2));
  }
  const pos = view.pos.map((v, i) => view.target[i] + (v - view.target[i]) * k);
  const ox = tall ? 0 : island ? -0.1 : -0.04;
  const oy = tall ? (island ? 0.16 : -0.16) : 0;
  return { pos, target: view.target.slice(), fov, ox, oy };
}

// the same view from the same distance, looking down at `deg` degrees (if it was looking down less steeply)
function steepen(view, deg) {
  const d = view.pos.map((v, i) => v - view.target[i]), flat = Math.hypot(d[0], d[2]), len = Math.hypot(flat, d[1]);
  if (Math.atan2(d[1], flat) >= rad(deg)) return view;
  const k = (len * Math.cos(rad(deg))) / flat;
  return { ...view, pos: [view.target[0] + d[0] * k, view.target[1] + len * Math.sin(rad(deg)), view.target[2] + d[2] * k] };
}

// The pose t (0..1, raw time) of the way from `from` to `to`, eased, on an arc that rises by `rise` times the distance.
export function lerpPose(from, to, t, rise = 0.25) {
  const e = ease(Math.min(1, Math.max(0, t)));
  const d = Math.hypot(to.pos[0] - from.pos[0], to.pos[1] - from.pos[1], to.pos[2] - from.pos[2]);
  const pos = mix3(from.pos, to.pos, e);
  pos[1] += rise * d * Math.sin(Math.PI * e);
  return { pos, target: mix3(from.target, to.target, e), fov: mix(from.fov, to.fov, e), ox: mix(from.ox || 0, to.ox || 0, e), oy: mix(from.oy || 0, to.oy || 0, e) };
}

export function applyPose(camera, p) {
  camera.position.set(p.pos[0], p.pos[1], p.pos[2]);
  camera.lookAt(p.target[0], p.target[1], p.target[2]);
  camera.fov = p.fov;
  const a = camera.aspect;                                  // (setViewOffset sets the aspect from its full size)
  camera.setViewOffset(a, 1, (p.ox || 0) * a, p.oy || 0, a, 1);   // shift by fractions of the screen; updates the projection
}

export function flyTo(camera, from, to, t, rise = 0.25) {
  const p = lerpPose(from, to, t, rise);
  applyPose(camera, p);
  return p;
}
