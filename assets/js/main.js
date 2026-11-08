// Boot: switch the page to its JavaScript layout, wire the island tabs, and let the 3D sea (and anything else)
// listen for island changes through onIslandChange(). The sea loads after the page has painted.
import { initTabs } from './tabs.js';

document.documentElement.classList.add('js');
const listeners = [];
export const onIslandChange = (fn) => { listeners.push(fn); };
export const tabs = initTabs({ onSelect: (id, info) => listeners.forEach((fn) => fn(id, info)) });

const params = new URLSearchParams(location.search);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// phones and small-memory devices get the lighter sea (fewer trees and clouds, 30 frames a second)
function quality() {
  const q = params.get('q');
  if (q === 'low' || q === 'high') return q;
  return matchMedia('(max-width: 720px), (pointer: coarse)').matches || (navigator.deviceMemory || 8) <= 4 ? 'low' : 'high';
}

async function startSea() {
  const canvas = document.getElementById('sea'), stage = document.getElementById('stage');
  if (!canvas || !stage) return;
  try {
    const { createSea } = await import('./sea/scene.js');
    const test = params.get('test') === '1';   // the checks run in a software renderer: they may draw at a lower scale
    const sea = await createSea(canvas, { quality: quality(), reducedMotion, view: tabs.current() || 'overview', pixelRatio: test ? +params.get('scale') || 0 : 0 });
    onIslandChange((id) => sea.view(id));
    stage.addEventListener('pointermove', (e) => {
      const r = stage.getBoundingClientRect();
      sea.pointer(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2);
    }, { passive: true });
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
