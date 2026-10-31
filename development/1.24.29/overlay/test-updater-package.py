"""Install the complete fresh Windows package using Windows PowerShell 5.1.
Only GUI restart is replaced; ZIP validation, backup, copy and version guards are real.
"""
from pathlib import Path
import hashlib,json,os,subprocess,tempfile,zipfile
if os.name!='nt': raise SystemExit('Windows package installer check runs on Windows only.')
root=Path(__file__).resolve().parent
version=json.loads((root/'manifest.json').read_text(encoding='utf-8'))['version']
assert isinstance(version,str) and all(part.isdigit() for part in version.split('.')),version
package=root.parents[1]/'artifacts'/f'PlazCode-{version}-development.zip'
assert package.is_file(),f'Fresh Windows package is missing: {package}'
source=(root/'Update-PlazCode.ps1').read_text()
start=source.index('function Start-UpdatedPlazCode(');end=source.index('function Get-ExtensionRoot(',start)
replacement="function Start-UpdatedPlazCode([string]$Version) { [IO.File]::WriteAllText((Join-Path $install 'relaunch-version.txt'), $Version) }\n"
source=source[:start]+replacement+source[end:]
with tempfile.TemporaryDirectory(prefix="PlazCode user's update ",ignore_cleanup_errors=True) as temp:
 home=Path(temp);install=home/'Downloads'/'PlazCode (old version)';install.mkdir(parents=True)
 extension=install/'PlazCode-Extension';extension.mkdir();(extension/'manifest.json').write_text('{"version":"1.0.0"}')
 (install/'update-source.json').write_text('{}')
 settings=b'{"preserve":"my settings"}';(install/'plazcode-settings.json').write_bytes(settings)
 (install/'templates').mkdir();(install/'templates/private-template.txt').write_text('user template')
 fixture=home/'updater.ps1';fixture.write_text(source,encoding='utf-8-sig')
 checksum=hashlib.sha256(package.read_bytes()).hexdigest()
 result=subprocess.run(['powershell.exe','-NoProfile','-File',str(fixture),'-InstallRoot',str(install),'-ZipPath',str(package),'-ExpectedSha256',checksum,'-ExpectedVersion',version],capture_output=True,text=True,timeout=180)
 assert result.returncode==0,(result.stdout,result.stderr,(install/'logs/update-failure.json').read_text(encoding='utf-8-sig') if (install/'logs/update-failure.json').exists() else '')
 assert (install/'relaunch-version.txt').read_text()==version
 assert (install/'plazcode-settings.json').read_bytes()==settings
 assert (install/'templates/private-template.txt').read_text()=='user template'
 with zipfile.ZipFile(package) as archive:
  for name in ['PlazCode.exe','WebView2Loader.dll','PlazCode-Extension/manifest.json','PlazCode-Extension/core/creator.js','Update-PlazCode.ps1']:
   assert (install/name).read_bytes()==archive.read('PlazCode/'+name),name
 assert json.loads((extension/'manifest.json').read_text())['version']==version
 print('PASS complete Windows package installation on PowerShell 5.1, spaces/apostrophe paths, exact installed bytes, preferences/templates preserved and relaunch handoff.')

# 1.24.29 (owner, 2026-10-31: updates "sometimes" failed the signature check, and sometimes stayed stuck).
# Run the REAL signed check on Windows PowerShell 5.1: the installed, trusted PlazCode.exe checks the
# downloaded ZIP against its signed file list. Paths contain spaces and an apostrophe.
import shutil
with zipfile.ZipFile(package) as archive:
 signed_list=archive.read('PlazCode/PlazCode-Extension/plazcode-installation-integrity.json')
 native=archive.read('PlazCode/PlazCode.exe');loader=archive.read('PlazCode/WebView2Loader.dll')
def signed_install(home):
 install=home/'Programs'/"PlazCode (old version)";extension=install/'PlazCode-Extension';extension.mkdir(parents=True)
 (extension/'manifest.json').write_text('{"version":"1.0.0"}');(install/'update-source.json').write_text('{}')
 (extension/'plazcode-installation-integrity.json').write_bytes(signed_list)
 (install/'PlazCode.exe').write_bytes(native);(install/'WebView2Loader.dll').write_bytes(loader)
 (install/'plazcode-settings.json').write_bytes(settings)
 return install
def run_update(home,install,zip_path):
 fixture=home/'updater.ps1';fixture.write_text(source,encoding='utf-8-sig')
 checksum=hashlib.sha256(zip_path.read_bytes()).hexdigest()
 return subprocess.run(['powershell.exe','-NoProfile','-File',str(fixture),'-InstallRoot',str(install),'-ZipPath',str(zip_path),'-ExpectedSha256',checksum,'-ExpectedVersion',version,'-RequireSignedPackage'],capture_output=True,text=True,timeout=600)
with tempfile.TemporaryDirectory(prefix="PlazCode user's signed update ",ignore_cleanup_errors=True) as temp:
 home=Path(temp);install=signed_install(home)
 download=home/'Download folder'/"release copy.zip";download.parent.mkdir();shutil.copyfile(package,download)
 result=run_update(home,install,download)
 assert result.returncode==0,(result.stdout,result.stderr)
 assert (install/'relaunch-version.txt').read_text()==version
 assert (install/'plazcode-settings.json').read_bytes()==settings
 assert json.loads((install/'PlazCode-Extension/manifest.json').read_text())['version']==version
print('PASS signed update: the installed PlazCode.exe checked the downloaded ZIP against its signed file list on PowerShell 5.1 and the update installed.')
with tempfile.TemporaryDirectory(prefix="PlazCode user's tampered update ",ignore_cleanup_errors=True) as temp:
 home=Path(temp);install=signed_install(home)
 tampered=home/'tampered release.zip'
 with zipfile.ZipFile(package) as src, zipfile.ZipFile(tampered,'w',zipfile.ZIP_DEFLATED) as dst:
  for item in src.infolist():
   data=src.read(item)
   if item.filename=='PlazCode/PlazCode-Extension/core/creator.js':data+=b'\n// changed'
   dst.writestr(item,data)
 before={p.relative_to(install):p.read_bytes() for p in install.rglob('*') if p.is_file() and 'logs' not in p.parts}
 result=run_update(home,install,tampered)
 assert result.returncode!=0,'a package with a changed file must be refused'
 failure=json.loads((install/'logs/update-failure.json').read_text(encoding='utf-8-sig'))['message']
 assert 'Release signature or file verification failed' in failure and 'PlazCode-Extension/core/creator.js' in failure,failure
 after={p.relative_to(install):p.read_bytes() for p in install.rglob('*') if p.is_file() and 'logs' not in p.parts}
 assert after==before,'a refused update must not change any installed file'
print('PASS changed package: refused before any installed file changed, and the reason names the changed file.')
