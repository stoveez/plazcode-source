"""Keep publication checks valid for platform-only and older combined ZIPs."""
import io,json,plistlib,struct,zipfile
from publish_release import validate_archive

def package(platform,combined=False,missing_arch=False):
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w') as z:
        for folder in ['PlazCode/','PlazCode/PlazCode-Extension/']:
            z.writestr(folder+'manifest.json',json.dumps({'version':'1.24.3'}))
        if platform=='windows':z.writestr('PlazCode/PlazCode.exe',b'MZfixture')
        if platform=='macos' or combined:
            base='PlazCode/PlazCode.app/Contents/'
            z.writestr(base+'Info.plist',plistlib.dumps({'CFBundleShortVersionString':'1.24.3'}))
            arches=[0x01000007] if missing_arch else [0x01000007,0x0100000c]
            binary=struct.pack('>II',0xcafebabe,len(arches))+b''.join(struct.pack('>IIIII',a,0,0,0,0) for a in arches)
            z.writestr(base+'MacOS/PlazCode',binary)
    return out.getvalue()

validate_archive(package('windows'),'1.24.3','windows')
validate_archive(package('windows',combined=True),'1.24.3','windows')
validate_archive(package('macos'),'1.24.3','macos')
for data,platform in [(package('macos'), 'windows'),(package('windows'),'macos'),(package('macos',missing_arch=True),'macos'),(package('windows',combined=True,missing_arch=True),'windows')]:
    try:validate_archive(data,'1.24.3',platform)
    except (ValueError,KeyError):pass
    else:raise AssertionError('Invalid platform package accepted: '+platform)
try:validate_archive(package('windows'),'1.24.4','windows')
except ValueError:pass
else:raise AssertionError('Wrong version accepted')
print('PASS publication archives: Windows-only, universal Mac, older combined Windows; missing app/architecture and wrong version rejected.')
