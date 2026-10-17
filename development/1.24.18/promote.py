"""Promote only successful exact-source artifacts; never overwrite release archives."""
from pathlib import Path
import argparse,json,os,hashlib,shutil,re,zipfile,plistlib,struct,subprocess
ROOT=Path(__file__).resolve().parents[2]
VERSION='1.24.18'
# Keep the small validated archive helpers local; publication must not depend
# on an older development script being present in a sparse checkout.
def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))

def write_json(path,value):
    Path(path).write_text(json.dumps(value,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')

def unpack(path):
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        names=archive.namelist()
        assert len(names)==len(set(names)), 'Duplicate archive paths'
        assert all(not Path(n).is_absolute() and '..' not in Path(n).parts and '\\' not in n and not re.match(r'^[A-Za-z]:',n) for n in names), 'Unsafe archive path'
        return {i.filename:(archive.read(i),i.external_attr) for i in archive.infolist() if not i.is_dir()}

def firefox_text(files):
    for name in ['manifest.json','FIREFOX-INSTALL.txt']:
        raw,mode=files[name];files[name]=(raw.replace(b'\r\n',b'\n'),mode)
    return files

# Publication-only files are intentionally excluded: they can be added after
# validation. Every preparation/packaging input, language catalog and validation
# recipe must still match the successful source commit exactly.
SOURCE_INPUTS=(
    'development/1.24.18/overlay',
    'development/1.24.18/prepare.py',
    'development/1.24.18/package.py',
    'development/1.24.18/build-locales.py',
    'development/1.24.18/preferences-test',
    'development/1.24.18/test-locales.py',
    'development/1.24.18/test-prepare-overlay.py',
    'development/1.24.18/test-package-size.py',
    'development/1.24.18/test-starter-pack.py',
    '.github/workflows/validate-1.24.18.yml',
    'PlazCode-source-1.24.17.zip',
    'PlazCode-1.23.0.zip',
    'PlazCode-macOS-1.23.0.zip',
)
REQUIRED_JOBS={'browsers','native (ubuntu-latest)','native (windows-latest)','native (macos-latest)'}
LANGUAGES={'en','es','fr','ru','ar','zh-CN','zh-TW','ja','ko','de','pt-BR','it','hi','tr'}

def verify_validation(run,jobs,sha,run_id,repository=None):
    assert re.fullmatch(r'[0-9a-f]{40}',sha), 'Set VALIDATED_SHA to the exact successful source commit'
    assert re.fullmatch(r'[1-9][0-9]*',str(run_id)), 'Set VALIDATION_RUN to the exact successful validation run'
    assert str(run['id'])==str(run_id) and run['head_sha']==sha, 'Validation run/source mismatch'
    assert run['path'].split('@',1)[0]=='.github/workflows/validate-1.24.18.yml', 'Wrong validation workflow'
    if repository:assert run['repository']['full_name']==repository, 'Wrong validation repository'
    assert run['status']=='completed' and run['conclusion']=='success', 'Validation must finish successfully'
    rows=jobs['jobs']
    assert len(rows)==4 and {j['name'] for j in rows}==REQUIRED_JOBS, 'Require browser and all three native jobs'
    assert all(j['status']=='completed' and j['conclusion']=='success' for j in rows), 'No failed, cancelled, skipped or incomplete platform job is promotable'

def verify_source_inputs(sha):
    assert all((ROOT/path).exists() for path in SOURCE_INPUTS), 'A source preparation/package input is missing'
    subprocess.run(['git','diff','--exit-code',sha,'--',*SOURCE_INPUTS],cwd=ROOT,check=True)
    dirty=subprocess.check_output(['git','status','--porcelain','--untracked-files=all','--',*SOURCE_INPUTS],cwd=ROOT,text=True)
    assert not dirty.strip(), 'Uncommitted source preparation/package inputs'

def check_validation(directory):
    base=os.environ['VALIDATED_SHA'];run_id=os.environ['VALIDATION_RUN']
    verify_validation(load(directory/'run.json'),load(directory/'jobs.json'),base,run_id,os.environ.get('GITHUB_REPOSITORY'))
    verify_source_inputs(base)

def verify_overlay(source):
    overlay=ROOT/'development/1.24.18/overlay'
    for path in overlay.rglob('*'):
        if path.is_file():
            name='PlazCode/'+path.relative_to(overlay).as_posix()
            assert source[name][0]==path.read_bytes().replace(b'\r\n',b'\n'), 'Source archive differs from validated overlay: '+name

def verify_locales(files,prefix='PlazCode/core/'):
    names={name[len(prefix+'locales/'):-5] for name in files if name.startswith(prefix+'locales/') and name.endswith('.json')}
    assert names==LANGUAGES, 'All 14 language catalogs must be included'
    english=json.loads(files[prefix+'locales/en.json'][0]);assert english
    for code in LANGUAGES-{'en'}:
        rows=json.loads(files[prefix+'locales/'+code+'.json'][0])
        assert rows.keys()==english.keys() and all(isinstance(v,str) and v.strip() for v in rows.values()), code+' incomplete catalog'
    assert files[prefix+'i18n-catalog.js'][0] and files[prefix+'i18n.js'][0]

def verify_shared_code(source,native_packages,firefox):
    # Firefox changes manifest/event wiring, not these reviewed program bytes.
    for name,(raw,_) in source.items():
        relative=name.removeprefix('PlazCode/')
        shared=relative.startswith(('core/','providers/')) or relative in {'background.js','popup.js','popup.html','overlay.css','ollama-page.js'}
        if not shared:continue
        assert firefox[relative][0]==raw, 'Standalone Firefox source mismatch: '+relative
        for files in native_packages:
            for prefix in ['PlazCode/','PlazCode/PlazCode-Extension/','PlazCode/PlazCode-Extension-Firefox/']:
                assert files[prefix+relative][0]==raw, 'Native/browser source mismatch: '+prefix+relative
    for relative in ['launch_studio_mcp.py','launch_blender_mcp.py','blender_ops.py']:
        for files in native_packages:
            assert files['PlazCode/'+relative][0]==source['PlazCode/'+relative][0], 'Native launcher source mismatch: '+relative

def verify_desktop(desktop,mac,package,sha,run_id):
    assert len(desktop)==3 and {d['mode'] for d in desktop}=={'foreground','background','restore'}
    for row in desktop:
        assert row['desktop_ready'] and row['version']==VERSION and row['alive_seconds']>=15
        assert row['window_visible']==(row['mode']!='background')
        assert row['validated_sha']==sha and str(row['validation_run_id'])==str(run_id), 'Desktop tested a different source/run'
        assert row['native_package_sha256']==hashlib.sha256(package.read_bytes()).hexdigest(), 'Desktop tested a different Mac ZIP'
        assert row['native_binary_sha256']==hashlib.sha256(mac['PlazCode/PlazCode.app/Contents/MacOS/PlazCode'][0]).hexdigest(), 'Desktop tested a different native executable'
    assert next(d for d in desktop if d['mode']=='foreground')['alive_seconds']>=210


def pack(path,files):
    assert not path.exists(),'Never overwrite published archives: '+str(path)
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for name,(data,mode) in sorted(files.items()):
            info=zipfile.ZipInfo(name,(2026,10,15,0,0,0));info.external_attr=mode
            archive.writestr(info,data,compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
    with zipfile.ZipFile(path) as archive:assert archive.testzip() is None

def validate(files, platform):
    for manifest in ['manifest.json', 'PlazCode-Extension/manifest.json', 'PlazCode-Extension-Firefox/manifest.json']:
        assert json.loads(files['PlazCode/'+manifest][0])['version'] == VERSION
    for folder in ['core', 'providers']:
        prefix = 'PlazCode/'+folder+'/'
        for name, value in files.items():
            if name.startswith(prefix):
                assert files['PlazCode/PlazCode-Extension/'+name[len('PlazCode/'):]][0] == value[0], name
    assert ('PlazCode/PlazCode.exe' in files) == (platform == 'windows')
    if platform == 'windows':
        assert files['PlazCode/PlazCode.exe'][0][:2] == b'MZ'
    if platform == 'windows':
        assert not any(n.startswith('PlazCode/PlazCode.app/') or n.endswith('.command') for n in files)
    app = 'PlazCode/PlazCode.app/Contents/'
    if platform == 'macos':
        info = plistlib.loads(files[app+'Info.plist'][0])
        assert info['CFBundleShortVersionString'] == VERSION
        binary = files[app+'MacOS/PlazCode'][0]
        assert binary[:4] == bytes.fromhex('cafebabe')
        count = struct.unpack('>I', binary[4:8])[0]
        assert {0x01000007, 0x0100000c}.issubset({struct.unpack('>I', binary[8+i*20:12+i*20])[0] for i in range(count)})
        assert files[app+'MacOS/PlazCode'][1] >> 16 & 0o111
    for name in files:
        assert not any(part in {'node_modules','target','config.local.json','plazcode-settings.json','bridge-pairing.json','memory.json','chat-history.json'} for part in Path(name).parts), name
        assert not name.endswith('.old.exe'), name

def find(name,platform):
    matches=list((ROOT/'ci-artifacts'/('plazcode-1.24.18-'+platform+'-validation')).rglob(name))
    assert len(matches)==1,(name,matches)
    return matches[0]

def unpack_package(path):
    files=unpack(path)
    # Added text notices and the shell helper use canonical LF line endings.
    # Preserve all supplied files, fonts and validated executable bytes.
    notices=('starter-skills/syphodev/PLAZCODE-ADAPTER.md',
             'starter-skills/syphodev/skills/roblox-ui/references/fonts/OFL.txt')
    for name,(raw,mode) in files.items():
        if name.endswith(notices) or name == 'PlazCode/Update-PlazCode.command':
            files[name]=(raw.replace(b'\r\n',b'\n'),mode)
        if name == 'PlazCode/Update-PlazCode.command':
            # copy2 from the extracted source can replace the Mac baseline's
            # executable mode with 0644. Restore only this known shell helper's
            # execute bits; its verified contents and native binaries stay intact.
            files[name]=(files[name][0],mode | (0o111 << 16))
    return files

def refresh_checksums(files,require_all=True):
    name='PlazCode/SHA256SUMS.txt'
    if name not in files:return
    raw,mode=files[name];lines=[]
    for line in raw.decode().splitlines():
        if not line.strip():continue
        _,relative=line.split(None,1);relative=relative.strip().lstrip('*');item='PlazCode/'+relative
        if item not in files:
            assert not require_all,item
            continue
        lines.append(hashlib.sha256(files[item][0]).hexdigest()+'  '+relative+'\n')
    files[name]=(''.join(lines).encode(),mode)

def main():
    check_validation(ROOT/'ci-artifacts')
    base=os.environ['VALIDATED_SHA'];run=load(ROOT/'ci-artifacts/run.json')
    windows=unpack_package(find('PlazCode-1.24.18-development.zip','Windows'));mac=unpack_package(find('PlazCode-macOS-1.24.18-development.zip','macOS'))
    for name,value in windows.items():
        if name.startswith(('PlazCode/core/','PlazCode/providers/','PlazCode/PlazCode-Extension/')):assert mac[name][0]==value[0],name
    firefox=firefox_text(unpack_package(find('PlazCode-Firefox-1.24.18-development.zip','Windows')))
    other=firefox_text(unpack_package(find('PlazCode-Firefox-1.24.18-development.zip','macOS')))
    assert {n:v[0] for n,v in firefox.items()}=={n:v[0] for n,v in other.items()}
    source=unpack_package(find('PlazCode-source-1.24.18-development.zip','macOS'));other=unpack_package(find('PlazCode-source-1.24.18-development.zip','Windows'))
    for files in [source,other]:
        for name in list(files):
            if name.startswith('PlazCode/visual-checks/') or Path(name).name in {'windows-signature.txt','defender-result.txt','defender-package-sha256.txt','defender-engine.json','defender-executable-sha256.txt'}:del files[name]
    assert {n:v[0] for n,v in source.items()}=={n:v[0] for n,v in other.items()}
    desktop_paths=list((ROOT/'ci-artifacts/mac-desktop').rglob('mac-desktop-result.json'));assert len(desktop_paths)==1,desktop_paths
    desktop_path=desktop_paths[0]
    desktop=load(desktop_path)
    verify_desktop(desktop,mac,find('PlazCode-macOS-1.24.18-development.zip','macOS'),base,os.environ['VALIDATION_RUN'])
    verify_overlay(source);verify_locales(source)
    desktop_runs=list((ROOT/'ci-artifacts/mac-desktop').rglob('desktop-validation-run.json'));assert len(desktop_runs)==1
    desktop_run=load(desktop_runs[0])
    assert str(desktop_run['id'])==os.environ['GITHUB_RUN_ID'] and desktop_run['head_sha']==os.environ['GITHUB_SHA'], 'Desktop evidence belongs to another publication run'
    native_bytes={name:value[0] for name,value in mac.items() if name.startswith('PlazCode/PlazCode.app/')}
    windows_executable=windows['PlazCode/PlazCode.exe'][0]
    entry=load(Path(__file__).with_name('release-entry.json'));assert entry['version']==VERSION
    notes=[entry]+[n for n in load(ROOT/'release-notes.json') if n['version']!=VERSION]
    write_json(ROOT/'release-notes.json',notes)
    defender=find('defender-result.txt','Windows').read_text(encoding='utf-8-sig').strip();assert defender
    # Bind the scan evidence to the actual Windows bytes promoted into the final ZIP.
    scanned_package=find('defender-package-sha256.txt','Windows') if 'unavailable' not in defender.lower() and 'not enabled' not in defender.lower() else None
    if scanned_package:
        hashes=re.findall(r'\b[0-9A-Fa-f]{64}\b',scanned_package.read_text(encoding='utf-8-sig'))
        assert hashlib.sha256(find('PlazCode-1.24.18-development.zip','Windows').read_bytes()).hexdigest() in [h.lower() for h in hashes]
        hashes=re.findall(r'\b[0-9A-Fa-f]{64}\b',find('defender-executable-sha256.txt','Windows').read_text(encoding='utf-8-sig'))
        assert hashlib.sha256(windows['PlazCode/PlazCode.exe'][0]).hexdigest() in [h.lower() for h in hashes]
    validation=f'''PlazCode {VERSION} — exact-source platform/browser gates and packaged macOS desktop lifetime checks passed before promotion.
Validated source: {base}
Validation run: {run['html_url']}
Changes: 14 offline interface languages with persistence, scoped Arabic RTL and authored-content protection; ClickUp protected draft/model acceptance, remount and preexisting-draft safeguards; cached ClickUp history reads and mutation-safe owned-message masking to reduce repeated tool-loop scans.
Existing startup staging, retained tool-result paging, server selection, rollback, native launch/update behavior and other released features are retained. Final native executable and macOS app bytes are reused from the validated development artifacts, not rebuilt during publication. Only release notices, checksums and package metadata change.
Local Chromium model-bound fixtures reproduce delayed acceptance and a stale initially-enabled model; they are not actual Quill or signed-in ClickUp. Hosted Chromium/Firefox fixtures use a mocked bridge. A signed-in ClickUp Ask Brain connection-only startup and a clearly labelled 8,585-character feedback transport were tested successfully without executing local/project tools. Affected accounts, Microsoft Edge binary, real Studio GUI creation and real-project Blender edits were not tested. Any hosted real-Blender regression is limited to its isolated test workload.
Publication follows the user's authorization for a direct update after validation, without a private-build delivery/review step.
Windows binaries are unsigned. macOS uses ad-hoc signing and is not notarized. GitHub provenance is not Authenticode or Apple notarization.
Microsoft Defender runner availability/result for the exact native artifact before release-notice assembly:
{defender}
Checksums, platform evidence and packaged Mac lifetime proof are recorded in release-validation-{VERSION}.
'''
    notice=f'''PlazCode is GPL-3.0-or-later. Editable source and build instructions:\nhttps://github.com/stoveez/PlazCode/releases/tag/v{VERSION}\nDownload PlazCode-source-{VERSION}.zip.\nVerify GitHub build provenance using gh attestation verify <archive> --repo stoveez/PlazCode.\nGitHub provenance is separate from Windows Authenticode and Apple notarization.\n'''.encode()
    common={'PlazCode/release-notes.json':((json.dumps(notes,indent=2,ensure_ascii=False)+'\n').encode(),0o100644<<16),'PlazCode/VALIDATION.txt':(validation.encode(),0o100644<<16),'PlazCode/SOURCE.txt':(notice,0o100644<<16),'PlazCode/PlazCode-Extension/SOURCE.txt':(notice,0o100644<<16)}
    firefox['SOURCE.txt']=(notice,0o100644<<16)
    for files in [windows,mac]:
        for name in list(files):
            if name.startswith('PlazCode/PlazCode-Extension-Firefox/') or name=='PlazCode/DEVELOPMENT.txt':del files[name]
        for name,value in firefox.items():
            relative=name.split('/',1)[1] if name.startswith('PlazCode-Extension-Firefox/') else name
            files['PlazCode/PlazCode-Extension-Firefox/'+relative]=value
        files.update(common)
    # Separate feeds already supply the matching platform package. Windows must
    # not download or install the two Mac memory helpers and universal Mac app.
    assert not any(n.startswith('PlazCode/PlazCode.app/') or n.endswith('.command') for n in windows)
    source.update(common);source['PlazCode/README.md']=(f"PlazCode {VERSION} — {entry['title']}\n\n{entry['summary']}\n".encode(),0o100644<<16)
    # Notices differ from the private build; regenerate listed checksums without
    # touching validated code or executables. Ultra references live once under
    # PlazCode-Extension and are served by the shared native Skills API for all browsers.
    resources=json.loads(source['PlazCode/agent/src/ultra-resources.json'][0])
    entries=json.loads(source['PlazCode/agent/src/ultra-index.json'][0])
    assert len(resources)==776 and len(entries)==48
    for files in [windows,mac]:
        for resource in resources:
            name='PlazCode/PlazCode-Extension/ultra/'+resource
            assert files[name][0]==source[name][0],name
        refresh_checksums(files)
        assert b'pc-ultra-shine' in files['PlazCode/core/main.js'][0] or b'pc-ultra-label' in files['PlazCode/core/main.js'][0]
        assert b'Deleted Skills' in files['PlazCode/core/skills-ui.js'][0]
    refresh_checksums(source,require_all=False)
    validate(windows,'windows');validate(mac,'macos')
    for files in [windows,mac]:verify_locales(files)
    verify_shared_code(source,[windows,mac],firefox)
    assert windows['PlazCode/PlazCode.exe'][0]==windows_executable, 'Native Windows bytes changed during promotion'
    assert all(mac[name][0]==raw for name,raw in native_bytes.items()), 'Signed Mac app bytes changed during promotion'
    for files in [windows,mac]:
        for name,value in files.items():
            if name.endswith('.command'):assert value[1]>>16&0o111,name
    for name in source:assert not name.endswith('.exe') and '/target/' not in name and '/node_modules/' not in name,name
    packages=[(f'PlazCode-{VERSION}.zip','windows',windows),(f'PlazCode-macOS-{VERSION}.zip','macos',mac),(f'PlazCode-source-{VERSION}.zip','source',source),(f'PlazCode-Firefox-{VERSION}.zip','firefox',firefox)]
    metadata=[]
    for name,platform,files in packages:
        pack(ROOT/name,files);raw=(ROOT/name).read_bytes();metadata.append({'file':name,'platform':platform,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
    write_json(ROOT/'release-metadata.json',metadata);byplatform={m['platform']:m for m in metadata}
    import sys
    sys.path.insert(0,str(ROOT));from release_feed import compact_feed
    for path,platform in [('latest.json','windows'),('latest-macos.json','macos')]:
        feed=load(ROOT/path);feed.update(version=VERSION,desktop_version=VERSION,url='https://raw.githubusercontent.com/stoveez/PlazCode/main/'+byplatform[platform]['file'],sha256=byplatform[platform]['sha256'])
        if platform=='windows':feed['platforms']['macos'].update(url='https://raw.githubusercontent.com/stoveez/PlazCode/main/'+byplatform['macos']['file'],sha256=byplatform['macos']['sha256'])
        write_json(ROOT/path,compact_feed(feed,notes))
    import publish_release
    _,body=publish_release.notes(load(ROOT/'latest.json'));(ROOT/f'release-description-{VERSION}.txt').write_text(body)
    header=f"PlazCode {VERSION} — {entry['title']}\n\n{entry['summary']}\n\n"+'\n'.join('- '+s for key in ['added','improved','fixed'] for s in entry[key])+'\n\n'
    (ROOT/'README.md').write_text(header+(ROOT/'README.md').read_text())
    evidence=ROOT/f'release-validation-{VERSION}';evidence.mkdir(exist_ok=True)
    for name in ['run.json','jobs.json']:shutil.copy2(ROOT/'ci-artifacts'/name,evidence/name)
    for name in ['defender-result.txt','defender-package-sha256.txt','defender-engine.json','defender-executable-sha256.txt','windows-signature.txt']:
        matches=list((ROOT/'ci-artifacts/plazcode-1.24.18-Windows-validation').rglob(name))
        if matches:shutil.copy2(matches[0],evidence/name)
    shutil.copy2(desktop_path,evidence/'mac-desktop-result.json')
    for name in ['desktop-validation-run.json','desktop-validation-jobs.json']:
        matches=list((ROOT/'ci-artifacts/mac-desktop').rglob(name));assert len(matches)==1,matches
        shutil.copy2(matches[0],evidence/name)
    (evidence/'VALIDATION.txt').write_text(validation)
    print(json.dumps(metadata,indent=2))
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check-validation',action='store_true',help='Read-only exact-source and four-job validation gate')
    args=parser.parse_args()
    if args.check_validation:check_validation(ROOT/'ci-artifacts')
    else:main()
