"""Cut the NiBi logo out of its ocean square, recolour the letters a bright tropical blue, and make the icons.
Usage: python3 tools/cut-logo.py <logo-2048.png> [repo_root]
Writes assets/brand/nibi-logo.png (600 px wide), tools/build/nibi-logo-full.png (tests only), nibi-logo.webp (1200 px wide), favicon-32.png, icon-192.png,
icon-512.png, apple-touch-icon.png (from the original square), site.webmanifest and tools/logo-crop.json."""
import sys, os, json
import cv2, numpy as np

src = sys.argv[1]
root = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(root, 'assets', 'brand'); os.makedirs(out, exist_ok=True)
img = cv2.imread(src)                                  # BGR, 2048x2048
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
H, S, V = hsv[..., 0], hsv[..., 1] / 255, hsv[..., 2] / 255

# 1) the white rim (threshold half-way between rim and sea)
rim = ((S < 0.42) & (V > 0.64)).astype(np.uint8)
rim = cv2.morphologyEx(rim, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(rim, 8)
keep = [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] > 1500]   # the outline and the rims round the B's holes
rim = np.isin(lab, keep).astype(np.uint8)             # drop bubbles and specks

# 2) regions enclosed by the rim: letter fill (navy) or trapped sea (B counters, the gap between N and i)
inv = (1 - rim).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(inv, 4)
outside = lab[0, 0]
enclosed = ((lab != outside) & (lab != 0)).astype(np.uint8)
# per pixel: the sea is greener (hue ~104) than the navy letters (hue ~113); clean up specks
sea = (enclosed & (H < 108.5)).astype(np.uint8)
sea = cv2.morphologyEx(sea, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
n2, lab2, st2, _ = cv2.connectedComponentsWithStats(sea, 8)
sea = np.isin(lab2, [i for i in range(1, n2) if st2[i, cv2.CC_STAT_AREA] > 300]).astype(np.uint8)
seaish = (enclosed & (S > 0.45) & (H < 110)).astype(np.uint8)
for _ in range(6): sea = (cv2.dilate(sea, np.ones((3, 3), np.uint8)) & seaish) | sea   # reach into the narrow tips
for i in range(1, n2):
    if st2[i, cv2.CC_STAT_AREA] > 300: print('trapped sea cut out at', st2[i, :4], 'area', st2[i, 4])
letters = (enclosed & (1 - sea)).astype(np.uint8)
mask = np.clip(rim + letters, 0, 1).astype(np.float32)

# 3) smooth, anti-aliased edges: blur at 4x and re-threshold, then area-downsample
k = 4
up = cv2.resize(mask, None, fx=k, fy=k, interpolation=cv2.INTER_LINEAR)
up = cv2.GaussianBlur(up, (0, 0), 2.2 * k)
up = (up > 0.5).astype(np.float32)
alpha = cv2.resize(up, (mask.shape[1], mask.shape[0]), interpolation=cv2.INTER_AREA)

# 4) colour clean-up: the outer band of the rim picks up sea blue, so pull the rim's own colour outward
solid = cv2.erode((alpha > 0.99).astype(np.uint8), np.ones((9, 9), np.uint8))
col = img.astype(np.float32)
acc = col * solid[..., None]; wt = solid.astype(np.float32)
for _ in range(12):                                   # grow interior colours into the band
    acc2 = cv2.blur(acc, (5, 5)); wt2 = cv2.blur(wt, (5, 5))
    grow = (wt == 0) & (wt2 > 0)
    acc[grow] = acc2[grow] / wt2[grow][:, None]; wt[grow] = 1
band = (alpha > 0) & (solid == 0)
# sea-coloured specks caught in the rim's narrow cusps take the rim's colour too
holes = cv2.dilate((alpha < 0.5).astype(np.uint8), np.ones((15, 15), np.uint8)) > 0
speck = holes & (alpha > 0) & (S > 0.4) & (H < 110)
fill = cv2.dilate(speck.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
rimcol = cv2.GaussianBlur((col * rim[..., None]).astype(np.float32), (0, 0), 6) / np.maximum(cv2.GaussianBlur(rim.astype(np.float32), (0, 0), 6), 1e-3)[..., None]
col[fill & (alpha > 0)] = rimcol[fill & (alpha > 0)]
col[band & ~fill] = acc[band & ~fill]
print('specks recoloured:', int(speck.sum()))

ys, xs = np.where(alpha > 0.004)
Y0, Y1, X0, X1 = int(ys.min() - 6), int(ys.max() + 7), int(xs.min() - 6), int(xs.max() + 7)
def rgba_of(rgb):
    return np.dstack([np.clip(rgb, 0, 255).astype(np.uint8), (alpha * 255 + 0.5).astype(np.uint8)])[Y0:Y1, X0:X1]

# 5) the bright tropical version: letters only (the rim stays white)
lf = cv2.GaussianBlur(cv2.dilate(letters, np.ones((5, 5), np.uint8)).astype(np.float32), (0, 0), 2.0)
h2 = cv2.cvtColor(np.clip(col, 0, 255).astype(np.uint8), cv2.COLOR_BGR2HSV).astype(np.float32)
Hh, Ss, Vv = h2[..., 0], h2[..., 1] / 255, h2[..., 2] / 255
newH = np.full_like(Hh, 103.0)                          # azure
newV = np.clip(0.40 + Vv * 0.80, 0, 1)
newS = np.clip(Ss * 0.98, 0, 1)
h2[..., 0] = Hh * (1 - lf) + newH * lf
h2[..., 1] = (Ss * (1 - lf) + newS * lf) * 255
h2[..., 2] = (Vv * (1 - lf) + newV * lf) * 255
bright = cv2.cvtColor(h2.astype(np.uint8), cv2.COLOR_HSV2BGR).astype(np.float32)
rgba = rgba_of(bright)
build = os.path.join(root, 'tools', 'build'); os.makedirs(build, exist_ok=True)
cv2.imwrite(os.path.join(build, 'nibi-logo-full.png'), rgba)          # full size, for the tests only (not shipped)
w2 = 600; cv2.imwrite(os.path.join(out, 'nibi-logo.png'), cv2.resize(rgba, (w2, round(rgba.shape[0] * w2 / rgba.shape[1])), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_PNG_COMPRESSION, 9])
w = 1200; h = round(rgba.shape[0] * w / rgba.shape[1])
small = cv2.resize(rgba, (w, h), interpolation=cv2.INTER_AREA)
cv2.imwrite(os.path.join(out, 'nibi-logo.webp'), small, [cv2.IMWRITE_WEBP_QUALITY, 92])
json.dump({'x0': X0, 'y0': Y0, 'source': os.path.basename(src)}, open(os.path.join(root, 'tools', 'logo-crop.json'), 'w'))
print('logo size', rgba.shape, 'crop origin', X0, Y0)

# 6) icons, from the original square (logo on its ocean), and the web manifest
for name, size in [('favicon-32.png', 32), ('icon-192.png', 192), ('icon-512.png', 512), ('apple-touch-icon.png', 180)]:
    cv2.imwrite(os.path.join(out, name), cv2.resize(img, (size, size), interpolation=cv2.INTER_AREA))
json.dump({'name': 'NiBi Games', 'short_name': 'NiBi', 'start_url': '/', 'display': 'browser',
           'theme_color': '#1a8cff', 'background_color': '#f2fbff',
           'icons': [{'src': '/assets/brand/icon-192.png', 'sizes': '192x192', 'type': 'image/png'},
                     {'src': '/assets/brand/icon-512.png', 'sizes': '512x512', 'type': 'image/png'}]},
          open(os.path.join(root, 'site.webmanifest'), 'w'), indent=2)
