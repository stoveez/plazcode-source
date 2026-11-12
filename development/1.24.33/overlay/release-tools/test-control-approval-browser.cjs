// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// 1.24.34 control rework, step 2, AI-tab side (real PlazCode AI-tab code in Chromium, shared fixture, fake worker):
// the fixed always-ask list asks the person even in "Always approve" mode, a "no" sends nothing more, a "yes" sends
// the same command once more with the person's confirmation, and the AI cannot set that confirmation itself.
const fs=require('fs'),assert=require('node:assert/strict'),{createRequire}=require('module');
const source=process.cwd(),requireFrom=createRequire(source+'/release-tools/package.json');
const {chromium}=requireFrom('playwright'),fixturePath=source+'/release-tools/test-approval-modes-browser.cjs',req=createRequire(fixturePath);
const script=fs.readFileSync(fixturePath,'utf8'),prefix=script.slice(0,script.indexOf('\n(async()=>'));
const {load}=new Function('require',prefix+';return {load};')(req);
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 const {page,errors}=await load(browser,'bypass');
 await page.evaluate(()=>{
  window.__rsEngine=()=>'local';window.sentTab=[];
  const old=chrome.runtime.sendMessage;
  chrome.runtime.sendMessage=(msg,cb)=>{if(!/^tab_/.test(msg.type))return old(msg,cb);sentTab.push(msg);
   const v=msg.type==='tab_click_at'&&!msg.confirmed?{ok:false,confirm:'PlazCode wants to press "Buy now" in "Shop".'}:msg.type==='tab_screenshot'?{ok:true,text:'Picture.',images:[{mimeType:'image/jpeg',data:'AAAA'}]}:{ok:true,text:'Clicked at (1, 2).'};
   if(cb)queueMicrotask(()=>cb(v));return Promise.resolve(v);};
 });
 const call=(tool,args)=>page.evaluate(({tool,args})=>{fixture.A.bridge={...(fixture.A.bridge||{}),connected:true,local_connected:true,control_v2:true};return fixture.runTool({tool,arguments:args});},{tool,args}).catch(e=>'PAGE CLOSED '+e.message);
 // Switched off in the worker: the commands do not exist.
 let off=await page.evaluate(()=>{fixture.A.bridge={connected:true,local_connected:true,control_v2:undefined};return fixture.runTool({tool:'tab_click_at',arguments:{x:1,y:2}});});
 assert.match(off,/unknown command/);
 // Always approve is on, yet the Buy click asks. Say no: nothing more is sent.
 let pending=call('tab_click_at',{x:1,y:2,confirmed:true});
 await page.waitForSelector('#rs-approve:not([hidden])');
 assert.match(await page.innerText('#rs-approve'),/PlazCode always asks for this[\s\S]*Buy now/i);
 await page.locator('#rs-approve-deny').click();
 assert.match(await pending,/did not allow it, so nothing was done/);
 let sent=await page.evaluate(()=>sentTab.splice(0));
 assert.equal(sent.length,1);assert.equal(sent[0].confirmed,false,'the AI\'s own "confirmed" is never passed on');
 // Say yes: sent once more, now with the person's confirmation.
 pending=call('tab_click_at',{x:1,y:2});
 await page.waitForSelector('#rs-approve:not([hidden])');
 await page.locator('#rs-approve-allow').click();
 assert.match(await pending,/Clicked at \(1, 2\)/);
 sent=await page.evaluate(()=>sentTab.splice(0));
 assert.deepEqual(sent.map(m=>m.confirmed),[false,true]);
 // A tab picture reaches the AI as a picture.
 assert.match(await call('tab_screenshot',{}),/image is attached/);
 assert.deepEqual(errors,[]);
 console.log('PASS control rework always-ask (real AI-tab code, Chromium): asks even in Always approve, no = nothing sent, yes = sent once with confirmation, the AI cannot confirm for the person, pictures attached, commands absent while switched off');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
