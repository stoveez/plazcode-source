// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Actual provider and response watcher: an open request is stronger than a silent DOM.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('providers/deepseek.js','utf8');
let listener;const box={console,Map,Set,Date,Promise,Math,crypto:require('crypto').webcrypto,location:{pathname:'/a/chat/one'},
 document:{querySelector:()=>null,querySelectorAll:()=>[],documentElement:{setAttribute(){}}},
 chrome:{runtime:{onMessage:{addListener:fn=>listener=fn},sendMessage:async()=>({ok:true,revision:0,active:[]})}}};
vm.createContext(box);vm.runInContext(source+';this.P=RSProvider;',box);box.P.init();
(async()=>{
 // Actual browser worker observer: allowlist, request completion/error, document isolation and worker restart.
 const background=fs.readFileSync('background.js','utf8'),net=background.slice(background.indexOf('const deepSeekRequests ='),background.indexOf('if (typeof importScripts'));
 const data={},events={},sent=[];
 const event=name=>({addListener(fn,filter){events[name]={fn,filter};}});
 const chrome={storage:{session:{get:async()=>({...data}),set:async value=>Object.assign(data,JSON.parse(JSON.stringify(value)))}},
 webRequest:{onBeforeRequest:event('start'),onCompleted:event('done'),onErrorOccurred:event('error')},
 tabs:{get:async()=>({url:'https://chat.deepseek.com/a/chat/one?private=never-store'}),sendMessage:async(...args)=>sent.push(args),onRemoved:event('removed')}};
 const worker=()=>{const c={chrome,Promise,Date,URL};vm.createContext(c);vm.runInContext(net+';this.net=deepSeekRequests;',c);return c.net;};
 let w=worker();const sender={url:'https://chat.deepseek.com/a/chat/one',tab:{id:4},frameId:0,documentId:'document-one'};
 const request={url:'https://chat.deepseek.com/api/v0/chat/completion?private=never-store',initiator:'https://chat.deepseek.com',requestId:'one',tabId:4,frameId:0,documentId:'document-one'};
 events.start.fn({...request,url:'https://chat.deepseek.com/api/v0/chat/create_pow_challenge'});assert.equal((await w.snapshot(sender)).active.length,0);
 events.start.fn({...request,initiator:'https://example.org'});assert.equal((await w.snapshot(sender)).active.length,0);
 events.start.fn(request);assert.equal((await w.snapshot(sender)).active.length,1);assert(!JSON.stringify(data).includes('never-store'));assert.equal((await w.snapshot({...sender,documentId:'document-two'})).active.length,0);
 w=worker();assert.equal((await w.snapshot(sender)).active.length,1,'worker restart restores open request ownership');
 events.done.fn(request);assert.equal((await w.snapshot(sender)).active.length,0,'onCompleted releases request');
 events.start.fn({...request,requestId:'two'});events.error.fn({...request,requestId:'two'});assert.equal((await w.snapshot(sender)).active.length,0,'network failure/abort releases request');
 events.start.fn(request);await w.snapshot(sender);events.removed.fn(4);assert.equal((await w.snapshot(sender)).active.length,0,'closed tab has no pending requests');
 assert.equal((await w.snapshot({...sender,url:'https://example.org/'})).ok,false);assert(sent.every(s=>s[2].documentId==='document-one'));
 await new Promise(r=>setImmediate(r));assert.equal(typeof listener,'function','provider must receive native request lifecycle events');
 listener({type:'rs-deepseek-requests',revision:1,active:[{id:'one',path:'/a/chat/one',startedAt:Date.now()}]});
 assert.equal(box.P.isHardGenerating(),true,'a missing Stop arrow is not end-of-stream');assert.equal(box.P.isBusyNow(),true);assert.equal(box.P.responsePending(),true);
 listener({type:'rs-deepseek-requests',revision:0,active:[]});assert.equal(box.P.isHardGenerating(),true,'late startup snapshot cannot erase a new request');
 box.location.pathname='/a/chat/two';assert.equal(box.P.isHardGenerating(),false,'another conversation does not own the stream');box.location.pathname='/a/chat/one';
 listener({type:'rs-deepseek-requests',revision:2,active:[]});assert.equal(box.P.isHardGenerating(),false,'only terminal notification releases this request');
 // A >6s pause mid-JSON must not become parse_error. Exercise actual core watcher.
 const core=fs.readFileSync('core/main.js','utf8'),start=core.indexOf('  async function waitForResponse('),end=core.indexOf('\n  // ═',start);
 const parser=new Function(fs.readFileSync('core/parser.js','utf8')+';return RSParse;')();
 let now=1000,open=true;const item={dataset:{}},complete='{"command":"read_file","params":{"path":"safe.txt"}}';
 const ctx={Map,Set,Date:{now:()=>now},A:{stop:false,sessionGen:1,sendToken:'before'},P:{id:'deepseek',displayName:'DeepSeek',conversationKey:()=> 'one',isHardGenerating:()=>open,isGenerating:()=>open,responsePending:()=>open,lastAssistantId:()=> 'after',assistantCount:()=>2,readAssistant:()=>({item,thinking:'',reply:now<14000?complete.slice(0,28):complete}),scanError:()=>null,isTooLongMsg:()=>false,isBusyMsg:()=>false,turnHalted:()=>false,findContinueBtn:()=>null},
 RSParse:parser,T:{RESPONSE_TIMEOUT_MS:30000,STABLE_MS:800,WARMUP_MS:100,REASON_NOREPLY_MS:100,PRESTART_MS:100,GEN_STOP_GRACE_MS:250},document:{hidden:false},bgMode:false,diag(){},log(){},sleep:async ms=>{now+=ms;if(now>=14000)open=false;if(now>32000)throw Error('watcher did not finish');}};
 vm.createContext(ctx);vm.runInContext(core.slice(start,end)+';this.watch=waitForResponse;',ctx);const result=await ctx.watch(1);assert.equal(result.kind,'tool');assert.equal(result.calls[0].arguments.path,'safe.txt');assert(now>=14000);
 console.log('PASS current-chat request ownership, stale snapshot rejection, terminal release and actual core pause >6s mid-JSON.');
})().catch(e=>{console.error(e);process.exitCode=1;});
