// Ctrl+Enter sends queued Co-work follow-ups now: stops the AI's reply, keeps the queue, never fires when it should not.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('core/main.js','utf8');
const a=source.indexOf('  function coworkSendNow() {'),b=source.indexOf('  }, true);',source.indexOf('  document.addEventListener("keydown", event => {',a))+'  }, true);'.length;
assert(a>0&&b>a,'send-now code present');
function make(over={}){
  const log={stops:0,pumps:0,toasts:[],handlers:[]};
  const box={A:{started:true,running:true,stopping:false},log,
    P:{editorText:()=>over.draft||'',isGenerating:()=>false,isHardGenerating:()=>over.generating??true},
    cowork:{snapshot:()=>({enabled:over.enabled??true,pending:over.pending??[{id:1,status:'queued'}]})},
    ui:{toast:t=>log.toasts.push(t),isCoworkCoverTarget:n=>n==='cover'},
    stopLoop:()=>{log.stops++;box.A.stopping=true;box.A.coworkSendNow=false;},pumpCowork:()=>{log.pumps++;},
    document:{addEventListener:(t,h,c)=>log.handlers.push({t,h,c})}};
  Object.assign(box.A,over.A||{});
  vm.createContext(box);vm.runInContext(source.slice(a,b)+';globalThis.send=coworkSendNow;',box);return box;
}
const ev=(o={})=>({key:'Enter',ctrlKey:true,metaKey:false,isComposing:false,isTrusted:true,defaultPrevented:false,target:'editor',prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...o});

// 1. queued + AI working -> stop it once, flag the pump, keep the queue.
{const b=make();assert.equal(b.send().ok,true);assert.equal(b.log.stops,1);assert.equal(b.A.coworkSendNow,true);assert.equal(b.log.toasts.length,1);
 b.send();assert.equal(b.log.stops,1,'second press while stopping does nothing more');}
// 2. nothing queued / co-work off / not started -> nothing happens.
for(const over of [{pending:[]},{pending:[{id:1,status:'sending'}]},{enabled:false},{A:{started:false}},{A:{staleExtension:true}}]){const b=make(over);assert.equal(b.send().ok,false);assert.equal(b.log.stops,0);}
// 3. AI already idle -> no stop, just let the queue send.
{const b=make({generating:false,A:{running:false}});const r=b.send();assert.equal(r.idle,true);assert.equal(b.log.stops,0);assert.equal(b.log.pumps,1);}
// 4. global Ctrl+Enter with an empty composer.
{const b=make();const h=b.log.handlers.find(x=>x.t==='keydown');assert(h&&h.c===true,'capture listener');
 let e=ev();h.h(e);assert(e.prevented&&e.stopped&&b.log.stops===1);
 for(const bad of [{ctrlKey:false},{key:'a'},{isComposing:true},{isTrusted:false},{defaultPrevented:true},{target:'cover'}]){const c=make();const hh=c.log.handlers.find(x=>x.t==='keydown').h;const e2=ev(bad);hh(e2);assert.equal(c.log.stops,0,JSON.stringify(bad));assert.equal(e2.prevented,false);}
 const withDraft=make({draft:'add a door'});const e3=ev();withDraft.log.handlers[0].h(e3);assert.equal(withDraft.log.stops,0,'a typed draft is handled by the composer hook, which queues it first');
 const meta=make();const e4=ev({ctrlKey:false,metaKey:true});meta.log.handlers[0].h(e4);assert.equal(meta.log.stops,1,'Cmd+Enter on Mac');
 const idle=make({generating:false,A:{running:false}});const e5=ev();idle.log.handlers[0].h(e5);assert.equal(idle.log.stops,0);assert.equal(e5.prevented,false,'idle chat keeps its normal Ctrl+Enter');}
// 5. wiring: native composer, cover composer, pump resume and the visible hints.
assert(source.includes("if(event.type==='keydown' && (event.ctrlKey||event.metaKey)) coworkSendNow();"),'native composer path');
assert(source.includes("if (event.type === 'keydown' && (event.ctrlKey || event.metaKey)) coworkSendNow();"),'cover composer path');
assert(/A\.coworkSendNow\) \{[\s\S]{0,400}A\.stop = false; A\.userStopped = false;[\s\S]{0,200}cowork\.resume\(\)/.test(source),'pump lifts the stop and resumes the queue');
assert((source.match(/Press Ctrl\+Enter to send now\. This stops the AI's current reply\./g)||[]).length===2,'hint under queued receipts and in the queue panel');
console.log('Ctrl+Enter sends queued Co-work follow-ups now: stops the reply once, keeps the queue, ignores wrong keys, drafts, idle chats and stale tabs, and the hint shows under queued messages.');
