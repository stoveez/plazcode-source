// SPDX-License-Identifier: GPL-3.0-or-later
// Portable offline CI regression gate. Run in a complete prepared source tree:
// NODE_PATH=<existing playwright node_modules> PLAZCODE_TEST_BROWSER=chromium|firefox node this-file
// Default source and sanitized fixtures are sibling-local. Explicit red baseline:
// PLAZCODE_REVIEW_SOURCE=<complete baseline tree>; REVIEW_PROVIDER/CORE/CSS override files.
// Captured HTML/CSS is replayed locally; native events/model acceptance are simulated.
// No Vani JS executes. This does not establish the cause of React error 418.
// No installation, external requests, extension preparation, or live sends.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const Module = require('node:module'), crypto = require('node:crypto');
const source = path.resolve(process.env.PLAZCODE_REVIEW_SOURCE || process.env.PLAZCODE_SOURCE || path.join(__dirname,'..'));
process.env.PLAZCODE_SOURCE = source;
process.env.PLAZCODE_VANI_PROVIDER = process.env.PLAZCODE_REVIEW_PROVIDER || process.env.PLAZCODE_VANI_PROVIDER || path.join(source,'providers/vani.js');
const harness = require('./test-vani-browser.cjs');
// Reuse ONLY the existing fixture setup, not its checks or auto-running main.
// Read all core/CSS from the selected immutable snapshot, avoiding overlay fallback.
let setup = fs.readFileSync(path.join(__dirname,'test-vani-core.cjs'),'utf8').split('\nasync function checks(')[0];
setup = setup.replace('const overlay = path.resolve(__dirname, "..");', 'const overlay = sourceRoot;');
setup = setup.replace('const read = f => {', 'const read = f => { if(f === "core/main.js" && process.env.PLAZCODE_REVIEW_CORE)return fs.readFileSync(process.env.PLAZCODE_REVIEW_CORE,"utf8"); if(f === "overlay.css" && process.env.PLAZCODE_REVIEW_CSS)return fs.readFileSync(process.env.PLAZCODE_REVIEW_CSS,"utf8");');
setup += '\nmodule.exports={coreFixture};';
function loadCoreFixture(nativeFixture) {
 const fixtureModule = new Module(path.join(source,'release-tools/independent-fixture.cjs'),module);
 fixtureModule.filename = path.join(source,'release-tools/independent-fixture.cjs');
 fixtureModule.paths = Module._nodeModulePaths(path.dirname(fixtureModule.filename));
 fixtureModule.require = function(id) { return id === './test-vani-browser.cjs' ? {...harness,fixture:nativeFixture} : Module.prototype.require.call(this,id); };
 fixtureModule._compile(setup,fixtureModule.filename);
 return fixtureModule.exports.coreFixture;
}
const coreFixture = loadCoreFixture(harness.fixture);
const captureDir = path.join(__dirname,'fixtures','vani-public');
async function capturedFixture(browser,options={}) {
 const f=await harness.fixture(browser,options);
 const body=fs.readFileSync(path.join(captureDir,'body.html'),'utf8');
 const pending=fs.readFileSync(path.join(captureDir,'pending.html'),'utf8');
 await f.page.evaluate(({body,pending,options})=>{
  const parse=html=>{const doc=new DOMParser().parseFromString(html,'text/html');doc.querySelectorAll('script,link').forEach(n=>n.remove());return doc;};
  document.body.innerHTML=parse(body).body.innerHTML+'<div id="rs-root"></div>';
  const pendingDoc=parse(pending), pendingMain=pendingDoc.querySelector('main');
  const nativeSetter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
  window.stopClicks=0;window.sent=[];window.nativeClicks=0;
  const mount=()=>{
   const editor=document.querySelector('main textarea'),form=editor.closest('form');let model='',tracker=editor.value;
   Object.defineProperty(editor,'value',{configurable:true,get(){return Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').get.call(this);},set(value){tracker=String(value);nativeSetter.call(this,value);}});
   editor.addEventListener('input',()=>{if(editor.value===tracker)return;tracker=editor.value;const value=editor.value;setTimeout(()=>{model=value;const send=form.querySelector('button[aria-label="Send message"]');if(send)send.disabled=!model.trim();},35);});
   form.addEventListener('submit',e=>e.preventDefault());
   form.querySelector('button[aria-label="Send message"]')?.addEventListener('click',e=>{
    e.preventDefault();nativeClicks++;if(!model.trim()||model!==editor.value)throw Error('fixture native model rejected incomplete draft');
    sent.push({text:model,images:[]});
    const replacement=pendingMain.cloneNode(true),user=replacement.querySelector('[data-message-actions="user"]').closest('[data-turn-id]');
    user.querySelector('.rounded-br-md').textContent=model;
    if(options.noReceipt)replacement.querySelectorAll('[data-turn-id]').forEach(n=>n.remove());
    if(options.maskReceipt)user.classList.add('rs-hidden');
    document.querySelector('main').replaceWith(replacement);
    const stop=replacement.querySelector('button[aria-label="Stop generating"]');
    stop.addEventListener('click',()=>{stopClicks++;const send=form.querySelector('button[aria-label="Send message"]').cloneNode(true);send.disabled=true;stop.replaceWith(send);mount();});
    if(options.lateText){const text=user.querySelector('.rounded-br-md').textContent;user.querySelector('.rounded-br-md').textContent='';setTimeout(()=>{user.querySelector('.rounded-br-md').textContent=text;},100);}
    if(options.cloneReceipt)setTimeout(()=>user.replaceWith(user.cloneNode(true)),60);
   });
  };
  mount();
 },{body,pending,options});
 // Deterministic minimum geometry plus required, sanitized actual host reset/layout CSS.
 await f.page.addStyleTag({content:'body{margin:0}main{min-height:600px}textarea{display:block;width:700px;height:60px}button{min-width:32px;min-height:30px}.hidden{display:none}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}'});
 const cssPath=path.join(captureDir,'host.css');
 await f.page.addStyleTag({content:fs.readFileSync(cssPath,'utf8')});
 return f;
}
for(const filename of ['body.html','pending.html']) {
 const text=fs.readFileSync(path.join(captureDir,filename),'utf8');
 assert(!/<(?:script|iframe|object|embed|link)\b/i.test(text),'fixture must not include executable/external content: '+filename);
 assert(!/\s(?:src|href|srcset|action|formaction|poster|on\w+)\s*=/i.test(text),'fixture must not request external resources: '+filename);
}
const hostFixtureCSS=fs.readFileSync(path.join(captureDir,'host.css'),'utf8');
assert(!/@import\b/i.test(hostFixtureCSS),'offline CSS must not import external resources');
for(const resource of hostFixtureCSS.matchAll(/url\(\s*["']?([^\)"']*)/gi))assert(resource[1]==='data:,','offline CSS URL must be neutralized');
const capturedCoreFixture=loadCoreFixture(capturedFixture);
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const maskCSS = fs.readFileSync(process.env.PLAZCODE_REVIEW_CSS || path.join(source,'overlay.css'),'utf8');
const results = [];
async function run(browser,name,options,fn,core=false) {
  if(process.env.PLAZCODE_REVIEW_FILTER && !name.includes(process.env.PLAZCODE_REVIEW_FILTER)) return;
  let f;
  try { f = await (core===true?coreFixture:typeof core==='function'?core:harness.fixture)(browser,options); await fn(f.page,f); assert.deepEqual(f.errors,[],'uncaught browser errors'); results.push({name,ok:true}); console.log('PASS '+name); }
  catch(e) { results.push({name,ok:false,error:e.message}); console.log('FAIL '+name+': '+e.message); }
  finally {if(f)await f.page.close();}
}
(async()=>{
 console.log(JSON.stringify({source,provider:process.env.PLAZCODE_VANI_PROVIDER,providerSha:harness.providerHash,coreSha:sha(process.env.PLAZCODE_REVIEW_CORE || path.join(source,'core/main.js')),cssSha:sha(process.env.PLAZCODE_REVIEW_CSS || path.join(source,'overlay.css')),hostCssSha:fs.existsSync(path.join(captureDir,'host.css'))?sha(path.join(captureDir,'host.css')):null}));
 const selection=process.env.PLAZCODE_TEST_BROWSER || process.env.PLAZCODE_BROWSER || 'chromium';
 assert(['chromium','firefox','all'].includes(selection),'PLAZCODE_TEST_BROWSER must be chromium, firefox, or all');
 for(const browserName of selection==='all'?['chromium','firefox']:[selection]) {
 console.log('BROWSER '+browserName);
 const browser=await harness.launch(browserName);
 try {
  await run(browser,'full production CSS: startup request receipt with synchronous prehide',{autoReply:false},async page=>{
   await page.addStyleTag({content:maskCSS});
   await page.evaluate(()=>{
    const old=window.addItem;
    window.addItem=(...args)=>{const row=old(...args); if(args[0]==='user')row.classList.add('rs-hidden');return row;};
   });
   const text=await page.evaluate(()=>provider.startupRequest('local'));
   const r=await harness.attempt(page,text);
   assert.equal(r.ok,true,JSON.stringify(r)); assert.equal(r.clicks,1);
   assert.equal(await page.evaluate(()=>provider.itemText(document.querySelector('#turns [data-turn-id]'))),text);
  });
  await run(browser,'full production CSS: context user masks stable counts and raw text',{parser:true},async page=>{
   await page.addStyleTag({content:maskCSS});
   const r=await page.evaluate(()=>{
    const text='⟦RS-SYS⟧ PlazCode startup context part 1/1.\nBEGIN CONTEXT PART\n'+ 'reference '.repeat(800)+'\nEND CONTEXT PART';
    const row=addItem('user',text,'context');
    const reads=Array.from({length:5},()=>({count:provider.userCount(),text:provider.itemText(row)}));
    row.replaceWith(row.cloneNode(true));
    reads.push({count:provider.userCount(),text:provider.itemText(document.querySelector('[data-turn-id="context"]'))});
    return {text,reads};
   });
   for(const read of r.reads){assert.equal(read.count,1);assert.equal(read.text,r.text);}
  });
  await run(browser,'context receipt with synchronous own mask',{autoReply:false},async page=>{
   await page.addStyleTag({content:maskCSS});
   await page.evaluate(()=>{const old=window.addItem;window.addItem=(...args)=>{const row=old(...args);if(args[0]==='user')row.classList.add('rs-hidden');return row;};});
   const text='⟦RS-SYS⟧ PlazCode startup context part 1/1.\nBEGIN CONTEXT PART\n'+ 'reference '.repeat(800)+'\nEND CONTEXT PART';
   const r=await harness.attempt(page,text);assert.equal(r.ok,true,r.error);assert.equal(r.clicks,1);
  });
  await run(browser,'baseline non-error host alert must not invalidate exact user receipt',{autoReply:false},async page=>{
   await page.evaluate(()=>{const alert=document.createElement('div');alert.role='alert';alert.textContent='You are using the free model';document.querySelector('main').append(alert);});
   const r=await harness.attempt(page,'ordinary explicit connection request');
   assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.clicks,1);
  });
  for(const mode of ['new alert','changed baseline alert']) await run(browser,'explicit send failure remains failclosed '+mode,{autoReply:false},async page=>{
   await page.evaluate(mode=>{
    const alert=document.createElement('div');alert.role='alert';
    if(mode==='changed baseline alert'){alert.textContent='Using free model';document.querySelector('main').append(alert);}
    document.querySelector('#native-send').addEventListener('click',()=>{alert.textContent='Message failed to send';if(!alert.isConnected)document.querySelector('main').append(alert);});
   },mode);
   const r=await harness.attempt(page,'DO NOT CLAIM FAILED RECEIPT');assert.equal(r.ok,false);assert.equal(r.clicks,1);assert.equal(r.sent.length,1);assert.equal(r.ambiguous,true);
  });
  await run(browser,'late hydrated user action marker confirms same receipt without duplicate',{autoReply:false,noReceipt:true},async page=>{
   await page.evaluate(()=>document.querySelector('#native-send').addEventListener('click',()=>{
    const row=document.createElement('div');row.dataset.turnId='hydrating';row.innerHTML='<div class="flex flex-col items-end"><div></div></div>';
    row.firstChild.firstChild.textContent=sent.at(-1).text;document.querySelector('#turns').append(row);
    setTimeout(()=>{const actions=document.createElement('div');actions.dataset.messageActions='user';row.append(actions);row.replaceWith(row.cloneNode(true));},100);
   }));
   const r=await harness.attempt(page,'HYDRATED NATIVE USER RECEIPT');assert.equal(r.ok,true,r.error);assert.equal(r.clicks,1);
  });
  await run(browser,'cancel receipt wait never automatically resubmits',{noReceipt:true,stopWithoutReceipt:true,autoReply:false},async page=>{
   const r=await page.evaluate(async()=>{let stopped=false;provider.init({isStopped:()=>stopped});const started=performance.now();const send=provider.typeAndSend(provider.startupRequest('local')).then(()=>'',e=>e.message);setTimeout(()=>{stopped=true;provider.stopGeneration();},250);return {error:await send,elapsed:performance.now()-started,clicks:nativeClicks};});
   assert(r.error);assert(r.elapsed<2000,JSON.stringify(r));assert.equal(r.clicks,1);
  });
  await run(browser,'stop request during controlled acceptance cancels before native commit',{delay:400,autoReply:false},async page=>{
   const r=await page.evaluate(async()=>{
    const task=provider.typeAndSend(provider.startupRequest('local')).then(()=>({ok:true}),e=>({ok:false,error:e.message}));
    setTimeout(()=>provider.stopGeneration(),50);
    return {...await task,clicks:nativeClicks};
   });assert.equal(r.ok,false,JSON.stringify(r));assert.equal(r.clicks,0);
  });
  await run(browser,'hidden stale native Stop cannot block idle Send',{autoReply:false},async page=>{
   await page.evaluate(()=>{const stop=document.createElement('button');stop.ariaLabel='Stop generating';stop.hidden=true;document.querySelector('#chat-form').append(stop);});
   assert.equal(await page.evaluate(()=>provider.isGenerating()),false);
   const r=await harness.attempt(page,'IDLE SEND WITH HIDDEN STALE STOP');assert.equal(r.ok,true,r.error);assert.equal(r.clicks,1);
  });
  await run(browser,'early content scripts leave captured host DOM byte-exact',{},async page=>{
   const scripts=['core/input-isolation.js','core/debug-capture.js','core/debug-capture-main.js'].map(f=>({file:f,code:fs.readFileSync(path.join(source,f),'utf8')}));
   const r=await page.evaluate(async scripts=>{
    const before=document.documentElement.outerHTML;
    for(const script of scripts)(0,eval)(script.code);
    await new Promise(r=>setTimeout(r,50));
    return {equal:before===document.documentElement.outerHTML};
   },scripts);assert.equal(r.equal,true,'document-start listeners must not alter SSR markup');
  },capturedFixture);
  await run(browser,'full core startup reaches exact initial receipt',{autoReply:false},async page=>{
   await page.evaluate(()=>{window.pendingStartup=fixtureCore.startSession();});
   await page.waitForFunction(()=>sent.length===1,{},{timeout:5000});
   await page.waitForTimeout(500);
   const r=await page.evaluate(()=>({sent:sent.length,starting:fixtureCore.A.starting,injecting:fixtureCore.A.injecting,users:provider.userCount(),row:document.querySelector('#turns [data-turn-id]')?.outerHTML,sendFailure:provider.sendFailureDetail(),gen:provider.isGenerating(),stop:document.querySelector('#rs-stop')?.outerHTML}));
   console.log('EVIDENCE full-core '+JSON.stringify(r));
   assert.equal(r.sendFailure,'');assert.equal(r.users,1);
  },true);
  await run(browser,'full core startup Stop is visible and cancels in-flight receipt',{noReceipt:true,autoReply:false,stopWithoutReceipt:true},async page=>{
   await page.evaluate(()=>{window.pendingStartup=fixtureCore.startSession();});
   await page.waitForFunction(()=>sent.length===1,{},{timeout:5000});
   await page.waitForTimeout(1200);
   const before=await page.locator('#rs-stop').evaluate(b=>({hidden:b.hidden,display:getComputedStyle(b).display,visibility:getComputedStyle(b).visibility,width:b.getBoundingClientRect().width,disabled:b.disabled}));
   assert.equal(before.hidden,false,JSON.stringify(before));assert.notEqual(before.display,'none');assert(before.width>0);assert.equal(before.disabled,false);
   await page.locator('#rs-stop').click({timeout:1500});
   await page.waitForFunction(()=>fixtureCore.A.userStopped && !fixtureCore.A.startupOwner,{},{timeout:3000});
   const after=await page.evaluate(()=>({stop:fixtureCore.A.stop,starting:fixtureCore.A.starting,clicks:nativeClicks,locked:provider.getEditor().readOnly,owner:fixtureCore.A.startupOwner}));
   assert.equal(after.stop,true);assert.equal(after.starting,false);assert.equal(after.clicks,1);assert.equal(after.locked,false);
  },true);

  for(const mode of ['normal','maskReceipt','lateText','cloneReceipt']) await run(browser,'captured public DOM whole-main remount '+mode,{[mode]:true,autoReply:false},async page=>{
   await page.addStyleTag({content:maskCSS});
   const text=await page.evaluate(()=>provider.startupRequest('roblox'));
   const r=await harness.attempt(page,text);assert.equal(r.ok,true,r.error);assert.equal(r.clicks,1);
   const state=await page.evaluate(()=>({users:provider.userCount(),text:provider.itemText(document.querySelector('main [data-turn-id]')),gen:provider.isGenerating()}));
   assert.equal(state.users,1);assert.equal(state.text,text);assert.equal(state.gen,true);
  },capturedFixture);
  await run(browser,'captured public DOM full core startup receipt prehide',{autoReply:false},async page=>{
   await page.evaluate(()=>{window.pendingStartup=fixtureCore.startSession();});
   await page.waitForFunction(()=>sent.length===1,{},{timeout:5000});
   await page.waitForTimeout(1000);
   const r=await page.evaluate(()=>({sent:sent.length,starting:fixtureCore.A.starting,injecting:fixtureCore.A.injecting,users:provider.userCount(),text:provider.itemText(document.querySelector('main [data-turn-id]')),failure:provider.sendFailureDetail(),gen:provider.isGenerating()}));
   console.log('EVIDENCE captured-full-core '+JSON.stringify(r));assert.equal(r.failure,'');assert.equal(r.injecting,false,'initial receipt must settle despite synchronous core prehide');assert.equal(r.users,1);
  },capturedCoreFixture);
  await run(browser,'captured public DOM full core cancellation native Stop',{noReceipt:true,autoReply:false},async page=>{
   await page.evaluate(()=>{window.pendingStartup=fixtureCore.startSession();});
   await page.waitForFunction(()=>sent.length===1,{},{timeout:5000});
   await page.waitForTimeout(1200);
   await page.locator('#rs-stop').click({timeout:2000});
   await page.waitForFunction(()=>fixtureCore.A.userStopped && !fixtureCore.A.startupOwner,{},{timeout:3000});
   const r=await page.evaluate(()=>({stopped:fixtureCore.A.stop,starting:fixtureCore.A.starting,clicks:nativeClicks,stopClicks,locked:provider.getEditor()?.readOnly}));
   assert.equal(r.stopped,true);assert.equal(r.starting,false);assert.equal(r.clicks,1);assert.equal(r.stopClicks,1);assert.equal(r.locked,false);
  },capturedCoreFixture);
 } finally {await browser.close();}
 }
 console.log(JSON.stringify({passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,results}));
 if(results.some(r=>!r.ok))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
