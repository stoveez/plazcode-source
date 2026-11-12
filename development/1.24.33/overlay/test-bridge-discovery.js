// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Actual complete background worker on a deterministic transport/clock fixture.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2]||'background.js','utf8');
async function fixture(options={}){
 let now=0,seq=0,listener;const timers=new Map(),requests=[],sockets=[],pushes=[],pending=[];
 const state={up:true,prefsHeld:false,pairHeld:false,statusHeld:false,...options};
 const later=(fn,ms=0,...a)=>{const id=++seq;timers.set(id,{at:now+Math.max(0,+ms||0),fn:()=>fn(...a)});return id;};
 const clear=id=>timers.delete(id);
 const interval=(fn,ms)=>{let id;const tick=()=>{timers.set(id,{at:now+Math.max(1,ms),fn:tick});fn();};id=++seq;timers.set(id,{at:now+Math.max(1,ms),fn:tick});return id;};
 class Signal extends EventTarget{constructor(){super();this.aborted=false;}static timeout(ms){const c=new Controller();later(()=>c.abort(),ms);return c.signal;}throwIfAborted(){if(this.aborted)throw this.reason;}}
 class Controller{constructor(){this.signal=new Signal();}abort(){if(this.signal.aborted)return;Object.assign(this.signal,{aborted:true,reason:Object.assign(Error('timed out'),{name:'TimeoutError'})});this.signal.dispatchEvent(new Event('abort'));}}
 const response=value=>({ok:true,status:200,json:async()=>value,text:async()=>JSON.stringify(value)});
 const native=()=>({local_ready:!state.profileRequired,local_full:false,local_root:'/fixture/project',roblox_connected:false,profile_required:!!state.profileRequired,accounts_enabled:false,version:'1.24.33'});
 const fetchV=(url,opts={})=>{url=String(url);requests.push(url);if(!state.up)return Promise.reject(TypeError('Failed to fetch'));
  const path=new URL(url).pathname,held=path==='/api/preferences'?state.prefsHeld:path==='/api/pair'?state.pairHeld:path==='/api/status'?state.statusHeld:false;
  const value=path==='/api/pair'?{key:'a'.repeat(64)}:path==='/api/status'?native():{};
  if(!held)return Promise.resolve(response(value));
  return new Promise((resolve,reject)=>{let done=false;const finish=()=>{if(done)return;done=true;resolve(response(value));};pending.push({path,finish});opts.signal?.addEventListener('abort',()=>{if(!done){done=true;reject(opts.signal.reason);}},{once:true});});};
 const event=()=>({addListener(){}}),data={'rs-tab-engine-1':'local'};
 const area={get:(key,cb)=>{const v=key===null?{...data}:typeof key==='string'?{[key]:data[key]}:{};if(cb){cb(v);return;}return Promise.resolve(v);},set:async v=>Object.assign(data,v),remove:async keys=>{for(const k of [].concat(keys))delete data[k];}};
 const chrome={runtime:{id:'fixture',getURL:()=> 'chrome-extension://fixture/',getManifest:()=>({version:'1.24.33'}),getPlatformInfo:async()=>({os:'linux'}),onMessage:{addListener:fn=>listener=fn},onStartup:event(),onInstalled:event(),sendMessage:async s=>pushes.push(s)},storage:{local:area,session:area,onChanged:event()},tabs:{query:(q,cb)=>{if(cb)cb([]);return Promise.resolve([]);},sendMessage:async()=>{},onRemoved:event(),onUpdated:event(),onActivated:event(),update:async()=>{}},windows:{getLastFocused:async()=>({focused:false})},scripting:{executeScript:async()=>[]},action:{setBadgeText(){},setBadgeBackgroundColor(){}}};
 class WS{static OPEN=1;static CONNECTING=0;static CLOSED=3;constructor(url,protocols){this.url=url;this.protocols=protocols;this.readyState=0;sockets.push(this);}close(){if(this.readyState===3)return;this.readyState=3;this.onclose?.({code:1006,wasClean:false});}send(){}addEventListener(){}}
 const box={chrome,fetch:fetchV,WebSocket:WS,AbortSignal:Signal,AbortController:Controller,setTimeout:later,clearTimeout:clear,setInterval:interval,clearInterval:clear,Headers,URL,URLSearchParams,Event,EventTarget,Blob,TextEncoder,TextDecoder,structuredClone,atob,btoa,queueMicrotask,crypto:require('crypto').webcrypto,navigator:{userAgent:'fixture'},console:{log(){},warn(){},error(){},info(){},debug(){}},Date:class extends Date{constructor(...args){super(...(args.length?args:[1700000000000+now]));}static now(){return 1700000000000+now;}},performance:{now:()=>now},PlazCodeIntegrity:{check:async()=>{}}};
 box.self=box;box.globalThis=box;vm.createContext(box);vm.runInContext(source,box);
 const flush=async()=>{for(let i=0;i<16;i++)await new Promise(r=>setImmediate(r));};
 const advance=async ms=>{const end=now+ms;for(let guard=0;guard<20000;guard++){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;now=next[1].at;timers.delete(next[0]);next[1].fn();await flush();}now=end;await flush();};
 const ask=msg=>new Promise(resolve=>listener(msg,{tab:{id:1}},resolve));
 await flush();return{box,state,requests,sockets,pushes,pending,advance,flush,ask,read:code=>vm.runInContext(code,box),release:path=>{for(const p of pending)if(p.path===path)p.finish();}};
}
(async()=>{
 let failures=0;async function check(name,run){try{await run();console.log('PASS '+name);}catch(e){failures++;console.error('FAIL '+name+': '+e.message);}}
 await check('reachable AgentScript publishes health before a held settings sync',async()=>{const f=await fixture({up:false,prefsHeld:true});f.state.up=true;await f.advance(5000);const s=await f.ask({type:'status',engine:'local'});assert.equal(s.connected,true,'a reachable local workspace must not await preferences');});
 await check('concurrent wake/status requests create one primary socket',async()=>{const f=await fixture({pairHeld:true});const wakes=Array.from({length:10},()=>f.ask({type:'status'}));await f.flush();f.release('/api/pair');await f.flush();await Promise.all(wakes);assert.equal(f.sockets.length,1,'overlapping async connect attempts must coalesce');});
 await check('an unresolved socket handshake is closed and retried within a bounded window',async()=>{const f=await fixture();assert.equal(f.sockets.length,1);await f.advance(18000);assert.equal(f.sockets[0].readyState,3,'CONNECTING may not pin discovery indefinitely');assert(f.sockets.length>1);assert(f.sockets.filter(s=>s.readyState===0).length<=1);});
 await check('failed fresh native health clears stale AgentScript readiness',async()=>{const f=await fixture();assert.equal((await f.ask({type:'status',engine:'local'})).connected,true);f.state.up=false;await f.advance(6000);assert.equal((await f.ask({type:'status',engine:'local'})).connected,false,'old local_ready is not a current connection');});
 await check('healthy primary socket does not pair again for every page status poll',async()=>{const f=await fixture();const s=f.sockets.at(-1);s.readyState=1;s.onopen();await f.flush();const before=f.requests.filter(u=>u.endsWith('/api/pair')).length;await Promise.all(Array.from({length:5},()=>f.ask({type:'status'})));await f.flush();assert.equal(f.requests.filter(u=>u.endsWith('/api/pair')).length,before);});
 await check('profile selection is reported separately from an absent app',async()=>{const f=await fixture({profileRequired:true});const s=await f.ask({type:'status',engine:'local'});assert.equal(s.connected,false);assert.equal(s.profile_required,true);assert.equal(s.bridge_reachable,true);});
 if(failures)throw Error(failures+' bridge discovery regressions failed');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
