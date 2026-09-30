"""配信前に実行: python3 tools/build_pwa.py — オフライン保存一覧と版を更新。"""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parent.parent
files = [ROOT / 'index.html', ROOT / 'manifest.webmanifest']
files += sorted((ROOT / 'js').glob('*.js'))
files += sorted((ROOT / 'css').glob('*.css'))
files += sorted((ROOT / 'vendor/three').rglob('*.js'))
files += [ROOT / 'assets' / name for name in (
    'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'hero.jpg',
    'lobby-poster.png', 'face-female.jpg', 'face-male.jpg',
    'ball-glb.js', 'lobby-glb.js', 'golfer-female-glb.js', 'golfer-male-glb.js',
    'golfer-female-face.js', 'golfer-male-face.js',
)]
paths = [file.relative_to(ROOT).as_posix() for file in files]
worker = ROOT / 'sw.js'
source = worker.read_text(encoding='utf-8')
pattern = r'// BEGIN PRECACHE\n.*?// END PRECACHE'
normalized = re.sub(pattern, '// PRECACHE', source, flags=re.S)
digest = hashlib.sha256(normalized.encode())
for path, file in zip(paths, files):
    digest.update(path.encode() + b'\0' + file.read_bytes() + b'\0')
version = digest.hexdigest()[:16]
block = '// BEGIN PRECACHE\nconst VERSION = ' + json.dumps(version) + ';\nconst APP_FILES = ' + json.dumps(paths, indent=2) + ';\n// END PRECACHE'
worker.write_text(re.sub(pattern, lambda _: block, source, flags=re.S), encoding='utf-8')
print(f'PWA {version}: {len(files)} files, {sum(file.stat().st_size for file in files) / 1024 / 1024:.1f} MiB')
