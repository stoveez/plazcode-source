"""Preparation is host-independent and preserves the original binary assets."""
from pathlib import Path
import tempfile,shutil,subprocess,zipfile
root=Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='plazcode-overlay-') as temporary:
 work=Path(temporary);dev=work/'development/1.24.11';dev.mkdir(parents=True)
 shutil.copy2(root/'PlazCode-source-1.24.10.zip',work/'PlazCode-source-1.24.10.zip')
 for name in ['prepare.py']:shutil.copy2(Path(__file__).parent/name,dev/name)
 for path in (Path(__file__).parent/'overlay').rglob('*'):
  if path.is_file():
   raw=path.read_bytes();raw.decode('utf-8')
   target=dev/'overlay'/path.relative_to(Path(__file__).parent/'overlay');target.parent.mkdir(parents=True,exist_ok=True)
   target.write_bytes(raw.replace(b'\r\n',b'\n').replace(b'\n',b'\r\n'))
 subprocess.run(['python',str(dev/'prepare.py')],check=True,timeout=60)
 source=work/'build-src/PlazCode'
 for path in (dev/'overlay').rglob('*'):
  if path.is_file():
   target=source/path.relative_to(dev/'overlay');assert target.read_bytes()==path.read_bytes().replace(b'\r\n',b'\n'),target
 for folder in ['core','providers']:
  for path in (source/folder).glob('*'):
   if path.is_file():assert path.read_bytes()==(source/'PlazCode-Extension'/path.relative_to(source)).read_bytes()
 with zipfile.ZipFile(work/'PlazCode-source-1.24.10.zip') as archive:
  binary=next(name for name in archive.namelist() if name.startswith('PlazCode/PlazCode-Extension/ultragui/') and name.endswith('.png'))
  assert (work/'build-src'/binary).read_bytes()==archive.read(binary),'Original image bytes changed'
print('PASS Windows CRLF overlays produce canonical source and matching extension files; original UltraGUI images remain byte-exact.')
