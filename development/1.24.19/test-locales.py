"""Verify strict, reproducible catalogs in a temporary tree; never rewrite source."""
from pathlib import Path
import json
import re
import shutil
import subprocess
import sys
import tempfile

here = Path(__file__).resolve().parent
core = here / 'overlay/core'
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
assert manifest['version'] == '1.24.19'
entry_count = 0
for entry in manifest['content_scripts']:
    scripts = entry.get('js', [])
    if 'core/main.js' not in scripts:
        continue
    entry_count += 1
    assert scripts.count('core/i18n-catalog.js') == scripts.count('core/i18n.js') == 1
    assert scripts.index('core/i18n-catalog.js') < scripts.index('core/i18n.js') < scripts.index('core/main.js'), 'shared runtime must precede UI bootstrap'
assert entry_count, 'no production UI content-script entries found'
popup = (here / 'overlay/popup.html').read_text(encoding='utf-8')
scripts = re.findall(r'<script\s+src="([^"]+)"', popup)
assert scripts.index('core/i18n-catalog.js') < scripts.index('core/i18n.js') < scripts.index('popup.js')
print(f'PASS strict catalogs reproduce committed bytes twice: {len(english)} keys, {len(codes)} languages; {entry_count} content-script entries and popup preserve i18n order. No source files regenerated.')
