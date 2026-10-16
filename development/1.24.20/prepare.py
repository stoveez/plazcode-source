"""Compose 1.24.20 from pinned 1.24.19 and a binary-safe sparse overlay."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import shutil
import stat
import zipfile

root = Path(__file__).resolve().parents[2]
here = Path(__file__).parent
archive = root / 'PlazCode-source-1.24.19.zip'
BASELINE_SHA256 = 'eb8973151a0ac54a884d72d70d3669b9ede14db6000cf8d244742170e378042b'
TEXT_SUFFIXES = frozenset({
 '.js', '.cjs', '.mjs', '.json', '.html', '.css', '.py', '.rs', '.toml',
 '.md', '.txt', '.ps1', '.sh', '.cmd', '.bat', '.yml', '.yaml', '.xml', '.svg',
})


def relative_path(value):
 """Resource/archive paths must be unambiguous on Linux and Windows."""
 if not isinstance(value, str) or not value or '\\' in value:
  raise ValueError(f'Unsafe relative path: {value!r}')
 path = PurePosixPath(value)
 if path.is_absolute() or '..' in path.parts or ':' in path.parts[0] or str(path) != value:
  raise ValueError(f'Unsafe relative path: {value!r}')
 return Path(*path.parts)


def extract(archive_path, destination):
 with zipfile.ZipFile(archive_path) as zipped:
  for item in zipped.infolist():
   relative_path(item.filename.rstrip('/'))
   if stat.S_ISLNK(item.external_attr >> 16):
    raise ValueError(f'Archive symlink is not allowed: {item.filename}')
  zipped.extractall(destination)


def is_ultra_resource(relative):
 return relative.parts[0] == 'ultra' or relative.parts[:2] == ('PlazCode-Extension', 'ultra')


def overlay_bytes(relative, raw):
 """Ultra is hash-pinned data, including its text; never normalize its bytes.

 Other known UTF-8 text may use Windows line endings. Binary/unknown formats,
 including binary files with a known text suffix, must remain byte-identical.
 """
 if is_ultra_resource(relative) or relative.suffix.lower() not in TEXT_SUFFIXES or b'\0' in raw:
  return raw
 try:
  raw.decode('utf-8')
 except UnicodeDecodeError:
  return raw
 return raw.replace(b'\r\n', b'\n')


def apply_overlay(overlay, source):
 for path in overlay.rglob('*'):
  if path.is_symlink():
   raise ValueError(f'Overlay symlink is not allowed: {path}')
  if path.is_file():
   relative = path.relative_to(overlay)
   target = source / relative
   target.parent.mkdir(parents=True, exist_ok=True)
   target.write_bytes(overlay_bytes(relative, path.read_bytes()))


def bundle_files(bundle):
 files = {}
 for path in bundle.rglob('*'):
  if path.is_symlink():
   raise ValueError(f'Ultra symlink is not allowed: {path}')
  if path.is_file():
   files[path.relative_to(bundle).as_posix()] = path
 return files


def checked_records(records, expected_count, description):
 if not isinstance(records, list) or len(records) != expected_count:
  raise ValueError(f'{description}: record count mismatch')
 mapped = {}
 for record in records:
  name = record['resource']
  relative_path(name)
  if name in mapped:
   raise ValueError(f'{description}: duplicate resource {name}')
  size, digest = record['bytes'], record['sha256']
  if type(size) is not int or size < 0 or not isinstance(digest, str) or len(digest) != 64 or any(c not in '0123456789abcdef' for c in digest):
   raise ValueError(f'{description}: invalid hash record for {name}')
  mapped[name] = record
 return mapped


def verify_record(path, record, description):
 raw = path.read_bytes()
 if len(raw) != record['bytes'] or hashlib.sha256(raw).hexdigest() != record['sha256']:
  raise ValueError(f'{description}: hash/size mismatch for {record["resource"]}')


def complete_ultra(source):
 """Prune the seeded sparse composition, then verify BOTH final and input hashes."""
 bundle = source / 'ultra'
 resources = json.loads((bundle / 'resources.json').read_text(encoding='utf-8'))
 inventory = json.loads((bundle / 'INVENTORY.json').read_text(encoding='utf-8'))
 if not isinstance(resources, list) or not resources or len(set(resources)) != len(resources):
  raise ValueError('Ultra allowlist is empty or contains duplicates')
 for name in resources:
  relative_path(name)
 allowed = set(resources)
 if inventory['format'] != 1 or inventory['resource_count'] != len(resources):
  raise ValueError('Ultra inventory/allowlist count mismatch')
 if not {'resources.json', 'index.json', 'INVENTORY.json'}.issubset(allowed):
  raise ValueError('Ultra allowlist omits required discovery files')
 # Remove inherited, superseded functional resources; never merge them into release.
 for name, path in bundle_files(bundle).items():
  if name not in allowed:
   path.unlink()
 for path in sorted(bundle.rglob('*'), key=lambda p: len(p.parts), reverse=True):
  if path.is_dir() and not any(path.iterdir()):
   path.rmdir()
 actual = bundle_files(bundle)
 if set(actual) != allowed:
  raise ValueError(f'Ultra missing resources: {sorted(allowed - set(actual))}')
 final_records = checked_records(inventory['files'], len(resources) - 1, 'Ultra final inventory')
 if set(final_records) != allowed - {'INVENTORY.json'}:
  raise ValueError('Ultra final hash records do not match allowlist')
 for name, record in final_records.items():
  verify_record(actual[name], record, 'Ultra final inventory')
 source_input = inventory['source_input']
 input_records = checked_records(source_input['files'], source_input['file_count'], 'Ultra source input')
 for name, record in input_records.items():
  if name not in actual:
   raise ValueError(f'Ultra source input missing: {name}')
  verify_record(actual[name], record, 'Ultra source input')
 catalog = json.loads((bundle / 'index.json').read_text(encoding='utf-8'))
 if len(catalog) != inventory['catalog_count'] or len({e['id'] for e in catalog}) != len(catalog):
  raise ValueError('Ultra catalog count/IDs mismatch')
 if sum(e['resource'].startswith('skills/') for e in catalog) != inventory['skill_count'] or sum(e['resource'].startswith('agents/') for e in catalog) != inventory['agent_count']:
  raise ValueError('Ultra catalog skill/agent counts mismatch')
 if any(e['resource'] not in allowed for e in catalog):
  raise ValueError('Ultra catalog points to an absent resource')
 for filename, expected in [('ultra-index.json', catalog), ('ultra-resources.json', resources)]:
  if json.loads((source / 'agent/src' / filename).read_text(encoding='utf-8')) != expected:
   raise ValueError(f'Native {filename} disagrees with Ultra bundle')
 # Remove the extracted extension tree entirely; its fresh replacement must match root.
 extension = source / 'PlazCode-Extension/ultra'
 if extension.exists():
  shutil.rmtree(extension)
 shutil.copytree(bundle, extension)
 copied = bundle_files(extension)
 if set(copied) != allowed or any(copied[name].read_bytes() != actual[name].read_bytes() for name in allowed):
  raise ValueError('Root/extension Ultra parity failure')


def main():
 if hashlib.sha256(archive.read_bytes()).hexdigest() != BASELINE_SHA256:
  raise ValueError('Pinned 1.24.19 source archive hash mismatch')
 # The baseline has an extension Ultra bundle, but no root Ultra directory.
 extract(archive, root / 'build-src-1.24.20')
 source = root / 'build-src-1.24.20/PlazCode'
 seed, bundle = source / 'PlazCode-Extension/ultra', source / 'ultra'
 if bundle.exists():
  shutil.rmtree(bundle)
 shutil.copytree(seed, bundle)
 apply_overlay(here / 'overlay', source)
 complete_ultra(source)
 for folder in ['core', 'providers']:
  shutil.copytree(source / folder, source / 'PlazCode-Extension' / folder, dirs_exist_ok=True)
 for name in ['manifest.json', 'background.js', 'popup.js', 'popup.html', 'overlay.css', 'blender_ops.py', 'blender_once.py', 'blender_once.ps1', 'SOURCE.txt']:
  shutil.copy2(source / name, source / 'PlazCode-Extension' / name)
 if json.loads((source / 'manifest.json').read_text(encoding='utf-8'))['version'] != '1.24.20':
  raise ValueError('Unexpected prepared version')
 print(source)


if __name__ == '__main__':
 main()
