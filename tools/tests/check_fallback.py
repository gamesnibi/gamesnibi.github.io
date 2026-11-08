"""When the 3D can't run: still pictures of each view, swapped by the tabs (Playwright).
Run: python3 -m pytest tools/tests/check_fallback.py -q"""
import gzip, io, time
import numpy as np
import pytest
from PIL import Image
from conftest import open_page, LIGHT
from check_sea import wait

SHOWN = """(id) => { const p = document.querySelector('.still[data-view="' + id + '"]');
  return !!p && getComputedStyle(p).opacity === '1' && getComputedStyle(p).visibility !== 'hidden'; }"""

@pytest.fixture(scope='module')
def nogl(pw):
    b = pw.chromium.launch(args=['--disable-3d-apis', '--disable-webgl', '--disable-webgl2'])
    yield b
    b.close()

def test_without_webgl_the_tabs_swap_still_pictures(nogl, site):
    pg, errors = open_page(nogl, site + '/index.html')
    assert wait(pg, "document.documentElement.classList.contains('still')", 10), 'no still mode'
    assert not pg.evaluate("document.documentElement.classList.contains('live')")
    assert wait(pg, "(" + SHOWN + ")('overview')", 5), 'the overview picture is not showing'
    pg.click('#tab-pondreels')
    assert wait(pg, "(" + SHOWN + ")('pondreels')", 5), 'the Pond Reels picture never showed'
    assert wait(pg, "!(" + SHOWN + ")('overview')", 3), 'the overview picture never faded out'
    src = pg.evaluate("""document.querySelector('.still[data-view="pondreels"] img').currentSrc""")
    assert 'pondreels' in src and src.endswith('.webp'), src
    assert pg.evaluate("""document.querySelector('.still[data-view="pondreels"] img').complete && document.querySelector('.still[data-view="pondreels"] img').naturalWidth > 0""")
    assert errors == [], errors

def frame_is_black(png):
    a = np.asarray(Image.open(io.BytesIO(png)).convert('L'), dtype=np.float32)
    return (a < 24).mean() > 0.9

def test_losing_the_webgl_context_falls_back_without_a_black_frame(browser, site):   # Review Focus 2
    pg, errors = open_page(browser, site + '/index.html?' + LIGHT, width=640, height=400)
    assert wait(pg, '!!(window.__sea && window.__sea.state.frames > 2)', 60)
    pg.evaluate("document.getElementById('sea').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()")
    t0 = time.time(); shots = []
    while time.time() - t0 < 1.0:
        shots.append(pg.locator('#stage').screenshot(timeout=5000))
        if pg.evaluate("document.documentElement.classList.contains('still')"): break
    assert pg.evaluate("document.documentElement.classList.contains('still')"), 'still mode did not take over within 1 s'
    for _ in range(3): shots.append(pg.locator('#stage').screenshot(timeout=5000))
    assert not any(frame_is_black(s) for s in shots), 'the stage went black'
    assert wait(pg, "(" + SHOWN + ")('overview')", 5)

def test_reduced_motion_cuts_straight_to_the_picture(browser, site):
    pg, _ = open_page(browser, site + '/index.html', reduced_motion='reduce')
    assert wait(pg, "document.documentElement.classList.contains('still')", 10), 'reduced motion should get the stills'
    ms = pg.evaluate("""(shown) => new Promise((res) => { const t0 = performance.now();
      document.getElementById('tab-lockin').click();
      const f = () => (eval(shown))('lockin') ? res(performance.now() - t0) : (performance.now() - t0 > 3000 ? res(-1) : requestAnimationFrame(f)); f(); })""", "(" + SHOWN + ")")
    assert 0 <= ms <= 100, ms

def test_first_paint_stays_under_450_kb_before_the_3d_loads(browser, site):
    c = browser.new_context(viewport={'width': 390, 'height': 844})
    pg = c.new_page()
    seen, done = [], {'sea': False}
    TEXT = ('text/', 'javascript', 'json', 'svg', 'manifest')
    def on_request(r):
        if '/assets/js/sea/' in r.url: done['sea'] = True
    def on_response(r):
        if done['sea'] or r.status >= 400: return
        try: body = r.body()
        except Exception: return
        kind = r.headers.get('content-type', '')
        size = len(gzip.compress(body)) if any(t in kind for t in TEXT) else len(body)   # as the browser's compression would send it
        seen.append((r.url.split('/')[-1].split('?')[0], size))
    pg.on('request', on_request); pg.on('response', on_response)
    pg.goto(site + '/index.html', wait_until='load')
    assert wait(pg, 'document.documentElement.classList.contains("live") || document.documentElement.classList.contains("still")', 60)
    total = sum(s for _, s in seen)
    assert done['sea'], 'the sea module never started loading'
    assert 'overview-wide.webp' in [n for n, _ in seen] or 'overview-tall.webp' in [n for n, _ in seen], 'no first-paint still'
    print("first paint", total // 1024, "KB:", sorted(seen, key=lambda x: -x[1])[:8])
    assert total <= 450 * 1024, (total, sorted(seen, key=lambda x: -x[1])[:10])
