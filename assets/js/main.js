// Boot: switch the page to its JavaScript layout, wire the island tabs, and let the 3D sea (and anything else)
// listen for island changes through onIslandChange(). After the page has painted, either the live 3D sea loads or,
// where it can't run well, still pictures of each view take its place (chooseMode).
import { initTabs } from './tabs.js';
import { createBubble } from './bubble.js';

document.documentElement.classList.add('js');
const listeners = [];
export const onIslandChange = (fn) => { listeners.push(fn); };
export const tabs = initTabs({ onSelect: (id, info) => listeners.forEach((fn) => fn(id, info)) });

const params = new URLSearchParams(location.search);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- Bramble's greeting
const stage = document.getElementById('stage'), bubbleEl = document.getElementById('bubble'), sayHi = document.getElementById('say-hi');
const bubble = bubbleEl && createBubble(bubbleEl);
let sea = null;                                     // the live 3D sea, once it runs
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// put the bubble just above a point on the stage (css px), kept inside the stage and below the top bar
function placeBubble(x, y) {
  const st = stage.getBoundingClientRect(), w = bubbleEl.offsetWidth, h = bubbleEl.offsetHeight;
  const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--top')) || 64;
  const left = clamp(x - w / 2, 8, st.width - w - 8), tp = clamp(y - h - 18, top + 8, st.height - h - 8);
  bubbleEl.style.left = left + 'px'; bubbleEl.style.top = tp + 'px';
  bubbleEl.style.setProperty('--tail', clamp(x - left, 18, w - 18) + 'px');
}
function greet() {
  bubble.say();
  const p = sea && sea.brambleScreen();
  if (sea) sea.greet();
  if (p) placeBubble(p[0], p[1]);
  else { const b = sayHi.getBoundingClientRect(), st = stage.getBoundingClientRect(); placeBubble(b.left - st.left + b.width / 2, b.top - st.top); }
}
if (sayHi && bubble) sayHi.addEventListener('click', greet);

// phones and small-memory devices get the lighter sea (fewer trees and clouds, 30 frames a second)
function quality() {
  const q = params.get('q');
  if (q === 'low' || q === 'high') return q;
  return matchMedia('(max-width: 720px), (pointer: coarse)').matches || (navigator.deviceMemory || 8) <= 4 ? 'low' : 'high';
}

// the pointer, as -1..1 across the stage
const toSea = (e) => { const r = stage.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2]; };

async function startSea() {
  const canvas = document.getElementById('sea');
  if (!canvas || !stage) return;
  try {
    const { createSea } = await import('./sea/scene.js');
    const test = params.get('test') === '1';   // the checks run in a software renderer: they may draw at a lower scale
    sea = await createSea(canvas, { quality: quality(), reducedMotion, view: tabs.current() || 'overview', pixelRatio: test ? +params.get('scale') || 0 : 0 });
    onIslandChange((id) => { if (sea) sea.view(id); });
    // Bramble watches the mouse; on a touch screen he looks where you last touched, for a few seconds
    let touchT = 0;
    stage.addEventListener('pointermove', (e) => { if (sea && e.pointerType !== 'touch') sea.pointer(...toSea(e)); }, { passive: true });
    stage.addEventListener('pointerleave', (e) => { if (sea && e.pointerType !== 'touch') sea.pointer(null); });
    stage.addEventListener('pointerdown', (e) => {
      if (!sea || e.pointerType !== 'touch') return;
      sea.pointer(...toSea(e)); clearTimeout(touchT); touchT = setTimeout(() => { if (sea) sea.pointer(null); }, 3000);
    }, { passive: true });
    // tapping Bramble on the sea greets him (taps on the cards, tabs and buttons are theirs)
    stage.addEventListener('click', (e) => {
      if (e.target.closest('a, button, .card, .hero-card, .tabs, .bubble')) return;
      if (sea && sea.tap(...toSea(e))) greet();
    });
    // the bubble follows his head while it shows
    sea.onFrame(() => { if (sea && bubbleEl.classList.contains('show')) { const p = sea.brambleScreen(); if (p) placeBubble(p[0], p[1]); } });
    // if the graphics chip resets or drops the page, the still pictures take over (and stay)
    sea.onLost(() => { const gone = sea; sea = null; gone.dispose(); goStill(); });
    document.documentElement.classList.add('live');
    sea.start();
    if (test) window.__sea = { state: sea.state, view: sea.view, heightAt: sea.heightAt, project: sea.project };
    return sea;
  } catch (err) {
    console.warn('NiBi: the 3D sea could not start', err);
    sea = null; goStill();
  }
}

// ---------------------------------------------------------------- live 3D or still pictures
// Still pictures for browsers without WebGL2, devices with 2 GB of memory or less, Save-Data, and reduce motion.
// (?mode=live or ?mode=still picks one, for trying them out.)
export function chooseMode({ webgl2 = hasWebGL2, memory = navigator.deviceMemory, saveData = navigator.connection && navigator.connection.saveData, reduced = reducedMotion, forced = params.get('mode') } = {}) {
  if (forced === 'live' || forced === 'still') return forced;
  if ((memory && memory <= 2) || saveData || reduced) return 'still';
  return (typeof webgl2 === 'function' ? webgl2() : webgl2) ? 'live' : 'still';
}
function hasWebGL2() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();   // (only asking)
    return true;
  } catch { return false; }
}

const STILL_ALT = {
  pondreels: "Pond Reels island: jungle hills wrapped round a calm turquoise bay, where Barnaby Bramble sits in his rowboat.",
  lockin: "Señor Orange's island: a long white beach with palms, tall rock towers and an orange beach bar.",
  nibi: 'NiBi HQ: a big jungle mountain island with rock spires and a sandy cove.',
  soon: 'A little sandbar with a few palms, waiting for the next game.',
};
// a view's still picture (wide, or tall on portrait screens), made the first time it's needed
// (a picture fades in once its image has loaded, so a slow one never shows as a blank)
function whenLoaded(p) {
  const img = p.querySelector('img'), on = () => p.classList.add('ready');
  if (img.complete && img.naturalWidth) on(); else img.addEventListener('load', on, { once: true });
}
function stillPicture(id) {
  let p = stage.querySelector('.view-still[data-view="' + id + '"]');
  if (p) { whenLoaded(p); return p; }
  if (!STILL_ALT[id]) return null;
  p = document.createElement('picture');
  p.className = 'view-still'; p.dataset.view = id;
  p.innerHTML = '<source media="(max-aspect-ratio: 1/1)" srcset="assets/stills/' + id + '-tall.webp" width="900" height="1600">'
    + '<img src="assets/stills/' + id + '-wide.webp" width="1600" height="900" decoding="async" alt="">';
  p.querySelector('img').alt = STILL_ALT[id];
  stage.querySelector('.view-still:last-of-type').after(p);
  whenLoaded(p);
  return p;
}
let still = false;
function goStill() {
  if (still) return;
  still = true;
  const html = document.documentElement;
  html.classList.remove('live'); html.classList.add('still');
  stillPicture(tabs.current() || 'overview');
  onIslandChange((id) => stillPicture(id));
}

function start() { if (chooseMode() === 'live') startSea(); else goStill(); }
if (document.readyState === 'complete') setTimeout(start, 0);
else addEventListener('load', () => setTimeout(start, 0), { once: true });
