import os
from copyrules import check_copy
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def test_rules_catch_problems():
    assert 'em dash' in check_copy('<p>small — games</p>')
    assert any(p.startswith('app name') for p in check_copy('<p>closes Reels and Shorts</p>'))
    assert check_copy('<p>Pond Reels is a fishing game</p>') == []
    assert any(p.startswith('count') for p in check_copy('<p>Explore 4 lakes</p>'))
    assert any(p.startswith('app name') for p in check_copy('<img alt="TikTok feed">'))

def test_home_page_copy():
    assert check_copy(open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()) == []

def test_still_picture_alt_text():
    import re
    src = open(os.path.join(ROOT, 'assets', 'js', 'main.js'), encoding='utf-8').read()
    block = re.search(r'const STILL_ALT = \{(.*?)\};', src, re.S).group(1)
    alts = re.findall(r":\s*([\"'])(.*?)\1,", block)
    assert len(alts) == 4
    for _, text in alts:
        assert check_copy('<p>' + text + '</p>') == [], text
