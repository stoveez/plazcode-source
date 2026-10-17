"""Install the complete fresh Windows package using Windows PowerShell 5.1.
Only GUI restart is replaced; ZIP validation, backup, copy and version guards are real.
"""
from pathlib import Path
import hashlib,json,os,subprocess,tempfile,zipfile
if os.name!='nt': raise SystemExit('Windows package installer check runs on Windows only.')
root=Path(__file__).resolve().parent
package=next((root.parents[1]/'artifacts').glob('PlazCode-1.24.6-development.zip'))
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
 result=subprocess.run(['powershell.exe','-NoProfile','-File',str(fixture),'-InstallRoot',str(install),'-ZipPath',str(package),'-ExpectedSha256',checksum,'-ExpectedVersion','1.24.6'],capture_output=True,text=True,timeout=180)
 assert result.returncode==0,(result.stdout,result.stderr,(install/'logs/update-failure.json').read_text(encoding='utf-8-sig') if (install/'logs/update-failure.json').exists() else '')
 assert (install/'relaunch-version.txt').read_text()=='1.24.6'
 assert (install/'plazcode-settings.json').read_bytes()==settings
 assert (install/'templates/private-template.txt').read_text()=='user template'
 with zipfile.ZipFile(package) as archive:
  for name in ['PlazCode.exe','WebView2Loader.dll','PlazCode-Extension/manifest.json','PlazCode-Extension/core/creator.js','Update-PlazCode.ps1']:
   assert (install/name).read_bytes()==archive.read('PlazCode/'+name),name
 assert json.loads((extension/'manifest.json').read_text())['version']=='1.24.6'
 print('PASS complete Windows package installation on PowerShell 5.1, spaces/apostrophe paths, exact installed bytes, preferences/templates preserved and relaunch handoff.')
