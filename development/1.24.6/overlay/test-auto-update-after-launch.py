"""Test automatic installation remains armed after an up-to-date launch check in a temporary install.
The installer helper verifies the real release checksum and records its inputs;
it intentionally leaves the temporary files in place instead of relaunching GUI.
"""
from pathlib import Path
import tempfile,os,subprocess,time,json,shutil,urllib.request,urllib.error
root=Path(__file__).resolve().parent
with tempfile.TemporaryDirectory(prefix='plazcode-launch-update-') as temporary:
 install=Path(temporary);name='PlazCode.exe' if os.name=='nt' else 'PlazCode'
 shutil.copy2(Path(os.environ.get('PLAZCODE_TEST_BINARY',str(root/'agent/target/release'/name))),install/name)
 (install/'PlazCode-Extension').mkdir();(install/'PlazCode-Extension/manifest.json').write_text(json.dumps({'version':json.load(urllib.request.urlopen('https://raw.githubusercontent.com/stoveez/PlazCode/main/latest.json',timeout=20))['version']}))
 config=install/'config';config.mkdir()
 (install/'plazcode-settings.json').write_text(json.dumps({'rsAppearance':{'theme':'ocean','glow':'off','gradients':'off'}}))
 helper=install/('Update-PlazCode.ps1' if os.name=='nt' else 'Update-PlazCode.command')
 if os.name=='nt':helper.write_text('''param([string]$InstallRoot,[string]$ZipPath,[string]$ExpectedSha256,[string]$ExpectedVersion,[switch]$ShowProgress,[switch]$BackgroundUpdate,[string]$Theme,[string]$Glow,[switch]$NoGradients)
if((Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash -ne $ExpectedSha256){exit 5}
@{version=$ExpectedVersion;sha256=$ExpectedSha256;bytes=(Get-Item $ZipPath).Length;background=[bool]$BackgroundUpdate;theme=$Theme;glow=$Glow;no_gradients=[bool]$NoGradients} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $InstallRoot 'installer-called.json')
exit 0
''')
 else:helper.write_text('''#!/bin/bash
set -eu
actual=$(shasum -a 256 "$1" | cut -d ' ' -f1)
[ "$actual" = "$2" ]
printf '{"version":"%s","sha256":"%s","mode":"%s"}' "$3" "$2" "$5" > "$6/installer-called.json"
''');helper.chmod(0o755)
 env={**os.environ,'LOCALAPPDATA':str(config),'XDG_CONFIG_HOME':str(config),'PLAZCODE_WORKSPACE_ROOT':str(install/'workspace')}
 log=(install/'output.log').open('w');p=subprocess.Popen([str(install/name),'--headless'],env=env,stdout=log,stderr=log)
 try:
  keyfile=config/'PlazCode/bridge-key';key=''
  def request(body=None):
   req=urllib.request.Request('http://127.0.0.1:3000/api/desktop/update',data=json.dumps(body).encode() if body else None,headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
   with urllib.request.urlopen(req,timeout=3) as r:return json.load(r)
  deadline=time.monotonic()+90
  launched=False
  launch_checked_at=0
  initially_current=False
  marked_outdated=False
  state={}
  while time.monotonic()<deadline:
   if p.poll() is not None:raise RuntimeError((install/'output.log').read_text())
   if keyfile.exists():
    key=keyfile.read_text()
    try:
     state=request()
     if state.get('latest') and not state.get('busy') and not launched:
      assert not state['available'],state
      launch_checked_at=state['checked_at']
      request({'action':'launch'});launched=True
     if launched and not state.get('busy') and state.get('checked_at',0)>launch_checked_at and not marked_outdated:
      assert not state['available'] and not (install/'installer-called.json').exists(),state
      initially_current=True
      (install/'PlazCode-Extension/manifest.json').write_text('{"version":"1.0.0"}')
      marked_outdated=True
     if (install/'installer-called.json').exists():break
    except (OSError,urllib.error.HTTPError):pass
   time.sleep(.2)
  else:raise RuntimeError('Automatic launch update did not reach installer. Last update state: '+json.dumps(state)+'; output: '+(install/'output.log').read_text())
  called=json.loads((install/'installer-called.json').read_text(encoding='utf-8-sig'))
  assert called['version']==request()['latest'] and len(called['sha256'])==64
  assert initially_current and marked_outdated
  if os.name=='nt':assert called['background'] and called['theme']=='ocean' and called['glow']=='off' and called['no_gradients'],called
  else:assert called['mode']=='background',called
  print('PASS automatic update after initial up-to-date check (installation metadata becomes outdated while app remains open): outdated detection, real published release download, verified SHA256, exact installer version/checksum handoff. GUI installation/relaunch replaced by test helper.')
 finally:
  try:
   # The installer inherits stdout. Stop this fixture's owned process tree so
   # its child cannot retain output.log while TemporaryDirectory removes it.
   if os.name=='nt' and p.poll() is None:
    stopped=subprocess.run(['taskkill','/PID',str(p.pid),'/T','/F'],capture_output=True,text=True,timeout=10)
    if stopped.returncode and p.poll() is None:raise RuntimeError(stopped.stdout+stopped.stderr)
   elif p.poll() is None:p.terminate()
   try:p.wait(timeout=5)
   except subprocess.TimeoutExpired:p.kill();p.wait(timeout=5)
  finally:log.close()
