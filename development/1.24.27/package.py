"""Create development packages with freshly compiled native executables.
Does not change release feeds or publish a release.
"""
from pathlib import Path
import zipfile,hashlib,platform,plistlib,subprocess,shutil,json,tempfile,os
root=Path(__file__).resolve().parents[2];source=root/'build-src-1.24.27/PlazCode';output=root/'artifacts';output.mkdir(exist_ok=True)
osname=platform.system();assert osname in ('Windows','Darwin','Linux');platform_name={'Windows':'windows','Darwin':'macos','Linux':'linux'}[osname];baseline=root/('PlazCode-1.23.0.zip' if osname=='Windows' else 'PlazCode-macOS-1.23.0.zip')
expected='09b0db8e85ef969bd7e1eb60eb26a219bd80ed60e5d221970e1b3af6750e510b' if osname=='Windows' else 'fc004c0416c9be1d84fca9a026f62ca939eec15d294b89ec465f0986641ab21c'
assert hashlib.sha256(baseline.read_bytes()).hexdigest()==expected
install=output/'staging';install.mkdir(exist_ok=True)
with zipfile.ZipFile(baseline) as archive:
 for member in archive.infolist():
  relative=Path(member.filename);assert not relative.is_absolute() and '..' not in relative.parts
  archive.extract(member,install)
  path=install/relative
  if path.is_file():path.chmod((member.external_attr>>16)&0o777 or 0o644)
package=install/'PlazCode'
for folder in ['core','providers','PlazCode-Extension']:
 shutil.copytree(source/folder,package/folder,dirs_exist_ok=True)
for name in ['manifest.json','background.js','protection.js','popup.js','popup.html','overlay.css','ollama-page.js','launch_studio_mcp.py','launch_blender_mcp.py','SOURCE.txt','Update-PlazCode.bat','Update-PlazCode.ps1','Updater-Progress.cs','blender_ops.py','blender_once.py','blender_once.ps1']:
 shutil.copy2(source/name,package/name)
if osname=='Windows':
 shutil.copy2(source/'agent/target/release/PlazCode.exe',package/'PlazCode.exe')
elif osname=='Linux':
 shutil.copy2(source/'agent/target/release/PlazCode',package/'PlazCode');(package/'PlazCode').chmod(0o755)
 shutil.rmtree(package/'PlazCode.app',ignore_errors=True)
 shutil.rmtree(package/'macos',ignore_errors=True)
 # Bundle the pinned official Linux memory helper; no first-use setup/download.
 import urllib.request,tarfile,io
 with urllib.request.urlopen('https://github.com/Gentleman-Programming/engram/releases/download/v3.0.0/engram_3.0.0_linux_amd64.tar.gz',timeout=120) as response:helper_archive=response.read(30*1024*1024+1)
 assert len(helper_archive)<=30*1024*1024 and hashlib.sha256(helper_archive).hexdigest()=='22bbfd81ee9071a04d446f653842c383a3101b594e8829519a63a7c747602e69','Linux memory helper archive mismatch'
 with tarfile.open(fileobj=io.BytesIO(helper_archive),mode='r:gz') as archive:
  entries=[entry for entry in archive.getmembers() if entry.isfile() and Path(entry.name).name=='engram'];assert len(entries)==1
  helper_bytes=archive.extractfile(entries[0]).read()
 helper=package/'runtime/engram/engram-linux-amd64';helper.parent.mkdir(parents=True,exist_ok=True);helper.write_bytes(helper_bytes);helper.chmod(0o755)
 (helper.parent/'SHA256SUMS.txt').write_text(hashlib.sha256(helper_bytes).hexdigest()+'  '+helper.name+'\n')
 subprocess.run([str(helper.resolve()),'version'],check=True)
 (package/'README.md').write_text('# PlazCode for Linux\n\nExtract the complete archive, open the PlazCode folder, then open the PlazCode executable. The app interface opens in your default browser; keep the full folder together. This build requires a Linux x86-64 desktop with a default browser; the app is statically linked and does not require WebKit or a particular glibc version. It is a native Linux program; do not use the Windows EXE or Mac app.\n\nChrome: load PlazCode-Extension. Firefox: load PlazCode-Extension-Firefox. Refresh AI tabs after reloading the extension. Memory helper is included. Linux automatic updates are not published yet; use complete native Linux downloads.\n')

 for path in package.iterdir():
  if path.is_file() and path.suffix.lower() in ('.exe','.bat','.ps1','.cs','.command'):path.unlink()
else:
 shutil.copy2(source/'Update-PlazCode.command',package/'Update-PlazCode.command')
 app=package/'PlazCode.app';shutil.copy2(source/'agent/target/release/PlazCode',app/'Contents/MacOS/PlazCode');(app/'Contents/MacOS/PlazCode').chmod(0o755)
 plist=app/'Contents/Info.plist';value=plistlib.loads(plist.read_bytes());value['CFBundleShortVersionString']=value['CFBundleVersion']='1.24.27';plist.write_bytes(plistlib.dumps(value))
 subprocess.run(['codesign','--force','--deep','--sign','-',str(app)],check=True)
 subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
 subprocess.run(['lipo',str(app/'Contents/MacOS/PlazCode'),'-verify_arch','x86_64','arm64'],check=True)
# Windows and Mac downloads have separate update feeds. Keep each native package
# platform-specific without changing any files used by its app or extension.
if osname=='Windows':
 shutil.rmtree(package/'PlazCode.app',ignore_errors=True)
 for path in package.glob('*.command'):path.unlink()
# Do not carry a stale v1.22 minification hash report into development builds.
(package/'production-build.json').unlink(missing_ok=True)
# 1.24.27: the Firefox folder inside the native package is rebuilt from this
# exact source (the 1.23.0 baseline copy was stale), and SHA256SUMS.txt is
# recomputed for every file it lists so no checksum describes an old file.
subprocess.run(['python',str(source/'release-tools/build-firefox.py'),str(source/'PlazCode-Extension'),str(package/'PlazCode-Extension-Firefox'),str(output/'PlazCode-Firefox-in-package.zip')],check=True)
(output/'PlazCode-Firefox-in-package.zip').unlink()
sums=package/'SHA256SUMS.txt'
if sums.exists():
 listed=[line.split(None,1)[1].strip().lstrip('*') for line in sums.read_text().splitlines() if line.strip()]
 sums.write_text(''.join(hashlib.sha256((package/item).read_bytes()).hexdigest()+'  '+item+'\n' for item in listed if (package/item).is_file()))
# The package must ship the fixed launcher, extension and Firefox copies.
for name in ['background.js','launch_blender_mcp.py','ollama-page.js','SOURCE.txt']:
 assert (package/name).read_bytes()==(source/name).read_bytes(),name+' in the package is not the reviewed source'
assert (package/'PlazCode-Extension/background.js').read_bytes()==(source/'background.js').read_bytes()
assert (package/'PlazCode-Extension-Firefox/background.js').read_bytes()==(source/'background.js').read_bytes()
for line in (sums.read_text().splitlines() if sums.exists() else []):
 digest,item=line.split(None,1);assert hashlib.sha256((package/item).read_bytes()).hexdigest()==digest,item+' checksum'
# Protect precisely the files that ship, after both browser variants and the native app exist.
# The running binary must contain the same pinned key/channel used to sign these files.
native=package/('PlazCode.exe' if osname=='Windows' else 'PlazCode' if osname=='Linux' else 'PlazCode.app/Contents/MacOS/PlazCode')
info=json.loads(subprocess.check_output([str(native.resolve()),'--protection-info'],text=True))
channel=os.environ.get('PLAZCODE_PROTECTION_CHANNEL','release')
assert info['channel']==channel and info['version']=='1.24.27' and len(info['public_key'])==64, 'Native protection is not configured'
with tempfile.TemporaryDirectory(prefix='plazcode-private-maps-') as maps:
 subprocess.run(['node',str(Path(__file__).with_name('protection.mjs')),'protect',str(package),maps,str(source),platform_name,str(output/f'PlazCode-1.24.27-{osname}-private-maps.encrypted.json')],check=True)
 subprocess.run(['node',str(Path(__file__).with_name('protection.mjs')),'verify',str(package),info['public_key']],check=True)
 subprocess.run([str(native.resolve()),'--verify-package',str(package.resolve()),'--verify-version','1.24.27'],check=True)
# Keep existing checksum listings truthful after transformation.
if sums.exists():
 listed=[line.split(None,1)[1].strip().lstrip('*') for line in sums.read_text().splitlines() if line.strip()]
 sums.write_text(''.join(hashlib.sha256((package/item).read_bytes()).hexdigest()+'  '+item+'\n' for item in listed if (package/item).is_file()))
with zipfile.ZipFile(output/'PlazCode-Firefox-1.24.27-development.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
 for path in sorted((package/'PlazCode-Extension-Firefox').rglob('*')):
  if path.is_file():archive.write(path,path.relative_to(package/'PlazCode-Extension-Firefox').as_posix())
(package/'DEVELOPMENT.txt').write_text('PlazCode 1.24.27 development build. Validation and live-provider/Studio checks remain required before release. This build is not publisher-signed. Existing stable update feeds are unchanged.\n')
name='PlazCode-1.24.27-development.zip' if osname=='Windows' else f'PlazCode-{"Linux" if osname=="Linux" else "macOS"}-1.24.27-development.zip'
with zipfile.ZipFile(output/name,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
 for path in sorted(package.rglob('*')):
  if path.is_file():archive.write(path,path.relative_to(install).as_posix())
print(name,hashlib.sha256((output/name).read_bytes()).hexdigest())
assert (output/name).stat().st_size<=64*1024*1024, 'Protected package exceeds the installed updater limit'
# Test download (the zip the owner gives testers): exactly the same files, folders and layout as the real
# update zips (one PlazCode folder, app, memory helper, both extensions, root extension copies), so testers
# extract it, open the PlazCode folder and see everything with no extra steps. Only DEVELOPMENT.txt (a note that
# the real update zips do not carry) is left out. Nothing is added.
lean_name='PlazCode-1.24.27-test-lean.zip' if osname=='Windows' else f'PlazCode-{"Linux" if osname=="Linux" else "macOS"}-1.24.27-test-lean.zip'
lean_root=output/'lean';shutil.rmtree(lean_root,ignore_errors=True)
shutil.copytree(package,lean_root/'PlazCode',symlinks=True)
lean=lean_root/'PlazCode'
(lean/'DEVELOPMENT.txt').unlink(missing_ok=True)
with zipfile.ZipFile(output/lean_name,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
 for path in sorted(lean_root.rglob('*')):
  if path.is_file() or path.is_symlink():
   info=zipfile.ZipInfo.from_file(path,path.relative_to(lean_root).as_posix());info.compress_type=zipfile.ZIP_DEFLATED
   archive.writestr(info,path.read_bytes(),compresslevel=9)
if osname=='Linux':
 import tarfile
 with tarfile.open(output/'PlazCode-Linux-1.24.27-test-lean.tar.gz','w:gz',compresslevel=9) as archive:archive.add(lean,arcname='PlazCode')
shutil.rmtree(lean_root)
print(lean_name,(output/lean_name).stat().st_size)
assert (output/lean_name).stat().st_size<=64*1024*1024, 'Protected test package exceeds the installed updater limit'
# Firefox and source are the exact reviewed development source, never old native files.
# The standalone Firefox ZIP above contains the exact protected package bytes.
with zipfile.ZipFile(output/'PlazCode-source-1.24.27-development.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
 for path in sorted(source.rglob('*')):
  if path.is_file() and not any(part in ['node_modules','target','__pycache__'] for part in path.parts) and path.name!='PlazCode.exe':archive.write(path,'PlazCode/'+path.relative_to(source).as_posix())
if osname=='Linux':
 subprocess.run(['node',str(source/'release-tools/test-linux-desktop.cjs')],cwd=source,env={**os.environ,'PLAZCODE_NATIVE_INSTALL_ROOT':str(package.resolve())},check=True)
shutil.rmtree(install)
