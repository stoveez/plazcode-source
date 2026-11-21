const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('core/text-pack.js','utf8').replace('const REQUIRED = false;','const REQUIRED = true;').replace('REQUEST_TIMEOUT_MS = 20000','REQUEST_TIMEOUT_MS = 20').replace('RETRY_DELAY_MS = 500','RETRY_DELAY_MS = 0');
function loader(replies){let calls=0;const box={setTimeout,clearTimeout,chrome:{runtime:{lastError:null,sendMessage(_msg,cb){const r=replies[Math.min(calls++,replies.length-1)];if(r!=='hang')queueMicrotask(()=>cb(r));}}}};vm.createContext(box);vm.runInContext(source,box);return {api:box.PlazCodeText,calls:()=>calls};}
(async()=>{
 let t=loader([{ok:false,error:'unknown message'}]);assert.equal(await t.api.ready(),false);assert.equal(t.calls(),1);assert.match(t.api.title(),/extension/);assert.match(t.api.error(),/worker.*does not recognize/);
 t=loader([{ok:false,error:'connecting'},{ok:true,pack:{'config:1':'exact instruction'}}]);const a=t.api.ready(),b=t.api.ready();assert.equal(a,b);assert(await a);assert.equal(t.calls(),2);assert.equal(t.api.t('config:1'),'exact instruction');
 t=loader(['hang']);assert.equal(await t.api.ready(),false);assert.equal(t.calls(),2);assert.match(t.api.error(),/did not answer/);
 t=loader([{ok:false,kind:'integrity',error:'official files check failed'}]);assert.equal(await t.api.ready(),false);assert.equal(t.calls(),1,'Never retry or bypass a failed file check');
 console.log('PASS sealed instruction loader: specific incompatible-worker recovery, bounded transient retry, shared requests and deadline; file checks stay enforced.');
})().catch(e=>{console.error(e);process.exitCode=1;});
