// (derived from test-continuation-offer-toggle.js)
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
 w.chrome={runtime:{id:'test',getManifest:()=>manifest,getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener(){}},sendMessage:(msg,cb)=>{const r=msg&&msg.type==='rs-get-engine'?{ok:true,engine:tab}:{ok:true,connected:false,tools:[],servers:[]};if(cb)queueMicrotask(()=>cb(r));return Promise.resolve(r);}},storage:{local:{get,set,remove:()=>Promise.resolve()},onChanged:{addListener:fn=>changed.push(fn)}}};
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

const engine=t=>t.w.__rsEngine&&t.w.__rsEngine();
(async()=>{
 // 1. A chat with a saved mode comes back in that mode after a refresh (AgentScript).
 let t=await run({rsChatEngines:{'chatgpt|/c/aaa':'local'}},'https://chatgpt.com/c/aaa','');
 try{await t.tick(1000);await t.tick(1000);assert.equal(engine(t),'local','saved AS comes back as AS after a refresh');}finally{t.dom.window.close();}
 // 2. A chat saved as RS stays RS even when the tab-wide mode says AS.
 t=await run({rsChatEngines:{'chatgpt|/c/bbb':'roblox'}},'https://chatgpt.com/c/bbb','local');
 try{await t.tick(1000);await t.tick(1000);await t.tick(3000);assert.equal(engine(t),'roblox','saved RS is not overridden by the tab-wide mode');assert.equal(t.data.rsChatEngines['chatgpt|/c/bbb'],'roblox');}finally{t.dom.window.close();}
 // 3. A new chat waits up to 3 s for the background page's answer about this tab, then saves the mode it is in.
 t=await run({},'https://chatgpt.com/c/ccc','');
 try{await t.tick(1000);await t.tick(1000);assert.equal(t.data.rsChatEngines,undefined,'nothing is saved while waiting for the tab answer');await t.tick(1500);assert.equal(engine(t),'roblox');assert.equal(t.data.rsChatEngines['chatgpt|/c/ccc'],'roblox','then remembers it');}finally{t.dom.window.close();}
 // 4. Switching the mode by hand is remembered for that chat only.
 t=await run({rsChatEngines:{'chatgpt|/c/eee':'roblox','chatgpt|/c/fff':'roblox'}},'https://chatgpt.com/c/eee','');
 try{await t.tick(1000);await t.tick(1000);const btn=t.d.querySelector('.rs-mode-btn[data-mode="local"]');assert(btn,'AS button exists');btn.click();await t.tick(100);await t.tick(100);
  assert.equal(engine(t),'local');assert.equal(t.data.rsChatEngines['chatgpt|/c/eee'],'local','this chat now remembers AS');assert.equal(t.data.rsChatEngines['chatgpt|/c/fff'],'roblox','other chats are untouched');}finally{t.dom.window.close();}
 console.log('Per-chat mode: a chat keeps AS or RS across a refresh; a new chat remembers the mode it starts in.');
})().catch(e=>{console.error(e);process.exit(1);});
