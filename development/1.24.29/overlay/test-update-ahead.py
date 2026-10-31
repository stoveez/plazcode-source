"""Run the unmodified native app against the real stable feed; never install an older release."""
from pathlib import Path
import hashlib,json,os,re,subprocess,sys,tempfile,time,urllib.request
if sys.platform not in ('win32','darwin'):
    print('Ahead-of-stable native updater integration runs on Windows/macOS; Linux has no automatic feed.')
    raise SystemExit(0)
root=Path(__file__).resolve().parent
current=re.search(r'^version\s*=\s*"([^"]+)"',(root/'agent/Cargo.toml').read_text(),re.M).group(1)
def version(text):return tuple(map(int,text.split('.')))+(0,)*(4-len(text.split('.')))
feed_url='https://raw.githubusercontent.com/stoveez/PlazCode/main/'+('latest-macos.json' if sys.platform=='darwin' else 'latest.json')
with urllib.request.urlopen(feed_url,timeout=30) as response:published=json.load(response)['version']
if version(published)>=version(current):
    print('Ahead-of-stable case unavailable: published release is at or above this desktop; unit coverage still applies.')
    raise SystemExit(0)
with tempfile.TemporaryDirectory(prefix='plazcode-ahead-of-stable-') as temporary:
    install=Path(temporary);config=install/'configuration';config.mkdir();workspace=install/'workspace';workspace.mkdir()
    executable=install/('PlazCode.exe' if sys.platform=='win32' else 'PlazCode')
    executable.write_bytes((root/'agent/target/debug'/executable.name).read_bytes());executable.chmod(0o755)
    original=hashlib.sha256(executable.read_bytes()).hexdigest()
    (install/'manifest.json').write_text(json.dumps({'version':current}))
    # Match a signed-in user's default auto-update setting, without creating a cloud account.
    (install/'plazcode-settings.json').write_text(json.dumps({'rsAutoUpdate':True}))
    environment=dict(os.environ,LOCALAPPDATA=str(config),XDG_CONFIG_HOME=str(config),PLAZCODE_WORKSPACE_ROOT=str(workspace))
    local=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with (install/'native.log').open('w') as log:
        process=subprocess.Popen([str(executable),'--headless'],cwd=install,env=environment,stdout=log,stderr=log)
        try:
            key=None
            def call(action=None):
                data=json.dumps({'action':action}).encode() if action else None
                request=urllib.request.Request('http://127.0.0.1:3000/api/desktop/update',data=data,headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
                with local.open(request,timeout=45) as response:return json.load(response)
            for attempt in range(150):
                try:
                    key=(config/'PlazCode/bridge-key').read_text().strip();call();break
                except Exception:
                    if process.poll() is not None:raise AssertionError('Native startup failed: '+(install/'native.log').read_text())
                    time.sleep(.1)
            assert key,'native bridge key not created'
            for action in ['check','install']:
                call(action)
                for attempt in range(160):
                    status=call()
                    if not status['busy']:break
                    time.sleep(.25)
                assert not status['busy'],'update did not finish'
                assert status['desktop_version']==current,status
                assert version(status['latest'])<version(current),status
                assert status['available'] is False,status
                assert status['error'] is None and status['check_error'] is None,status
                assert status['message']=='This desktop is newer than the latest published release.',status
                assert hashlib.sha256(executable.read_bytes()).hexdigest()==original,'older release replaced desktop'
            print('PASS actual native ahead-of-stable Check and Install: no failure overlay, no downgrade, current executable preserved.')
        finally:
            if process.poll() is None:
                process.terminate()
                try:process.wait(timeout=8)
                except subprocess.TimeoutExpired:process.kill();process.wait()
