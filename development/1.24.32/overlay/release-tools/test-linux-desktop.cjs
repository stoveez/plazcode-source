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
  assert.equal((await call('/api/show',{})).status,200);await waitFor(()=>launch().length===2,'relaunch shows real Linux desktop');
  assert.notEqual(launch()[1],url,'every launch uses a fresh ticket');
  if(process.env.PLAZCODE_UI_PREVIEW_DIR&&!profileGate){fs.mkdirSync(process.env.PLAZCODE_UI_PREVIEW_DIR,{recursive:true});await page.evaluate(()=>{document.querySelector('#desktopApprovalMode').closest('details').open=true;});await page.locator('#desktopApprovalMode').locator('xpath=..').locator('.pc-effort-trigger').click();await page.screenshot({path:path.join(process.env.PLAZCODE_UI_PREVIEW_DIR,'plazcode-linux-native-settings.png')});}
  assert.deepEqual(errors,[]);
  assert.equal((await call('/api/desktop/browser-action',{message:'open-url:javascript:alert(1)'})).status,400,'unsafe external URI rejected');
  {const before=launch().length;assert.equal((await call('/api/desktop/browser-action',{message:'open:get-godot'})).status,200);await waitFor(()=>launch().length===before+1,'official download page opens');assert.equal(launch()[before],'https://godotengine.org/download/');assert.equal((await call('/api/desktop/browser-action',{message:'open:get-anything'})).status,400,'only listed download pages open');}
  assert.equal((await call('/api/desktop/browser-action',{message:'quit'})).status,200);
  await waitFor(()=>agent.exitCode!==null,'Quit exits actual Linux bridge');assert.equal(agent.exitCode,0);
  console.log('PASS real Linux desktop launch, authenticated single-use browser bootstrap, wrong-origin/replay rejection, profile gate incl. locked app connections (or legacy settings save/reload), Apps & servers page against the real app (Godot: Allow, refused folder, picked project, Disconnect; Blender in the background when a real Blender is named), official download page, reopen and Quit.');
 }finally{if(browser)await browser.close();if(agent.exitCode===null){agent.kill('SIGTERM');await new Promise(resolve=>agent.once('exit',resolve));}fs.closeSync(log);fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
