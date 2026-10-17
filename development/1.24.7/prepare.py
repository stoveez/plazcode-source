from pathlib import Path
import zipfile,hashlib,shutil,json
root=Path(__file__).resolve().parents[2];archive=root/'PlazCode-source-1.24.6.zip'
assert hashlib.sha256(archive.read_bytes()).hexdigest()=="c86234c2879f4868774dec31bf1f153643e877b14ba885c94bbd7354f09d44cd"
with zipfile.ZipFile(archive) as z:
 for name in z.namelist():
  p=Path(name);assert not p.is_absolute() and '..' not in p.parts
 z.extractall(root/'build-src')
source=root/'build-src/PlazCode'
for path in (Path(__file__).parent/'overlay').rglob('*'):
 if path.is_file():
  target=source/path.relative_to(Path(__file__).parent/'overlay');target.parent.mkdir(parents=True,exist_ok=True)
  target.write_bytes(path.read_bytes().replace(b'\r\n',b'\n'))
for folder in ['core','providers']:shutil.copytree(source/folder,source/'PlazCode-Extension'/folder,dirs_exist_ok=True)
for name in ['manifest.json','background.js','popup.js','popup.html','overlay.css']:shutil.copy2(source/name,source/'PlazCode-Extension'/name)
assert json.loads((source/'manifest.json').read_text())['version']=='1.24.7'
print(source)
