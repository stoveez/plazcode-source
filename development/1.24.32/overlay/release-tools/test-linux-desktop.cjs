// Runs the real Linux binary and its actual desktop frontend, including the
// one-time browser bootstrap. Only the OS browser opener is a local fixture.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{chromium}=require('playwright');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const waitFor=async(fn,label)=>{for(let i=0;i<150;i++){if(await fn())return;await sleep(100);}throw Error('Timed out: '+label);};
(async()=>{
 if(process.platform!=='linux'){console.log('Linux desktop test runs on Linux only.');return;}
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'plazcode-linux-desktop-')),install=path.join(temp,'install'),bin=path.join(temp,'bin'),config=path.join(temp,'config'),launches=path.join(temp,'launches');
 for(const directory of[install,bin,config])fs.mkdirSync(directory);
 if(process.env.PLAZCODE_NATIVE_INSTALL_ROOT)fs.cpSync(process.env.PLAZCODE_NATIVE_INSTALL_ROOT,install,{recursive:true});
 else{fs.copyFileSync('agent/target/debug/PlazCode',path.join(install,'PlazCode'));fs.chmodSync(path.join(install,'PlazCode'),0o755);fs.cpSync('PlazCode-Extension',path.join(install,'PlazCode-Extension'),{recursive:true});}
 fs.writeFileSync(path.join(install,'plazcode-settings.json'),JSON.stringify({rsAutoUpdate:false,rsApprovalMode:'auto'}));
 fs.writeFileSync(path.join(bin,'xdg-open'),'#!/usr/bin/env python3\nimport os,sys\nwith open(os.environ["PLAZCODE_TEST_LAUNCHES"],"a") as f:f.write(sys.argv[1]+"\\n")\n',{mode:0o700});
 fs.writeFileSync(path.join(temp,'Godot_v4-stand-in'),'stand-in for the Godot editor program');
 const log=fs.openSync(path.join(temp,'agent.log'),'w');
 const agent=spawn(path.join(install,'PlazCode'),[],{cwd:install,env:{...process.env,PATH:bin+path.delimiter+process.env.PATH,LOCALAPPDATA:config,XDG_CONFIG_HOME:config,PLAZCODE_WORKSPACE_ROOT:path.join(temp,'workspace'),PLAZCODE_TEST_LAUNCHES:launches,GODOT_PATH:path.join(temp,'Godot_v4-stand-in')},stdio:['ignore',log,log]});
 let browser;
 try{
  await waitFor(()=>fs.existsSync(launches),'native Linux opens a browser');
  const launch=()=>fs.readFileSync(launches,'utf8').trim().split('\n');
  const url=launch()[0],key=fs.readFileSync(path.join(config,'PlazCode/bridge-key'),'utf8');
  assert(!url.includes(key),'permanent key must never enter launch URL');
  assert.match(url,/^http:\/\/127\.0\.0\.1:3000\/desktop-start#[a-f0-9]{64}$/);
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
  const pill=()=>page.locator('#cnApps [data-app="godot"] .cn-pill').innerText(),stepState=id=>page.locator('#cnWin [data-step="'+id+'"]').getAttribute('data-state');
  await page.locator('#cnApps [data-cn-open="godot"]').waitFor();assert.equal(await pill(),'Not set up','the real page draws the real report');
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
  assert.equal(await page.locator('#cnWin [data-step="project"] .cn-detail').innerText(),game);assert.equal(await page.locator('#cnWin .cn-alert').count(),0);
  const program=await stepState('runtime'),started=await stepState('start');assert(['working','done','needs_you'].includes(program),'the helper program is looked for once editor and project are known: '+program);assert(['waiting','working','done','needs_you'].includes(started),'start step state: '+started);assert(program==='done'||started==='waiting','the helper never starts before its program is ready: '+program+' / '+started);
  console.log('Godot on this machine after pick: helper program '+program+', helper '+started+' / '+await pill());
  await page.locator('#cnWin [data-cn-act="disconnect"]').click();await waitFor(async()=>await pill()==='Not set up','Disconnect returns to Not set up');
  await page.locator('#cnWin [data-cn-act="close"]').first().click();
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
  assert.equal((await call('/api/desktop/browser-action',{message:'open-url:javascript:alert(1)'})).status,400,'unsafe external URI rejected');
  {const before=launch().length;assert.equal((await call('/api/desktop/browser-action',{message:'open:get-godot'})).status,200);await waitFor(()=>launch().length===before+1,'official download page opens');assert.equal(launch()[before],'https://godotengine.org/download/');assert.equal((await call('/api/desktop/browser-action',{message:'open:get-anything'})).status,400,'only listed download pages open');}
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
  assert.equal((await call('/api/desktop/browser-action',{message:'quit'})).status,200);
  await waitFor(()=>agent.exitCode!==null,'Quit exits actual Linux bridge');assert.equal(agent.exitCode,0);
  console.log('PASS real Linux desktop launch, authenticated single-use browser bootstrap, wrong-origin/replay rejection, profile gate incl. locked app connections (or legacy settings save/reload), Apps & servers page against the real app (Godot: Allow, refused folder, picked project, Disconnect; Blender in the background when a real Blender is named), official download page, reopen and Quit.');
 }finally{if(browser)await browser.close();if(agent.exitCode===null){agent.kill('SIGTERM');await new Promise(resolve=>agent.once('exit',resolve));}fs.closeSync(log);fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
