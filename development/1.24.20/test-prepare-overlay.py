"""Sparse Ultra reconstruction is hash-exact; only other known text gets CRLF normalization."""
from pathlib import Path
import hashlib
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import zipfile

root = Path(__file__).resolve().parents[2]
here = Path(__file__).parent
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('prepare_overlay', here / 'prepare.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


def digest(raw):
 return hashlib.sha256(raw).hexdigest()


def files(folder):
 return {p.relative_to(folder).as_posix(): p for p in folder.rglob('*') if p.is_file()}


def expect_failure(callback, message):
 try:
  callback()
 except ValueError as error:
  assert message in str(error), error
 else:
  raise AssertionError('Expected failure: ' + message)


# Binary-safe even with misleading extensions; unknown formats are not guessed as text.
for name in ['asset.png', 'archive.zip', 'opaque.bin', 'binary.txt']:
 raw = b'\x89PNG\r\n\x1a\n\x00binary\xff\r\n'
 assert prepare.overlay_bytes(Path(name), raw) == raw
assert prepare.overlay_bytes(Path('unknown.bin'), b'utf8-looking\r\n') == b'utf8-looking\r\n'
assert prepare.overlay_bytes(Path('known.js'), b'known\r\n') == b'known\n'
for name in ['ultra/GUIDE.md', 'ultra/image.png', 'PlazCode-Extension/ultra/notes.md']:
 assert prepare.overlay_bytes(Path(name), b'Ultra\r\nexact\r\n') == b'Ultra\r\nexact\r\n'
for bad in ['../escape', '/absolute', 'a/../b', 'a\\b', 'C:/escape', 'a//b']:
 expect_failure(lambda: prepare.relative_path(bad), 'Unsafe relative path')

with tempfile.TemporaryDirectory(prefix='plazcode-overlay-') as temporary:
 work = Path(temporary)
 dev = work / 'development/1.24.20'
 dev.mkdir(parents=True)
 shutil.copy2(root / 'PlazCode-source-1.24.19.zip', work / 'PlazCode-source-1.24.19.zip')
 shutil.copy2(here / 'prepare.py', dev / 'prepare.py')
 # Deliberately simulate the REMOTE SPARSE overlay, even while the working overlay
 # still contains all incoming files. No edit/pruning of the real overlay occurs.
 skipped = 0
 expected_overlay = {}
 with zipfile.ZipFile(root / 'PlazCode-source-1.24.19.zip') as baseline:
  names = set(baseline.namelist())
  assert not any(n.startswith('PlazCode/ultra/') for n in names), 'Baseline unexpectedly has root Ultra'
  for path in (here / 'overlay').rglob('*'):
   if path.is_file():
    relative = path.relative_to(here / 'overlay')
    raw = path.read_bytes()
    if relative.parts[0] == 'ultra':
     seed = 'PlazCode/PlazCode-Extension/' + relative.as_posix()
     if seed in names and baseline.read(seed) == raw:
      skipped += 1
      continue
    # Simulate Windows checkout only for known NON-Ultra text, never binary/data.
    canonical = prepare.overlay_bytes(relative, raw)
    if not prepare.is_ultra_resource(relative) and relative.suffix.lower() in prepare.TEXT_SUFFIXES:
     try:
      raw.decode('utf-8')
      if b'\0' not in raw:
       raw = canonical.replace(b'\n', b'\r\n')
     except UnicodeDecodeError:
      pass
    target = dev / 'overlay' / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(raw)
    expected_overlay[relative] = canonical
 # These fixtures are test-local and are never put into the actual source overlay.
 fixtures = {
  'core/prepare-binary.png': b'\x89PNG\r\n\x1a\n\x00\xff\r\n',
  'test-support/prepare-opaque.bin': b'opaque UTF8\r\nstill binary by format\r\n',
  'test-support/prepare-binary.txt': b'\xff\xfe\r\n\x00\r\n',
  'test-support/prepare-crlf.txt': 'text café\r\nsecond line\r\n'.encode(),
 }
 for name, raw in fixtures.items():
  relative = Path(name)
  target = dev / 'overlay' / relative
  target.parent.mkdir(parents=True, exist_ok=True)
  target.write_bytes(raw)
  expected_overlay[relative] = prepare.overlay_bytes(relative, raw)
 # Stale files from an earlier local invocation must not survive either Ultra tree.
 source = work / 'build-src-1.24.20/PlazCode'
 for relative in ['ultra/stale-root-only.bin', 'PlazCode-Extension/ultra/stale-extension-only.bin']:
  path = source / relative
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_bytes(b'superseded\r\n')
 result = subprocess.run([sys.executable, str(dev / 'prepare.py')], timeout=120, capture_output=True, text=True)
 assert result.returncode == 0, result.stdout + result.stderr
 for relative, expected in expected_overlay.items():
  assert (source / relative).read_bytes() == expected, relative
 for folder in ['core', 'providers']:
  for relative, path in files(source / folder).items():
   assert path.read_bytes() == (source / 'PlazCode-Extension' / folder / relative).read_bytes(), relative
 for name in ['SOURCE.txt', 'manifest.json', 'popup.html', 'popup.js', 'background.js']:
  assert (source / name).read_bytes() == (source / 'PlazCode-Extension' / name).read_bytes(), name
 manifest = json.loads((source / 'PlazCode-Extension/manifest.json').read_text())
 assert manifest['version'] == '1.24.20'
 for entry in manifest['content_scripts']:
  scripts = entry.get('js', [])
  if 'core/main.js' in scripts:
   assert scripts.index('core/i18n-catalog.js') < scripts.index('core/i18n.js') < scripts.index('core/main.js')
 bundle = source / 'ultra'
 resources = json.loads((bundle / 'resources.json').read_text())
 inventory = json.loads((bundle / 'INVENTORY.json').read_text())
 assert len(resources) == inventory['resource_count'] == 819
 assert len(inventory['files']) == 818
 assert inventory['source_input']['file_count'] == len(inventory['source_input']['files']) == 813
 assert set(files(bundle)) == set(files(source / 'PlazCode-Extension/ultra')) == set(resources)
 for name in resources:
  assert (bundle / name).read_bytes() == (source / 'PlazCode-Extension/ultra' / name).read_bytes(), name
 for record in inventory['files'] + inventory['source_input']['files']:
  raw = (bundle / record['resource']).read_bytes()
  assert len(raw) == record['bytes'] and digest(raw) == record['sha256'], record['resource']
 assert not any(n.startswith('core-skills/') for n in resources)
 for old_font in ['Fredoka-Bold.ttf', 'Fredoka-SemiBold.ttf']:
  assert not (bundle / 'skills/ul-ui-builder/references/fonts' / old_font).exists()
 assert (bundle / 'skills/ul-ui-builder/references/fonts/OFL.txt').exists()
 for stale in ['stale-root-only.bin', 'stale-extension-only.bin']:
  assert not (bundle / stale).exists()
  assert not (source / 'PlazCode-Extension/ultra' / stale).exists()
 # Hash validation must reject corruption, not merely copy the right path/count.
 guide = bundle / 'GUIDE.md'
 original = guide.read_bytes()
 guide.write_bytes(original + b'\r\ncorrupted')
 expect_failure(lambda: prepare.complete_ultra(source), 'Ultra final inventory: hash/size mismatch')
 guide.write_bytes(original)
 inventory_path = bundle / 'INVENTORY.json'
 original_inventory = inventory_path.read_bytes()
 corrupted = json.loads(original_inventory)
 corrupted['source_input']['files'][0]['sha256'] = '0' * 64
 inventory_path.write_text(json.dumps(corrupted))
 expect_failure(lambda: prepare.complete_ultra(source), 'Ultra source input: hash/size mismatch')
 inventory_path.write_bytes(original_inventory)
 # A malicious allowlist must not permit deleting/reading outside the bundle.
 resource_path = bundle / 'resources.json'
 original_resources = resource_path.read_bytes()
 resource_path.write_text(json.dumps(resources + ['../escape']))
 expect_failure(lambda: prepare.complete_ultra(source), 'Unsafe relative path')
 resource_path.write_bytes(original_resources)
 prepare.complete_ultra(source)
print(f'PASS sparse baseline-seeded Ultra: 819 exact resources, 818 final + 813 input hashes, no superseded files; binary-safe copy, non-Ultra CRLF text normalization and root/extension parity ({skipped} identical overlay files omitted in test).')
