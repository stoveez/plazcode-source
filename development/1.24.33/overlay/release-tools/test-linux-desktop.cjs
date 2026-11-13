// Runs the real Linux binary and its actual desktop frontend, including the
// one-time browser bootstrap. Only the OS browser opener is a local fixture.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{chromium}=require('playwright');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const waitFor=async(fn,label)=>{for(let i=0;i<150;i++){if(await fn())return;await sleep(100);}throw Error('Timed out: '+label);};
(async()=>{
 if(process.platform!=='linux'){console.log('Linux desktop test runs on Linux only.');return;}
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'plazcode-linux-desktop-')),install=path.join(temp,'install'),bin=path.join(temp,'bin'),config=path.join(temp,'config'),launches=path.join(temp,'launches');
 const home=path.join(temp,'home');for(const directory of[install,bin,config,home])fs.mkdirSync(directory);
 if(process.env.PLAZCODE_NATIVE_INSTALL_ROOT)fs.cpSync(process.env.PLAZCODE_NATIVE_INSTALL_ROOT,install,{recursive:true});
 else{fs.copyFileSync('agent/target/debug/PlazCode',path.join(install,'PlazCode'));fs.chmodSync(path.join(install,'PlazCode'),0o755);fs.cpSync('PlazCode-Extension',path.join(install,'PlazCode-Extension'),{recursive:true});}
 fs.writeFileSync(path.join(install,'plazcode-settings.json'),JSON.stringify({rsAutoUpdate:false,rsApprovalMode:'auto'}));
 fs.writeFileSync(path.join(bin,'xdg-open'),'#!/usr/bin/env python3\nimport os,sys\nwith open(os.environ["PLAZCODE_TEST_LAUNCHES"],"a") as f:f.write(sys.argv[1]+"\\n")\n',{mode:0o700});
 // 1.24.33 (Linux rework): PlazCode opens its own app window with the first Chromium-family browser it finds. This
 // stand-in Chrome comes first on PATH and writes down the --app link, so the test controls the launch as before.
 fs.writeFileSync(path.join(bin,'google-chrome'),'#!/usr/bin/env python3\nimport os,sys\nlog=os.environ["PLAZCODE_TEST_LAUNCHES"];a=sys.argv[1:]\nif len(a)==1 and a[0].startswith("--app="):\n open(log,"a").write(a[0][6:]+"\\n");open(log+".app-window","a").write("1")\nelse:\n open(log+".pages","a").write(" ".join(a)+"\\n")\n',{mode:0o700});
 fs.writeFileSync(path.join(temp,'Godot_v4-stand-in'),'stand-in for the Godot editor program');
 // Unity stand-ins: a Unity Hub project list, one installed editor (a script that writes down how it was started) and
 // a project with Unity's usual package list. OpenUPM is a local stand-in; the real one is checked in unity.rs tests.
 const unityGame=path.join(temp,'Space'),unityManifest='{\n  "dependencies": {\n    "com.unity.ugui": "1.0.0",\n    "com.unity.modules.ai": "1.0.0"\n  }\n}\n';
 for(const dir of['Assets','ProjectSettings','Packages'])fs.mkdirSync(path.join(unityGame,dir),{recursive:true});
 fs.writeFileSync(path.join(unityGame,'ProjectSettings','ProjectVersion.txt'),'m_EditorVersion: 2022.3.40f1\n');fs.writeFileSync(path.join(unityGame,'Packages','manifest.json'),unityManifest);
 fs.mkdirSync(path.join(temp,'UnityHub'));fs.writeFileSync(path.join(temp,'UnityHub','projects-v1.json'),JSON.stringify({schema_version:'v1',data:{[unityGame]:{title:'Space',path:unityGame,version:'2022.3.40f1'}}}));
 fs.mkdirSync(path.join(temp,'UnityEditors','2022.3.40f1','Editor'),{recursive:true});fs.mkdirSync(path.join(temp,'unity-status'));
 fs.writeFileSync(path.join(temp,'UnityEditors','2022.3.40f1','Editor','Unity'),'#!/bin/sh\nprintf "%s\\n" "$@" > "'+path.join(temp,'unity-started')+'"\n',{mode:0o755});
 const openupm=require('http').createServer((req,res)=>{res.writeHead(req.url==='/com.coplaydev.unity-mcp'?200:404,{'Content-Type':'application/json'});res.end(JSON.stringify({name:'com.coplaydev.unity-mcp',versions:{'10.2.0':{},'10.3.0':{}}}));}).listen(39517,'127.0.0.1');
 const log=fs.openSync(path.join(temp,'agent.log'),'w');
 const agent=spawn(path.join(install,'PlazCode'),[],{cwd:install,env:{...process.env,HOME:home,XDG_CACHE_HOME:process.env.XDG_CACHE_HOME||path.join(os.homedir(),'.cache'),PATH:bin+path.delimiter+process.env.PATH,LOCALAPPDATA:config,XDG_CONFIG_HOME:config,PLAZCODE_WORKSPACE_ROOT:path.join(temp,'workspace'),PLAZCODE_TEST_LAUNCHES:launches,GODOT_PATH:path.join(temp,'Godot_v4-stand-in'),PLAZCODE_UNITY_HUB_DIR:path.join(temp,'UnityHub'),PLAZCODE_UNITY_EDITORS:path.join(temp,'UnityEditors'),UNITY_MCP_STATUS_DIR:path.join(temp,'unity-status'),PLAZCODE_OPENUPM_URL:'http://127.0.0.1:39517'},stdio:['ignore',log,log]});
 let browser;
 try{
  await waitFor(()=>fs.existsSync(launches),'native Linux opens a browser');
  const launch=()=>fs.readFileSync(launches,'utf8').trim().split('\n');
  const url=launch()[0],key=fs.readFileSync(path.join(config,'PlazCode/bridge-key'),'utf8');
  assert(!url.includes(key),'permanent key must never enter launch URL');
  assert.match(url,/^http:\/\/127\.0\.0\.1:3000\/desktop-start#[a-f0-9]{64}$/);
  assert(fs.existsSync(launches+'.app-window'),'PlazCode opens in its own app window when a Chromium browser is installed');
  const call=(route,data,auth=true,origin='http://127.0.0.1:3000')=>fetch('http://127.0.0.1:3000'+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(auth?{Authorization:'Bearer '+key}:{})},body:JSON.stringify(data)});
  assert.equal((await call('/api/desktop/browser-action',{message:'quit'},false)).status,401);
  const ticket=url.split('#')[1];
  assert.equal((await call('/api/desktop/browser-session',{ticket},false,'https://example.com')).status,403);
  browser=await chromium.launch({headless:true,...(process.env.PLAZCODE_CHROMIUM?{executablePath:process.env.PLAZCODE_CHROMIUM}:{}),args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  let desktopNavigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame()&&new URL(frame.url()).pathname==='/desktop-ui')desktopNavigations++;});
  await page.goto(url);await page.waitForURL('**/desktop-ui');
  const shell=await page.request.get('http://127.0.0.1:3000/desktop-ui');assert.equal(shell.headers()['x-frame-options'],'DENY');assert.equal(shell.headers()['referrer-policy'],'no-referrer');
  await page.locator('#nxSplash').waitFor({state:'hidden',timeout:30000});
  assert.equal(new URL(page.url()).hash,'');
  assert.equal((await call('/api/desktop/browser-session',{ticket},false)).status,401,'ticket cannot be reused');
  const profileGate=await page.locator('#profileSignIn').isVisible();
  if(profileGate){
    assert.equal(desktopNavigations,1,'fresh locked window must not reload and replay the startup intro');
    assert.equal(await page.locator('.app').evaluate(node=>getComputedStyle(node).visibility),'hidden','desktop must not flash behind the sign-in crossfade');
    assert.equal(await page.locator('#profileCreate').isVisible(),true);
    const denied=await fetch('http://127.0.0.1:3000/api/preferences',{headers:{Authorization:'Bearer '+key}});assert.equal(denied.status,423,'locked desktop cannot expose profile preferences');
    assert.equal((await fetch('http://127.0.0.1:3000/api/connections',{headers:{Authorization:'Bearer '+key}})).status,423,'locked desktop cannot expose saved app connections');assert.equal((await call('/api/connections/setup',{id:'godot',consent:true})).status,423,'locked desktop cannot change app connections');
    assert.equal(await page.locator('.app').evaluate(node=>node.inert),true);
  }else{
  await page.evaluate(()=>PlazCodeDesktop.go('settings','general'));
  await page.locator('#desktopApprovalMode').waitFor({state:'attached'});
  await page.evaluate(()=>{const card=document.querySelector('#desktopApprovalMode').closest('details');if(card)card.open=true;});
  for(const mode of ['ask','bypass','auto']){
   const wrapper=page.locator('#desktopApprovalMode').locator('xpath=..');
   await wrapper.locator('.pc-effort-trigger').click();await wrapper.locator('[data-value="'+mode+'"]').click();
   await waitFor(()=>JSON.parse(fs.readFileSync(path.join(install,'plazcode-settings.json'),'utf8')).rsApprovalMode===mode,'mode persists to real disk');
  }
  await page.reload();await page.locator('#nxSplash').waitFor({state:'hidden',timeout:30000});
  await page.evaluate(()=>PlazCodeDesktop.go('settings','general'));
  assert.equal(await page.locator('#desktopApprovalMode').inputValue(),'auto');
  }
  // Apps & servers, real page against the real app: Godot from "Not set up" through Allow, a refused folder, a picked project and Disconnect.
  // GODOT_PATH points at a stand-in file, so the editor counts as found; the helper itself may or may not start on this machine.
  assert.equal((await fetch('http://127.0.0.1:3000/api/connections',{})).status,401,'the connection report needs the pairing key');
  if(profileGate){await page.locator('#profileGuest').click();await page.locator('#profileSignIn').waitFor({state:'hidden',timeout:30000});}
  await page.waitForFunction(()=>typeof PlazCodeDesktop==='object'&&!document.querySelector('.app').inert,null,{timeout:30000});
  await page.evaluate(()=>PlazCodeDesktop.go('mcp'));
  // PLAZCODE_SHOTS=<folder>: real screenshots of the running app's Apps & servers page for the owner.
  const shot=async name=>{if(process.env.PLAZCODE_SHOTS){fs.mkdirSync(process.env.PLAZCODE_SHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.PLAZCODE_SHOTS,name+'.png')});}};
  const pill=()=>page.locator('#cnApps [data-app="godot"] .cn-pill').innerText(),stepState=id=>page.locator('#cnWin [data-step="'+id+'"]').getAttribute('data-state');
  await page.locator('#cnApps [data-cn-open="godot"]').waitFor();assert.equal(await pill(),'Not set up','the real page draws the real report');if(process.env.PLAZCODE_SHOTS){await page.waitForTimeout(1800);await page.locator('#cnApps').scrollIntoViewIfNeeded();await page.waitForTimeout(400);}await shot('1-apps-and-servers');
  await page.locator('#cnApps [data-cn-open="godot"]').click();
  assert.match(await page.locator('#cnWin .cn-consent p').innerText(),/Nothing in your projects changes/);
  assert.deepEqual([await stepState('find'),await stepState('project'),await stepState('runtime'),await stepState('start')],['waiting','waiting','waiting','waiting'],'nothing is claimed before Allow');
  await page.locator('#cnWin [data-cn-act="allow"]').click();
  await waitFor(async()=>await stepState('find')==='done'&&await stepState('project')==='needs_you','Allow finds the editor and asks for a project');
  assert.equal(await page.locator('#cnWin [data-step="find"] .cn-detail').innerText(),path.join(temp,'Godot_v4-stand-in'));
  await page.locator('#cnWin [data-cn-input="project"]').fill(temp);await page.locator('#cnWin [data-cn-use="project"]').click();
  await page.locator('#cnWin .cn-alert').waitFor();assert.match(await page.locator('#cnWin .cn-alert').innerText(),/project\.godot/,'a folder that is not a project is refused with the reason');
  const game=path.join(temp,'game');fs.mkdirSync(game);fs.writeFileSync(path.join(game,'project.godot'),'config_version=5\n');
  await page.locator('#cnWin [data-cn-input="project"]').fill(game);await page.locator('#cnWin [data-cn-input="project"]').press('Enter');
  await waitFor(async()=>await stepState('project')==='done','the pasted project is accepted');
  assert.equal(await page.locator('#cnWin [data-step="project"] .cn-detail').innerText(),game);await shot('2-godot-project-picked');assert.equal(await page.locator('#cnWin .cn-alert').count(),0);
  const program=await stepState('runtime'),started=await stepState('start');assert(['working','done','needs_you'].includes(program),'the helper program is looked for once editor and project are known: '+program);assert(['waiting','working','done','needs_you'].includes(started),'start step state: '+started);assert(program==='done'||started==='waiting','the helper never starts before its program is ready: '+program+' / '+started);
  console.log('Godot on this machine after pick: helper program '+program+', helper '+started+' / '+await pill());
  await page.locator('#cnWin [data-cn-act="disconnect"]').click();await waitFor(async()=>await pill()==='Not set up','Disconnect returns to Not set up');
  await page.locator('#cnWin [data-cn-act="close"]').first().click();
  {// Unity against the real app: Allow, Hub's project list, the package added to manifest.json with a backup, Open project
   // starts the matching editor with the stdio start, a stand-in Unity answers, Disconnect takes only PlazCode's entry out.
   const upill=()=>page.locator('#cnApps [data-app="unity"] .cn-pill').innerText();
   await page.locator('#cnApps [data-cn-open="unity"]').click();
   assert.match(await page.locator('#cnWin .cn-consent p').innerText(),/keeping a backup/);
   assert.equal(fs.readFileSync(path.join(unityGame,'Packages','manifest.json'),'utf8'),unityManifest,'nothing changes before Allow');
   await page.locator('#cnWin [data-cn-act="allow"]').click();
   await waitFor(async()=>await stepState('find')==='done'&&await stepState('project')==='needs_you','Allow finds Unity and asks for a project');
   await page.locator('#cnWin [data-step="project"] .cn-choice').first().click();
   await waitFor(async()=>await stepState('package')==='done','the package is added to the picked project');
   const manifest=JSON.parse(fs.readFileSync(path.join(unityGame,'Packages','manifest.json'),'utf8'));
   assert.equal(manifest.dependencies['com.coplaydev.unity-mcp'],'10.3.0');assert.deepEqual(manifest.scopedRegistries,[{name:'package.openupm.com',url:'https://package.openupm.com',scopes:['com.coplaydev.unity-mcp']}]);
   assert.deepEqual(Object.keys(manifest.dependencies),['com.unity.ugui','com.unity.modules.ai','com.coplaydev.unity-mcp'],'other packages kept, in order');
   const backups=fs.readdirSync(path.join(unityGame,'Packages')).filter(name=>name.startsWith('manifest.json.plazcode-backup-'));
   assert.equal(backups.length,1);assert.equal(fs.readFileSync(path.join(unityGame,'Packages',backups[0]),'utf8'),unityManifest,'the backup is the original file');
   await waitFor(async()=>await stepState('open')==='needs_you','Open project is offered');await shot('3-unity-package-added');
   await page.locator('#cnWin [data-step="open"] [data-cn-act="open"]').click();
   await waitFor(()=>fs.existsSync(path.join(temp,'unity-started')),'Open project starts the matching Unity editor');
   assert.deepEqual(fs.readFileSync(path.join(temp,'unity-started'),'utf8').trim().split('\n'),['-projectPath',unityGame,'-executeMethod','MCPForUnity.Editor.McpCiBoot.StartStdioForCi'],'the project opens with the stdio start for this session');
   // The package's local listener, the way Unity runs it: a status file for this project and the greeting.
   const unityListener=require('net').createServer(socket=>socket.end('WELCOME UNITY-MCP 1 FRAMING=1\n')).listen(0,'127.0.0.1');await new Promise(r=>unityListener.once('listening',r));
   const statusFile=path.join(temp,'unity-status','unity-mcp-status-0123abcd.json');
   const beat=()=>fs.writeFileSync(statusFile,JSON.stringify({unity_port:unityListener.address().port,reason:'ready',reloading:false,project_path:path.join(unityGame,'Assets'),project_name:'Space'}));
   beat();const beating=setInterval(beat,500);
   try{
    await waitFor(async()=>await stepState('open')==='done','a Unity that answers ticks off Open project');await shot('4-unity-answers');
    const test=await stepState('test');assert(['working','done','needs_you'].includes(test),'check step: '+test);
    console.log('Unity against the real app: Allow, Hub list, package added with a backup, Open project with the stdio start, stand-in Unity answers; helper '+test+' / '+await upill());
   }finally{clearInterval(beating);unityListener.close();}
   await page.locator('#cnWin [data-cn-act="disconnect"]').click();await waitFor(async()=>await upill()==='Not set up','Disconnect returns Unity to Not set up');
   assert.deepEqual(JSON.parse(fs.readFileSync(path.join(unityGame,'Packages','manifest.json'),'utf8')),JSON.parse(unityManifest),'Disconnect takes out only what PlazCode added');
   await page.locator('#cnWin [data-cn-act="close"]').first().click();
   openupm.close();
  }
  // Blender in the background, end to end, when a real Blender is on this machine (CI installs one and names it in PLAZCODE_BLENDER).
  if(process.env.PLAZCODE_BLENDER){
   const blenderPill=()=>page.locator('#cnApps [data-app="blender"] .cn-pill').innerText(),bStep=id=>page.locator('#cnWin [data-step="'+id+'"]').getAttribute('data-state');
   const slow=async(fn,label,seconds)=>{for(let i=0;i<seconds*10;i++){if(await fn())return;await sleep(100);}throw Error('Timed out: '+label);};
   await page.locator('#cnApps [data-cn-open="blender"]').click();
   assert.equal(await page.locator('#cnWin [data-cn-mode="background"]').getAttribute('aria-pressed'),'true','background is the default way');
   await page.locator('#cnWin [data-cn-act="allow"]').click();
   await slow(async()=>await blenderPill()==='Ready','real Blender starts in the background and answers',150);
   assert.equal(await page.locator('#cnWin [data-cn-switch="free_python"]').getAttribute('aria-checked'),'false','safe mode is on');
   // Work requests carry the active profile's mark, exactly as the extension sends it.
   const epoch=((await (await fetch('http://127.0.0.1:3000/api/status',{headers:{Authorization:'Bearer '+key}})).json()).profile||{}).epoch;
   const work=data=>fetch('http://127.0.0.1:3000/api/blender',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://127.0.0.1:3000',Authorization:'Bearer '+key,...(epoch?{'X-PlazCode-Profile':epoch}:{})},body:JSON.stringify(data)});
   const refused=await (await work({type:'execute_code',params:{code:'print(1)'}})).json();assert.equal(refused.ok,false);assert.match(refused.error,/Safe mode is on/,'free Python is refused by the real app');
   const cube=await (await work({type:'plazcode_op',params:{cmd:'add_cube',args:{name:'PZ Live Cube'}}})).json();assert.equal(cube.ok,true,JSON.stringify(cube));assert.match(JSON.stringify(cube.data),/PZ Live Cube/);
   await page.locator('#cnWin .cn-actions [data-cn-step="preview"]').click();
   await slow(async()=>await page.locator('#cnWin .cn-preview img').count()===1,'the picture appears in the window',200);
   await shot('5-blender-background-picture');
   console.log('Real background Blender: '+await page.locator('#cnWin [data-step="start"] .cn-detail').innerText()+', picture shown, safe mode refused free Python');
   await page.locator('#cnWin [data-cn-act="disconnect"]').click();await waitFor(async()=>await blenderPill()==='Not set up','Blender Disconnect');
   await page.locator('#cnWin [data-cn-act="close"]').first().click();
  }else console.log('No real Blender here (PLAZCODE_BLENDER not set): background Blender end-to-end part skipped.');
  // Blockbench, the app way: the real PlazCode app, its real helper connection and its real helper file. The file is run
  // here against a stand-in for Blockbench (release-tools/fake-blockbench.js), so this proves PlazCode's side end to end
  // and nothing about a real Blockbench.
  {
   const vm=require('vm'),first=await (await fetch('http://127.0.0.1:3000/api/status',{headers:{Authorization:'Bearer '+key}})).json();
   // Requests carry the signed-in profile's value, as the extension's do.
   const headers={Authorization:'Bearer '+key,'Content-Type':'application/json',Origin:'http://127.0.0.1:3000',...(first.profile&&first.profile.epoch?{'X-PlazCode-Profile':first.profile.epoch}:{})};
   const get=async route=>(await fetch('http://127.0.0.1:3000'+route,{headers})).json(),post=async(route,body)=>(await fetch('http://127.0.0.1:3000'+route,{method:'POST',headers,body:JSON.stringify(body)})).json();
   const card=async()=>{const all=await get('/api/connections');if(!all.apps)throw new Error('connections reply: '+JSON.stringify(all).slice(0,300));return all.apps.find(app=>app.id==='blockbench');};
   const setup=body=>post('/api/connections/setup',{id:'blockbench',...body}),states=app=>app.steps.map(step=>step.id+':'+step.state).join(' '),tool=body=>post('/api/blockbench',body);
   const helperFiles=()=>fs.readdirSync(config,{recursive:true}).map(String).filter(name=>name.endsWith('plazcode_blockbench.js')).map(name=>path.join(config,name));
   const knock=word=>new Promise(resolve=>{const socket=new WebSocket('ws://127.0.0.1:3000/helper');let paired=false;socket.onopen=()=>socket.send(JSON.stringify({hello:1,app:'blockbench',word}));socket.onmessage=event=>{if(String(event.data).includes('"paired":true')){paired=true;socket.close();}};socket.onclose=()=>resolve(paired);socket.onerror=()=>{};});
   let bb=await card();assert.equal(bb.state+' '+bb.mode+' '+states(bb),'not_set_up web open:waiting test:waiting','Blockbench before Allow: nothing started');
   assert.deepEqual(helperFiles(),[],'no helper file before Allow');assert.equal(await knock('a'.repeat(64)),false,'the helper address lets nobody in before Allow');
   assert.equal((await tool({cmd:'status'})).ok,false,'no Blockbench action before Allow');
   assert.equal((await setup({mode:'app'})).ok,true);assert.deepEqual(helperFiles(),[],'looking at the other way makes no file');
   assert.equal((await setup({consent:true,mode:'app'})).ok,true);
   await waitFor(async()=>states(await card())==='file:done load:needs_you test:waiting','helper file made after Allow');
   bb=await card();const helper=bb.steps[0].detail;assert.deepEqual(helperFiles(),[helper],'one helper file, inside PlazCode\'s own settings folder');assert.equal(fs.statSync(helper).mode&0o777,0o600,'the helper file is readable by its owner only');
   const text=fs.readFileSync(helper,'utf8'),word=/WORD = "([0-9a-f]{64})"/.exec(text)[1];
   assert.equal((await get('/api/status')).blockbench.connected,false);assert.match((await tool({cmd:'status'})).error,/not connected/);
   assert.equal(await knock('b'.repeat(64)),false,'a wrong pairing word is refused by the real app');
   // "Load the plugin": run PlazCode's helper file the way Blockbench would, with Blockbench's objects replaced by the stand-in.
   const box=vm.createContext({WebSocket,setTimeout,clearTimeout,setInterval,clearInterval,console});
   vm.runInContext(fs.readFileSync(path.join(__dirname,'fake-blockbench.js'),'utf8'),box);
   box.Plugin={register:(id,plugin)=>{assert.equal(id,'plazcode_blockbench');box.__plugin=plugin;plugin.onload();}};
   vm.runInContext(text,box);
   try{
    await waitFor(async()=>states(await card())==='file:done load:done test:needs_you','the helper connected to the real app by itself');
    assert.deepEqual((await get('/api/status')).blockbench,{consent:true,mode:'app',connected:true});
    assert.equal((await setup({step:'test'})).ok,true);await waitFor(async()=>(await card()).state==='ready','Blockbench card ready after a real answer');
    let reply=await tool({cmd:'project_new',args:{format:'free',name:'house'}});assert.equal(reply.ok&&reply.result.project.name,'house');
    reply=await tool({cmd:'cube_add',args:{name:'door',from:[6,0,0],to:[10,8,1]}});assert.equal(reply.ok&&reply.result.name,'door');
    reply=await tool({cmd:'outline'});assert.deepEqual(reply.result.parts.map(part=>part.name),['door']);
    assert.equal(vm.runInContext('Cube.all.length+":"+Project.name',box),'1:house','the change happened in "Blockbench"');
    reply=await tool({cmd:'cube_add',args:{name:'x',group:'nowhere'}});assert(!reply.ok&&/no part named "nowhere"/.test(reply.error),JSON.stringify(reply));
    reply=await tool({cmd:'read_file',args:{path:'/etc/passwd'}});assert(!reply.ok&&/no action named/.test(reply.error),'the helper has named actions only');
    reply=await tool({cmd:'Run Code!'});assert(!reply.ok&&/not a Blockbench action/.test(reply.error),'the app refuses odd action names itself');
    assert(!JSON.stringify([await card(),await get('/api/status'),await get('/api/connections')]).includes(word),'the pairing word never leaves the app in a report');
    // The real page draws what the app reports: open Blockbench's window (it asks the app every two seconds).
    await page.locator('#cnApps [data-cn-open="blockbench"]').click();
    await waitFor(async()=>(await page.locator('#cnWin [data-step]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-step')+':'+node.getAttribute('data-state')).join(' ')))==='file:done load:done test:done','the real page shows every Blockbench step ticked');
    assert.equal(await page.locator('#cnWin [data-cn-mode][aria-pressed="true"]').innerText(),'The Blockbench app');assert(!/[0-9a-f]{64}/.test(await page.locator('#cnWin').innerText()),'no pairing word on the real page');
    await page.locator('#cnWin [data-cn-act="close"]').first().click();
    // Disconnect: the file is taken away, the helper is cut off at once, and its old word never works again.
    assert.equal((await setup({disconnect:true})).ok,true);
    await waitFor(()=>!fs.existsSync(helper),'helper file removed on Disconnect');
    await waitFor(async()=>(await get('/api/status')).blockbench.connected===false,'helper cut off on Disconnect');
    assert.equal((await card()).state,'not_set_up');assert.equal(await knock(word),false,'the old pairing word is dead after Disconnect');
    assert.equal((await setup({consent:true,mode:'app'})).ok,true);await waitFor(()=>fs.existsSync(helper),'a new helper file after a new Allow');
    assert.notEqual(/WORD = "([0-9a-f]{64})"/.exec(fs.readFileSync(helper,'utf8'))[1],word,'a new Allow makes a new pairing word');assert.equal(await knock(word),false);
    console.log('Blockbench app way against the real app: Allow, helper file, pairing, real actions through the helper connection, Disconnect kills the word (stand-in Blockbench)');
   }finally{box.__plugin&&box.__plugin.onunload();}
   // Left allowed on purpose: the sign-out check at the end must cut helpers off and sign-in must bring the word back.
   globalThis.__blockbenchLeft={headers,file:helperFiles()[0],knock};
  }
  // Figma: the real PlazCode app, its real helper connection and its real helper files. The files run in a real browser page
  // the way Figma runs a plugin (code.js beside a sandboxed window frame whose origin is "null"), with Figma's own objects
  // replaced by a stand-in (release-tools/fake-figma.js). This proves PlazCode's side end to end and nothing about a real Figma.
  {
   const first=await (await fetch('http://127.0.0.1:3000/api/status',{headers:{Authorization:'Bearer '+key}})).json();
   const headers={Authorization:'Bearer '+key,'Content-Type':'application/json',Origin:'http://127.0.0.1:3000',...(first.profile&&first.profile.epoch?{'X-PlazCode-Profile':first.profile.epoch}:{})};
   const get=async route=>(await fetch('http://127.0.0.1:3000'+route,{headers})).json(),post=async(route,body)=>(await fetch('http://127.0.0.1:3000'+route,{method:'POST',headers,body:JSON.stringify(body)})).json();
   const card=async()=>(await get('/api/connections')).apps.find(app=>app.id==='figma');
   const setup=body=>post('/api/connections/setup',{id:'figma',...body}),states=app=>app.steps.map(step=>step.id+':'+step.state).join(' '),tool=body=>post('/api/figma',body);
   const helperFolders=()=>fs.readdirSync(config,{recursive:true}).map(String).filter(name=>/helpers[\\/]figma$/.test(name)).map(name=>path.join(config,name));
   const knock=word=>new Promise(resolve=>{const socket=new WebSocket('ws://127.0.0.1:3000/helper');let paired=false;socket.onopen=()=>socket.send(JSON.stringify({hello:1,app:'figma',word}));socket.onmessage=event=>{if(String(event.data).includes('"paired":true')){paired=true;socket.close();}};socket.onclose=()=>resolve(paired);socket.onerror=()=>{};});
   let fg=await card();assert.equal(fg.state+' '+states(fg),'not_set_up file:waiting start:waiting test:waiting','Figma before Allow: nothing started');
   assert.deepEqual(helperFolders(),[],'no Figma helper folder before Allow');assert.equal(await knock('a'.repeat(64)),false,'the helper address lets no Figma helper in before Allow');
   assert.deepEqual((await get('/api/status')).figma,{consent:false,connected:false});assert.match((await tool({cmd:'status'})).error,/not connected yet/,'no Figma action before Allow');
   assert.equal((await setup({step:'start'})).ok,false,'nothing but Allow works first');assert.deepEqual(helperFolders(),[]);
   assert.equal((await setup({consent:true})).ok,true);
   await waitFor(async()=>states(await card())==='file:done start:needs_you test:waiting','Figma helper made after Allow');
   fg=await card();const manifestFile=fg.steps[0].detail,folder=path.dirname(manifestFile);
   assert.deepEqual(helperFolders(),[folder],'one helper folder, inside PlazCode\'s own settings folder');assert.deepEqual(fs.readdirSync(folder).sort(),['code.js','manifest.json','ui.html']);
   assert.equal(fg.steps[1].copy,manifestFile,'the card shows the file to pick in Figma');assert.match(fg.steps[1].hint,/Import plugin from manifest/);
   assert.equal(fs.statSync(path.join(folder,'ui.html')).mode&0o777,0o600,'the file with the pairing word is readable by its owner only');
   const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));assert.deepEqual(manifest.networkAccess.devAllowedDomains,['ws://localhost:3000']);assert.deepEqual(manifest.networkAccess.allowedDomains,['none']);
   const ui=fs.readFileSync(path.join(folder,'ui.html'),'utf8'),code=fs.readFileSync(path.join(folder,'code.js'),'utf8'),word=/WORD = "([0-9a-f]{64})"/.exec(ui)[1];
   assert(!code.includes(word)&&!JSON.stringify(manifest).includes(word),'the pairing word is in the helper\'s window file only');
   assert.match((await tool({cmd:'status'})).error,/Figma is not connected/);assert.equal(await knock('b'.repeat(64)),false,'a wrong pairing word is refused by the real app');
   // "Run the plugin": Figma's objects are the stand-in, everything else is PlazCode's real files in a real browser.
   // Chrome itself now stops a page that is not on this computer from reaching this computer's own addresses unless it is
   // given leave ("local network access"). Figma documents that a development plugin may reach localhost when its manifest
   // lists it (devAllowedDomains); whether the Figma desktop app really lets the helper's window through is NOT verified
   // here. For this stand-in page that browser check is switched off, in a browser of its own.
   const figBrowser=await chromium.launch({headless:true,...(process.env.PLAZCODE_CHROMIUM?{executablePath:process.env.PLAZCODE_CHROMIUM}:{}),args:['--no-sandbox','--disable-features=LocalNetworkAccessChecks']});
   const fig=await figBrowser.newPage(),figErrors=[];fig.on('pageerror',error=>figErrors.push(String(error)));
   try{
    await fig.goto('about:blank');await fig.addScriptTag({content:fs.readFileSync(path.join(__dirname,'fake-figma.js'),'utf8')});
    await fig.evaluate(html=>{window.__html__=html;},ui);await fig.addScriptTag({content:code});
    await waitFor(async()=>states(await card())==='file:done start:done test:needs_you','the Figma helper connected to the real app by itself');
    assert.deepEqual((await get('/api/status')).figma,{consent:true,connected:true});
    assert.equal(await fig.frameLocator('#plazcode-figma-ui').locator('#state').innerText(),'Connected to PlazCode','the helper\'s window says it is connected');
    assert.equal(await fig.evaluate(()=>document.getElementById('plazcode-figma-ui').getAttribute('sandbox')),'allow-scripts','the window frame has no origin of its own, as in Figma');
    assert.equal((await setup({step:'test'})).ok,true);await waitFor(async()=>(await card()).state==='ready','Figma card ready after a real answer');
    let reply=await tool({cmd:'status'});assert.equal(reply.ok&&reply.result.file,'Shop app designs',JSON.stringify(reply));
    reply=await tool({cmd:'frame_add',args:{name:'Card',width:320,height:200,fill:'#ff8800',direction:'column',gap:12,padding:24}});assert.equal(reply.ok&&reply.result.name,'Card',JSON.stringify(reply));
    reply=await tool({cmd:'text_add',args:{text:'Summer sale',parent:'Card',font_size:28}});assert.equal(reply.ok&&reply.result.text,'Summer sale',JSON.stringify(reply));
    reply=await tool({cmd:'outline'});assert.deepEqual(reply.result.children.map(part=>part.name+'>'+part.children.map(inner=>inner.name).join(',')),['Card>Summer sale']);
    assert.equal(await fig.evaluate(()=>figma.currentPage.children.map(node=>node.name+':'+node.width+':'+node.layoutMode+':'+node.children.length).join()),'Card:320:VERTICAL:1','the change happened in "Figma"');
    reply=await tool({cmd:'export',args:{target:'Card',scale:2}});assert(reply.ok&&/^data:image\/png;base64,iVBORw0KGgo/.test(reply.result.image),'a picture comes back through the helper connection');
    reply=await tool({cmd:'frame_add',args:{parent:'nowhere'}});assert(!reply.ok&&/Nothing on this page is named "nowhere"/.test(reply.error),JSON.stringify(reply));
    reply=await tool({cmd:'read_file',args:{path:'/etc/passwd'}});assert(!reply.ok&&/does not know the action/.test(reply.error),'the helper has named actions only');
    reply=await tool({cmd:'Run Code!'});assert(!reply.ok&&/not a Figma action/.test(reply.error),'the app refuses odd action names itself');
    assert(!JSON.stringify([await card(),await get('/api/status'),await get('/api/connections')]).includes(word),'the pairing word never leaves the app in a report');
    // The real page draws what the app reports.
    await page.locator('#cnApps [data-cn-open="figma"]').click();
    await waitFor(async()=>(await page.locator('#cnWin [data-step]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-step')+':'+node.getAttribute('data-state')).join(' ')))==='file:done start:done test:done','the real page shows every Figma step ticked');
    assert.equal(await page.locator('#cnWin [data-cn-mode]').count(),0,'Figma has one way, so no way switch is shown');assert(!/[0-9a-f]{64}/.test(await page.locator('#cnWin').innerText()),'no pairing word on the real page');
    await page.locator('#cnWin [data-cn-act="close"]').first().click();
    // Disconnect: the files are taken away, the helper is cut off at once, and its old word never works again.
    assert.equal((await setup({disconnect:true})).ok,true);
    await waitFor(()=>!fs.existsSync(folder),'Figma helper folder removed on Disconnect');
    await waitFor(async()=>(await get('/api/status')).figma.connected===false,'Figma helper cut off on Disconnect');
    await waitFor(async()=>(await fig.frameLocator('#plazcode-figma-ui').locator('#state').innerText())!=='Connected to PlazCode','the helper\'s window stops saying it is connected');
    assert.equal((await card()).state,'not_set_up');assert.equal(await knock(word),false,'the old Figma pairing word is dead after Disconnect');
    assert.equal((await setup({consent:true})).ok,true);await waitFor(()=>fs.existsSync(path.join(folder,'ui.html')),'new helper files after a new Allow');
    assert.notEqual(/WORD = "([0-9a-f]{64})"/.exec(fs.readFileSync(path.join(folder,'ui.html'),'utf8'))[1],word,'a new Allow makes a new pairing word');assert.equal(await knock(word),false);
    assert.equal((await get('/api/status')).figma.connected,false,'the still-open old helper window cannot get back in with its old word');
    assert.equal((await setup({disconnect:true})).ok,true);await waitFor(()=>!fs.existsSync(folder),'left clean');
    assert.deepEqual(figErrors,[],'no errors in the helper page: '+figErrors.join(' | '));
    console.log('Figma against the real app: Allow, helper files, pairing from a sandboxed window frame, real actions and a picture through the helper connection, Disconnect kills the word (stand-in Figma)');
   }finally{await figBrowser.close();}
  }
  assert.equal((await call('/api/show',{})).status,200);await waitFor(()=>launch().length===2,'relaunch shows real Linux desktop');
  assert.notEqual(launch()[1],url,'every launch uses a fresh ticket');
  if(process.env.PLAZCODE_UI_PREVIEW_DIR&&!profileGate){fs.mkdirSync(process.env.PLAZCODE_UI_PREVIEW_DIR,{recursive:true});await page.evaluate(()=>{document.querySelector('#desktopApprovalMode').closest('details').open=true;});await page.locator('#desktopApprovalMode').locator('xpath=..').locator('.pc-effort-trigger').click();await page.screenshot({path:path.join(process.env.PLAZCODE_UI_PREVIEW_DIR,'plazcode-linux-native-settings.png')});}
  assert.deepEqual(errors,[]);
  {
   // 1.24.33 (owner: PlazCode on macOS 10.15 Catalina): the same running app as Catalina's Safari 15.6 would draw it,
   // with no color-mix() and no crypto.randomUUID. Each page must keep every background and every text it has normally.
   const pretendOld=()=>{const real=CSS.supports.bind(CSS);CSS.supports=function(a,b){return String(b===undefined?a:b).includes('color-mix')?false:real(a,b);};Object.defineProperty(Crypto.prototype,'randomUUID',{value:undefined,configurable:true,writable:true});};
   const survey=()=>{const out={};const alpha=c=>{const m=c.match(/rgba?\(([^)]*)\)/);if(!m)return 1;const p=m[1].split(/[ ,/]+/).filter(Boolean);return p.length>3?parseFloat(p[3]):1;};
    for(const e of document.querySelectorAll('.app *')){if(!e.getClientRects().length)continue;let key=[],n=e;while(n&&n!==document.body){key.unshift(n.id?'#'+n.id:n.tagName+(n.classList.length?'.'+[...n.classList].sort().join('.'):''));if(n.id)break;n=n.parentElement;}
     const s=getComputedStyle(e);out[key.join('>')]={bg:alpha(s.backgroundColor),ink:e.textContent.trim()&&!e.children.length?alpha(s.color):1};}return out;};
   const views=['home','settings','mcp','skills','toolkit','appearance','updates','templates','explorer','guides'];
   const look=async(p,view)=>{await p.evaluate(v=>PlazCodeDesktop.go(v),view);await p.waitForTimeout(400);return p.evaluate(survey);};
   const oldContext=await browser.newContext({viewport:{width:1440,height:1000},storageState:await page.context().storageState()}),old=await oldContext.newPage(),oldErrors=[];old.on('pageerror',error=>oldErrors.push(error.message));
   const boot=await page.evaluate(()=>sessionStorage.getItem('plazcode-linux-desktop'));assert(boot,'the signed-in window keeps its session');
   await old.addInitScript(pretendOld);await old.addInitScript(value=>sessionStorage.setItem('plazcode-linux-desktop',value),boot);await old.goto('http://127.0.0.1:3000/desktop-ui');await old.locator('#nxSplash').waitFor({state:'hidden',timeout:30000});
   await old.waitForFunction(()=>typeof PlazCodeDesktop==='object'&&!document.querySelector('.app').inert,null,{timeout:30000});
   assert.equal(await old.evaluate(()=>typeof window.__plazcodeColorMixFallback),'function','the old-engine path is active');
   assert.equal(await old.evaluate(()=>[...document.querySelectorAll('style')].some(s=>s.textContent.includes('color-mix('))),false,'no color-mix() left for the old engine');
   let compared=0;const lost=[];
   for(const view of views){const normal=await look(page,view),before=await look(old,view);
    for(const [key,a] of Object.entries(normal)){const b=before[key];if(!b)continue;compared++;if(a.bg>0.5&&b.bg===0)lost.push(view+': background '+key);if(a.ink>0.3&&b.ink<0.3)lost.push(view+': text '+key);}
    if(process.env.PLAZCODE_SHOTS&&['home','mcp','settings'].includes(view)){fs.mkdirSync(process.env.PLAZCODE_SHOTS,{recursive:true});await old.screenshot({path:path.join(process.env.PLAZCODE_SHOTS,'old-safari-'+view+'.png')});}}
   assert.deepEqual(lost,[],'without color-mix nothing loses its background or text');
   assert.deepEqual(oldErrors,[],'no script errors on the old engine: '+oldErrors.join(' | '));
   assert.equal(await old.locator('#cnApps .cn-logo').count(),6,'the old engine shows the six app tiles too');
   await oldContext.close();
   console.log('Old Safari (macOS 10.15): '+views.length+' pages, '+compared+' drawn parts compared, every background and text kept, no script errors');
  }
  const menuFile=path.join(home,'.local/share/applications/plazcode.desktop'),loginFile=path.join(config,'autostart/plazcode.desktop');
  // Requests from here on carry the signed-in profile's value, as the page's own requests do.
  const signedIn=async()=>{const epoch=((await (await fetch('http://127.0.0.1:3000/api/status',{headers:{Authorization:'Bearer '+key}})).json()).profile||{}).epoch;return {Authorization:'Bearer '+key,'Content-Type':'application/json',Origin:'http://127.0.0.1:3000',...(epoch?{'X-PlazCode-Profile':epoch}:{})};};
  const setup=async body=>fetch('http://127.0.0.1:3000/api/connections/setup',{method:'POST',headers:await signedIn(),body:JSON.stringify(body)});
  {
   // 1.24.33 (Linux rework): the two "Get started" cards against the real app, clicked through the real page.
   // The real extension connected earlier in this test (Blockbench), so the browser card is already done: it stays
   // Ready from then on. Its steps are driven through the app's own setup route; the page shows them.
   // 1.24.33: Linux checks for updates now. Until the first Linux release is published its feed does not exist,
   // which is reported as "no update", never as an update error over the page.
   const updates=await(await fetch('http://127.0.0.1:3000/api/desktop/update',{headers:await signedIn()})).json();
   assert(!updates.error,'no update error on Linux: '+JSON.stringify(updates).slice(0,300));
   assert.equal(await page.locator('#updateOverlay').isVisible(),false,'no update window over the page');
   const report=async()=>{const all=await(await fetch('http://127.0.0.1:3000/api/connections',{headers:await signedIn()})).json();if(!all.apps)throw new Error('connections reply: '+JSON.stringify(all).slice(0,300));return all.apps;};
   const card=async id=>(await report()).find(app=>app.id===id);
   assert.equal((await card('browser')).group,'start');
   assert.equal((await card('computer')).state,'setting_up');
   await page.evaluate(()=>PlazCodeDesktop.go('home'));
   await page.locator('#homeSetup:not([hidden]) [data-home-setup="computer"]').waitFor({timeout:30000});
   assert.equal(await page.locator('#homeSetup [data-home-setup="browser"]').count(),(await card('browser')).state==='ready'?0:1,'the reminder lists only what is not finished');
   const win=page.locator('#cnWin');
   assert.equal((await setup({id:'browser',step:'pick',value:'chrome'})).status,200);
   assert.equal((await setup({id:'browser',step:'open'})).status,200);
   await waitFor(()=>fs.existsSync(launches+'.pages')&&fs.readFileSync(launches+'.pages','utf8').includes('chrome://extensions'),'PlazCode opens Chrome on its extensions page');
   const browser=await card('browser'),steps=Object.fromEntries(browser.steps.map(step=>[step.id,step]));
   assert.equal(steps.pick.detail,'Google Chrome');assert.equal(steps.pick.choices[0].label,'Google Chrome','the stand-in Chrome is found on this computer');
   if(browser.state!=='ready'){assert.equal(steps.load.copy,path.join(install,'PlazCode-Extension'));assert.match(steps.load.hint,/Ctrl\+L/);}
   if(process.env.PLAZCODE_SHOTS){await page.waitForTimeout(900);await shot('2-home-reminder');}
   await page.locator('#homeSetup [data-home-setup="computer"]').click();
   await win.locator('[data-step="where"]').waitFor();
   if(process.env.PLAZCODE_SHOTS){await page.waitForTimeout(900);await shot('3-this-computer-window');}
   assert.equal(await page.locator('#cnStart .cn-tile').count(),2,'Get started: the browser extension and PlazCode on this computer');
   await win.locator('[data-cn-act="close"]').first().click();
   await page.locator('#cnStart [data-cn-open="browser"]').click();
   await win.locator('[data-step="pick"]').waitFor();
   assert.equal(await win.locator('[data-cn-act="disconnect"]').count(),0,'the browser card has no Disconnect');
   assert.equal(await win.locator('[data-cn-act="test"]').count(),0,'nor Test again');
   if(process.env.PLAZCODE_SHOTS){await page.waitForTimeout(900);await shot('4-browser-window');}
   await win.locator('[data-cn-act="close"]').first().click();
   await page.locator('#cnStart [data-cn-open="computer"]').click();
   await win.locator('[data-step="where"][data-state="needs_you"] [data-cn-pick="move"]').waitFor();
   await win.locator('[data-step="menu"] [data-cn-act="menu"]').click();
   await waitFor(()=>fs.existsSync(menuFile),'Add to app menu writes the menu entry');
   assert(fs.readFileSync(menuFile,'utf8').includes('Exec="'+path.join(install,'PlazCode')+'"'),'the menu entry starts this PlazCode');
   assert(fs.existsSync(path.join(home,'.local/share/icons/hicolor/128x128/apps/plazcode.png')),'with its icon');
   await win.locator('[data-cn-pick="keep"]').click();
   await page.locator('#cnStart [data-app="computer"][data-state="ready"]').waitFor();
   await win.locator('[data-cn-switch="login"][aria-checked="false"]').click();
   await waitFor(()=>fs.existsSync(loginFile),'Start when I log in');
   assert.match(fs.readFileSync(loginFile,'utf8'),/--background/);
   await win.locator('[data-cn-switch="login"][aria-checked="true"]').waitFor();
   await win.locator('[data-cn-act="disconnect"]').click();
   await waitFor(()=>!fs.existsSync(menuFile)&&!fs.existsSync(loginFile),'Remove from app menu takes both entries out');
   assert(fs.existsSync(path.join(install,'PlazCode')),'and keeps the program');
   await win.locator('[data-cn-act="close"]').first().click();
   // Roblox Studio on Linux (experimental): the Studio tile opens a Vinegar checklist. No Vinegar here first, then a
   // stand-in Vinegar folder with Studio and Roblox's helper in it (nothing is run from it in this test).
   await page.locator('#cnApps [data-cn-open="studio"]').click();
   await win.locator('[data-step="vinegar"][data-state="needs_you"]').waitFor();
   assert.match(await win.locator('.cn-lead').textContent(),/^Experimental/);
   {const before=launch().length;await win.locator('[data-step="vinegar"] [data-cn-ipc="get-vinegar"]').click();await waitFor(()=>launch().length===before+1,'Get Vinegar opens its page');assert.equal(launch()[before],'https://vinegarhq.org/');}
   const studioFolder=path.join(home,'.var/app/org.vinegarhq.Vinegar/data/vinegar/versions/version-test');fs.mkdirSync(studioFolder,{recursive:true});
   for(const name of['StudioMCP.exe','RobloxStudioBeta.exe'])fs.writeFileSync(path.join(studioFolder,name),'MZ stand-in');
   await win.locator('[data-step="studio"][data-state="done"]').waitFor({timeout:15000});
   await win.locator('[data-step="mcp"][data-state="needs_you"]').waitFor();
   assert.match(await win.locator('.cn-tech pre').textContent(),/^flatpak run --command=.*kombucha\/bin\/wine --env=WINEPREFIX=.*prefixes\/studio org\.vinegarhq\.Vinegar .*StudioMCP\.exe$/);
   if(process.env.PLAZCODE_SHOTS){await page.waitForTimeout(900);await shot('5-studio-vinegar');}
   await win.locator('[data-cn-act="close"]').first().click();
   fs.rmSync(path.join(home,'.var'),{recursive:true,force:true});
   console.log('Get started against the real app: Home reminder, browser picked and its extensions page opened, folder and paste tip shown, app menu entry with icon, start at login, removed again; Roblox Studio through Vinegar (experimental): Get Vinegar, Studio found, MCP step, start command');
  }
  assert.equal((await call('/api/desktop/browser-action',{message:'open-url:javascript:alert(1)'})).status,400,'unsafe external URI rejected');
  {const before=launch().length;assert.equal((await call('/api/desktop/browser-action',{message:'open:get-godot'})).status,200);await waitFor(()=>launch().length===before+1,'official download page opens');assert.equal(launch()[before],'https://godotengine.org/download/');assert.equal((await call('/api/desktop/browser-action',{message:'open:get-anything'})).status,400,'only listed download pages open');}
  {
   // 1.24.34 control rework, desktop control state (switched off in release builds; PLAZCODE_CONTROL_V2=1 in a development build switches it on).
   const left=globalThis.__blockbenchLeft,headers=left?left.headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',Origin:'http://127.0.0.1:3000'};
   const status=async()=>(await (await fetch('http://127.0.0.1:3000/api/status',{headers})).json()).desktop_control;
   const control=async body=>(await (await fetch('http://127.0.0.1:3000/api/desktop/control',{method:'POST',headers,body:JSON.stringify(body)})).json());
   assert.equal((await fetch('http://127.0.0.1:3000/api/desktop/frame',{})).status,401,'the desktop picture needs the pairing key');
   if(process.env.PLAZCODE_CONTROL_V2==='1'){
    assert.deepEqual(await status(),{active:false,paused:false,stopped:false,accent:'',sharing:false});
    assert.equal((await control({action:'share'})).control.sharing,true,'whole-screen sharing for Ask PlazCode');
    assert.equal((await control({action:'unshare'})).control.sharing,false);
    assert.equal((await fetch('http://127.0.0.1:3000/api/desktop/frame',{headers})).status,204,'no picture while PlazCode is not controlling the desktop');
    assert.equal((await control({accent:'#16a34a'})).control.accent,'#16a34a');
    assert.equal((await control({action:'stop'})).control.stopped,true);
    assert.equal((await control({action:'explode'})).ok,false);
    assert.equal((await control({action:'resume'})).ok,true);
    console.log('Desktop control state (switched on for this run): status, colour, Stop, refusals, no picture while idle');
   }else{
    assert.equal(await status(),null,'desktop control is absent while the rework is switched off');
    assert.match((await control({action:'stop'})).error,/Not available/);
   }
  }
  if(profileGate&&globalThis.__blockbenchLeft){
   // Each profile has its own Blockbench choices. Signed out, the app accepts no helper at all; signed in again, the same helper file works.
   const {headers,file,knock}=globalThis.__blockbenchLeft,word=/WORD = "([0-9a-f]{64})"/.exec(fs.readFileSync(file,'utf8'))[1];
   const profiles=async body=>fetch('http://127.0.0.1:3000/api/desktop/profiles',{method:'POST',headers,body:JSON.stringify(body)});
   assert.equal(await knock(word),true,'the helper file\'s word works while its profile is signed in');
   assert.equal((await profiles({action:'logout'})).status,200,'sign out');
   assert.equal(await knock(word),false,'a signed-out PlazCode accepts no helper');
   assert.equal((await profiles({action:'guest'})).status,200,'sign in again');
   await waitFor(()=>knock(word),'the same helper file works again after signing in');
   console.log('Blockbench follows the signed-in profile: no helper while signed out, same helper file after signing in again');
  }
  {
   // 1.24.33 (Linux rework): Move to my home folder. The copy is checked, added to the app menu and started; it waits
   // for this PlazCode to close and then opens its own window. Quit then closes the copy.
   const before=launch().length;
   const moved=await setup({id:'computer',step:'where',value:'move'}),body=await moved.json();
   assert.equal(moved.status,200,JSON.stringify(body));assert.match(body.notice,/home folder/);
   await waitFor(()=>agent.exitCode!==null,'the PlazCode that was moved closes');assert.equal(agent.exitCode,0);
   await waitFor(()=>launch().length===before+1,'the PlazCode in the home folder opens its own window');
   const homeProgram=path.join(home,'PlazCode','PlazCode');
   assert(fs.existsSync(homeProgram)&&fs.existsSync(path.join(home,'PlazCode','plazcode-settings.json')),'program and settings are in ~/PlazCode');
   assert(fs.readFileSync(menuFile,'utf8').includes('Exec="'+homeProgram+'"'),'the app menu starts the home copy');
   assert.equal((await call('/api/desktop/browser-action',{message:'quit'})).status,200);
   await waitFor(async()=>{try{await fetch('http://127.0.0.1:3000/desktop-start');return false;}catch{return true;}},'Quit closes the home copy');
   console.log('Move to the home folder against the real app: copied with settings, checked, app menu updated, reopened from ~/PlazCode, Quit');
  }
  console.log('PASS real Linux desktop launch, authenticated single-use browser bootstrap, wrong-origin/replay rejection, profile gate incl. locked app connections (or legacy settings save/reload), Apps & servers page against the real app (Godot: Allow, refused folder, picked project, Disconnect; Blender in the background when a real Blender is named), official download page, reopen and Quit.');
 }finally{try{require('node:child_process').execFileSync('pkill',['-f',path.join(home,'PlazCode','PlazCode')]);}catch{}if(browser)await browser.close();if(agent.exitCode===null){agent.kill('SIGTERM');await new Promise(resolve=>agent.once('exit',resolve));}fs.closeSync(log);fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
