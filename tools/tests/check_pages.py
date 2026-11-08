"""The privacy policies, the 404 page, the site tags and the housekeeping files (Playwright).
Run: python3 -m pytest tools/tests/check_pages.py -q"""
import json, os, re, subprocess
import pytest
from conftest import open_page, ROOT

MAIN = '38bf6e6'                       # the live site the redesign started from
POLICIES = ['privacy.html', 'lockin-inator-privacy.html']
PAGES = ['index.html'] + POLICIES + ['404.html']
WIDTHS = [320, 360, 390, 412, 768, 1280]

def src(name): return open(os.path.join(ROOT, name), encoding='utf-8').read()
def on_main(name): return subprocess.run(['git', 'show', f'{MAIN}:{name}'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
def body_from_main(html): return html[html.index('<main>'):]          # everything from the policy itself to the end

@pytest.mark.parametrize('name', POLICIES)
def test_policy_wording_and_anchors_are_untouched(name):
    assert body_from_main(src(name)) == body_from_main(on_main(name)), 'the policy changed below the header'
    assert 'id="updated"' in src(name)
    if name.startswith('lockin'): assert 'id="beta"' in src(name)

@pytest.mark.parametrize('name', PAGES)
def test_search_and_share_tags(name):
    html = src(name)
    assert re.search(r'<link rel="canonical" href="https://gamesnibi\.github\.io/[^"]*">', html), 'canonical'
    m = re.search(r'<meta property="og:image" content="(https://gamesnibi\.github\.io/[^"]+)">', html)
    assert m and os.path.exists(os.path.join(ROOT, m.group(1).split('github.io/')[1])), 'og:image'
    assert '<meta name="twitter:card" content="summary_large_image">' in html
    if name == 'index.html':
        ld = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.S).group(1))
        assert ld['@type'] == 'Organization' and ld['url'] == 'https://gamesnibi.github.io/'
        # only the studio's name, website, logo and email (Josh, Nov 7): no address, phone, people or blurb
        assert set(ld) - {'@context', '@type'} == {'name', 'url', 'logo', 'email'}, sorted(ld)

def test_404_shows_the_little_islet_and_a_way_back(browser, site):
    pg, errors = open_page(browser, site + '/404.html')    # (GitHub Pages serves it for any missing address)
    assert 'This page drifted off.' in pg.inner_text('main')
    link = pg.get_by_role('link', name='Back to the islands')
    assert link.count() == 1 and link.get_attribute('href') == '/'
    img = pg.locator('main img').first
    assert 'soon' in img.get_attribute('src') and pg.evaluate('(i) => i.complete && i.naturalWidth > 0', img.element_handle())
    assert all(re.match(r'^(/|https?:|#|mailto:)', u) for u in pg.evaluate("[...document.querySelectorAll('[href],[src]')].map(e => e.getAttribute('href') || e.getAttribute('src'))")), 'a 404 page must use root paths'
    assert errors == [], errors

@pytest.mark.parametrize('name', POLICIES + ['404.html'])
@pytest.mark.parametrize('w', WIDTHS)
def test_page_fits_and_is_clean(browser, site, name, w):
    pg, errors = open_page(browser, site + '/' + name, width=w, height=800)
    assert pg.evaluate('document.documentElement.scrollWidth') <= w, 'scrolls sideways'
    missing = pg.evaluate("[...document.images].filter(i => !i.getAttribute('width') || !i.getAttribute('height')).map(i => i.getAttribute('src'))")
    assert missing == [], missing
    assert pg.locator('header.topbar .brand img').count() == 1, 'the new top bar'
    if name in POLICIES:   # the policy starts below the fixed top bar
        assert pg.locator('h1').first.bounding_box()['y'] >= pg.locator('header.topbar').bounding_box()['height']
    assert errors == [], errors

def test_robots_sitemap_and_credits():
    robots = src('robots.txt')
    assert 'Sitemap: https://gamesnibi.github.io/sitemap.xml' in robots
    sm = src('sitemap.xml')
    for u in ['https://gamesnibi.github.io/', 'https://gamesnibi.github.io/privacy.html', 'https://gamesnibi.github.io/lockin-inator-privacy.html']:
        assert f'<loc>{u}</loc>' in sm
    credits = src('CREDITS.md')
    for word in ['three.js', 'MIT', 'Sniglet', 'Nunito', 'Archivo', 'SIL Open Font', 'Bonum', 'GUST', 'Bramble', 'Old Mossback', 'Pond Reels',
                 'tools/gen-textures.py', 'procedural', 'no AI']:
        assert word in credits, word

def test_old_assets_are_gone():
    gone = ['assets/nibi-mark.png', 'assets/favicon.png', 'assets/fish-tile.webp', 'assets/frame-wood.jpg', 'assets/lockin-beta-phone.webp',
            'assets/fonts/inter-regular.woff', 'assets/fonts/inter-medium.woff', 'assets/fonts/inter-semibold.woff', 'assets/fonts/inter-display-bold.woff'] + \
           [f'assets/shot-{n}.jpg' for n in ['boss', 'buddies', 'lakes', 'oasis', 'pond', 'reel', 'shop']]
    left = [g for g in gone if os.path.exists(os.path.join(ROOT, g))]
    assert left == [], left

def test_tab_thumbnails_are_small_webps():
    html = src('index.html')
    nav = html[html.index('<nav class="tabs"'):html.index('</nav>', html.index('<nav class="tabs"'))]
    imgs = re.findall(r'<img src="([^"]+)"', nav)
    assert len(imgs) == 5
    for i in imgs:
        assert i.endswith('.webp') and os.path.getsize(os.path.join(ROOT, i)) <= 8 * 1024, (i, os.path.getsize(os.path.join(ROOT, i)))
