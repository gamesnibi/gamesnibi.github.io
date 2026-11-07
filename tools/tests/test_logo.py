"""The cut-out NiBi logo: see-through where the sea showed, solid letters, no sea-blue fringe.
Run: python3 -m pytest tools/tests/test_logo.py -q"""
import json, os
import cv2, numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BRAND = os.path.join(ROOT, 'assets', 'brand')

def load():
    im = cv2.imread(os.path.join(ROOT, 'tools', 'build', 'nibi-logo-full.png'), cv2.IMREAD_UNCHANGED)
    crop = json.load(open(os.path.join(ROOT, 'tools', 'logo-crop.json')))
    return im, crop['x0'], crop['y0']

def alpha_at(im, x0, y0, x, y):          # (x, y) in the 2048 px source image
    return int(im[y - y0, x - x0, 3])

def test_trapped_sea_is_transparent():
    im, x0, y0 = load()
    for p in [(1258, 875), (1281, 1105), (1028, 900), (886, 920)]:      # the B's holes, the gaps between letters
        assert alpha_at(im, x0, y0, *p) == 0, p

def test_letter_fill_is_solid():
    im, x0, y0 = load()
    assert alpha_at(im, x0, y0, 470, 950) == 255

def test_no_sea_blue_fringe():
    im, x0, y0 = load()
    a = im[..., 3]
    edge = cv2.dilate((a < 128).astype(np.uint8), np.ones((7, 7), np.uint8)).astype(bool) & (a > 0)
    hsv = cv2.cvtColor(im[..., :3], cv2.COLOR_BGR2HSV)
    sea = (hsv[..., 0] >= 100) & (hsv[..., 0] <= 108) & (hsv[..., 1] > 0.45 * 255)
    assert int((edge & sea).sum()) == 0

def test_icons_and_webp_exist():
    for f, size in [('favicon-32.png', 32), ('icon-192.png', 192), ('icon-512.png', 512), ('apple-touch-icon.png', 180)]:
        im = cv2.imread(os.path.join(BRAND, f), cv2.IMREAD_UNCHANGED)
        assert im is not None and im.shape[0] == size and im.shape[1] == size, f
    w = cv2.imread(os.path.join(BRAND, 'nibi-logo.webp'), cv2.IMREAD_UNCHANGED)
    assert w is not None and w.shape[1] == 1200 and w.shape[2] == 4
    m = json.load(open(os.path.join(ROOT, 'site.webmanifest')))
    assert m['name'] == 'NiBi Games' and m['theme_color'] == '#1a8cff' and m['background_color'] == '#f2fbff'
