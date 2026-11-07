"""Island tabs and cards (Playwright). Run: python3 -m pytest tools/tests/check_tabs.py -q"""
from conftest import open_page

TABS = ['overview', 'pondreels', 'lockin', 'nibi', 'soon']

def active_id(pg):
    return pg.evaluate("document.activeElement && document.activeElement.id")

def test_arrow_keys_move_focus_and_enter_selects(browser, site):
    pg, errors = open_page(browser, site + '/index.html')
    pg.focus('#tab-overview')
    pg.keyboard.press('ArrowDown'); assert active_id(pg) == 'tab-pondreels'
    pg.keyboard.press('ArrowUp'); assert active_id(pg) == 'tab-overview'
    pg.keyboard.press('End'); assert active_id(pg) == 'tab-soon'
    pg.keyboard.press('Home'); assert active_id(pg) == 'tab-overview'
    pg.keyboard.press('ArrowDown'); pg.keyboard.press('ArrowDown'); pg.keyboard.press('Enter')
    assert pg.get_attribute('#tab-lockin', 'aria-selected') == 'true'
    assert errors == []
    pg.context.close()

def test_selecting_lockin_shows_only_its_card(browser, site):
    pg, _ = open_page(browser, site + '/index.html')
    pg.click('#tab-lockin')
    assert pg.is_visible('#card-lockin')
    for other in ['card-pondreels', 'card-nibi', 'card-soon', 'panel-overview']:
        assert not pg.is_visible('#' + other), other
    assert pg.get_attribute('#tab-lockin', 'aria-selected') == 'true'
    assert [pg.get_attribute('#tab-' + t, 'aria-selected') for t in TABS].count('true') == 1
    assert pg.get_attribute('#stage', 'data-view') == 'lockin'
    tabidx = [pg.get_attribute('#tab-' + t, 'tabindex') for t in TABS]
    assert tabidx == ['-1', '-1', '0', '-1', '-1']
    pg.context.close()

def test_hover_slides_a_tab_open(browser, site):
    pg, _ = open_page(browser, site + '/index.html')
    pg.hover('#tab-nibi'); pg.wait_for_timeout(450)
    assert pg.evaluate("document.querySelector('#tab-nibi').getBoundingClientRect().width") > 150
    for t in ['overview', 'pondreels', 'lockin', 'soon']:
        assert pg.evaluate(f"document.querySelector('#tab-{t}').getBoundingClientRect().width") <= 48, t
    pg.context.close()

def test_about_link_opens_nibi_hq(browser, site):
    pg, _ = open_page(browser, site + '/index.html#about')
    pg.wait_for_timeout(300)
    assert pg.get_attribute('#tab-nibi', 'aria-selected') == 'true' and pg.is_visible('#card-nibi')
    pg.click('.topnav a[href="#games"]'); pg.wait_for_timeout(200)
    assert pg.get_attribute('#tab-overview', 'aria-selected') == 'true' and pg.is_visible('#panel-overview')
    pg.context.close()

def test_poster_link_lands_on_beta_and_stays(browser, site):          # Review Focus 1
    pg, errors = open_page(browser, site + '/index.html#beta', width=390, height=844)
    last, still = -1, 0                                   # let the browser finish its jump to #beta
    while still < 5:
        pg.wait_for_timeout(100); y = pg.evaluate('scrollY'); still = still + 1 if y == last else 0; last = y
    y0 = last
    pg.wait_for_timeout(4000)                             # then nothing (the 3D loading included) may move it
    assert pg.evaluate('scrollY') == y0
    top, bottom = pg.evaluate("(() => { const r = document.getElementById('beta').getBoundingClientRect(); return [r.top, r.bottom]; })()")
    assert top < 844 and bottom > 0 and abs(top) < 120, (top, bottom)
    assert errors == []
    pg.context.close()

def test_phone_sheet_never_covers_tabs(browser, site):                 # Review Focus 5
    pg, _ = open_page(browser, site + '/index.html', width=320, height=640)
    for t in ['pondreels', 'lockin', 'nibi', 'soon']:
        pg.click('#tab-' + t); pg.mouse.move(5, 5); pg.wait_for_timeout(350)
        for u in TABS:      # nothing sits on top of any tab: the element at its centre is the tab itself
            on_top = pg.evaluate(f"""(() => {{ const t = document.getElementById('tab-{u}'), r = t.getBoundingClientRect();
                const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!el && t.contains(el); }})()""")
            assert on_top, (t, u)
        card = pg.locator('#card-' + t).bounding_box()
        assert card['x'] + card['width'] <= 320 - 56, ('the sheet runs into the tab column', t)
    assert pg.evaluate('document.documentElement.scrollWidth') <= 320
    pg.context.close()

def test_every_tab_shows_a_focus_ring(browser, site):
    pg, _ = open_page(browser, site + '/index.html')
    for _ in range(12):
        pg.keyboard.press('Tab')
        if (active_id(pg) or '').startswith('tab-'): break
    assert (active_id(pg) or '').startswith('tab-'), 'keyboard never reached the tabs'
    for i in range(len(TABS)):
        ring = pg.evaluate("(() => { const s = getComputedStyle(document.activeElement); return [s.outlineStyle, parseFloat(s.outlineWidth)]; })()")
        assert ring[0] != 'none' and ring[1] > 0, (active_id(pg), ring)
        pg.keyboard.press('ArrowDown')
    pg.context.close()
