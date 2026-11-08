"""The live 3D sea (Playwright + SwiftShader, so frames are slow; the page runs at 640x400 with ?test=1&q=low).
Run: python3 -m pytest tools/tests/check_sea.py -q"""
import io, time
import numpy as np
from PIL import Image
from conftest import open_page

URL = '/index.html?test=1&q=low'
FAST = URL + '&scale=0.25'      # timing checks draw at a quarter scale so software rendering keeps up

def wait(pg, cond, timeout):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if pg.evaluate(cond): return True
        pg.wait_for_timeout(100)
    return False

def ready_page(browser, site, url=FAST, **kw):
    pg, errors = open_page(browser, site + url, width=640, height=400, **kw)
    assert wait(pg, '!!(window.__sea && window.__sea.state && window.__sea.state.frames > 1)', 60), 'the sea never drew'
    return pg, errors

def canvas_rgb(pg):
    # only the 3D: hide the page furniture that floats over the canvas
    pg.add_style_tag(content='.topbar, .hero, .tabs, .cards { visibility: hidden !important; }')
    pg.wait_for_timeout(50)
    return np.asarray(Image.open(io.BytesIO(pg.locator('#sea').screenshot())).convert('RGB')).astype(np.float32) / 255

def test_sea_draws_turquoise_shallows_and_darker_deep_water(browser, site):
    pg, errors = ready_page(browser, site, URL + '&scale=0.5')   # half scale: true colours, frames fast enough
    pg.evaluate("window.__sea.view('overview', { instant: true })")
    f0 = pg.evaluate('window.__sea.state.frames'); assert wait(pg, f'window.__sea.state.frames > {f0 + 1}', 30)
    assert wait(pg, "getComputedStyle(document.getElementById('sea')).opacity === '1'", 30), 'the sea never faded in'
    assert -2.6 < pg.evaluate('window.__sea.heightAt(-75, 26)') < -0.8, 'the lagoon point should be shallow'
    assert pg.evaluate('window.__sea.heightAt(-10, -30)') < -8, 'the deep point should be deep'
    img = canvas_rgb(pg)
    assert img.std() > 0.05, 'the canvas is one flat colour'
    (lx, ly), (dx, dy) = pg.evaluate('[window.__sea.project(-75, 0, 26), window.__sea.project(-10, 0, -30)]')
    sx, sy = img.shape[1] / 640, img.shape[0] / 400
    lag = img[int(ly * sy) - 2:int(ly * sy) + 3, int(lx * sx) - 2:int(lx * sx) + 3].reshape(-1, 3).mean(0)
    deep = img[int(dy * sy) - 2:int(dy * sy) + 3, int(dx * sx) - 2:int(dx * sx) + 3].reshape(-1, 3).mean(0)
    assert lag[1] > 0.55 and lag[2] > 0.55 and lag[0] < 0.45, ('lagoon colour', lag)
    assert deep.sum() < lag.sum(), ('deep water should be darker', deep, lag)
    assert errors == [], errors
    pg.context.close()

# Click tabs inside the page and time the flight with the page's own clock, frame by frame (Playwright's polling
# stalls while the software renderer works, so it can't time a 1.6 s flight). Resolves with ms from the last click
# to the frame where the sea reports it has arrived.
FLY = """async ([ids, gap, want]) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const [i, id] of ids.entries()) { if (i) await sleep(gap); document.getElementById('tab-' + id).click(); }
  const t0 = performance.now();
  return await new Promise((res) => { const f = () => (window.__sea.state.view === want && !window.__sea.state.flying)
    ? res(performance.now() - t0) : (performance.now() - t0 > 20000 ? res(-1) : requestAnimationFrame(f)); f(); });
}"""
SLOW_FRAME = 1000   # one software-rendered frame, at most

def settled_page(browser, site):
    # past the opening glide, with every island drawn once (first draws upload their buffers, which is slow here)
    pg, errors = ready_page(browser, site)
    assert wait(pg, '!window.__sea.state.flying && window.__sea.state.frames > 4', 60), 'the opening glide never ended'
    return pg, errors

def test_flying_to_lockin(browser, site):
    pg, _ = settled_page(browser, site)
    ms = pg.evaluate(FLY, [['lockin'], 0, 'lockin'])
    assert 0 < ms <= 2500 + SLOW_FRAME, (ms, pg.evaluate('JSON.stringify(window.__sea.state)'))
    pg.context.close()

def test_rapid_tab_clicks_end_on_the_last_island(browser, site):          # Review Focus 3
    pg, _ = settled_page(browser, site)
    ms = pg.evaluate(FLY, [['pondreels', 'lockin', 'nibi'], 150, 'nibi'])
    assert 0 < ms <= 3000 + SLOW_FRAME, (ms, pg.evaluate('JSON.stringify(window.__sea.state)'))
    assert pg.is_visible('#card-nibi') and pg.get_attribute('#tab-nibi', 'aria-selected') == 'true'
    assert not pg.is_visible('#card-lockin') and not pg.is_visible('#card-pondreels')
    pg.context.close()

def test_rendering_stops_when_the_sea_scrolls_away(browser, site):
    pg, _ = ready_page(browser, site)
    pg.evaluate("window.scrollTo({ top: document.getElementById('beta').offsetTop, behavior: 'instant' })")   # (the page scrolls smoothly otherwise)
    assert pg.evaluate("document.getElementById('stage').getBoundingClientRect().bottom") <= 0, 'the sea should be off-screen'
    pg.wait_for_timeout(1500)
    f1 = pg.evaluate('window.__sea.state.frames'); pg.wait_for_timeout(3000)
    assert pg.evaluate('window.__sea.state.frames') == f1, 'still rendering while hidden'
    pg.evaluate("window.scrollTo({ top: 0, behavior: 'instant' })")
    assert wait(pg, f'window.__sea.state.frames > {f1}', 20), 'did not start again'
    pg.context.close()
