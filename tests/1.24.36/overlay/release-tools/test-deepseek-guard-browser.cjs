// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Full provider in real engines on an offline fixture; sends never leave this page.
const fs=require('fs'),assert=require('node:assert/strict'),{chromium,firefox}=require('playwright');
// An installed extension observes real chunked HTTPS completion, without fetch wrappers.
async function requestLifecycleBrowser(){
 const os=require('os'),path=require('path'),https=require('https'),{execFileSync}=require('child_process');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'plazcode-request-fixture-')),ext=path.join(dir,'extension');fs.mkdirSync(ext);
 const key=path.join(dir,'key.pem'),cert=path.join(dir,'cert.pem');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=chat.deepseek.com'],{stdio:'ignore'});
 const bg=fs.readFileSync('background.js','utf8'),observer=bg.slice(bg.indexOf('const deepSeekRequests ='),bg.indexOf('if (typeof importScripts'));
 fs.writeFileSync(path.join(ext,'background.js'),observer+`chrome.runtime.onMessage.addListener((m,s,r)=>{if(m.type==='deepseek-requests'){deepSeekRequests.snapshot(s).then(r);return true;}});`);
 fs.writeFileSync(path.join(ext,'content.js'),fs.readFileSync('providers/deepseek.js','utf8')+`;RSProvider.init();setInterval(()=>{document.documentElement.dataset.requestPending=String(RSProvider.responsePending());document.documentElement.dataset.requestHard=String(RSProvider.isHardGenerating());},40);`);
 fs.writeFileSync(path.join(ext,'manifest.json'),JSON.stringify({manifest_version:3,name:'PlazCode request fixture',version:'1.0',permissions:['storage','webRequest'],host_permissions:['https://chat.deepseek.com/*'],background:{service_worker:'background.js'},content_scripts:[{matches:['https://chat.deepseek.com/*'],js:['content.js']}]}));
 let reply;const server=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},(req,res)=>{
  if(req.url.startsWith('/api/v0/chat/completion')){res.writeHead(200,{'content-type':'text/event-stream'});res.write('data: partial\n\n');reply=res;return;}
  res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><form><textarea></textarea><div role="button" class="ds-button--primary"><svg><path d="M8.3125 0.980206"></path></svg></div></form>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let context;
 try{
  context=await chromium.launchPersistentContext(path.join(dir,'profile'),{headless:true,channel:'chromium',executablePath:process.env.PLAZCODE_CHROMIUM,ignoreDefaultArgs:['--disable-extensions'],ignoreHTTPSErrors:true,args:['--no-sandbox','--no-proxy-server','--ignore-certificate-errors','--host-resolver-rules=MAP chat.deepseek.com 127.0.0.1:'+server.address().port,'--disable-extensions-except='+ext,'--load-extension='+ext]});
  const page=await context.newPage();await page.goto('https://chat.deepseek.com/a/chat/one');await page.waitForFunction(()=>document.documentElement.dataset.requestPending==='false');
  await page.evaluate(()=>{window.controller=new AbortController();window.receivedHeaders=false;window.response=fetch('/api/v0/chat/completion',{method:'POST',body:'inert',signal:controller.signal}).then(r=>{window.receivedHeaders=true;return r.text();}).catch(()=> 'aborted');});
  await page.waitForFunction(()=>window.receivedHeaders&&document.documentElement.dataset.requestPending==='true');
  await page.waitForTimeout(6500);assert.equal(await page.evaluate(()=>document.documentElement.dataset.requestHard),'true','response headers and a long token pause do not finish the request');
  reply.end('data: end\n\n');await page.evaluate(()=>window.response);await page.waitForFunction(()=>document.documentElement.dataset.requestPending==='false');
  await page.evaluate(()=>{window.controller=new AbortController();window.response=fetch('/api/v0/chat/completion',{method:'POST',body:'inert',signal:controller.signal}).then(r=>r.text()).catch(()=> 'aborted');});
  await page.waitForFunction(()=>document.documentElement.dataset.requestPending==='true');await page.evaluate(()=>controller.abort());await page.waitForFunction(()=>document.documentElement.dataset.requestPending==='false');reply.end();
  console.log('PASS installed Chromium extension: real chunked HTTPS remains pending after headers/6.5s pause, terminal EOF and abort release it, native Send arrow unchanged.');
 }finally{if(context)await context.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
}
(async()=>{
 if(process.env.PLAZCODE_ONLY_REQUEST_BROWSER){await requestLifecycleBrowser();return;}
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
   await page.evaluate(()=>{const link=document.createElement('a');link.href='/attachment.txt';link.setAttribute('download','');link.textContent='Download attachment';link.id='download';link.onclick=event=>event.preventDefault();document.body.append(link);window.downloadSettled=false;window.downloadPending=P.typeAndSend('cancel explicitly later').then(()=>{window.downloadSettled=true;return false;},error=>{window.downloadSettled=true;return error.code;});});
   await page.locator('#download').click();await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.downloadSettled),false,'a download link is not chat navigation');await page.evaluate(()=>P.cancelPendingSends());assert.equal(await page.evaluate(()=>window.downloadPending),'DEEPSEEK_CANCELLED');assert.equal(await page.evaluate(()=>window.clicks),2);
   await page.evaluate(()=>{const b=document.querySelector('.ds-button--primary');b.setAttribute('aria-label','Stop');b.click();});assert.equal(await page.evaluate(()=>window.stopEvents),0,'automatic native Stop is not a user stop');
   await page.getByRole('button',{name:'Stop',exact:true}).click();assert.equal(await page.evaluate(()=>window.stopEvents),1,'trusted user Stop is handled');
   // Native/BDS autosizing must not push the bar up during a held internal draft.
   await page.evaluate(()=>{
    document.querySelector('.ds-button--primary').setAttribute('aria-label','Send');
    const ed=document.querySelector('textarea');ed.style.height='80px';ed.style.minHeight='';ed.style.maxHeight='';
    ed.addEventListener('input',()=>{ed.style.height='auto';ed.style.height=Math.min(420,ed.scrollHeight)+'px';});
    window.nextAt=Date.now()+12000;window.beforeHeight=ed.getBoundingClientRect().height;
    window.geometry=P.typeAndSend('Output of a command:\n'+('multiline result row\n'.repeat(500)));
   });
   await page.waitForFunction(()=>document.querySelector('textarea').value.length>1000);
   assert.equal(await page.evaluate(()=>document.querySelector('textarea').getBoundingClientRect().height),await page.evaluate(()=>window.beforeHeight),'internal result keeps original input height while paced');
   await page.evaluate(()=>window.geometry);
   assert.equal(await page.evaluate(()=>document.querySelector('textarea').style.maxHeight),'','temporary clamp restored after send');
   for(const mode of ['cancel','draft','style','remount','error']){
    const held=await browser.newPage();try{
     await held.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<style>form{border-radius:16px;width:500px}textarea{height:80px;width:400px}</style><form><textarea></textarea><button type="button" class="ds-button--primary" aria-label="Send">Send</button></form>'}));
     await held.goto('https://chat.deepseek.com/a/chat/held');
     await held.addScriptTag({content:fs.readFileSync('providers/deepseek.js','utf8')+';window.P=RSProvider;'});
     await held.evaluate(mode=>{
      window.clicks=0;document.querySelector('button').onclick=()=>window.clicks++;
      P.init({sendContext:()=>({session:1,stop:0}),pacingRequest:async()=>{if(mode==='error')throw Error('bridge unavailable');return {ok:true,allowed:false,wait_ms:100};}});
      const ed=document.querySelector('textarea'),frame=document.querySelector('form');window.oldEditor=ed;
      ed.addEventListener('input',()=>{ed.style.height='420px';frame.style.height='500px';});
      window.beforeFrame=frame.getBoundingClientRect().height;
      window.heldSend=P.typeAndSend('result row\n'.repeat(600)).then(()=>false,error=>error.code || error.message);
     },mode);
     if(mode!=='error'){
      await held.waitForFunction(()=>document.querySelector('textarea').value.length>1000);
      assert.equal(await held.evaluate(()=>document.querySelector('form').getBoundingClientRect().height),await held.evaluate(()=>window.beforeFrame),'frame autosizing cannot move bar anchor');
      await held.evaluate(mode=>{
       const ed=document.querySelector('textarea');
       if(mode==='draft')ed.value='my new draft';
       if(mode==='style')ed.style.setProperty('max-height','190px','important');
       if(mode==='remount'){const next=document.createElement('textarea');next.style.height='120px';ed.replaceWith(next);}
       P.cancelPendingSends();
      },mode);
     }
     assert.equal(await held.evaluate(()=>window.heldSend),mode==='error'?'bridge unavailable':'DEEPSEEK_CANCELLED');
     assert.equal(await held.evaluate(()=>window.clicks),0);
     assert.equal(await held.evaluate(()=>document.querySelector('textarea').value),mode==='draft'?'my new draft':'');
     assert.equal(await held.evaluate(()=>document.querySelector('form').style.maxHeight),'');
     assert.equal(await held.evaluate(()=>document.querySelector('textarea').style.maxHeight),mode==='style'?'190px':'');
    }finally{await held.close();}
   }
   console.log('PASS '+name+': full DeepSeek provider, fresh URL-before-row startup, one send, actual paced Continue, queued cancellation and trusted/automatic Stop.');
  }finally{await browser.close();}
 }
 if(process.env.PLAZCODE_SKIP_INSTALLED_REQUEST_BROWSER==='1' && !process.env.CI)console.log('NOT RUN locally: installed request observer (browser administrator policy). CI requires it.');else await requestLifecycleBrowser();
})().catch(e=>{console.error(e);process.exit(1);});
