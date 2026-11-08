// Boot: switch the page to its JavaScript layout, wire the island tabs, and let the 3D sea (and anything else)
// listen for island changes through onIslandChange(). The sea loads after the page has painted.
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
    onIslandChange((id) => sea.view(id));
    // Bramble watches the mouse; on a touch screen he looks where you last touched, for a few seconds
    let touchT = 0;
    stage.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') sea.pointer(...toSea(e)); }, { passive: true });
    stage.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') sea.pointer(null); });
    stage.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      sea.pointer(...toSea(e)); clearTimeout(touchT); touchT = setTimeout(() => sea.pointer(null), 3000);
    }, { passive: true });
    // tapping Bramble on the sea greets him (taps on the cards, tabs and buttons are theirs)
    stage.addEventListener('click', (e) => {
      if (e.target.closest('a, button, .card, .hero-card, .tabs, .bubble')) return;
      if (sea.tap(...toSea(e))) greet();
    });
    // the bubble follows his head while it shows
    sea.onFrame(() => { if (bubbleEl.classList.contains('show')) { const p = sea.brambleScreen(); if (p) placeBubble(p[0], p[1]); } });
    document.documentElement.classList.add('live');
    sea.start();
    if (test) window.__sea = { state: sea.state, view: sea.view, heightAt: sea.heightAt, project: sea.project };
    return sea;
  } catch (err) {
    console.warn('NiBi: the 3D sea could not start', err);
  }
}

if (document.readyState === 'complete') setTimeout(startSea, 0);
else addEventListener('load', () => setTimeout(startSea, 0), { once: true });
