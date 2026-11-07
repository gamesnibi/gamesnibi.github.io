// The island tabs: a vertical tab list on the right edge of the stage. Each tab shows one panel (the overview
// hero or an island's card), keeps roving tabindex and aria-selected right, routes #games / #about / #contact,
// and tells the 3D sea which island to fly to through onSelect(id, { source }).
export const VIEWS = ['overview', 'pondreels', 'lockin', 'nibi', 'soon'];
const HASH = { '#games': 'overview', '#about': 'nibi', '#contact': 'nibi' };

export function initTabs({ onSelect = () => {} } = {}) {
  const stage = document.getElementById('stage');
  const list = stage.querySelector('[role="tablist"]');
  const tabs = VIEWS.map((id) => document.getElementById('tab-' + id));
  const panels = VIEWS.map((id) => document.getElementById(id === 'overview' ? 'panel-overview' : 'card-' + id));
  let current = null, peekTimer = 0;

  function select(id, { source = 'code' } = {}) {
    const i = VIEWS.indexOf(id);
    if (i < 0) return;
    current = id;
    tabs.forEach((t, k) => { const on = k === i; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; panels[k].hidden = !on; });
    stage.dataset.view = id;
    if (source === 'tap') {                       // phones have no hover, so the picked tab shows its name for a moment
      tabs.forEach((t) => t.classList.remove('peek'));
      tabs[i].classList.add('peek'); clearTimeout(peekTimer);
      peekTimer = setTimeout(() => tabs[i].classList.remove('peek'), 2000);
    }
    onSelect(id, { source });
  }

  list.addEventListener('click', (e) => {
    const t = e.target.closest('[role="tab"]');
    if (t) select(t.dataset.view, { source: e.pointerType === 'touch' ? 'tap' : 'click' });
  });
  list.addEventListener('keydown', (e) => {
    const k = tabs.indexOf(document.activeElement);
    if (k < 0) return;
    const to = { ArrowDown: k + 1, ArrowRight: k + 1, ArrowUp: k - 1, ArrowLeft: k - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    tabs[(to + tabs.length) % tabs.length].focus();
  });

  // #games, #about and #contact pick an island; #beta (the poster's link) only scrolls, the browser's own way
  const route = (hash) => { if (HASH[hash]) select(HASH[hash], { source: 'hash' }); };
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || !HASH[a.getAttribute('href')]) return;
    e.preventDefault();
    history.pushState(null, '', a.getAttribute('href'));
    route(a.getAttribute('href'));
    stage.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
  addEventListener('hashchange', () => route(location.hash));

  select(HASH[location.hash] || 'overview', { source: 'load' });
  document.documentElement.classList.add('tabs-ready');
  return { select, current: () => current };
}
