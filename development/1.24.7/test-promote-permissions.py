"""Verify the release-only Mac helper permission repair and ZIP roundtrip."""
from pathlib import Path
import importlib.util,tempfile,zipfile
spec=importlib.util.spec_from_file_location('promotion',Path(__file__).with_name('promote.py'))
promotion=importlib.util.module_from_spec(spec);spec.loader.exec_module(promotion)
with tempfile.TemporaryDirectory(prefix='plazcode-release-modes-') as directory:
 root=Path(directory);source=root/'validated.zip';target=root/'release.zip'
 original={
  'PlazCode/Update-PlazCode.command':(b'#!/bin/bash\necho verified\n',0o100644<<16),
  'PlazCode/Configure-MacOS-Updates.command':(b'#!/bin/bash\necho configure\n',0o100755<<16),
  'PlazCode/nested/example.command':(b'unchanged reference',0o100644<<16),
  'PlazCode/PlazCode.app/Contents/MacOS/PlazCode':(b'validated native bytes',0o100755<<16),
  'PlazCode/Update-PlazCode.ps1':(b'checksum and rollback unchanged',0o100644<<16),
 }
 with zipfile.ZipFile(source,'w') as archive:
  for name,(content,mode) in original.items():
   info=zipfile.ZipInfo(name);info.external_attr=mode;archive.writestr(info,content)
 repaired=promotion.unpack_package(source)
 for name,(content,mode) in original.items():
  assert repaired[name][0]==content,name
  assert repaired[name][1]==(mode|(0o111<<16) if name=='PlazCode/Update-PlazCode.command' else mode),name
 promotion.pack(target,repaired)
 with zipfile.ZipFile(target) as archive:
  assert archive.testzip() is None
  assert archive.getinfo('PlazCode/Update-PlazCode.command').external_attr>>16&0o777==0o755
  assert archive.read('PlazCode/PlazCode.app/Contents/MacOS/PlazCode')==original['PlazCode/PlazCode.app/Contents/MacOS/PlazCode'][0]
 assert promotion.unpack_package(target)==repaired
 try:promotion.pack(target,repaired)
 except AssertionError:pass
 else:raise AssertionError('Published archive overwrite was allowed')
print('PASS Mac updater execute-bit repair, immutable native/script bytes, unrelated permissions, ZIP roundtrip and no archive overwrite.')
