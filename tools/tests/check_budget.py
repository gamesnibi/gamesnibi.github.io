"""Size budgets (spec 4.4), with the browser's compression: first paint 450 KB or less, the whole 3D layer
1.5 MB or less. Text files are gzipped here, as GitHub Pages sends them. Run: python3 -m pytest tools/tests/check_budget.py -q -s"""
import gzip
from conftest import LIGHT
from check_sea import wait

TEXT = ('text/', 'javascript', 'json', 'svg', 'manifest', 'xml')

def test_first_paint_and_3d_layer_budgets(browser, site):
    for w, h in ((1280, 800), (390, 844)):
        c = browser.new_context(viewport={'width': w, 'height': h})
        pg = c.new_page()
        phase = {'now': 'first'}
        sizes = {'first': [], '3d': []}
        def on_request(r):
            if '/assets/js/sea/' in r.url: phase['now'] = '3d'
        def on_response(r):
            if r.status >= 400: return
            try: body = r.body()
            except Exception: return
            kind = r.headers.get('content-type', '')
            n = len(gzip.compress(body)) if any(t in kind for t in TEXT) else len(body)
            # the 3D layer is everything the sea loads: its scripts and everything under assets/3d
            layer = '3d' if ('/assets/3d/' in r.url or '/assets/js/sea/' in r.url) else ('first' if phase['now'] == 'first' else None)
            if layer: sizes[layer].append((r.url.split('/')[-1].split('?')[0], n))
        pg.on('request', on_request); pg.on('response', on_response)
        pg.goto(site + '/index.html?' + LIGHT, wait_until='load')
        assert wait(pg, '!!(window.__sea && window.__sea.state.frames > 1)', 90), 'the sea never drew'
        first, three = sum(n for _, n in sizes['first']), sum(n for _, n in sizes['3d'])
        print(f'\n{w}x{h}: first paint {first / 1024:.0f} KB, 3D layer {three / 1024:.0f} KB')
        print('  biggest 3D files:', sorted(sizes['3d'], key=lambda x: -x[1])[:6])
        assert first <= 450 * 1024, sorted(sizes['first'], key=lambda x: -x[1])[:8]
        assert three <= 1536 * 1024, sorted(sizes['3d'], key=lambda x: -x[1])[:8]
        c.close()
