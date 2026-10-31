"""Real Mac processes: reclaim stale PlazCode; leave other port owners alone."""
from pathlib import Path
import json,os,platform,shutil,socket,subprocess,tempfile,time,urllib.request

if platform.system()!='Darwin':
 print('Mac startup recovery runs on macOS only.');raise SystemExit
root=Path(__file__).resolve().parent
binary=root/'agent/target/debug/PlazCode'
def unused_port():
 with socket.socket() as sock:sock.bind(('127.0.0.1',0));return sock.getsockname()[1]
def ready(port,key,process):
 for _ in range(140):
  if process.poll() is not None:raise AssertionError('Agent exited before binding')
  try:
   request=urllib.request.Request(f'http://127.0.0.1:{port}/api/status',headers={'Authorization':'Bearer '+key})
   with urllib.request.urlopen(request,timeout=.5) as response:
    if response.status==200:return
  except OSError:pass
  time.sleep(.1)
 raise AssertionError('Agent did not bind all required endpoints')

with tempfile.TemporaryDirectory(prefix='plazcode-mac-reclaim-') as directory:
 base=Path(directory);install=base/'install';install.mkdir();config=base/'config';config.mkdir()
 shutil.copy2(binary,install/'PlazCode');shutil.copytree(root/'PlazCode-Extension',install/'PlazCode-Extension')
 env={**os.environ,'LOCALAPPDATA':str(config),'XDG_CONFIG_HOME':str(config),'PLAZCODE_WORKSPACE_ROOT':str(base/'workspace')}
 processes=[]
 with (base/'test.log').open('w') as log:
  def start(port):
   process=subprocess.Popen([str(install/'PlazCode'),'--headless','--roblox-addr',f'127.0.0.1:{port}'],env=env,cwd=install,stdout=log,stderr=log);processes.append(process);return process
  try:
   # An orphaned older bridge holds the legacy ports but a different API port.
   first_port=unused_port();first=start(first_port)
   keyfile=config/'PlazCode/bridge-key'
   for _ in range(100):
    if keyfile.exists():break
    time.sleep(.1)
   key=keyfile.read_text();ready(first_port,key,first)
   second_port=unused_port();second=start(second_port);ready(second_port,key,second)
   first.wait(timeout=8);assert second.poll() is None
   second.terminate();second.wait(timeout=8)
   # A non-PlazCode listener must never be killed to make room.
   with socket.socket() as unrelated:
    unrelated.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
    unrelated.bind(('127.0.0.1',17613));unrelated.listen()
    blocked=start(unused_port());assert blocked.wait(timeout=15)!=0
    assert unrelated.fileno()>=0
    with socket.create_connection(('127.0.0.1',17613),timeout=2):pass
  finally:
   for process in processes:
    if process.poll() is None:process.kill();process.wait(timeout=5)
print('PASS real macOS stale PlazCode port recovery and unrelated listener preservation.')
