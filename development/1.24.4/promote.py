"""Promote only successful exact-source artifacts; never overwrite release archives."""
from pathlib import Path
import importlib.util,json,os,hashlib,shutil,re,zipfile,plistlib,struct
ROOT=Path(__file__).resolve().parents[2]
VERSION='1.24.4'
spec=importlib.util.spec_from_file_location('archive_tools',ROOT/'development/1.23.0/promote.py')
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a);a.VERSION=VERSION

def pack(path,files):
    assert not path.exists(),'Never overwrite published archives: '+str(path)
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for name,(data,mode) in sorted(files.items()):
            info=zipfile.ZipInfo(name,(2026,10,8,0,0,0));info.external_attr=mode
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
    matches=list((ROOT/'ci-artifacts'/('plazcode-1.24.4-'+platform+'-validation')).rglob(name))
    assert len(matches)==1,(name,matches)
    return matches[0]

def unpack_package(path):
    files=a.unpack(path)
    # Added text notices and the shell helper use canonical LF line endings.
    # Preserve all 217 supplied files, fonts and validated executable bytes.
    notices=('starter-skills/syphodev/PLAZCODE-ADAPTER.md',
             'starter-skills/syphodev/skills/roblox-ui/references/fonts/OFL.txt')
    for name,(raw,mode) in files.items():
        if name.endswith(notices) or name == 'PlazCode/Update-PlazCode.command':
            files[name]=(raw.replace(b'\r\n',b'\n'),mode)
    return files

def main():
    base=os.environ['VALIDATED_SHA'];run=a.load(ROOT/'ci-artifacts/run.json');jobs=a.load(ROOT/'ci-artifacts/jobs.json')['jobs']
    assert run['head_sha']==base and run['status']=='completed' and run['conclusion']=='success'
    assert {j['name'] for j in jobs}=={'browsers','native (ubuntu-latest)','native (windows-latest)','native (macos-latest)'}
    assert all(j['conclusion']=='success' for j in jobs)
    windows=unpack_package(find('PlazCode-1.24.4-development.zip','Windows'));mac=unpack_package(find('PlazCode-macOS-1.24.4-development.zip','macOS'))
    for name,value in windows.items():
        if name.startswith(('PlazCode/core/','PlazCode/providers/','PlazCode/PlazCode-Extension/')):assert mac[name][0]==value[0],name
    firefox=a.firefox_text(unpack_package(find('PlazCode-Firefox-1.24.4-development.zip','Windows')))
    other=a.firefox_text(unpack_package(find('PlazCode-Firefox-1.24.4-development.zip','macOS')))
    assert {n:v[0] for n,v in firefox.items()}=={n:v[0] for n,v in other.items()}
    source=unpack_package(find('PlazCode-source-1.24.4-development.zip','macOS'));other=unpack_package(find('PlazCode-source-1.24.4-development.zip','Windows'))
    for files in [source,other]:
        for name in list(files):
            if name.startswith('PlazCode/visual-checks/') or Path(name).name in {'windows-signature.txt','defender-result.txt','defender-package-sha256.txt','defender-engine.json','defender-executable-sha256.txt'}:del files[name]
    assert {n:v[0] for n,v in source.items()}=={n:v[0] for n,v in other.items()}
    desktop_paths=list((ROOT/'ci-artifacts/mac-desktop').rglob('mac-desktop-result.json'));assert len(desktop_paths)==1,desktop_paths
    desktop_path=desktop_paths[0]
    desktop=a.load(desktop_path);assert {d['mode'] for d in desktop}=={'foreground','background','restore'} and all(d['desktop_ready'] and d['version']==VERSION and d['alive_seconds']>=15 for d in desktop)
    assert next(d for d in desktop if d['mode']=='foreground')['alive_seconds']>=210
    assert all(d['window_visible']==(d['mode']!='background') for d in desktop)
    entry=a.load(Path(__file__).with_name('release-entry.json'));notes=[entry]+[n for n in a.load(ROOT/'release-notes.json') if n['version']!=VERSION]
    a.write_json(ROOT/'release-notes.json',notes)
    defender=find('defender-result.txt','Windows').read_text(encoding='utf-8-sig').strip();assert defender
    # Bind the scan evidence to the actual Windows bytes promoted into the final ZIP.
    scanned_package=find('defender-package-sha256.txt','Windows') if 'unavailable' not in defender.lower() and 'not enabled' not in defender.lower() else None
    if scanned_package:
        hashes=re.findall(r'\b[0-9A-Fa-f]{64}\b',scanned_package.read_text(encoding='utf-8-sig'))
        assert hashlib.sha256(find('PlazCode-1.24.4-development.zip','Windows').read_bytes()).hexdigest() in [h.lower() for h in hashes]
        hashes=re.findall(r'\b[0-9A-Fa-f]{64}\b',find('defender-executable-sha256.txt','Windows').read_text(encoding='utf-8-sig'))
        assert hashlib.sha256(windows['PlazCode/PlazCode.exe'][0]).hexdigest() in [h.lower() for h in hashes]
    validation=f'''PlazCode {VERSION} — exact-source validation passed on Linux, Windows and macOS, with Chromium/Firefox UI fixtures and the real macOS desktop lifetime check.
Ultracode injected instructions reduced 62% (10,592 to 4,067 characters); all ten skill summaries and complete reference bodies preserved. This is prompt overhead, not a measured provider speedup or accuracy improvement.
Workspace/side navigation scroll reachability, accessible Settings expansion, retained control values/listeners, Updates navigation and effort labels passed.
Notion tall nested German composers, hidden old controls, delayed control hydration, verified startup/catalogue/tool-result pastes, upload fallback/retries, Stop, remount and foreign draft preservation passed.
Studio bridge routing and ChatGPT attachment confirmation, one transport, rejected upload and at-most-once commit fixtures passed.
Platform Rust/JavaScript regression suites, starter pack completeness, creator round trips and archive preservation checks passed. Windows installer and update checksum/handoff checks passed. Mac x86_64/arm64 packaging, relaunch modes and 210-second visible process lifetime passed.
Live signed-in providers and real Studio/Blender sessions were not tested. Windows binaries are unsigned; Mac uses ad-hoc signing, not notarization.
Microsoft Defender runner result before assembly:
{defender}
The scanned checksum and availability are recorded in release-validation-{VERSION}.
'''
    notice=f'''PlazCode is GPL-3.0-or-later. Editable source and build instructions:\nhttps://github.com/stoveez/PlazCode/releases/tag/v{VERSION}\nDownload PlazCode-source-{VERSION}.zip.\nVerify GitHub build provenance using gh attestation verify <archive> --repo stoveez/PlazCode.\nGitHub provenance is separate from Windows Authenticode and Apple notarization.\n'''.encode()
    common={'PlazCode/release-notes.json':(a.encode(notes) if hasattr(a,'encode') else (json.dumps(notes,indent=2,ensure_ascii=False)+'\n').encode(),0o100644<<16),'PlazCode/VALIDATION.txt':(validation.encode(),0o100644<<16),'PlazCode/SOURCE.txt':(notice,0o100644<<16),'PlazCode/PlazCode-Extension/SOURCE.txt':(notice,0o100644<<16)}
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
    validate(windows,'windows');validate(mac,'macos')
    for files in [windows,mac]:
        for name,value in files.items():
            if name.endswith('.command'):assert value[1]>>16&0o111,name
    for name in source:assert not name.endswith('.exe') and '/target/' not in name and '/node_modules/' not in name,name
    packages=[(f'PlazCode-{VERSION}.zip','windows',windows),(f'PlazCode-macOS-{VERSION}.zip','macos',mac),(f'PlazCode-source-{VERSION}.zip','source',source),(f'PlazCode-Firefox-{VERSION}.zip','firefox',firefox)]
    metadata=[]
    for name,platform,files in packages:
        pack(ROOT/name,files);raw=(ROOT/name).read_bytes();metadata.append({'file':name,'platform':platform,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
    a.write_json(ROOT/'release-metadata.json',metadata);byplatform={m['platform']:m for m in metadata}
    import sys
    sys.path.insert(0,str(ROOT));from release_feed import compact_feed
    for path,platform in [('latest.json','windows'),('latest-macos.json','macos')]:
        feed=a.load(ROOT/path);feed.update(version=VERSION,desktop_version=VERSION,url='https://raw.githubusercontent.com/stoveez/PlazCode/main/'+byplatform[platform]['file'],sha256=byplatform[platform]['sha256'])
        if platform=='windows':feed['platforms']['macos'].update(url='https://raw.githubusercontent.com/stoveez/PlazCode/main/'+byplatform['macos']['file'],sha256=byplatform['macos']['sha256'])
        a.write_json(ROOT/path,compact_feed(feed,notes))
    import publish_release
    _,body=publish_release.notes(a.load(ROOT/'latest.json'));(ROOT/f'release-description-{VERSION}.txt').write_text(body)
    header=f"PlazCode {VERSION} — {entry['title']}\n\n{entry['summary']}\n\n"+'\n'.join('- '+s for key in ['added','improved','fixed'] for s in entry[key])+'\n\n'
    (ROOT/'README.md').write_text(header+(ROOT/'README.md').read_text())
    evidence=ROOT/f'release-validation-{VERSION}';evidence.mkdir(exist_ok=True)
    for name in ['run.json','jobs.json']:shutil.copy2(ROOT/'ci-artifacts'/name,evidence/name)
    for name in ['defender-result.txt','defender-package-sha256.txt','defender-engine.json','defender-executable-sha256.txt','windows-signature.txt']:
        matches=list((ROOT/'ci-artifacts/plazcode-1.24.4-Windows-validation').rglob(name))
        if matches:shutil.copy2(matches[0],evidence/name)
    shutil.copy2(desktop_path,evidence/'mac-desktop-result.json')
    for name in ['desktop-validation-run.json','desktop-validation-jobs.json']:
        matches=list((ROOT/'ci-artifacts/mac-desktop').rglob(name));assert len(matches)==1,matches
        shutil.copy2(matches[0],evidence/name)
    (evidence/'VALIDATION.txt').write_text(validation)
    p=ROOT/'development/1.24.4/REVIEW.md';p.write_text(p.read_text().replace('Validation: local JavaScript and browser checks in progress; exact-source platform CI pending. Release promotion must require all four validation jobs and the real macOS desktop check.','Validation: all exact-source platform CI jobs passed. See release-validation-1.24.4.'))
    print(json.dumps(metadata,indent=2))
if __name__=='__main__':main()
