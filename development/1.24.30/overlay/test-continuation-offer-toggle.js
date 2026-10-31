// 1.19.39: the "continue your previous chat or start a new project" prompt has
// an on/off setting (default ON) in the bar settings and the desktop Settings
// page. Off never shows the prompt and closes an open one; on keeps the
// existing behavior. The preference syncs with the desktop app.
const {JSDOM,VirtualConsole}=require(process.env.PLAZCODE_TEST_JSDOM || 'jsdom');const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const root=__dirname;const manifest=JSON.parse(fs.readFileSync(root+'/manifest.json'));
const handoff={chat_id:'chatgpt|previous',provider:'ChatGPT',reason:'Latest captured chat',handoff:{has_user_request:true},history:[{role:'user',text:'Build a round system for my obby'}]};
async function run(stored,url='https://chatgpt.com/c/startup-chat',started=true){
 const dom=new JSDOM('<!doctype html><html><body><main><form><div class="composer-surface"><div id="prompt-textarea" class="ProseMirror" contenteditable="true" role="textbox"><p></p></div><button id="composer-submit-button" data-testid="send-button" aria-label="Send" type="submit">Send</button></div></form></main></body></html>',{url,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
 const w=dom.window,context=dom.getInternalVMContext(),intervals=[],changed=[];let data={rsLatestHandoff:handoff,...(started?{rsStartedSessions:['/c/startup-chat']}:{}),...stored};
 const get=(keys,cb)=>{const d={};for(const k of [].concat(keys||Object.keys(data)))if(k in data)d[k]=data[k];if(cb)queueMicrotask(()=>cb(d));return Promise.resolve(d);};
 const set=v=>{const changes={};for(const [k,n] of Object.entries(v)){changes[k]={oldValue:data[k],newValue:n};data[k]=n;}for(const fn of changed)fn(changes,'local');return Promise.resolve();};
 w.chrome={runtime:{id:'test',getManifest:()=>manifest,getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener(){}},sendMessage:(msg,cb)=>{const r={ok:true,connected:false,tools:[],servers:[]};if(cb)queueMicrotask(()=>cb(r));return Promise.resolve(r);}},storage:{local:{get,set,remove:()=>Promise.resolve()},onChanged:{addListener:fn=>changed.push(fn)}}};
 w.ResizeObserver=class{observe(){}disconnect(){}};w.setInterval=(fn,ms)=>{intervals.push({fn,ms});return intervals.length;};w.setTimeout=()=>1;w.requestAnimationFrame=()=>1;w.cancelAnimationFrame=()=>{};
 w.console={log(){},warn(){},error:(...x)=>process.stderr.write(x.map(String).join(' ')+'\n')};
 w.HTMLElement.prototype.getBoundingClientRect=function(){return {left:200,top:700,width:700,height:120,right:900,bottom:820};};
 Object.defineProperty(w.HTMLElement.prototype,'offsetParent',{get(){return this.parentElement;}});
 let now=1e12;vm.runInContext('Date.now=()=>globalThis.__now;',context);w.__now=now;
 for(const file of manifest.content_scripts.find(x=>x.js.includes('providers/chatgpt.js')&&x.js.includes('core/main.js')).js) vm.runInContext(fs.readFileSync(root+'/'+file,'utf8'),context,{filename:file});
 await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
 // Only the offer tick (and other 1s ticks are guarded by an unstarted session).
 const ticks=intervals.filter(x=>x.ms===1000);
 const tick=async ms=>{w.__now+=ms;for(const t of ticks){try{t.fn();}catch{}}await new Promise(r=>setImmediate(r));};
 return {dom,w,d:w.document,tick,set,data};
}
const offer=d=>d.querySelector('.rs-continuation-offer');
(async()=>{
 for(const [label,stored] of [['default (no saved setting)',{}],['explicitly on',{rsContinuationOffer:true}]]){
  const t=await run(stored);
  try{await t.tick(1000);await t.tick(1000);await t.tick(2100);
   assert(offer(t.d),label+': the prompt appears after startup (PlazCode is ready.)');
   assert.match(offer(t.d).textContent,/continue where you left off/);
   assert.match(offer(t.d).textContent,/start a new project/);
   await t.set({rsContinuationOffer:false});await t.tick(1000);
   assert.equal(offer(t.d),null,label+': turning the setting off closes an open prompt');
   await t.tick(3000);await t.tick(3000);
   assert.equal(offer(t.d),null,label+': and it stays closed');
   await t.set({rsContinuationOffer:true});await t.tick(1000);await t.tick(2100);
   assert(offer(t.d),label+': turning it back on shows the prompt again');
  }finally{t.dom.window.close();}
 }
 // Before startup finishes (a brand new chat, PlazCode not ready yet) the question must NOT appear.
 const pre=await run({},'https://chatgpt.com/',false);
 try{for(let i=0;i<6;i++)await pre.tick(1500);assert.equal(offer(pre.d),null,'before startup: no prompt');}
 finally{pre.dom.window.close();}
 const off=await run({rsContinuationOffer:false});
 try{for(let i=0;i<6;i++)await off.tick(1500);assert.equal(offer(off.d),null,'off: the prompt never appears');}
 finally{off.dom.window.close();}
 // 1.24.21: the chat used last only had the startup (no real request was saved for it): nothing to continue, no question.
 const startupOnly=await run({rsLastUsedChats:[{id:'chatgpt|previous',at:1},{id:'chatgpt|/c/startup-only',at:2}]});
 try{for(let i=0;i<6;i++)await startupOnly.tick(1500);assert.equal(offer(startupOnly.d),null,'previous chat had only the startup: no prompt');}
 finally{startupOnly.dom.window.close();}
 // The chat used last is the one with the saved work: the question is asked (this chat itself is skipped).
 const lastReal=await run({rsLastUsedChats:[{id:'chatgpt|/c/startup-only',at:1},{id:'chatgpt|previous',at:2},{id:'chatgpt|/c/startup-chat',at:3}]});
 try{await lastReal.tick(1000);await lastReal.tick(1000);await lastReal.tick(2100);assert(offer(lastReal.d),'previous chat had real work: the prompt appears');
  // New look and the third choice.
  const o=offer(lastReal.d);
  assert(o.querySelector('.rs-co-kicker')&&o.querySelector('.rs-co-from b').textContent==='ChatGPT','kicker and the previous chat name');
  const never=o.querySelector('.rs-co-never');assert.equal(never.textContent,"Start new project, and don't show this again.");
  assert.equal(o.querySelector('.rs-co-yes').textContent,'Yes, continue.');assert.equal(o.querySelector('.rs-co-no').textContent,'No, I wanna start a new project.');
  never.click();await lastReal.tick(1000);
  assert.equal(offer(lastReal.d),null,"don't show again closes the prompt");
  assert.equal(lastReal.data.rsContinuationOffer,false,"don't show again turns the question off (same switch as the menu)");
  for(let i=0;i<4;i++)await lastReal.tick(1500);assert.equal(offer(lastReal.d),null,'and it stays closed');
 }finally{lastReal.dom.window.close();}
 // Starting a chat marks it as the one used last; real work in a chat does too.
 const mainSrc=fs.readFileSync(root+'/core/main.js','utf8');
 assert(/startedSessions\.add\(path\);\s*try \{ noteChatUsed\(P\.id \+ "\|" \+ path\); \} catch \{\}/.test(mainSrc),'a started chat is noted as used');
 assert(mainSrc.includes("chrome.storage.local.set({rsLatestHandoff:transfer});try{noteChatUsed(transfer.chat_id);}catch{}"),'a chat with real work is noted as used');
 // Bar settings control and desktop sync wiring.
 const main=fs.readFileSync(root+'/core/main.js','utf8'),bg=fs.readFileSync(root+'/background.js','utf8'),desk=fs.readFileSync(root+'/agent/src/desktop.html','utf8'),prefs=fs.readFileSync(root+'/agent/src/preferences.rs','utf8');
 assert(main.includes('id="rs-continuation-offer" type="checkbox"'),'bar settings has the toggle');
 assert(main.includes('["rs-continuation-offer","rsContinuationOffer"]'),'bar toggle saves the shared preference');
 assert(/"rsVisualCheck",\s*"rsContinuationOffer",/.test(bg),'extension syncs the preference with the desktop app');
 assert(desk.includes('<div class="toggle" data-pref="rsContinuationOffer"></div>'),'desktop Settings has the toggle');
 assert(/#\[serde\(rename = "rsContinuationOffer"\)\]\s*pub continuation_offer: bool/.test(prefs)&&prefs.includes('continuation_offer:true'),'desktop preference defaults to on');
 for(const f of ['core/main.js','background.js'])assert.equal(fs.readFileSync(root+'/'+f,'utf8'),fs.readFileSync(root+'/PlazCode-Extension/'+f,'utf8'),f+' copies are in sync');
 console.log('Continuation prompt: only after startup finishes; toggle on by default, off never prompts and closes an open prompt, synced between the bar and desktop settings.');
})().catch(e=>{console.error(e);process.exit(1);});
