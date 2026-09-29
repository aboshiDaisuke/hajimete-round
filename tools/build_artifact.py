"""index.html と css/js を1枚のHTMLにまとめる（Claude のアーティファクト公開用）
   python3 tools/build_artifact.py  →  dist/artifact.html
"""
import os, re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
src = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()

def inline_css(m):
    css = open(os.path.join(ROOT, m.group(1)), encoding='utf-8').read()
    return '<style>\n' + css.replace('../assets/', 'assets/') + '\n</style>'

def inline_js(m):
    js = open(os.path.join(ROOT, m.group(1)), encoding='utf-8').read()
    return '<script>\n' + js + '\n</script>'

out = re.sub(r'<link rel="stylesheet" href="(css/[^"]+)">', inline_css, src)
out = re.sub(r'<script src="([^"]+)"></script>', inline_js, out)
# ゴルファーのモデル（男女）は、通常は選ばれたほうだけ後から読み込む。1枚にまとめるときは両方を埋め込む
models = ''.join('<script>\n' + open(os.path.join(ROOT, 'assets', f'golfer-{ch}-glb.js'), encoding='utf-8').read() + '\n</script>\n' for ch in ('female', 'male'))
out = out.replace('<script type="importmap">', models + '<script type="importmap">')
# アーティファクトは doctype / html / head / body を自動で付けるので外す
out = re.sub(r'<!DOCTYPE html>\s*|</?html[^>]*>\s*|</?head>\s*|</?body>\s*', '', out)
out = re.sub(r'<meta (charset|name="viewport")[^>]*>\s*', '', out)
os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
open(os.path.join(ROOT, 'dist', 'artifact.html'), 'w', encoding='utf-8').write(out)
print('dist/artifact.html', len(out))
