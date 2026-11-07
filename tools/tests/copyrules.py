"""Website copy rules: no em dashes, no other apps' names in marketing copy, no counts of lakes or bosses."""
import re
from html.parser import HTMLParser

APP_NAMES = re.compile(r'\b(Instagram|TikTok|YouTube|Facebook|Snapchat|Reddit|Pinterest|Twitch|Netflix|Shorts)\b|(?<!Pond )\bReels\b', re.I)
COUNTS = re.compile(r'\b\d+\s+(lakes|bosses)\b', re.I)

class _Text(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []; self.skip = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'): self.skip += 1
        for k, v in attrs:
            if k in ('alt', 'title', 'aria-label', 'content') and v: self.parts.append(v)
    def handle_endtag(self, tag):
        if tag in ('script', 'style') and self.skip: self.skip -= 1
    def handle_data(self, d):
        if not self.skip: self.parts.append(d)

def visible_text(html_text):
    p = _Text(); p.feed(html_text); return ' '.join(p.parts)

def check_copy(html_text, marketing=True):
    """Return a list of copy-rule problems found in a page (empty when it's fine)."""
    text = visible_text(html_text); problems = []
    if '—' in text: problems.append('em dash')
    if marketing:
        for m in APP_NAMES.finditer(text): problems.append('app name: ' + m.group(0))
    for m in COUNTS.finditer(text): problems.append('count: ' + m.group(0))
    return problems
