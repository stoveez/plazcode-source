// SPDX-License-Identifier: GPL-3.0-or-later
// Offline Chromium/Firefox: sanitized public DOM captured 2026-10-16.
// Host events are simulated. Public captures do NOT cover signed-in fresh chats.
// NODE_PATH=<playwright modules> PLAZCODE_SOURCE=<complete source> node this-file
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {fixture,attempt,launch}=require('./test-vani-browser.cjs');
const fixtureDir=path.join(__dirname,'fixtures','vani-public');
const captured=fs.readFileSync(path.join(fixtureDir,'pending.html'),'utf8');
const hostCSS=fs.readFileSync(path.join(fixtureDir,'host.css'),'utf8');
async function run(browserName){const browser=await launch(browserName);let passes=0;
async function test(name,options,fn){if(process.env.PLAZCODE_TEST_FILTER&&!name.includes(process.env.PLAZCODE_TEST_FILTER))return;const f=await fixture(browser,{autoReply:false,...options});try{await fn(f.page);assert.deepEqual(f.errors,[]);console.log('PASS '+browserName+' '+name);passes++;}finally{await f.page.close();}}
try{
await test('actual captured public pending structure and masked identity',{},async page=>{
 await page.addStyleTag({content:hostCSS});
 const r=await page.evaluate(captured=>{
  const parsed=new DOMParser().parseFromString(captured,'text/html');
  parsed.querySelectorAll('script,link,iframe,img,video,audio,source').forEach(n=>n.remove());
  document.querySelector('#turns').replaceChildren(...Array.from(parsed.querySelectorAll('[data-turn-id]')));
  document.querySelector('#chat-form').replaceWith(parsed.querySelector('main form'));
  const style=document.createElement('style');style.textContent='.rs-hidden > *:not(.rs-chip){display:none!important}.rs-tool-hide,.rs-code-hide{display:none!important}';document.head.append(style);
  const user=provider.allItems().find(provider.isUserItem),assistant=provider.lastAssistant();
  const key=provider.itemKey(user);user.classList.add('rs-hidden');
  return {text:provider.itemText(user),keyStable:provider.itemKey(user)===key,users:provider.userCount(),assistants:provider.assistantCount(),busy:provider.isHardGenerating(),thinking:provider.itemText(assistant),editor:provider.getEditor()?.id};
 },captured);
 assert.deepEqual(r,{text:'Reply with exactly: VANI_TRANSPORT_OK',keyStable:true,users:1,assistants:1,busy:true,thinking:'',editor:'public-composer'});
});
await test('captured public row receipt remains exact under synchronous own mask',{},async page=>{
 await page.addStyleTag({content:hostCSS});
 await page.evaluate(captured=>{
  const style=document.createElement('style');style.textContent='.rs-hidden > *:not(.rs-chip){display:none!important}';document.head.append(style);
  window.addItem=(role,text,id='actual-'+ ++seq)=>{const template=document.createElement('template');template.innerHTML=captured;const row=template.content.querySelector('[data-turn-id="pub-1"]');row.dataset.turnId=id;row.querySelector('.rounded-br-md').textContent=text;document.querySelector('#turns').append(row);row.classList.add('rs-hidden');return row;};
 },captured);
 const r=await attempt(page,'Exact startup-like message\nUnicode 🧪');assert.equal(r.ok,true,r.error);assert.equal(r.clicks,1);
});
await test('unchanged baseline advisory alert does not veto exact receipt',{},async page=>{
 await page.evaluate(()=>{const a=document.createElement('div');a.role='alert';a.textContent='You are using the free model';document.querySelector('main').append(a);});
 const r=await attempt(page,'Baseline advisory');assert.equal(r.ok,true,r.error);assert.equal(r.clicks,1);
});
for(const changed of [false,true])await test((changed?'changed baseline':'new')+' native failure alert vetoes receipt',{},async page=>{
 await page.evaluate(changed=>{fastClock();let a;if(changed){a=document.createElement('div');a.role='alert';a.textContent='You are using the free model';document.querySelector('main').append(a);}document.querySelector('#native-send').addEventListener('click',()=>{if(!a){a=document.createElement('div');a.role='alert';document.querySelector('main').append(a);}a.textContent='Message failed to send';},true);},changed);
 const r=await attempt(page,'Fail closed alert');assert.equal(r.ok,false);assert.equal(r.ambiguous,true);assert.equal(r.clicks,1);
});
await test('new failed user row cannot confirm even beside baseline advisory',{failedReceipt:true},async page=>{
 await page.evaluate(()=>{const a=document.createElement('div');a.role='alert';a.textContent='You are using the free model';document.querySelector('main').append(a);});
 const r=await attempt(page,'Failed row');assert.equal(r.ok,false);assert.match(r.error,/marked the message as failed/);assert.equal(r.clicks,1);
});
await test('old failed user row does not veto a distinct exact new receipt',{},async page=>{
 await page.evaluate(()=>{addItem('user','An earlier failed message','old-failed').dataset.state='failed';});
 const r=await attempt(page,'Distinct new message');assert.equal(r.ok,true,r.error);assert.equal(r.clicks,1);
});
await test('hidden stale Stop neither blocks send nor receives Stop clicks',{},async page=>{
 await page.evaluate(()=>{const s=document.createElement('button');s.ariaLabel='Stop generating';s.hidden=true;s.onclick=()=>{throw Error('Hidden Stop clicked');};document.querySelector('#chat-form').prepend(s);});
 assert.equal(await page.evaluate(()=>provider.isHardGenerating()),false);
 const r=await attempt(page,'Visible Send only');assert.equal(r.ok,true,r.error);assert.equal(r.clicks,1);await page.evaluate(()=>provider.stopGeneration());
});
await test('provider Stop cancels pending precommit even when core stop flag resets',{rejectInput:true},async page=>{
 const r=await page.evaluate(async()=>{const start=performance.now();const op=provider.typeAndSend(provider.startupRequest('local')).then(()=>({ok:true}),e=>({ok:false,error:e.message}));setTimeout(()=>provider.stopGeneration(),35);const result=await op;return {...result,ms:performance.now()-start,clicks:nativeClicks,draft:provider.editorText(),ambiguous:provider.sendFailureAmbiguous()};});
 assert.equal(r.ok,false);assert.match(r.error,/Stopped before/);assert(r.ms<1200,JSON.stringify(r));assert.equal(r.clicks,0);assert.equal(r.draft,'');assert.equal(r.ambiguous,false);
});
await test('provider Stop after click stays ambiguous and never replays',{noReceipt:true,stopWithoutReceipt:true},async page=>{
 const r=await page.evaluate(async()=>{const start=performance.now();const op=provider.typeAndSend('Cancel receipt wait').then(()=>({ok:true}),e=>({ok:false,error:e.message}));setTimeout(()=>provider.stopGeneration(),80);return {...await op,ms:performance.now()-start,clicks:nativeClicks,ambiguous:provider.sendFailureAmbiguous()};});
 assert.equal(r.ok,false);assert.match(r.error,/may have reached/);assert(r.ms<1200);assert.equal(r.clicks,1);assert.equal(r.ambiguous,true);
});
await test('provider Stop cancels image upload without committing',{signed:true,uploadFailure:true},async page=>{
 const r=await page.evaluate(async()=>{const start=performance.now();const op=provider.typeAndSend('Cancel upload',[{data:'AA==',mimeType:'image/png'}]).then(()=>({ok:true}),e=>({ok:false,error:e.message}));setTimeout(()=>provider.stopGeneration(),80);return {...await op,ms:performance.now()-start,clicks:nativeClicks,ambiguous:provider.sendFailureAmbiguous()};});
 assert.equal(r.ok,false);assert.match(r.error,/Stopped during Vani image upload/);assert(r.ms<1200,JSON.stringify(r));assert.equal(r.clicks,0);assert.equal(r.ambiguous,false);
});
console.log(browserName+': '+passes+' public/cancellation regressions passed');
}finally{await browser.close();}}
(async()=>{const selection=process.env.PLAZCODE_TEST_BROWSER||process.env.PLAZCODE_BROWSER||'chromium';assert(['chromium','firefox','all'].includes(selection),'PLAZCODE_TEST_BROWSER must be chromium, firefox or all');for(const browserName of selection==='all'?['chromium','firefox']:[selection])await run(browserName);})().catch(e=>{console.error(e);process.exitCode=1;});
