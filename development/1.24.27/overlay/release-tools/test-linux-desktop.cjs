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
 const log=fs.openSync(path.join(temp,'agent.log'),'w');
 const agent=spawn(path.join(install,'PlazCode'),[],{cwd:install,env:{...process.env,PATH:bin+path.delimiter+process.env.PATH,LOCALAPPDATA:config,XDG_CONFIG_HOME:config,PLAZCODE_WORKSPACE_ROOT:path.join(temp,'workspace'),PLAZCODE_TEST_LAUNCHES:launches},stdio:['ignore',log,log]});
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
  await page.goto(url);await page.waitForURL('**/desktop-ui');
  const shell=await page.request.get('http://127.0.0.1:3000/desktop-ui');assert.equal(shell.headers()['x-frame-options'],'DENY');assert.equal(shell.headers()['referrer-policy'],'no-referrer');
  await page.locator('#nxSplash').waitFor({state:'hidden',timeout:30000});
  assert.equal(new URL(page.url()).hash,'');
  assert.equal((await call('/api/desktop/browser-session',{ticket},false)).status,401,'ticket cannot be reused');
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
  assert.equal((await call('/api/show',{})).status,200);await waitFor(()=>launch().length===2,'relaunch shows real Linux desktop');
  assert.notEqual(launch()[1],url,'every launch uses a fresh ticket');
  if(process.env.PLAZCODE_UI_PREVIEW_DIR){fs.mkdirSync(process.env.PLAZCODE_UI_PREVIEW_DIR,{recursive:true});await page.evaluate(()=>{document.querySelector('#desktopApprovalMode').closest('details').open=true;});await page.locator('#desktopApprovalMode').locator('xpath=..').locator('.pc-effort-trigger').click();await page.screenshot({path:path.join(process.env.PLAZCODE_UI_PREVIEW_DIR,'plazcode-linux-native-settings.png')});}
  assert.deepEqual(errors,[]);
  assert.equal((await call('/api/desktop/browser-action',{message:'open-url:javascript:alert(1)'})).status,400,'unsafe external URI rejected');
  assert.equal((await call('/api/desktop/browser-action',{message:'quit'})).status,200);
  await waitFor(()=>agent.exitCode!==null,'Quit exits actual Linux bridge');assert.equal(agent.exitCode,0);
  console.log('PASS real Linux desktop launch, authenticated single-use browser bootstrap, wrong-origin/replay rejection, settings save/reload, reopen and Quit.');
 }finally{if(browser)await browser.close();if(agent.exitCode===null){agent.kill('SIGTERM');await new Promise(resolve=>agent.once('exit',resolve));}fs.closeSync(log);fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
