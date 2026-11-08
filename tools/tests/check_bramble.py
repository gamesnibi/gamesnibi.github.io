"""Bramble in the Pond Reels bay: he follows the pointer, and waves and talks when greeted (Playwright + SwiftShader).
Run: python3 -m pytest tools/tests/check_bramble.py -q"""
import json, os, re
from conftest import open_page, LIGHT
from check_sea import wait

HERE = os.path.dirname(os.path.abspath(__file__))
def lines():   # Bramble's lines, as bubble.js lists them
    src = open(os.path.join(HERE, '..', '..', 'assets', 'js', 'bubble.js'), encoding='utf-8').read()
    return json.loads(re.search(r'export const LINES = (\[.*?\]);', src, re.S).group(1))

def at_pond_reels(browser, site, w=1280, h=800):
    pg, errors = open_page(browser, site + '/index.html?' + LIGHT, width=w, height=h)
    assert wait(pg, '!!(window.__sea && window.__sea.state.frames > 1)', 60), 'the sea never drew'
    pg.click('#tab-pondreels')
    assert wait(pg, "window.__sea.state.view === 'pondreels' && !window.__sea.state.flying && window.__sea.state.frames > 4", 60)
    return pg, errors

def test_bramble_turns_his_head_after_the_pointer(browser, site):
    pg, _ = at_pond_reels(browser, site)
    pg.mouse.move(1280 * 0.06, 800 * 0.4)
    assert wait(pg, 'window.__sea.state.brambleYaw < -0.2', 30), pg.evaluate('window.__sea.state.brambleYaw')
    pg.mouse.move(1280 * 0.88, 800 * 0.4, steps=4)
    assert wait(pg, 'window.__sea.state.brambleYaw > 0.2', 30), pg.evaluate('window.__sea.state.brambleYaw')

def test_say_hi_button_works_by_keyboard(browser, site):                # Review Focus 4
    pg, errors = at_pond_reels(browser, site)
    pg.focus('#say-hi'); pg.keyboard.press('Enter')
    assert wait(pg, "document.getElementById('bubble').textContent.length > 0", 5)
    assert pg.text_content('#bubble') in lines()
    assert pg.evaluate('window.__sea.state.waving') is True
    assert pg.get_attribute('#bubble', 'aria-live') == 'polite'
    assert errors == [], errors

def test_tapping_bramble_on_the_sea_greets_him(browser, site):
    pg, _ = at_pond_reels(browser, site)
    x, y = pg.evaluate('window.__sea.project(...window.__sea.state.brambleHead)')
    assert 0 < x < 1280 and 0 < y < 800, (x, y)
    pg.mouse.click(x, y)
    assert wait(pg, "document.getElementById('bubble').textContent.length > 0", 5), 'no greeting'
    assert pg.text_content('#bubble') in lines()
    assert pg.evaluate('window.__sea.state.waving') is True
    # the bubble sits inside the screen
    box = pg.locator('#bubble').bounding_box()
    assert box['x'] >= 0 and box['y'] >= 0 and box['x'] + box['width'] <= 1280 and box['y'] + box['height'] <= 800, box
