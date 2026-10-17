"""Unpack the checksum-verified user-supplied UltraLab reference bundle. Never execute it."""
from pathlib import Path,PurePosixPath
import base64,hashlib,io,zipfile,sys
here=Path(__file__).parent
raw=base64.b64decode(''.join(p.read_text().strip() for p in sorted((here/'ultra-assets').glob('ultralab.*.b64'))),validate=True)
assert hashlib.sha256(raw).hexdigest()=="17c95a709e1b98e5d6809cd688a98e4fb8d0c297e35934573b14b77d2d63bbfb","UltraLab source archive checksum mismatch"
root=Path(sys.argv[1])/'PlazCode-Extension/ultra';root.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(io.BytesIO(raw)) as archive:
 assert sum(x.file_size for x in archive.infolist())<=16*1024*1024,"UltraLab archive exceeds reviewed size bound"
 for item in archive.infolist():
  path=PurePosixPath(item.filename)
  assert not path.is_absolute() and '..' not in path.parts and '\\' not in item.filename and ':' not in item.filename
  assert ((item.external_attr>>16)&0o170000)!=0o120000,"Symbolic links are not allowed"
  if not item.is_dir():
   target=root.joinpath(*path.parts);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(archive.read(item))
print('Verified UltraLab reference bundle:',len(raw),'archive bytes; no helpers executed')
