// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Full provider in real engines on an offline fixture; sends never leave this page.
const fs=require('fs'),assert=require('node:assert/strict'),{chromium,firefox}=require('playwright');
(async()=>{
 for(const [name,engine] of Object.entries({chromium,firefox})){
  const browser=await engine.launch({headless:true});try{
   const page=await browser.newPage();await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<style>form{width:500px;margin:60px}textarea{width:400px;height:80px}button{padding:10px}</style><div id="turns"></div><form><textarea></textarea><button type="button" class="ds-button--primary" aria-label="Send">Send</button></form><button type="button" class="ds-button" id="continue">Continue</button>'}));
   await page.goto('https://chat.deepseek.com/');
   await page.addScriptTag({content:fs.readFileSync('providers/deepseek.js','utf8')+';window.P=RSProvider;'});
   await page.evaluate(()=>{
    window.clicks=0;window.requests=[];window.stopEvents=0;window.nextAt=0;window.session=1;window.earlyRoute=true;
    const echo=()=>{window.clicks++;const text=document.querySelector('textarea').value||'continued';document.querySelector('textarea').value='';const render=()=>{const turn=document.createElement('div');turn.className='ds-message';turn.dataset.role='user';turn.textContent=text;document.querySelector('#turns').append(turn);};if(window.earlyRoute){window.earlyRoute=false;history.replaceState(null,'','/a/chat/offline');setTimeout(render,240);}else render();};
    document.querySelector('[aria-label="Send"]').addEventListener('click',echo);document.querySelector('#continue').addEventListener('click',echo);
    P.init({sendContext:()=>({session:window.session,stop:0}),pacingRequest:async req=>{window.requests.push(req);if(req.action==='claim')return Date.now()>=window.nextAt?{ok:true,allowed:true,valid_until:Date.now()+30000}:{ok:true,allowed:false,wait_ms:window.nextAt-Date.now()};if(req.action==='validate')return {ok:true,allowed:true};if(req.action==='finish'||req.action==='observe')window.nextAt=Date.now()+8000;return {ok:true};}});
    P.installSendHooks({isBlocked:()=>false,isStarted:()=>true,onCoworkSend:()=>false,onNativeStop:()=>window.stopEvents++,onNativeContinue(){},onUserMessage(){},onBlockedAttempt(){}});
   });
   assert.equal(await page.evaluate(()=>P.typeAndSend('first command result')),true);assert.equal(await page.evaluate(()=>window.clicks),1);
   const start=Date.now();assert.equal(await page.evaluate(()=>P.clickContinueBtn()),true);assert(Date.now()-start>=7900,'Continue really waits in the browser');assert.equal(await page.evaluate(()=>window.clicks),2);
   // Stop while waiting: no draft injection, no extra click.
   await page.evaluate(()=>{window.queued=P.typeAndSend('must never send').then(()=>false,error=>error.code);setTimeout(()=>P.cancelPendingSends(),100);});
   assert.equal(await page.evaluate(()=>window.queued),'DEEPSEEK_CANCELLED');assert.equal(await page.evaluate(()=>window.clicks),2);assert.equal(await page.locator('textarea').inputValue(),'');
   await page.evaluate(()=>{const link=document.createElement('a');link.href='/a/chat/other';link.textContent='Other chat';link.id='navigate';link.onclick=event=>{event.preventDefault();history.replaceState(null,'','/a/chat/other');};document.body.append(link);window.navigating=P.typeAndSend('cancel on navigation').then(()=>false,error=>({code:error.code,expected:error.expectedCancellation}));});
   await page.locator('#navigate').click();assert.deepEqual(await page.evaluate(()=>window.navigating),{code:'DEEPSEEK_CANCELLED',expected:true});assert.equal(await page.evaluate(()=>window.clicks),2);await page.evaluate(()=>history.replaceState(null,'','/a/chat/offline'));
   await page.evaluate(()=>{const b=document.querySelector('.ds-button--primary');b.setAttribute('aria-label','Stop');b.click();});assert.equal(await page.evaluate(()=>window.stopEvents),0,'automatic native Stop is not a user stop');
   await page.getByRole('button',{name:'Stop',exact:true}).click();assert.equal(await page.evaluate(()=>window.stopEvents),1,'trusted user Stop is handled');
   console.log('PASS '+name+': full DeepSeek provider, fresh URL-before-row startup, one send, actual paced Continue, queued cancellation and trusted/automatic Stop.');
  }finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exit(1);});
