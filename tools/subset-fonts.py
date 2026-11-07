"""Make the site's fonts: Latin subsets as WOFF, with their licences.
Usage: python3 tools/subset-fonts.py <google-fonts-clone>/ofl [repo_root]
Sources: ofl/sniglet/Sniglet-ExtraBold.ttf, ofl/nunito/Nunito[wght].ttf, ofl/archivo/Archivo[wdth,wght].ttf (google/fonts on
GitHub), and Bonum (TeX Gyre Bonum Bold, GUST licence), which is already in assets/fonts/bonum-bold.woff."""
import sys, os, shutil
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ofl = sys.argv[1]
root = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(root, 'assets', 'fonts'); os.makedirs(out, exist_ok=True)
TEXT = ''.join(chr(c) for c in range(0x20, 0x7F)) + ''.join(chr(c) for c in range(0xA0, 0x100)) + '×éñ’‘“”…–•→←'

def make(src, dst, limits=None):
    f = TTFont(src)
    opts = subset.Options(); opts.layout_features = ['kern', 'liga', 'calt', 'ccmp', 'locl', 'mark', 'mkmk']
    opts.name_IDs = ['*']; opts.notdef_outline = True
    s = subset.Subsetter(opts); s.populate(text=TEXT); s.subset(f)          # subset first, then trim the axes
    if limits: f = instancer.instantiateVariableFont(f, limits)
    f.flavor = 'woff'; f.save(os.path.join(out, dst))
    print(dst, os.path.getsize(os.path.join(out, dst)) // 1024, 'KB')

make(os.path.join(ofl, 'sniglet', 'Sniglet-ExtraBold.ttf'), 'sniglet-800.woff')
make(os.path.join(ofl, 'nunito', 'Nunito[wght].ttf'), 'nunito-var.woff', {'wght': (400, 800)})
make(os.path.join(ofl, 'archivo', 'Archivo[wdth,wght].ttf'), 'archivo-var.woff', {'wght': (600, 900), 'wdth': (100, 125)})
for fam in ('sniglet', 'nunito', 'archivo'):
    shutil.copy(os.path.join(ofl, fam, 'OFL.txt'), os.path.join(out, f'LICENSE-{fam}-OFL.txt'))
