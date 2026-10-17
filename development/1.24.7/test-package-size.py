"""Compression must preserve bytes, paths and modes; platform pruning is explicit."""
from pathlib import Path
import importlib.util,tempfile,zipfile,json
root=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('promotion',Path(__file__).with_name('promote.py'))
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
with tempfile.TemporaryDirectory() as temp:
 archive=root/'PlazCode-1.23.0.zip'
 with zipfile.ZipFile(archive) as z:
  original={i.filename:(z.read(i),i.external_attr) for i in z.infolist() if not i.is_dir()}
 retained={n:v for n,v in original.items() if not n.startswith('PlazCode/PlazCode.app/') and not n.endswith('.command')}
 assert 'PlazCode/PlazCode.exe' in retained
 assert 'PlazCode/runtime/engram/engram-windows-amd64.exe' in retained
 assert any(n.startswith('PlazCode/PlazCode-Extension/') for n in retained)
 assert any(n.startswith('PlazCode/PlazCode-Extension-Firefox/') for n in retained)
 target=Path(temp)/'windows.zip';p.pack(target,retained)
 with zipfile.ZipFile(target) as z:
  restored={i.filename:(z.read(i),i.external_attr) for i in z.infolist()}
 assert restored==retained,'Every retained entry must preserve bytes and permissions'
 assert target.stat().st_size<archive.stat().st_size*.5
 print(json.dumps({'baselineWindowsBytes':archive.stat().st_size,'platformOnlyWindowsBytes':target.stat().st_size,'allRetainedBytesAndModesVerified':True}))
 try:p.pack(target,retained)
 except AssertionError:pass
 else:raise AssertionError('Published archive overwrite must remain forbidden')
