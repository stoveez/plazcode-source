from pathlib import Path
import zipfile,hashlib,shutil,json,base64
root=Path(__file__).resolve().parents[2];here=Path(__file__).parent;archive=root/'PlazCode-source-1.24.11.zip'
assert hashlib.sha256(archive.read_bytes()).hexdigest()=="33fa30c0ad1778635af2f9f5be031e639df5d6ac0f06024b457f2c5cd24d73df"
def extract(archive,destination):
 with zipfile.ZipFile(archive) as z:
  for name in z.namelist():
   p=Path(name);assert not p.is_absolute() and '..' not in p.parts
  z.extractall(destination)
# The published 1.24.11 source already contains every 1.24.11 overlay and edit.
extract(archive,root/'build-src');source=root/'build-src/PlazCode'
# Retired UltraGUI files replaced by the new skill pack.
REMOVED=["PlazCode-Extension/ultragui/skills/gui-layout.md", "PlazCode-Extension/ultragui/skills/gui-packs.md", "PlazCode-Extension/ultragui/skills/gui-references.md", "PlazCode-Extension/ultragui/skills/gui-toolbox.md", "PlazCode-Extension/ultragui/skills/project-layout.md", "PlazCode-Extension/ultragui/skills/reference-library.md", "PlazCode-Extension/ultragui/skills/review-for-exploits.md", "PlazCode-Extension/ultragui/ultragui_prompt_full.txt"]
for name in REMOVED:
 target=source/name;assert target.is_file(),name;target.unlink()
for path in (here/'overlay').rglob('*'):
 if path.is_file():
  target=source/path.relative_to(here/'overlay');target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(path.read_bytes().replace(b'\r\n',b'\n'))
# New UltraGUI images are stored as base64 chunks (name.b64.000, .001, ...) so they stay byte-exact.
chunks={}
for path in sorted((here/'binary').rglob('*.b64.*')):
 chunks.setdefault(path.relative_to(here/'binary').as_posix().rsplit('.b64.',1)[0],[]).append(path)
for name,parts in chunks.items():
 target=source/name;target.parent.mkdir(parents=True,exist_ok=True)
 target.write_bytes(base64.b64decode(b''.join(p.read_bytes().strip() for p in sorted(parts))))
for folder in ['core','providers']:shutil.copytree(source/folder,source/'PlazCode-Extension'/folder,dirs_exist_ok=True)
for name in ['manifest.json','background.js','popup.js','popup.html','overlay.css','blender_ops.py','blender_once.py','blender_once.ps1']:shutil.copy2(source/name,source/'PlazCode-Extension'/name)
assert json.loads((source/'manifest.json').read_text())['version']=='1.24.12'
print(source)
