"""Verify strict, reproducible catalogs in a temporary tree; never rewrite source."""
from pathlib import Path
import json
import re
import shutil
import subprocess
import sys
import tempfile

import hashlib
import zipfile

here = Path(__file__).resolve().parent
# 1.24.20 changes no language files, so the catalogs under test are the ones in
# the pinned, hash-checked 1.24.19 source this release is built from.
archive = here.parents[1] / 'PlazCode-source-1.24.19.zip'
assert hashlib.sha256(archive.read_bytes()).hexdigest() == 'eb8973151a0ac54a884d72d70d3669b9ede14db6000cf8d244742170e378042b'
baseline = Path(tempfile.mkdtemp(prefix='plazcode-baseline-'))
with zipfile.ZipFile(archive) as zipped:
    for name in zipped.namelist():
        if name.startswith(('PlazCode/core/', 'PlazCode/popup.html')) and not name.endswith('/'):
            zipped.extract(name, baseline)
core = baseline / 'PlazCode/core'
codes = ['en', 'es', 'fr', 'ru', 'ar', 'zh-CN', 'zh-TW', 'ja', 'ko', 'de', 'pt-BR', 'it', 'hi', 'tr', 'pl']
folder = core / 'locales'
assert {p.stem for p in folder.glob('*.json')} == set(codes), 'expected all 15 committed catalogs'
english = json.loads((folder / 'en.json').read_text(encoding='utf-8'))
# English JSON is the source-key inventory (its values may be null); the compiler
# deliberately emits identity translations from those keys.
assert english and all(isinstance(k, str) and k.strip() for k in english), 'English catalog must contain nonblank source keys'
for code in codes[1:]:
    data = json.loads((folder / (code + '.json')).read_text(encoding='utf-8'))
    assert data.keys() == english.keys(), code + ': incomplete keys'
    assert all(isinstance(v, str) and v.strip() for v in data.values()), code + ': blank translation'
    assert not any(any(0x202a <= ord(c) <= 0x202e or 0x2066 <= ord(c) <= 0x2069 for c in v) for v in data.values()), code + ': unexpected bidi control'

# Run the real compiler twice in isolation, without --allow-incomplete. Compare
# canonical text across hosts: Windows may write CRLF, but prepare normalizes LF.
committed = (core / 'i18n-catalog.js').read_bytes().replace(b'\r\n', b'\n')
with tempfile.TemporaryDirectory(prefix='plazcode-catalog-verification-') as temporary:
    work = Path(temporary)
    shutil.copy2(here / 'build-locales.py', work / 'build-locales.py')
    shutil.copytree(folder, work / 'overlay/core/locales')
    generated = work / 'overlay/core/i18n-catalog.js'
    for attempt in range(2):
        subprocess.run([sys.executable, str(work / 'build-locales.py')], check=True, timeout=60)
        assert generated.read_bytes().replace(b'\r\n', b'\n') == committed, 'committed i18n-catalog.js differs from strict compiler output'

manifest = json.loads((here / 'overlay/manifest.json').read_text(encoding='utf-8'))
assert manifest['version'] == '1.24.20'
entry_count = 0
for entry in manifest['content_scripts']:
    scripts = entry.get('js', [])
    if 'core/main.js' not in scripts:
        continue
    entry_count += 1
    assert scripts.count('core/i18n-catalog.js') == scripts.count('core/i18n.js') == 1
    assert scripts.index('core/i18n-catalog.js') < scripts.index('core/i18n.js') < scripts.index('core/main.js'), 'shared runtime must precede UI bootstrap'
assert entry_count, 'no production UI content-script entries found'
popup = (baseline / 'PlazCode/popup.html').read_text(encoding='utf-8')
scripts = re.findall(r'<script\s+src="([^"]+)"', popup)
assert scripts.index('core/i18n-catalog.js') < scripts.index('core/i18n.js') < scripts.index('popup.js')
print(f'PASS strict catalogs reproduce committed bytes twice: {len(english)} keys, {len(codes)} languages; {entry_count} content-script entries and popup preserve i18n order. No source files regenerated.')
