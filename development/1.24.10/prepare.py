from pathlib import Path
import zipfile,hashlib,shutil,json,importlib.util
root=Path(__file__).resolve().parents[2];archive=root/'PlazCode-source-1.24.9.zip'
assert hashlib.sha256(archive.read_bytes()).hexdigest()=="e618de8a04707991eb0d4a8c50dae8d30e93c5d4e38dc36cd98a8cb007c2e4c0"
def extract(archive,destination):
 with zipfile.ZipFile(archive) as z:
  for name in z.namelist():
   p=Path(name);assert not p.is_absolute() and '..' not in p.parts
  z.extractall(destination)
# The published 1.24.9 source already contains the UltraGUI pack and every 1.24.9 overlay.
extract(archive,root/'build-src');source=root/'build-src/PlazCode'
for path in (Path(__file__).parent/'overlay').rglob('*'):
 if path.is_file():
  target=source/path.relative_to(Path(__file__).parent/'overlay');target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(path.read_bytes().replace(b'\r\n',b'\n'))
# Exact, unique-block edits to files the overlay does not replace (see edits.py).
here=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('edits',here/'edits.py');edits=importlib.util.module_from_spec(spec);spec.loader.exec_module(edits)
for name in edits.apply(source,here/'edits.json'):assert not (here/'overlay'/name).exists(),name
for folder in ['core','providers']:shutil.copytree(source/folder,source/'PlazCode-Extension'/folder,dirs_exist_ok=True)
for name in ['manifest.json','background.js','popup.js','popup.html','overlay.css','blender_ops.py','blender_once.py','blender_once.ps1']:shutil.copy2(source/name,source/'PlazCode-Extension'/name)
assert json.loads((source/'manifest.json').read_text())['version']=='1.24.10'
print(source)
