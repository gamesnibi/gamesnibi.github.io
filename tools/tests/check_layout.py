"""Layout checks for the home page (Playwright). Run: python3 -m pytest tools/tests/check_layout.py -q"""
import pytest
from conftest import open_page, LIGHT

WIDTHS = [320, 360, 390, 412, 768, 1280]

@pytest.mark.parametrize('w', WIDTHS)
def test_home_fits_and_is_clean(browser, site, w):
    pg, errors = open_page(browser, site + '/index.html?' + LIGHT, width=w, height=800)
    pg.wait_for_timeout(600)
    assert pg.evaluate('document.documentElement.scrollWidth') <= w, 'scrolls sideways'
    assert pg.locator('#stage').count() == 1
    assert pg.locator('#beta').count() == 1
    assert pg.locator('#beta h2').first.inner_text().strip() == 'Be one of the first to lock in.'
    missing = pg.evaluate("[...document.images].filter(i => !i.getAttribute('width') || !i.getAttribute('height')).map(i => i.getAttribute('src') || i.id)")
    assert missing == [], missing
    assert errors == [], errors
    pg.context.close()

def test_without_js_all_cards_show_in_order(browser, site):
    pg, errors = open_page(browser, site + '/index.html?' + LIGHT, width=390, js=False)
    ids = ['card-pondreels', 'card-lockin', 'card-nibi', 'card-soon']
    tops = []
    for i in ids:
        el = pg.locator('#' + i)
        assert el.count() == 1 and el.is_visible(), i
        tops.append(el.bounding_box()['y'])
    assert tops == sorted(tops)
    pg.context.close()

@pytest.mark.parametrize('w,h', [(320, 568), (360, 640)])
def test_short_phones_show_the_whole_hero(browser, site, w, h):
    pg, _ = open_page(browser, site + '/index.html?' + LIGHT, width=w, height=h)
    pg.wait_for_timeout(400)
    for a in pg.locator('#panel-overview .actions a').all():
        b = a.bounding_box()
        assert b['y'] >= 0 and b['y'] + b['height'] <= h, (a.inner_text(), b)
        assert pg.evaluate("([x, y]) => { const e = document.elementFromPoint(x, y); return !!e && !!e.closest('.actions a'); }", [b['x'] + b['width'] / 2, b['y'] + b['height'] / 2])

def test_tabs_and_cards_clear_the_notch():
    import os, re
    css = open(os.path.join(os.path.dirname(__file__), '..', '..', 'style.css'), encoding='utf-8').read()
    assert re.search(r'html\.js \.tabs \{[^}]*env\(safe-area-inset-right', css), 'tabs ignore the right safe area'
    assert re.search(r'html\.js \.cards \{[^}]*env\(safe-area-inset-left', css), 'cards ignore the left safe area'

# Lockin-Inator's look is black and purple, as on the old site (Josh, Nov 8); no orange in its card or the beta section
PAINT = """(sel) => {
  const out = [];
  for (const root of document.querySelectorAll(sel)) for (const el of [root, ...root.querySelectorAll('*')]) for (const pseudo of [null, '::before', '::after']) {
    const cs = getComputedStyle(el, pseudo);
    if (pseudo && (cs.content === 'none' || cs.content === 'normal')) continue;
    for (const prop of ['color', 'background-color', 'border-top-color', 'outline-color', 'box-shadow', 'background-image'])
      for (const m of cs.getPropertyValue(prop).matchAll(/rgba?\\(([\\d.]+), ([\\d.]+), ([\\d.]+)(?:, ([\\d.]+))?\\)/g))
        if (m[4] === undefined || +m[4] > 0.05) out.push([el.tagName + (el.className ? '.' + String(el.className).split(' ')[0] : '') + (pseudo || ''), prop, +m[1], +m[2], +m[3]]);
  }
  return out; }"""

def hue_sat(r, g, b):
    import colorsys
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    return h * 360, s, l

def test_lockin_inator_is_black_and_purple(browser, site):
    pg, _ = open_page(browser, site + '/index.html?' + LIGHT, width=1280, height=800)
    pg.click('#tab-lockin'); pg.wait_for_timeout(300)
    paints = pg.evaluate(PAINT, '#card-lockin, #beta')
    orange = [p for p in paints if 15 <= hue_sat(*p[2:])[0] <= 50 and hue_sat(*p[2:])[1] > 0.45 and hue_sat(*p[2:])[2] > 0.25]
    assert orange == [], orange[:6]
    purple = [p for p in paints if 255 <= hue_sat(*p[2:])[0] <= 290 and hue_sat(*p[2:])[1] > 0.45]
    assert len(purple) >= 5, 'the purple accents are missing'
    for sel in ['#card-lockin', '#beta']:
        r, g, b = pg.evaluate(f"getComputedStyle(document.querySelector('{sel}')).backgroundColor.match(/\\d+/g).slice(0, 3).map(Number)")
        assert max(r, g, b) < 40, (sel, 'should be near-black', (r, g, b))
