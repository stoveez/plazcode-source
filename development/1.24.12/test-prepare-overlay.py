"""Preparation is host-independent and preserves the original binary assets."""
from pathlib import Path
import tempfile,shutil,subprocess,zipfile,base64
root=Path(__file__).resolve().parents[2];here=Path(__file__).parent
with tempfile.TemporaryDirectory(prefix='plazcode-overlay-') as temporary:
 work=Path(temporary);dev=work/'development/1.24.12';dev.mkdir(parents=True)
 shutil.copy2(root/'PlazCode-source-1.24.11.zip',work/'PlazCode-source-1.24.11.zip')
 for name in ['prepare.py']:shutil.copy2(here/name,dev/name)
 shutil.copytree(here/'binary',dev/'binary')
 for path in (here/'overlay').rglob('*'):
  if path.is_file():
   raw=path.read_bytes();raw.decode('utf-8')
   target=dev/'overlay'/path.relative_to(here/'overlay');target.parent.mkdir(parents=True,exist_ok=True)
   target.write_bytes(raw.replace(b'\r\n',b'\n').replace(b'\n',b'\r\n'))
 subprocess.run(['python3' if shutil.which('python3') else 'python',str(dev/'prepare.py')],check=True,timeout=60)
 source=work/'build-src/PlazCode'
 for path in (dev/'overlay').rglob('*'):
  if path.is_file():
   target=source/path.relative_to(dev/'overlay');assert target.read_bytes()==path.read_bytes().replace(b'\r\n',b'\n'),target
 for folder in ['core','providers']:
  for path in (source/folder).glob('*'):
   if path.is_file():assert path.read_bytes()==(source/'PlazCode-Extension'/path.relative_to(source)).read_bytes()
 images=[p for p in (source/'PlazCode-Extension/ultragui/references').rglob('*') if p.suffix in ('.png','.jpg')]
 assert len(images)>=5
 for p in images:
  head=p.read_bytes()[:4];assert head.startswith(b'\x89PNG') or head.startswith(b'\xff\xd8'),p
 with zipfile.ZipFile(work/'PlazCode-source-1.24.11.zip') as archive:
  kept=[n for n in archive.namelist() if n.startswith('PlazCode/PlazCode-Extension/ultragui/') and n.endswith('.png') and (work/'build-src'/n).exists()]
  for name in kept:assert (work/'build-src'/name).read_bytes()==archive.read(name),'Original image bytes changed'
 assert not (source/'PlazCode-Extension/ultragui/skills/gui-layout.md').exists(),'retired skill removed'
print('PASS Windows CRLF overlays produce canonical source and matching extension files; UltraGUI images are byte-exact and retired skills removed.')
