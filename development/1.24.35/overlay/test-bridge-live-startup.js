const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('background.js','utf8');let listener,live={roblox_connected:false,local_ready:true,profile_required:false,blender_connected:false};
const box={Map,Set,Promise,setTimeout,clearTimeout,AbortController,AbortSignal,URLSearchParams,
 chrome:{runtime:{onMessage:{addListener:fn=>listener=fn}}},protectionCheck:async()=>{},tabEngine:async()=> 'roblox',normalizeEngine:v=>v==='local'?'local':'roblox',
 RUST_ROBLOX_HTTP:'http://127.0.0.1:3000',bridgeFetch:async()=>({ok:true,json:async()=>live}),
 connected:true,statusObj:mode=>({connected:true,engine:mode,roblox_connected:true,tools:99}),
 toolsCache:[{name:'cached_script_read'}],localToolsCache:[{name:'cached_read_file'}],mergeBlenderTools:x=>x,
 send:async()=>({ok:false,error:'bridge not connected'}),sendLocalEngine:async()=>({ok:false,error:'local disconnected'}),broadcastStatus(){}
};
vm.createContext(box);vm.runInContext(source.slice(source.indexOf('const INTEGRITY_EXEMPT ='),source.indexOf('// Pick the tab a tab_*')),box);
const ask=msg=>new Promise(resolve=>listener(msg,{tab:{id:1}},resolve));
(async()=>{
 let r=await ask({type:'live-status',engine:'roblox'});assert(r.bridge_reachable);assert.equal(r.roblox_connected,false,'Fresh native engine state overrides cached healthy state');
 r=await ask({type:'live-status',engine:'local'});assert.equal(r.engine,'local');assert(r.local_connected&&r.connected,'Explicit selected engine determines live status');
 live={profile_required:true,local_ready:false};r=await ask({type:'live-status'});assert(r.profile_required);
 r=await ask({type:'list_tools',engine:'roblox'});assert(r.tools.length);assert.equal(r.fresh,false);assert.equal(r.cached,true,'A cached catalogue is explicitly marked when refresh failed');
 r=await ask({type:'unsupported-fixture-message'});assert.equal(r.kind,'unknown-message');assert.match(r.error,/Reload the extension/);
 console.log('PASS actual background message handler: fresh native engine/profile health, requested engine, cached catalogue provenance and incompatible-request recovery.');
})().catch(e=>{console.error(e);process.exitCode=1;});
