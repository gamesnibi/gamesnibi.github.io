"""Render the still pictures of every island view from the live site (the same 3D scene), for first paint, the
still-picture fallback, the tab thumbnails and the share picture. Software-rendered, so it takes a few minutes.

  python3 tools/render-stills.py            -> assets/stills/<view>-wide.webp (1600x900), <view>-tall.webp (900x1600),
                                               thumb-overview.webp, thumb-soon.webp (96x96), and og.png (1200x630)
  python3 tools/render-stills.py og         -> og.png only
"""
import functools, http.server, io, os, socketserver, sys, threading, time
from PIL import Image, ImageFilter
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'stills')
VIEWS = ['overview', 'pondreels', 'lockin', 'nibi', 'soon']
MAX_BYTES = 110 * 1024
HIDE = '.topbar, .hero, .tabs, .cards, .bubble { visibility: hidden !important; }'

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def serve():
    srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return f'http://127.0.0.1:{srv.server_address[1]}'

def save_webp(img, path, quality=80):
    """WebP at quality 80, stepping down until it fits 110 KB."""
    while True:
        buf = io.BytesIO(); img.save(buf, 'WEBP', quality=quality, method=6)
        if buf.tell() <= MAX_BYTES or quality <= 50:
            open(path, 'wb').write(buf.getvalue()); return quality, buf.tell()
        quality -= 4

def render(page, base, w, h, views):
    page.set_viewport_size({'width': w, 'height': h})
    page.goto(base + '/index.html?test=1&q=high&mode=live')
    page.wait_for_function('!!(window.__sea && window.__sea.state.frames > 1)', timeout=180000)
    page.add_style_tag(content=HIDE)
    shots = {}
    for v in views:
        page.evaluate('(v) => window.__sea.view(v, { instant: true })', v)
        f = page.evaluate('window.__sea.state.frames')
        page.wait_for_function(f'window.__sea.state.frames > {f + 1}', timeout=300000, polling=500)
        shots[v] = Image.open(io.BytesIO(page.locator('#sea').screenshot(timeout=300000))).convert('RGB')
        print(f'  {v} {w}x{h}', flush=True)
    return shots

def main():
    base = serve()
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        page = b.new_page(device_scale_factor=1)
        page.set_default_timeout(300000)
        only_og = 'og' in sys.argv[1:]
        if not only_og:
            wide = render(page, base, 1600, 900, VIEWS)
            tall = render(page, base, 900, 1600, VIEWS)
        og = render(page, base, 1200, 630, ['overview'])['overview']
        b.close()
    if not only_og: save_stills(wide, tall)
    save_og(og)

def save_stills(wide, tall):
    for v in VIEWS:
        for name, img in ((f'{v}-wide.webp', wide[v]), (f'{v}-tall.webp', tall[v])):
            q, n = save_webp(img, os.path.join(OUT, name)); print(f'{name}: q{q}, {n // 1024} KB')
    # tab thumbnails: the middle of the overview and of the sandbar
    for v, name in (('overview', 'thumb-overview.webp'), ('soon', 'thumb-soon.webp')):
        img = wide[v]; s = int(img.height * (0.78 if v == 'overview' else 0.5)); cx, cy = int(img.width * 0.54), img.height // 2
        img.crop((cx - s // 2, cy - s // 2, cx + s // 2, cy + s // 2)).resize((96, 96), Image.LANCZOS).save(os.path.join(OUT, name), 'WEBP', quality=82, method=6)

def save_og(og):
    """the share picture: the overview with the logo in the top left, clear of the islands"""
    logo = Image.open(os.path.join(ROOT, 'assets', 'brand', 'nibi-logo.png')).convert('RGBA')
    lw = 400; logo = logo.resize((lw, round(logo.height * lw / logo.width)), Image.LANCZOS)
    shadow = Image.new('RGBA', logo.size, (11, 58, 110, 0)); shadow.putalpha(logo.getchannel('A').point(lambda a: a * 0.35))
    card = og.convert('RGBA')
    card.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(10)), (46, 46))
    card.alpha_composite(logo, (40, 34))
    card.convert('RGB').save(os.path.join(OUT, 'og.png'), optimize=True)
    print('og.png', os.path.getsize(os.path.join(OUT, 'og.png')) // 1024, 'KB')

if __name__ == '__main__':
    sys.exit(main())
