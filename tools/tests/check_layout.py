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
