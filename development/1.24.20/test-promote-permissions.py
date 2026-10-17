"""Read-only promotion regressions: temporary ZIPs/repos, never assemble a release."""
from pathlib import Path
import ast,copy,hashlib,importlib.util,json,os,re,subprocess,sys,tempfile,zipfile
from unittest import mock
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('promotion',Path(__file__).with_name('promote.py'))
promotion=importlib.util.module_from_spec(spec);spec.loader.exec_module(promotion)

def rejected(function,*args):
    try:function(*args)
    except (AssertionError,KeyError,subprocess.CalledProcessError):return
    raise AssertionError('Unsafe promotion input was accepted')

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
 rejected(promotion.pack,target,repaired)
 for index,bad in enumerate(['../escape','/absolute','C:/absolute','nested\\escape']):
  path=root/f'unsafe-{index}.zip'
  with zipfile.ZipFile(path,'w') as archive:archive.writestr(bad,b'blocked')
  rejected(promotion.unpack,path)
print('PASS Mac helper execute-bit repair, immutable native/script bytes, ZIP roundtrip, unsafe paths and no archive overwrite.')

sample={'PlazCode/SHA256SUMS.txt':(b'old  retained.txt\nold  absent.exe\n',0o100644<<16),'PlazCode/retained.txt':(b'current bytes',0o100644<<16)}
rejected(promotion.refresh_checksums,dict(sample))
promotion.refresh_checksums(sample,require_all=False)
assert sample['PlazCode/SHA256SUMS.txt'][0]==(hashlib.sha256(b'current bytes').hexdigest()+'  retained.txt\n').encode()
print('PASS native checksum targets required; source drops absent native targets and refreshes retained digests.')

sha='a'*40;run_id='123456'
run={'id':int(run_id),'head_sha':sha,'path':'.github/workflows/validate-1.24.20.yml','repository':{'full_name':'stoveez/PlazCode'},'status':'completed','conclusion':'success'}
jobs={'jobs':[{'name':name,'status':'completed','conclusion':'success'} for name in sorted(promotion.REQUIRED_JOBS)]}
promotion.verify_validation(run,jobs,sha,run_id,'stoveez/PlazCode')
for field,value in [('id',654321),('head_sha','b'*40),('path','.github/workflows/other.yml'),('status','in_progress'),('conclusion','failure')]:
 bad=copy.deepcopy(run);bad[field]=value;rejected(promotion.verify_validation,bad,jobs,sha,run_id,'stoveez/PlazCode')
for value in ['failure','cancelled','skipped',None]:
 for index in range(4):
  bad=copy.deepcopy(jobs);bad['jobs'][index]['conclusion']=value;rejected(promotion.verify_validation,run,bad,sha,run_id)
for index in range(4):
 bad=copy.deepcopy(jobs);bad['jobs'][index]['status']='in_progress';rejected(promotion.verify_validation,run,bad,sha,run_id)
bad=copy.deepcopy(jobs);bad['jobs'].pop();rejected(promotion.verify_validation,run,bad,sha,run_id)
bad=copy.deepcopy(jobs);bad['jobs'].append(bad['jobs'][0]);rejected(promotion.verify_validation,run,bad,sha,run_id)
rejected(promotion.verify_validation,run,jobs,'SET_VALIDATED_SHA_AFTER_SUCCESS',run_id)
rejected(promotion.verify_validation,run,jobs,sha,'SET_VALIDATION_RUN_AFTER_SUCCESS')
rejected(promotion.verify_validation,run,jobs,sha,run_id,'unrelated/repository')
print('PASS exact workflow/repository/run/SHA and all four successful completed jobs required; placeholders and partial success rejected.')

with tempfile.TemporaryDirectory(prefix='plazcode-source-gate-') as directory:
 root=Path(directory)
 for name in promotion.SOURCE_INPUTS:
  path=root/name
  if name.endswith(('overlay','preferences-test')):path=path/'fixture.txt'
  path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(b'validated source\n')
 subprocess.run(['git','init','-q',str(root)],check=True)
 subprocess.run(['git','-C',str(root),'add','.'],check=True)
 subprocess.run(['git','-C',str(root),'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','validated fixture'],check=True)
 commit=subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()
 previous=promotion.ROOT;promotion.ROOT=root
 real_run=subprocess.run
 def quiet_run(*args,**kwargs):return real_run(*args,**{**kwargs,'stdout':subprocess.PIPE,'stderr':subprocess.STDOUT})
 try:
  with mock.patch.object(promotion.subprocess,'run',side_effect=quiet_run):
   promotion.verify_source_inputs(commit)
   for name in promotion.SOURCE_INPUTS:
    path=root/name
    if path.is_dir():path=path/'fixture.txt'
    old=path.read_bytes();path.write_bytes(b'unvalidated change\n')
    rejected(promotion.verify_source_inputs,commit);path.write_bytes(old)
   extra=root/'development/1.24.20/overlay/unvalidated.js';extra.write_text('unvalidated')
   rejected(promotion.verify_source_inputs,commit);extra.unlink()
   # Publication plumbing is allowed after the validation SHA; production inputs are not.
   (root/'development/1.24.20/release-entry.json').write_text('{}')
   promotion.verify_source_inputs(commit)
 finally:promotion.ROOT=previous
assert {'development/1.24.20/overlay','development/1.24.20/prepare.py','development/1.24.20/package.py','development/1.24.20/build-locales.py','.github/workflows/validate-1.24.20.yml','PlazCode-source-1.24.19.zip','PlazCode-1.23.0.zip','PlazCode-macOS-1.23.0.zip'}<=set(promotion.SOURCE_INPUTS)
print('PASS every source/prepare/package/catalog compiler/validation/base ZIP input rejects drift and untracked overlays; publication-only metadata remains independent.')

with tempfile.TemporaryDirectory(prefix='plazcode-desktop-gate-') as directory:
 package=Path(directory)/'mac.zip';package.write_bytes(b'exact validated Mac package')
 binary=b'exact validated universal native executable'
 mac={'PlazCode/PlazCode.app/Contents/MacOS/PlazCode':(binary,0o100755<<16)}
 desktop=[{'mode':mode,'version':'1.24.20','alive_seconds':210 if mode=='foreground' else 15,'desktop_ready':True,'window_visible':mode!='background','validated_sha':sha,'validation_run_id':run_id,'native_package_sha256':hashlib.sha256(package.read_bytes()).hexdigest(),'native_binary_sha256':hashlib.sha256(binary).hexdigest()} for mode in ['foreground','background','restore']]
 promotion.verify_desktop(desktop,mac,package,sha,run_id)
 for field,value in [('version','1.24.17'),('alive_seconds',14),('desktop_ready',False),('window_visible',False),('validated_sha','b'*40),('validation_run_id','654321'),('native_package_sha256','0'*64),('native_binary_sha256','0'*64)]:
  bad=copy.deepcopy(desktop);bad[0][field]=value;rejected(promotion.verify_desktop,bad,mac,package,sha,run_id)
 bad=copy.deepcopy(desktop);bad[0]['alive_seconds']=209;rejected(promotion.verify_desktop,bad,mac,package,sha,run_id)
 bad=copy.deepcopy(desktop);bad[1]['window_visible']=True;rejected(promotion.verify_desktop,bad,mac,package,sha,run_id)
 rejected(promotion.verify_desktop,desktop[:2],mac,package,sha,run_id)
print('PASS Mac desktop 210s foreground/15s hidden/15s restored-window evidence requires exact package, native bytes, source and validation run.')

mode=0o100644<<16
locales={'PlazCode/core/locales/'+code+'.json':(json.dumps({'Built-in setting':'Built-in setting' if code=='en' else 'Translation'}).encode(),mode) for code in promotion.LANGUAGES}
locales.update({'PlazCode/core/i18n-catalog.js':(b'compiled catalog',mode),'PlazCode/core/i18n.js':(b'shared runtime',mode)})
promotion.verify_locales(locales)
bad=dict(locales);del bad['PlazCode/core/locales/tr.json'];rejected(promotion.verify_locales,bad)
bad=dict(locales);del bad['PlazCode/core/locales/pl.json'];rejected(promotion.verify_locales,bad)
bad=dict(locales);bad['PlazCode/core/locales/tr.json']=(b'{}',mode);rejected(promotion.verify_locales,bad)
with tempfile.TemporaryDirectory(prefix='plazcode-overlay-parity-') as directory:
 previous=promotion.ROOT;promotion.ROOT=Path(directory)
 try:
  overlay=promotion.ROOT/'development/1.24.20/overlay/core/locales';overlay.mkdir(parents=True)
  (overlay/'en.json').write_bytes(b'{"Built-in setting":null}\r\n')
  source={'PlazCode/core/locales/en.json':(b'{"Built-in setting":null}\n',mode)}
  promotion.verify_overlay(source)
  source['PlazCode/core/locales/en.json']=(b'old catalog',mode);rejected(promotion.verify_overlay,source)
 finally:promotion.ROOT=previous
print('PASS all 15 complete catalogs/runtime and exact canonical overlay bytes required in source archive.')

shared={'PlazCode/core/main.js':(b'validated UI',mode),'PlazCode/providers/clickup.js':(b'validated startup/performance',mode),'PlazCode/core/locales/tr.json':(b'validated locale',mode)}
for relative in ['launch_studio_mcp.py','launch_blender_mcp.py','blender_ops.py']:shared['PlazCode/'+relative]=(b'validated launcher',mode)
native={}
firefox={}
for name,value in shared.items():
 relative=name.removeprefix('PlazCode/')
 native[name]=value
 if relative.startswith(('core/','providers/')):
  firefox[relative]=value
  for prefix in ['PlazCode/PlazCode-Extension/','PlazCode/PlazCode-Extension-Firefox/']:native[prefix+relative]=value
promotion.verify_shared_code(shared,[native,dict(native)],firefox)
bad=dict(native);bad['PlazCode/PlazCode-Extension-Firefox/providers/clickup.js']=(b'stale composer',mode)
rejected(promotion.verify_shared_code,shared,[bad],firefox)
bad=dict(firefox);bad['core/locales/tr.json']=(b'stale locale',mode)
rejected(promotion.verify_shared_code,shared,[native],bad)
print('PASS native/Chromium/embedded Firefox/standalone Firefox startup, performance and locale code matches source bytes.')

here=Path(__file__).parent
mac_source=(here/'test-macos-desktop.py').read_text()
old_mac=(here.parent/'1.24.19/test-macos-desktop.py').read_text()
def functions(text):return {node.name:ast.dump(node) for node in ast.parse(text).body if isinstance(node,ast.FunctionDef)}
assert functions(mac_source)==functions(old_mac),'Actual desktop visibility/process/cleanup checks must remain intact'
for proof in ["duration = 210 if mode == 'foreground' else 15",'while time.monotonic() < deadline:',"assert alive(pid)",'assert on_screen(pid)==expected_visible',"['/usr/bin/codesign','--verify','--deep','--strict'"]:
 assert proof in mac_source,proof
workflow=(promotion.ROOT/'.github/workflows/publish-1.24.20.yml').read_text()
def verify_workflow_pins(text):
 sha=re.findall(r"^  VALIDATED_SHA: '([^']+)'$",text,re.M)
 run=re.findall(r"^  VALIDATION_RUN: '([^']+)'$",text,re.M)
 assert len(sha)==len(run)==1, 'Require one global validation pin pair'
 placeholders=(sha[0]=='SET_VALIDATED_SHA_AFTER_SUCCESS',run[0]=='SET_VALIDATION_RUN_AFTER_SUCCESS')
 assert all(placeholders) or (not any(placeholders) and re.fullmatch(r'[0-9a-f]{40}',sha[0]) and re.fullmatch(r'[1-9][0-9]*',run[0])), 'Require both placeholders or both valid exact-run pins'
verify_workflow_pins(workflow)
for sha,run,valid in [
 ('SET_VALIDATED_SHA_AFTER_SUCCESS','SET_VALIDATION_RUN_AFTER_SUCCESS',True),
 ('a'*40,'123456',True),
 ('SET_VALIDATED_SHA_AFTER_SUCCESS','123456',False),
 ('a'*40,'SET_VALIDATION_RUN_AFTER_SUCCESS',False),
 ('main','123456',False),
 ('a'*40,'latest',False),
 ('a'*40,'0',False),
]:
 fixture=f"  VALIDATED_SHA: '{sha}'\n  VALIDATION_RUN: '{run}'\n"
 if valid:verify_workflow_pins(fixture)
 else:rejected(verify_workflow_pins,fixture)
rejected(verify_workflow_pins,"  VALIDATED_SHA: '"+'a'*40+"'\n")
rejected(verify_workflow_pins,fixture+fixture)
for expected in ['promote.py --check-validation','PLAZCODE_MAC_TEST_ARCHIVE','needs: wait-native','needs: mac-desktop','actions/attest-build-provenance@v2','gh attestation verify','git merge-base --is-ancestor origin/main HEAD']:
 assert expected in workflow,expected
assert workflow.index('python3 publish_release.py')<workflow.index('git push origin HEAD:main')
assert 'prepare-ultra.py' not in workflow
entry=json.loads((here/'release-entry.json').read_text())
assert entry['version']=='1.24.20' and all(isinstance(entry[key],list) for key in ['added','improved','fixed','notes'])
assert all(item['title'] and item['items'] for item in entry['github']['sections'])
assert 'unsigned' in ' '.join(entry['notes']) and 'not notarized' in ' '.join(entry['notes'])
print('PASS real Mac lifetime proof retained; workflow is fail-closed, attests archives and publishes assets before exposing feeds; factual release entry retains signing limitations.')

# Use the actual production release renderer/feed budget without publishing.
sys.path.insert(0,str(promotion.ROOT))
from publish_release import notes
from release_feed import compact_feed,encode
_,body=notes({'version':entry['version'],'release_notes':[entry]})
assert len(body.encode('utf-16-le'))//2<2000
assert len(encode(compact_feed({'version':entry['version']},[entry])))<48*1024
print('PASS factual GitHub release copy stays below 2000 UTF-16 units and the compact feed budget.')
