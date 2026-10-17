"""Authenticated native skills routes against a real locally compiled agent."""
from pathlib import Path
import json,os,shutil,tempfile,subprocess,time,urllib.request,urllib.error
root=Path(__file__).resolve().parent
binary=root/'agent/target/debug'/('PlazCode.exe' if os.name=='nt' else 'PlazCode')
with tempfile.TemporaryDirectory(prefix='plazcode-skills-native-') as temporary:
 install=Path(temporary)/'install';install.mkdir();shutil.copy2(binary,install/binary.name);shutil.copytree(root/'PlazCode-Extension',install/'PlazCode-Extension');binary=install/binary.name
 config=Path(temporary)/'config';config.mkdir();env={**os.environ,'LOCALAPPDATA':str(config),'XDG_CONFIG_HOME':str(config),'PLAZCODE_WORKSPACE_ROOT':str(Path(temporary)/'workspace')}
 env.pop('PLAZCODE_GITHUB_TOKEN',None)
 with (Path(temporary)/'agent.log').open('w') as log:
  process=subprocess.Popen([str(binary),'--headless'],env=env,stdout=log,stderr=log)
  try:
   key=''
   for _ in range(100):
    path=config/'PlazCode/bridge-key'
    if path.exists():
     key=path.read_text()
     try:urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:3000/api/status',headers={'Authorization':'Bearer '+key}),timeout=1).close();break
     except OSError:pass
    time.sleep(.1)
   else:raise AssertionError('Agent did not start')
   def call(path,body,auth=True):
    request=urllib.request.Request('http://127.0.0.1:3000'+path,data=json.dumps(body).encode(),headers={'Content-Type':'application/json',**({'Authorization':'Bearer '+key} if auth else {})})
    try:
     with urllib.request.urlopen(request,timeout=8) as response:return response.status,json.load(response)
    except urllib.error.HTTPError as error:
     text=error.read().decode()
     try:body=json.loads(text)
     except json.JSONDecodeError:body={"error":text}
     return error.code,body
   assert call('/api/skills',{'action':'list'},False)[0]==401
   starters=call('/api/skills',{'action':'list'})[1]['skills'];assert len([x for x in starters if x['id'].startswith('starter-syphodev-')])==11
   status,reference=call('/api/skills',{'action':'read','id':'starter-syphodev-roblox-code','limit':100});assert status==200 and len(reference['bundle']['content'])==100 and reference['bundle']['next_offset']==100
   assert call('/api/skills',{'action':'read','id':'starter-syphodev-roblox-code','resource':'../../bridge-key'})[0]==400
   skill={'id':'inventory','title':'Inventory','description':'Inventory menu','domain':'roblox','scope':'project:A','steps':['Inspect existing UI','Adapt the menu'],'pitfalls':[],'verification':['Test open/close'],'confirmed':True,'revision':0,'community':False}
   status,saved=call('/api/skills',{'action':'save','skill':skill,'revision':0});assert status==200 and saved['skill']['revision']==1,saved
   assert call('/api/skills',{'action':'save','skill':skill,'revision':0})[0]==400
   assert any(x['id']=='inventory' for x in call('/api/skills',{'action':'match','domain':'roblox','scope':'project:A','query':'inventory'})[1]['skills'])
   assert all(x['id']!='inventory' for x in call('/api/skills',{'action':'match','domain':'roblox','scope':'project:B','query':'inventory'})[1]['skills'])
   assert call('/api/skills',{'action':'export','id':'inventory'})[1]['skill']['scope']==''
   assert call('/api/skills',{'action':'publish','id':'inventory','reviewed':True,'revision':1})[0]==400
   status,task=call('/api/checkpoints',{'action':'begin','engine':'roblox','chat':'test|chat','label':'Build an inventory'});assert status==200,task
   assert call('/api/checkpoints',{'action':'finish','id':task['id'],'complete':True})[0]==200
   status,candidate=call('/api/skills',{'action':'checkpoint','checkpoint':task['id']});assert status==200,candidate
   assert candidate['skill']['scope']=='chat:test|chat' and candidate['skill']['confirmed']==False
   assert all(x['id']!=candidate['id'] for x in call('/api/skills',{'action':'match','domain':'roblox','scope':'chat:test|chat','query':'inventory'})[1]['skills'])
   assert call('/api/explorer',{'action':'write','id':'1;error()','source':'','expected':''})[0]==400
   print('PASS real native HTTP: auth, skill persistence, revision conflicts, project isolation, public export, sharing disabled, task candidates and Explorer input validation.')
  finally:
   process.terminate()
   try:process.wait(timeout=5)
   except subprocess.TimeoutExpired:process.kill();process.wait(timeout=5)
