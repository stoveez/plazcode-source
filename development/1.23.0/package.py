"""Create development packages with freshly compiled native executables.
Does not change release feeds or publish a release.
"""
from pathlib import Path
import zipfile,hashlib,platform,plistlib,subprocess,shutil,json
root=Path(__file__).resolve().parents[2];source=root/'build-src/PlazCode';output=root/'artifacts';output.mkdir(exist_ok=True)
osname=platform.system();baseline=root/('PlazCode-1.22.1.zip' if osname=='Windows' else 'PlazCode-macOS-1.22.1.zip')
expected='3e27c88305ea26a7001e01220f7cf97cfac49aaf0a453a67adac9ed96d8e0f30' if osname=='Windows' else '4de418cc61224227909cf575d020ed1ab737a1a5bdcdc6495e1f80807ac047c2'
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
for name in ['manifest.json','background.js','launch_studio_mcp.py','Update-PlazCode.bat']:
 shutil.copy2(source/name,package/name)
if osname=='Windows':
 shutil.copy2(source/'agent/target/release/PlazCode.exe',package/'PlazCode.exe')
else:
 app=package/'PlazCode.app';shutil.copy2(source/'agent/target/release/PlazCode',app/'Contents/MacOS/PlazCode');(app/'Contents/MacOS/PlazCode').chmod(0o755)
 plist=app/'Contents/Info.plist';value=plistlib.loads(plist.read_bytes());value['CFBundleShortVersionString']=value['CFBundleVersion']='1.23.0';plist.write_bytes(plistlib.dumps(value))
 subprocess.run(['codesign','--force','--deep','--sign','-',str(app)],check=True)
 subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
 subprocess.run(['lipo',str(app/'Contents/MacOS/PlazCode'),'-verify_arch','x86_64','arm64'],check=True)
# Do not carry a stale v1.22 minification hash report into development builds.
(package/'production-build.json').unlink(missing_ok=True)
(package/'DEVELOPMENT.txt').write_text('PlazCode 1.23.0 development build. Validation and live-provider/Studio checks remain required before release. This build is not publisher-signed. Existing stable update feeds are unchanged.\n')
name='PlazCode-1.23.0-development.zip' if osname=='Windows' else 'PlazCode-macOS-1.23.0-development.zip'
with zipfile.ZipFile(output/name,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
 for path in sorted(package.rglob('*')):
  if path.is_file():archive.write(path,path.relative_to(install).as_posix())
print(name,hashlib.sha256((output/name).read_bytes()).hexdigest())
# Firefox and source are the exact reviewed development source, never old native files.
subprocess.run(['python',str(source/'release-tools/build-firefox.py'),str(source/'PlazCode-Extension'),str(output/'firefox'),str(output/'PlazCode-Firefox-1.23.0-development.zip')],check=True)
with zipfile.ZipFile(output/'PlazCode-source-1.23.0-development.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
 for path in sorted(source.rglob('*')):
  if path.is_file() and not any(part in ['node_modules','target','__pycache__'] for part in path.parts) and path.name!='PlazCode.exe':archive.write(path,'PlazCode/'+path.relative_to(source).as_posix())
shutil.rmtree(install);shutil.rmtree(output/'firefox')
