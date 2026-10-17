"""Assemble immutable release archives from successful exact-commit CI artifacts."""
from pathlib import Path
import hashlib, io, json, os, plistlib, shutil, struct, subprocess, zipfile

ROOT = Path(__file__).resolve().parents[2]
VERSION = '1.23.0'
BASE = 'a93610aa8411e8b3e7aaa4d45172eed18f53b4bc'

def load(path):
    return json.loads(Path(path).read_text())

def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')

def unpack(path):
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        names = archive.namelist()
        assert len(names) == len(set(names))
        assert all(not Path(n).is_absolute() and '..' not in Path(n).parts for n in names)
        return {i.filename: (archive.read(i), i.external_attr) for i in archive.infolist() if not i.is_dir()}

def pack(path, files):
    assert not path.exists(), 'Never overwrite published archives: ' + str(path)
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, (data, mode) in sorted(files.items()):
            info = zipfile.ZipInfo(name, (2026, 10, 8, 0, 0, 0))
            info.external_attr = mode
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, data)
    assert zipfile.ZipFile(path).testzip() is None

def find(name, platform):
    matches = list((ROOT/'ci-artifacts'/('plazcode-1.23-'+platform+'-validation')).rglob(name))
    assert len(matches) == 1, (name, matches)
    return matches[0]

def firefox_text(files):
    # These two files are generated with host-native newlines by build-firefox.
    for name in ['manifest.json', 'FIREFOX-INSTALL.txt']:
        data, mode = files[name]
        files[name] = (data.replace(b'\r\n', b'\n'), mode)
    return files

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
    app = 'PlazCode/PlazCode.app/Contents/'
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

def main():
    run = load(ROOT/'ci-artifacts/run.json')
    assert run['head_sha'] == BASE and run['status'] == 'completed', 'Exact source CI must complete before release'
    jobs = load(ROOT/'ci-artifacts/jobs.json')['jobs']
    assert {j['name'] for j in jobs} == {'browsers','native (ubuntu-latest)','native (windows-latest)','native (macos-latest)'}
    for job in jobs:
        if job['name'] in {'browsers','native (ubuntu-latest)'}:
            assert job['conclusion'] == 'success', job['name']
        else:
            failure='Package fresh native artifacts' if job['name']=='native (macos-latest)' else 'Windows PE and updater regressions'
            assert [s['name'] for s in job['steps'] if s['conclusion']=='failure'] == [failure]
            required={'JavaScript regression suite','Native regression suite','Build debug binary and test authenticated routes','Build native executable'}
            if job['name']=='native (macos-latest)':required.add('Build both macOS architectures')
            assert required.issubset({s['name'] for s in job['steps'] if s['conclusion']=='success'})
    recovery=load(ROOT/'ci-artifacts/mac-repackage.json')
    assert recovery['native_source']==BASE and recovery['artifact_id']==11520264469
    assert recovery['codesign_verified'] and recovery['architectures_verified']==['x86_64','arm64']
    winrecovery=load(find('windows-repackage.json','Windows'))
    assert winrecovery['native_source']==BASE and winrecovery['pe_and_updater_verified'] and winrecovery['icon_verified']
    windows = unpack(find('PlazCode-1.23.0-development.zip', 'Windows'))
    mac = unpack(find('PlazCode-macOS-1.23.0-development.zip', 'macOS'))
    # Both native builds must use precisely the same reviewed JS sources.
    for name, value in windows.items():
        if name.startswith(('PlazCode/core/', 'PlazCode/providers/', 'PlazCode/PlazCode-Extension/')):
            assert mac[name][0] == value[0], 'Platform source mismatch: '+name
    firefox = firefox_text(unpack(find('PlazCode-Firefox-1.23.0-development.zip', 'Windows')))
    other_firefox = firefox_text(unpack(find('PlazCode-Firefox-1.23.0-development.zip', 'macOS')))
    assert {n:v[0] for n,v in firefox.items()} == {n:v[0] for n,v in other_firefox.items()}
    source = unpack(find('PlazCode-source-1.23.0-development.zip', 'Windows'))
    other_source = unpack(find('PlazCode-source-1.23.0-development.zip', 'macOS'))
    # Platform test evidence is not source; mode bits differ on Windows.
    for files in [source, other_source]:
        for name in list(files):
            if name.startswith('PlazCode/visual-checks/') or Path(name).name in {'windows-signature.txt','defender-result.txt','defender-package-sha256.txt','defender-engine.json'}:
                del files[name]
    assert {n:v[0] for n,v in source.items()} == {n:v[0] for n,v in other_source.items()}
    # Preserve executable source/build-script modes from the POSIX host.
    source = other_source
    entry = load(Path(__file__).with_name('release-entry.json'))
    notes = [entry] + [n for n in load(ROOT/'release-notes.json') if n['version'] != VERSION]
    write_json(ROOT/'release-notes.json', notes)
    result = find('defender-result.txt', 'Windows').read_text(encoding='utf-8-sig')
    assert result.strip(), 'Defender availability must be reported'
    validation = ('PlazCode '+VERSION+'\nSource: '+BASE+'\nCI: '+run['html_url']+'\n'
                  'Chromium/Firefox fixtures, JavaScript and all native-platform regressions passed.\n'
                  'Original Mac packaging failed on lipo argument order after both architectures compiled.\n'
                  'Corrected packaging reused the exact compiled artifact and passed codesign/architecture verification.\n'
                  'Windows release rebuilt from identical reviewed source; PE/updater/icon checks passed using Windows PowerShell for the .NET Framework icon fixture.\n'
                  'Live signed-in providers and real Studio/Blender were not tested. Windows binaries remain unsigned.\n'
                  'Skills improve retrieved task context, not underlying AI model weights. Sharing is opt-in.\n'
                  'Microsoft Defender runner result (before final cross-platform assembly):\n'+result+'\n'
                  'See release-validation-1.23.0/ for the CI scan result and original scanned package checksum.\n')
    common = {'PlazCode/release-notes.json': (json.dumps(notes, indent=2, ensure_ascii=False).encode()+b'\n', 0o100644 << 16),
              'PlazCode/VALIDATION.txt': (validation.encode(), 0o100644 << 16)}
    notice = ('PlazCode is GPL-3.0-or-later. Preferred editable source and build instructions\n'
              'for this version are distributed as PlazCode-source-'+VERSION+'.zip at:\n'
              'https://github.com/stoveez/PlazCode/releases/tag/v'+VERSION+'\n\n'
              'GitHub build provenance can be checked with:\n'
              'gh attestation verify PlazCode-'+VERSION+'.zip --repo stoveez/PlazCode\n'
              'Use the matching macOS or Firefox ZIP filename for those downloads.\n'
              'GitHub provenance is separate from Windows Authenticode and Apple notarization.\n').encode()
    common['PlazCode/SOURCE.txt'] = (notice, 0o100644 << 16)
    common['PlazCode/PlazCode-Extension/SOURCE.txt'] = (notice, 0o100644 << 16)
    firefox['SOURCE.txt'] = (notice, 0o100644 << 16)
    for files in [windows,mac]:
        for name in list(files):
            if name.startswith('PlazCode/PlazCode-Extension-Firefox/') or name == 'PlazCode/DEVELOPMENT.txt':
                del files[name]
        for name,value in firefox.items():
            # Standalone Firefox ZIP has one extension-folder prefix.
            relative = name.split('/',1)[1] if name.startswith('PlazCode-Extension-Firefox/') else name
            files['PlazCode/PlazCode-Extension-Firefox/'+relative] = value
        files.update(common)
    for name,value in mac.items():
        if name.startswith('PlazCode/PlazCode.app/') or name.endswith('.command'):
            windows[name] = value
    source.update(common)
    source['PlazCode/README.md'] = (('PlazCode '+VERSION+' — '+entry['title']+'\n\n'+entry['summary']+'\n').encode(), 0o100644 << 16)
    validate(windows, 'windows'); validate(mac, 'macos')
    for files in [windows,mac]:
        for name,value in files.items():
            if name.endswith('.command'):assert value[1] >> 16 & 0o111, name
    for name in source:
        assert not name.endswith('.exe') and '/target/' not in name and '/node_modules/' not in name, name
    packages = [('PlazCode-'+VERSION+'.zip','windows',windows), ('PlazCode-macOS-'+VERSION+'.zip','macos',mac),
                ('PlazCode-source-'+VERSION+'.zip','source',source), ('PlazCode-Firefox-'+VERSION+'.zip','firefox',firefox)]
    metadata=[]
    for name,platform,files in packages:
        pack(ROOT/name,files)
        raw=(ROOT/name).read_bytes()
        metadata.append({'file':name,'platform':platform,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
    write_json(ROOT/'release-metadata.json',metadata)
    byplatform={m['platform']:m for m in metadata}
    for path,platform in [('latest.json','windows'),('latest-macos.json','macos')]:
        feed=load(ROOT/path);feed.update(version=VERSION,desktop_version=VERSION,release_notes=notes,
            url='https://raw.githubusercontent.com/stoveez/PlazCode/main/'+byplatform[platform]['file'],sha256=byplatform[platform]['sha256'])
        if platform=='windows':feed['platforms']['macos'].update(url='https://raw.githubusercontent.com/stoveez/PlazCode/main/'+byplatform['macos']['file'],sha256=byplatform['macos']['sha256'])
        import sys
        sys.path.insert(0,str(ROOT))
        from release_feed import compact_feed
        write_json(ROOT/path,compact_feed(feed,notes))
    import sys
    sys.path.insert(0,str(ROOT));import publish_release
    _,body=publish_release.notes(load(ROOT/'latest.json'))
    (ROOT/('release-description-'+VERSION+'.txt')).write_text(body)
    header='PlazCode '+VERSION+' — '+entry['title']+'\n\n'+entry['summary']+'\n\n'
    header+='\n'.join('- '+s for key in ['added','improved','fixed'] for s in entry[key])+'\n\n'
    (ROOT/'README.md').write_text(header+(ROOT/'README.md').read_text())
    evidence=ROOT/('release-validation-'+VERSION);evidence.mkdir(exist_ok=True)
    shutil.copy2(ROOT/'ci-artifacts/run.json',evidence/'run.json');shutil.copy2(ROOT/'ci-artifacts/jobs.json',evidence/'jobs.json')
    shutil.copy2(ROOT/'ci-artifacts/mac-repackage.json',evidence/'mac-repackage.json')
    shutil.copy2(find('windows-repackage.json','Windows'),evidence/'windows-repackage.json')
    if (ROOT/'ci-artifacts/recovery-run.json').exists():
        shutil.copy2(ROOT/'ci-artifacts/recovery-run.json',evidence/'recovery-run.json')
        shutil.copy2(ROOT/'ci-artifacts/recovery-jobs.json',evidence/'recovery-jobs.json')
    for name in ['defender-result.txt','defender-package-sha256.txt','defender-engine.json','windows-signature.txt']:
        matches=list((ROOT/'ci-artifacts/plazcode-1.23-Windows-validation').rglob(name))
        if matches:shutil.copy2(matches[0],evidence/name)
    (evidence/'VALIDATION.txt').write_text(validation)
    review=ROOT/'development/1.23.0/REVIEW.md'
    if review.exists():
        review.write_text(review.read_text()+'\nRelease status: the user authorized publication after automated validation while accepting that live browser/Studio/Blender checks are unavailable. Platform results and actual Defender availability are recorded in release-validation-1.23.0. Earlier pending release gates above describe the development-stage investigation, not a claim that those live checks subsequently ran.\n')
    print(json.dumps(metadata,indent=2))

if __name__=='__main__':main()
