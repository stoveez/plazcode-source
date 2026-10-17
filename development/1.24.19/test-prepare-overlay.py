"""Preparation is host-independent: Windows CRLF overlays produce the same canonical source."""
from pathlib import Path
import tempfile,shutil,subprocess,json
root=Path(__file__).resolve().parents[2];here=Path(__file__).parent
with tempfile.TemporaryDirectory(prefix='plazcode-overlay-') as temporary:
 work=Path(temporary);dev=work/'development/1.24.19';dev.mkdir(parents=True)
 shutil.copy2(root/'PlazCode-source-1.24.18.zip',work/'PlazCode-source-1.24.18.zip')
 shutil.copy2(here/'prepare.py',dev/'prepare.py')
 for path in (here/'overlay').rglob('*'):
  if path.is_file():
   raw=path.read_bytes();raw.decode('utf-8')
   target=dev/'overlay'/path.relative_to(here/'overlay');target.parent.mkdir(parents=True,exist_ok=True)
   target.write_bytes(raw.replace(b'\r\n',b'\n').replace(b'\n',b'\r\n'))
 subprocess.run(['python3' if shutil.which('python3') else 'python',str(dev/'prepare.py')],check=True,timeout=120)
 source=work/'build-src-1.24.19/PlazCode'
 for path in (dev/'overlay').rglob('*'):
  if path.is_file():
   target=source/path.relative_to(dev/'overlay');assert target.read_bytes()==path.read_bytes().replace(b'\r\n',b'\n'),target
 for folder in ['core','providers']:
  for path in (source/folder).glob('*'):
   if path.is_file():assert path.read_bytes()==(source/'PlazCode-Extension'/path.relative_to(source)).read_bytes(),path
 assert (source/'SOURCE.txt').read_bytes()==(source/'PlazCode-Extension/SOURCE.txt').read_bytes()
 for name in ['manifest.json','popup.html','popup.js','background.js']:
  assert (source/name).read_bytes()==(source/'PlazCode-Extension'/name).read_bytes(),name
 manifest=json.loads((source/'PlazCode-Extension/manifest.json').read_text())
 assert manifest['version']=='1.24.19'
 for entry in manifest['content_scripts']:
  scripts=entry.get('js',[])
  if 'core/main.js' in scripts:
   assert scripts.index('core/i18n-catalog.js')<scripts.index('core/i18n.js')<scripts.index('core/main.js')
 for name in ['i18n-catalog.js','i18n.js']:
  assert (source/'core'/name).read_bytes()==(source/'PlazCode-Extension/core'/name).read_bytes(),name
print('PASS Windows CRLF overlays produce canonical source and matching extension files.')
