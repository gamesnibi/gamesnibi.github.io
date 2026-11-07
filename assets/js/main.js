// Boot: switch the page to its JavaScript layout, wire the island tabs, and let the 3D sea (and anything else)
// listen for island changes through onIslandChange().
import { initTabs } from './tabs.js';

document.documentElement.classList.add('js');
const listeners = [];
export const onIslandChange = (fn) => { listeners.push(fn); };
export const tabs = initTabs({ onSelect: (id, info) => listeners.forEach((fn) => fn(id, info)) });
