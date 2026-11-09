"""Preparation is host-independent: Windows CRLF overlays produce the same canonical source."""
from pathlib import Path
import tempfile,shutil,subprocess,json,sys,copy
root=Path(__file__).resolve().parents[2];here=Path(__file__).parent
with tempfile.TemporaryDirectory(prefix='plazcode-overlay-') as temporary:
 work=Path(temporary);dev=work/'development/1.24.31';dev.mkdir(parents=True)
 shutil.copy2(root/'PlazCode-source-1.24.20.zip',work/'PlazCode-source-1.24.20.zip')
 shutil.copy2(here/'prepare.py',dev/'prepare.py')
 shutil.copy2(here/'source_proof.py',dev/'source_proof.py')
 for path in (here/'overlay').rglob('*'):
  if path.is_file():
   raw=path.read_bytes();binary=path.suffix.lower() in {'.png','.jpg','.jpeg','.gif','.ico','.zip','.exe','.dll','.woff','.woff2','.ttf','.otf','.webp'} or b'\0' in raw[:8192] or 'ro-engineer' in path.parts  # 1.24.30: -text in .gitattributes, kept byte for byte
   if not binary:raw.decode('utf-8')
   target=dev/'overlay'/path.relative_to(here/'overlay');target.parent.mkdir(parents=True,exist_ok=True)
   target.write_bytes(raw if binary else raw.replace(b'\r\n',b'\n').replace(b'\n',b'\r\n'))
 subprocess.run(['python3' if shutil.which('python3') else 'python',str(dev/'prepare.py')],check=True,timeout=120)
 source=work/'build-src-1.24.31/PlazCode'
 for path in (dev/'overlay').rglob('*'):
  if path.is_file():
   target=source/path.relative_to(dev/'overlay');data=path.read_bytes();binary=path.suffix.lower() in {'.png','.jpg','.jpeg','.gif','.ico','.zip','.exe','.dll','.woff','.woff2','.ttf','.otf','.webp'} or b'\0' in data[:8192] or 'ro-engineer' in path.parts
   assert target.read_bytes()==(data if binary else data.replace(b'\r\n',b'\n')),target
 for folder in ['core','providers']:
  for path in (source/folder).glob('*'):
   if path.is_file():assert path.read_bytes()==(source/'PlazCode-Extension'/path.relative_to(source)).read_bytes(),path
 assert (source/'SOURCE.txt').read_bytes()==(source/'PlazCode-Extension/SOURCE.txt').read_bytes()
 for name in ['manifest.json','popup.html','popup.js','background.js']:
  assert (source/name).read_bytes()==(source/'PlazCode-Extension'/name).read_bytes(),name
 manifest=json.loads((source/'PlazCode-Extension/manifest.json').read_text())
 assert manifest['version']=='1.24.31'
 for entry in manifest['content_scripts']:
  scripts=entry.get('js',[])
  if 'core/main.js' in scripts:
   assert scripts.index('core/i18n-catalog.js')<scripts.index('core/i18n.js')<scripts.index('core/main.js')
 for name in ['i18n-catalog.js','i18n.js']:
  assert (source/'core'/name).read_bytes()==(source/'PlazCode-Extension/core'/name).read_bytes(),name
 sys.path.insert(0,str(here))
 from source_proof import NAME,source_files,verify
 files=source_files(source);report=json.loads((work/'artifacts'/NAME).read_text())
 verify(files,[report,copy.deepcopy(report)])
 assert all(set(row)=={'bytes','sha256'} for row in report['files'].values()), 'Only hashes and lengths may be uploaded'
 def refused(candidate,reports):
  try:verify(candidate,reports)
  except AssertionError:return
  raise AssertionError('Changed source proof was accepted')
 changed=dict(files);key=next(iter(changed));changed[key]=(b'changed',changed[key][1]);refused(changed,[report,report])
 changed=dict(files);del changed[key];refused(changed,[report,report])
 changed=dict(files);changed['PlazCode/extra.js']=(b'extra',0);refused(changed,[report,report])
 bad=copy.deepcopy(report);bad['version']='1.24.29';refused(files,[report,bad])
 assert not list((work/'artifacts').glob('*source*.zip'))
print('PASS Windows CRLF overlays produce canonical source and matching extension files.')
print('PASS hash-only source proofs reject changed/missing/extra files and mismatched platform versions; no source ZIP created.')
