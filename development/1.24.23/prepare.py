from pathlib import Path
import zipfile,hashlib,shutil,json
root=Path(__file__).resolve().parents[2];here=Path(__file__).parent;archive=root/'PlazCode-source-1.24.20.zip'
assert hashlib.sha256(archive.read_bytes()).hexdigest()=="a359139c301580762d20508f15a02bc52caa1e2383df16d1106fda960a5a0762"
# Images and other binary files must keep every byte; only text gets line endings normalised.
BINARY={'.png','.jpg','.jpeg','.gif','.ico','.zip','.exe','.dll','.woff','.woff2','.ttf','.otf','.webp'}
REMOVED=['core/ultracode-deepseek.js','PlazCode-Extension/core/ultracode-deepseek.js','PlazCode-Extension/ultra','PlazCode-Extension/ultragui',
 'test-deepseek-ultracode.js','test-ultracode-efficiency.js','agent/src/ultra-index.json','agent/src/ultra-resources.json','agent/src/ultragui-index.json','agent/src/ultragui-resources.json']
def extract(archive,destination):
 with zipfile.ZipFile(archive) as z:
  for name in z.namelist():
   p=Path(name);assert not p.is_absolute() and '..' not in p.parts
  z.extractall(destination)
# The published 1.24.20 source already contains every released overlay and edit.
extract(archive,root/'build-src-1.24.23');source=root/'build-src-1.24.23/PlazCode'
for path in (here/'overlay').rglob('*'):
 if path.is_file():
  target=source/path.relative_to(here/'overlay');target.parent.mkdir(parents=True,exist_ok=True);data=path.read_bytes();target.write_bytes(data if (path.suffix.lower() in BINARY or b'\0' in data[:8192]) else data.replace(b'\r\n',b'\n'))
# 1.24.23: Ultra is now the UltraLab pack (core/ultralab, read with ultralab_read). The old Ultra
# bundles, the DeepSeek-only Ultra and the Rust readers for them are removed completely.
for name in REMOVED:
 path=source/name
 if path.is_dir():shutil.rmtree(path)
 else:path.unlink(missing_ok=True)
for folder in ['core','providers']:shutil.copytree(source/folder,source/'PlazCode-Extension'/folder,dirs_exist_ok=True)
for name in ['manifest.json','background.js','popup.js','popup.html','overlay.css','blender_ops.py','blender_once.py','blender_once.ps1','SOURCE.txt']:shutil.copy2(source/name,source/'PlazCode-Extension'/name)
assert json.loads((source/'manifest.json').read_text())['version']=='1.24.23'
print(source)
