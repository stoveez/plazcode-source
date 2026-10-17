"""Extract the immutable verified source baseline and overlay reviewed changes."""
from pathlib import Path
import hashlib,zipfile,shutil,json
root=Path(__file__).resolve().parents[2]
archive=root/'PlazCode-source-1.22.1.zip'
assert hashlib.sha256(archive.read_bytes()).hexdigest()=='bdd02417075ab9a173d5634d52200e04ff75a8de2432f3b70a4a41249c050950','Source baseline checksum mismatch'
destination=root/'build-src'
with zipfile.ZipFile(archive) as z:
 for name in z.namelist():
  path=Path(name)
  assert not path.is_absolute() and '..' not in path.parts,'Unsafe archive path'
 z.extractall(destination)
source=destination/'PlazCode'
for path in (Path(__file__).parent/'overlay').rglob('*'):
 if path.is_file():
  target=source/path.relative_to(Path(__file__).parent/'overlay');target.parent.mkdir(parents=True,exist_ok=True)
  # Git on Windows may use autocrlf; embedded source and extraction fixtures
  # must have the same line endings on every host. Do not alter binary assets.
  if path.suffix in {".js",".cjs",".rs",".html",".luau",".json",".py",".toml",".lock"}:target.write_bytes(path.read_bytes().replace(b"\r\n",b"\n"))
  else:shutil.copy2(path,target)
# Desktop embeds the nested compatibility extension. Keep both byte-identical.
for folder in ['core','providers']:
 shutil.copytree(source/folder,source/'PlazCode-Extension'/folder,dirs_exist_ok=True)
for name in ['manifest.json','background.js']:
 shutil.copy2(source/name,source/'PlazCode-Extension'/name)
assert json.loads((source/'manifest.json').read_text())['version']=='1.23.0'
print(source)
