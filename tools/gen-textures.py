"""Procedural, tileable textures for the NiBi Games website's 3D islands (all made here, no outside images).
Usage: python3 tools/gen-textures.py [out_dir]   (default: assets/3d/tex). Writes 512 px WebP (quality 70 to 78, see QUALITY)."""
import sys, os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', '3d', 'tex')
os.makedirs(OUT, exist_ok=True)
N = 512
QUALITY = {'leaves.webp': 78, 'grass.webp': 70, 'sand.webp': 70}   # noisy textures are expensive; these still look the same at the size they're seen
rng = np.random.default_rng(7)

def spectral(beta=2.0, aniso=(1.0, 1.0), seed=None, n=N):
    """Periodic (tileable) noise with a 1/f^beta spectrum; aniso stretches it (e.g. (1, 6) = streaks along y)."""
    r = np.random.default_rng(seed)
    w = r.standard_normal((n, n))
    fy = np.fft.fftfreq(n)[:, None] * aniso[1]; fx = np.fft.fftfreq(n)[None, :] * aniso[0]
    f = np.sqrt(fx * fx + fy * fy); f[0, 0] = 1
    F = np.fft.fft2(w) / f ** (beta / 2); F[0, 0] = 0
    out = np.real(np.fft.ifft2(F))
    return (out - out.mean()) / (out.std() + 1e-9)

def hexc(h): return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255

def save(rgb, name, alpha=None):
    a = np.clip(rgb, 0, 1)
    img = (a * 255 + 0.5).astype(np.uint8)
    if alpha is not None:
        img = np.dstack([img, (np.clip(alpha, 0, 1) * 255 + 0.5).astype(np.uint8)])
    name = name.replace('.png', '.webp')
    Image.fromarray(img).save(os.path.join(OUT, name), 'WEBP', quality=QUALITY.get(name, 72), method=6)
    print('wrote', name, os.path.getsize(os.path.join(OUT, name)) // 1024, 'KB')

def lerp(a, b, t): return a + (b - a) * t[..., None]

# ---------------------------------------------------------------- sand: warm mottling, fine grain, sparse shell bits, soft ripples
low = spectral(2.6, seed=1); mid = spectral(1.6, seed=2); grain = rng.standard_normal((N, N))
y = np.arange(N)[:, None] / N; x = np.arange(N)[None, :] / N
rip = np.sin((y * 9 + x * 2 + 0.05 * spectral(2.8, seed=3)) * 2 * math.pi)   # periodic ripples
sand = lerp(hexc('#efd9a6')[None, None, :] * np.ones((N, N, 3)), hexc('#f8e9c2')[None, None, :] * np.ones((N, N, 3)), 0.5 + 0.18 * low)
sand *= (1 + 0.05 * mid + 0.035 * rip + 0.07 * grain)[..., None]
spk = rng.random((N, N)); sand[spk > 0.996] *= 0.78; sand[(spk < 0.004)] = sand[(spk < 0.004)] * 0.6 + 0.4
save(sand, 'sand.png')

# ---------------------------------------------------------------- grass: two greens, blade streaks, a few tiny white and yellow flowers
blades = spectral(1.2, aniso=(1.0, 7.0), seed=4); patch = spectral(2.4, seed=5)
grass = lerp(hexc('#4f9e3a') * np.ones((N, N, 3)), hexc('#8cc85a') * np.ones((N, N, 3)), np.clip(0.5 + 0.25 * patch, 0, 1))
grass *= (1 + 0.12 * blades + 0.05 * rng.standard_normal((N, N)))[..., None]
fl = rng.random((N, N)); img = Image.fromarray((np.clip(grass, 0, 1) * 255).astype(np.uint8)); d = ImageDraw.Draw(img)
for k in range(140):
    cx, cy = rng.integers(0, N, 2); col = (255, 255, 245) if rng.random() < 0.6 else (255, 222, 90)
    for ox in (-N, 0, N):
        for oy in (-N, 0, N): d.ellipse([cx + ox - 1.5, cy + oy - 1.5, cx + ox + 1.5, cy + oy + 1.5], fill=col)
grass = np.asarray(img).astype(np.float32) / 255
save(grass, 'grass.png')

# ---------------------------------------------------------------- granite: grey-brown, pink-grey speckles, dark mica, stains and streaks
stain = spectral(2.5, seed=6); streak = spectral(1.8, aniso=(1.0, 5.0), seed=7)
rock = lerp(hexc('#8d8378') * np.ones((N, N, 3)), hexc('#b1a596') * np.ones((N, N, 3)), np.clip(0.5 + 0.22 * stain, 0, 1))
rock *= (1 + 0.08 * streak + 0.09 * rng.standard_normal((N, N)))[..., None]
s = rng.random((N, N))
rock[s > 0.985] = rock[s > 0.985] * 0.5 + hexc('#d9c7b8') * 0.5
rock[s < 0.012] *= 0.45
rock = np.asarray(Image.fromarray((np.clip(rock, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))).astype(np.float32) / 255
save(rock, 'rock.png')

# ---------------------------------------------------------------- leaves: a tile packed with overlapping leaves, lit from the top left
img = Image.new('RGB', (N, N), (30, 78, 38)); d = ImageDraw.Draw(img)
for k in range(2600):
    cx, cy = rng.random(2) * N; ang = rng.random() * math.pi; L = 14 + rng.random() * 12; W = L * 0.45
    tone = rng.random(); shade = 0.75 + 0.25 * (1 - (cy / N)) + rng.random() * 0.15
    base = np.array([0.26, 0.6, 0.24]) * (1 - tone) + np.array([0.48, 0.76, 0.3]) * tone
    col = tuple(int(c * 255 * min(1.15, shade)) for c in base)
    pts = []
    for t in np.linspace(0, 2 * math.pi, 14):
        px, py = math.cos(t) * L / 2, math.sin(t) * W / 2 * (1 - 0.35 * math.cos(t))
        pts.append((px * math.cos(ang) - py * math.sin(ang), px * math.sin(ang) + py * math.cos(ang)))
    for ox in (-N, 0, N):
        for oy in (-N, 0, N):
            d.polygon([(cx + ox + a, cy + oy + b) for a, b in pts], fill=col)
            d.line([(cx + ox - math.cos(ang) * L * 0.45, cy + oy - math.sin(ang) * L * 0.45), (cx + ox + math.cos(ang) * L * 0.45, cy + oy + math.sin(ang) * L * 0.45)], fill=tuple(int(c * 0.82) for c in col), width=1)
save(np.asarray(img).astype(np.float32) / 255, 'leaves.png')

# ---------------------------------------------------------------- bark: vertical fibres and ring scars (for trunks)
fib = spectral(1.4, aniso=(1.0, 7.0), seed=8).T
bark = lerp(hexc('#6b4a2e') * np.ones((N, N, 3)), hexc('#9a7650') * np.ones((N, N, 3)), np.clip(0.5 + 0.28 * fib, 0, 1))
rings = (np.sin(y * 2 * math.pi * 10 + 0.3 * spectral(2.5, seed=9)) > 0.93)
bark[rings] *= 0.72
save(bark, 'bark.png')

# ---------------------------------------------------------------- thatch: layered straw strands (for the beach bar's roof)
straw = spectral(1.1, aniso=(1.0, 9.0), seed=10)
th = lerp(hexc('#c9a24e') * np.ones((N, N, 3)), hexc('#f0d58a') * np.ones((N, N, 3)), np.clip(0.5 + 0.3 * straw, 0, 1))
rows = ((y * 8) % 1.0)
th *= (0.78 + 0.22 * np.clip(rows / 0.85, 0, 1))[..., None]          # a darker lip at the bottom of each layer
save(th, 'thatch.png')

# ---------------------------------------------------------------- planks: painted boards with seams and a little wear (tinted per object)
gr = spectral(1.3, aniso=(1.0, 8.0), seed=11)
pl = np.ones((N, N, 3)) * (0.9 + 0.06 * gr)[..., None]
seam = (np.abs(((x * 6) % 1.0) - 0.5) > 0.485)
pl[np.broadcast_to(seam, (N, N))] *= 0.7
wear = spectral(2.2, seed=12) > 1.6
pl[wear] *= 0.92
save(pl, 'planks.png')

# ---------------------------------------------------------------- palm frond (RGBA, cut out): a midrib with angled leaflets
W2, H2 = 512, 128
img = Image.new('RGBA', (W2, H2), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
for i in range(46):
    t = i / 45; x0 = 12 + t * (W2 - 30); half = (H2 / 2 - 6) * math.sin(math.pi * min(1, t * 1.15)) ** 0.8
    for sgn in (-1, 1):
        x1 = x0 + 26 * (0.6 + 0.4 * t); y1 = H2 / 2 + sgn * half
        g = 0.85 + 0.15 * rng.random(); col = (int(108 * g), int(186 * g), int(80 * g), 255) if sgn > 0 else (int(92 * g), int(166 * g), int(72 * g), 255)
        d.polygon([(x0, H2 / 2), (x0 + 6, H2 / 2), (x1 + 3, y1), (x1 - 3, y1)], fill=col)
d.line([(6, H2 / 2), (W2 - 8, H2 / 2)], fill=(120, 140, 60, 255), width=4)
img.save(os.path.join(OUT, 'frond.webp'), 'WEBP', quality=85, method=6); print('wrote frond.webp', os.path.getsize(os.path.join(OUT, 'frond.webp')) // 1024, 'KB')

