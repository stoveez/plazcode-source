from pathlib import Path
import zipfile,hashlib,shutil,json
root=Path(__file__).resolve().parents[2];archive=root/'PlazCode-source-1.24.8.zip'
assert hashlib.sha256(archive.read_bytes()).hexdigest()=="219c215426189b91ad994201166e1005724da3420334b6c47df0f419941335ef"
def extract(archive,destination):
 with zipfile.ZipFile(archive) as z:
  for name in z.namelist():
   p=Path(name);assert not p.is_absolute() and '..' not in p.parts
  z.extractall(destination)
extract(archive,root/'build-src');source=root/'build-src/PlazCode'
pack=Path(__file__).parent/'ultragui.zip'
assert hashlib.sha256(pack.read_bytes()).hexdigest()=="39613893710a444863b8e4114b3344423e9d960c3a31a79fc0964ed4715d0919"
extract(pack,source/'PlazCode-Extension/ultragui')
for path in (Path(__file__).parent/'overlay').rglob('*'):
 if path.is_file():
  target=source/path.relative_to(Path(__file__).parent/'overlay');target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(path.read_bytes().replace(b'\r\n',b'\n'))
for folder in ['core','providers']:shutil.copytree(source/folder,source/'PlazCode-Extension'/folder,dirs_exist_ok=True)
for name in ['manifest.json','background.js','popup.js','popup.html','overlay.css','blender_ops.py','blender_once.py','blender_once.ps1']:shutil.copy2(source/name,source/'PlazCode-Extension'/name)
assert json.loads((source/'manifest.json').read_text())['version']=='1.24.9'
print(source)
