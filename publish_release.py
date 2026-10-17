"""Create a versioned GitHub Release from an already published PlazCode feed.
No secrets or local install data are packaged. Existing published releases are
never edited; an interrupted draft can be completed by rerunning the workflow.
"""
import base64, hashlib, io, json, os, pathlib, re, subprocess, time, urllib.request, zipfile

def gh(*args):
    attempts=6 if (args[:2] in [('release','upload'),('release','edit'),('release','view')] or args[:1]==('api',)) else 1
    for attempt in range(attempts):
        try:return subprocess.check_output(['gh',*args],text=True)
        except subprocess.CalledProcessError:
            if attempt+1==attempts:raise
            time.sleep(min(2**attempt,8))
def fetch(url):
    with urllib.request.urlopen(url,timeout=60) as r:
        data=r.read(64*1024*1024+1)
    if len(data)>64*1024*1024: raise ValueError('Release download exceeds 64 MB')
    return data

def checked_release_body(body):
    characters=len(body.encode('utf-16-le'))//2
    if characters>=2000:
        raise ValueError(f'GitHub release description is {characters} characters; shorten it to at most 1999. Use the entry github fields for a concise release-only summary; keep full details in the changelog.')
    return body

def notes(feed):
    version=feed['version'];entry=next(x for x in feed['release_notes'] if x['version']==version)
    entry={**entry,**entry.get('github',{})}
    lines=['## ✨ PlazCode '+version,'',entry['summary'],'']
    sections=entry.get('sections')
    if sections is None:
        sections=[{'title':title,'items':entry.get(key,[])} for key,title in [('added','✨ New features'),('improved','💡 Improvements'),('fixed','🛠️ Fixes'),('notes','🧪 Checks')]]
    for section in sections:
        if section.get('items'):lines+=['### '+section['title'],'']+['- '+x for x in section['items']]+['']
    lines+=['### 📥 How to update','','- Open PlazCode, or choose **Updates → Update now**.',
            '- Manual downloads: **PlazCode-'+version+'.zip** for Windows, **PlazCode-macOS-'+version+'.zip** for Mac, or **PlazCode-Firefox-'+version+'.zip** for Firefox.',
            '- Reload your extension and refresh your AI tabs. Firefox users: reload the temporary add-on after restarting Firefox.',
            '- Your settings, memory and connections are kept.','','Test details are included in VALIDATION.txt.']
    return 'PlazCode '+version+': '+entry['title'],checked_release_body('\n'.join(lines)+'\n')

def validate_archive(data,version,platform="windows"):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        if archive.testzip() is not None:raise ValueError('ZIP checksum failure')
        names=archive.namelist()
        if len(names)!=len(set(names)):raise ValueError('ZIP contains duplicate entries')
        for path in ['PlazCode/manifest.json','PlazCode/PlazCode-Extension/manifest.json']:
            manifest=json.loads(archive.read(path))
            if manifest['version']!=version:raise ValueError('ZIP version does not match feed: '+path)
            if manifest.get('version_name',manifest['version'])!=manifest['version']:raise ValueError('Extension display version contradicts release version: '+path)
        if platform=='windows' and 'PlazCode/PlazCode.exe' not in archive.namelist():raise ValueError('Windows desktop executable missing')
        if platform=='macos' and 'PlazCode/PlazCode.exe' in archive.namelist():raise ValueError('Mac download must not contain the Windows executable')
        # Windows archives no longer bundle macOS; older combined downloads remain valid.
        if platform=='macos' or any(name.startswith('PlazCode/PlazCode.app/') for name in names):
            import plistlib, struct
            app='PlazCode/PlazCode.app/Contents/'
            if tuple(map(int,plistlib.loads(archive.read(app+'Info.plist'))['CFBundleShortVersionString'].split('.')))>tuple(map(int,version.split('.'))):raise ValueError('Mac app version exceeds package version')
            binary=archive.read(app+'MacOS/PlazCode')
            if binary[:4]!=bytes.fromhex('cafebabe'):raise ValueError('Universal Mac application missing')
            count=struct.unpack('>I',binary[4:8])[0]
            architectures={struct.unpack('>I',binary[8+i*20:12+i*20])[0] for i in range(count)}
            if not {0x01000007,0x0100000c}.issubset(architectures):raise ValueError('Mac architecture missing')


def main():
    repo=os.environ['GITHUB_REPOSITORY'];commit=os.environ['GITHUB_SHA']
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',repo) or not re.fullmatch(r'[a-f0-9]{40}',commit):raise ValueError('Invalid repository or commit')
    root='https://raw.githubusercontent.com/'+repo+'/'+commit+'/'
    from release_feed import validate
    raw=fetch(root+'latest.json');feed=validate(json.loads(raw),raw);version=feed['version']
    mac_raw=fetch(root+'latest-macos.json');mac_feed=validate(json.loads(mac_raw),mac_raw)
    if mac_feed['version']!=version or mac_feed['sha256']!=feed['platforms']['macos']['sha256']:raise ValueError('Platform feed mismatch')
    if not re.fullmatch(r'\d+\.\d+\.\d+',version):raise ValueError('Invalid release version')
    tag='v'+version
    try:existing=json.loads(gh('release','view',tag,'--repo',repo,'--json','isDraft'))
    except subprocess.CalledProcessError:existing=None
    if existing and not existing['isDraft']:
        print('Version is already published; leaving it unchanged.');return
    title,body=notes(feed)
    assets=[]
    for name,platform,expected_hash in [('PlazCode-'+version+'.zip','windows',feed['sha256']),('PlazCode-macOS-'+version+'.zip','macos',feed['platforms']['macos']['sha256'])]:
        data=fetch(root+name)
        content=json.loads(gh('api','repos/'+repo+'/contents/'+name+'?ref='+commit))
        actual=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
        if actual!=content['sha']:raise ValueError('Repository ZIP hash mismatch')
        if hashlib.sha256(data).hexdigest()!=expected_hash:raise ValueError('Update SHA-256 mismatch')
        validate_archive(data,version,platform);pathlib.Path(name).write_bytes(data);assets.append(name)
    pathlib.Path('release-notes.md').write_text(body)
    for name in ['PlazCode-source-'+version+'.zip','PlazCode-Firefox-'+version+'.zip','PlazCode-'+version+'.sigstore.json']:
        data=fetch(root+name);content=json.loads(gh('api','repos/'+repo+'/contents/'+name+'?ref='+commit))
        if hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()!=content['sha']:raise ValueError('Source/provenance repository hash mismatch')
        pathlib.Path(name).write_bytes(data);assets.append(name)
    for name in assets[:4]:gh('attestation','verify',name,'--repo',repo)
    if not existing:gh('release','create',tag,'--repo',repo,'--target',commit,'--draft','--title',title,'--notes-file','release-notes.md')
    gh('release','upload',tag,*assets,'--repo',repo,'--clobber')
    current=json.loads(gh('api','repos/'+repo+'/contents/latest.json?ref=main'))
    current=json.loads(base64.b64decode(current['content']))
    gh('release','edit',tag,'--repo',repo,'--draft=false','--latest='+str(current['version']==version).lower())
    print('Published https://github.com/'+repo+'/releases/tag/'+tag)
if __name__=='__main__':main()



