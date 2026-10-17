from pathlib import Path
import zipfile,hashlib,shutil,json
root=Path(__file__).resolve().parents[2];here=Path(__file__).parent;archive=root/'PlazCode-source-1.24.16.zip'
assert hashlib.sha256(archive.read_bytes()).hexdigest()=="0d70c6d034cce64196a53fcaf65d1227295a4110f85aa8182cb7394a469f18e0"
def extract(archive,destination):
 with zipfile.ZipFile(archive) as z:
  for name in z.namelist():
   p=Path(name);assert not p.is_absolute() and '..' not in p.parts
  z.extractall(destination)
# The published 1.24.16 source already contains every released overlay and edit.
extract(archive,root/'build-src-1.24.17');source=root/'build-src-1.24.17/PlazCode'
for path in (here/'overlay').rglob('*'):
 if path.is_file():
  target=source/path.relative_to(here/'overlay');target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(path.read_bytes().replace(b'\r\n',b'\n'))
for folder in ['core','providers']:shutil.copytree(source/folder,source/'PlazCode-Extension'/folder,dirs_exist_ok=True)
for name in ['manifest.json','background.js','popup.js','popup.html','overlay.css','blender_ops.py','blender_once.py','blender_once.ps1','SOURCE.txt']:shutil.copy2(source/name,source/'PlazCode-Extension'/name)
assert json.loads((source/'manifest.json').read_text())['version']=='1.24.17'
print(source)
