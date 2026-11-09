const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const {pageFor}=require('./test-clickup-browser.cjs');
const read=file=>fs.readFileSync(file,'utf8');
async function load(browser,mode){
 const {page,errors}=await pageFor(browser,false,false);
 await page.evaluate(({mode,version})=>{
  chrome.runtime.getManifest=()=>({version});window.prefStore={rsApprovalMode:mode,rsAlwaysApprove:[{tool:'write_file',at:1}]};window.prefListeners=[];
  chrome.storage.local.get=(keys,callback)=>{const data={...prefStore};if(callback)queueMicrotask(()=>callback(data));return Promise.resolve(data);};
  chrome.storage.local.set=async data=>{if(window.rejectPreferenceSave)throw Error('save rejected');const changes={};for(const [key,value]of Object.entries(data)){changes[key]={oldValue:prefStore[key],newValue:value};prefStore[key]=value;}for(const listener of prefListeners)listener(changes,'local');};
  chrome.storage.onChanged.addListener=listener=>prefListeners.push(listener);
  window.externalApprovalMode=value=>{prefStore.rsApprovalMode=value;for(const listener of prefListeners)listener({rsApprovalMode:{newValue:value}},'local');};
 },{mode,version:JSON.parse(read('manifest.json')).version});
 await page.addStyleTag({path:'overlay.css'});
 const scripts=JSON.parse(read('manifest.json')).content_scripts.find(group=>group.js.includes('providers/clickup.js')).js;
 for(const file of scripts){if(['providers/clickup.js','core/parser.js'].includes(file))continue;let code=read(file);if(file==='core/main.js')code=code.replace('const TOKEN_CHARS = 4;','window.fixture={A,runTool,requestApproval,ui};const TOKEN_CHARS = 4;');await page.addScriptTag({content:code});}
 await page.waitForSelector('#rs-approval-mode');return {page,errors};
}
async function choose(page,value){await page.locator('#rs-approval-mode').click();await page.locator('.pc-approval-menu [data-mode="'+value+'"]').click();await page.waitForFunction(value=>prefStore.rsApprovalMode===value,value);}
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.PLAZCODE_CHROMIUM?{executablePath:process.env.PLAZCODE_CHROMIUM}:{}),args:['--no-sandbox']});try{
 const {page,errors}=await load(browser,'ask');
 for(let count=0;count<2;count++){
  const call=page.evaluate(count=>fixture.runTool({tool:'write_file',arguments:{path:'approval-'+count+'.txt',content:'hello'}}),count);
  await page.waitForSelector('#rs-approve:not([hidden])');assert.equal(await page.locator('#rs-approve-all').isVisible(),false,'strict Ask cannot be skipped by saved per-tool approvals');await page.locator('#rs-approve-allow').click();await call;
 }
 await choose(page,'auto');await page.evaluate(()=>fixture.runTool({tool:'write_file',arguments:{path:'auto.txt',content:'hello'}}));assert.equal(await page.locator('#rs-approve').isVisible(),false);
 const removal=page.evaluate(()=>fixture.runTool({tool:'execute_luau',arguments:{code:'workspace.Part:Destroy()'}}));await page.waitForSelector('#rs-approve:not([hidden])');await page.locator('#rs-approve-deny').click();assert.match(await removal,/declined/);
 await choose(page,'bypass');await page.evaluate(()=>fixture.runTool({tool:'execute_luau',arguments:{code:'workspace.Part:Destroy()'}}));assert.equal(await page.locator('#rs-approve').isVisible(),false);
 assert.equal(await page.evaluate(()=>fixture.requestApproval('plan',{}, {plan:{text:'Make a scene'}})),true,'bypass also skips plan cards');
 await page.evaluate(()=>externalApprovalMode('ask'));await page.waitForFunction(()=>document.querySelector('#rs-approval-mode').textContent.includes('Ask for approval'));
 await page.evaluate(()=>rejectPreferenceSave=true);await page.locator('#rs-approval-mode').click();await page.locator('.pc-approval-menu [data-mode=bypass]').click();await page.waitForTimeout(30);assert.equal(await page.evaluate(()=>prefStore.rsApprovalMode),'ask','failed save cannot enable bypass');await page.keyboard.press('Escape');await page.evaluate(()=>rejectPreferenceSave=false);
 // Exercise actual core positioning with an ordinary composer that moves and remounts.
 await page.evaluate(()=>{
  const composer=document.createElement('div');composer.id='position-composer';composer.style.cssText='position:fixed;left:190px;bottom:40px;width:720px;height:110px;background:#191919;border-radius:28px';document.body.append(composer);
  provider.barMount=undefined;provider.barOutside=true;provider.barAnchor=()=>document.querySelector('#position-composer');
 });
 for(const width of [1120,780]){
  await page.setViewportSize({width,height:850});await page.evaluate(width=>{const c=document.querySelector('#position-composer');c.style.left=(width===1120?190:35)+'px';c.style.width=(width===1120?720:700)+'px';},width);await page.waitForTimeout(450);
  let geometry=await page.evaluate(()=>{const b=document.querySelector('#rs-bar').getBoundingClientRect(),c=document.querySelector('#position-composer').getBoundingClientRect();return {left:b.left,width:b.width,bottom:b.bottom,cLeft:c.left,cWidth:c.width,cTop:c.top};});
  assert(Math.abs(geometry.left-geometry.cLeft)<=1&&Math.abs(geometry.width-geometry.cWidth)<=1&&geometry.bottom<=geometry.cTop,JSON.stringify(geometry));
  await page.locator('#rs-hide').click();await page.waitForTimeout(250);
  for(const move of [false,true]){
   if(move)await page.evaluate(()=>{const old=document.querySelector('#position-composer'),fresh=old.cloneNode();fresh.style.bottom='110px';old.replaceWith(fresh);});await page.waitForTimeout(350);
   geometry=await page.evaluate(()=>{const b=document.querySelector('#rs-show-tab').getBoundingClientRect(),c=document.querySelector('#position-composer').getBoundingClientRect();return {bottom:b.bottom,right:b.right,cTop:c.top,cRight:c.right};});assert(geometry.bottom<geometry.cTop&&geometry.right<=geometry.cRight,JSON.stringify(geometry));
  }
  await page.locator('#rs-show-tab').click();await page.waitForTimeout(250);
 }
 if(process.env.PLAZCODE_UI_PREVIEW_DIR){fs.mkdirSync(process.env.PLAZCODE_UI_PREVIEW_DIR,{recursive:true});await page.setViewportSize({width:1120,height:850});await page.evaluate(()=>{const c=document.querySelector('#position-composer');c.style.left='190px';c.style.width='720px';c.style.bottom='40px';});await page.waitForTimeout(350);await page.locator('#rs-approval-mode').click();await page.screenshot({path:process.env.PLAZCODE_UI_PREVIEW_DIR+'/plazcode-bar-approval-menu.png'});await page.keyboard.press('Escape');await page.locator('#rs-hide').click();await page.waitForTimeout(300);await page.screenshot({path:process.env.PLAZCODE_UI_PREVIEW_DIR+'/plazcode-collapsed-alignment.png'});}
 assert.deepEqual(errors,[]);await page.close();
 const restored=await load(browser,'bypass');assert.match(await restored.page.locator('#rs-approval-mode').innerText(),/Bypass approval/);await restored.page.close();
 console.log('PASS real bar approval menus, strict edit/deletion/bypass policy, saved-mode restoration, external sync, failed-save handling and composer-relative expanded/collapsed placement across resize/remount.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
