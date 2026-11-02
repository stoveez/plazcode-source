// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Actual provider functions, inert controls and deterministic time. No live traffic.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),{parse}=require('./release-tools/node_modules/acorn');
const source=fs.readFileSync('providers/deepseek.js','utf8'),functions={};
function walk(n){if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration')functions[n.id.name]=source.slice(n.start,n.end);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}
walk(parse(source,{ecmaVersion:'latest'}));
const guard=source.slice(source.indexOf('  const MIN_SEND_GAP_MS'),source.indexOf('  async function typeAndSendRaw('));
function fixture(options={}){
 let now=100000,chat=options.fresh?'':'/chat/a',value='',users=0,hook=()=>{},blocked=false;const clicks=[],requests=[],context={session:1,stop:0},editor={focus(){}};
 const button={getAttribute:()=>null,click(){clicks.push(now);if(!options.uncertain){users++;if(options.fresh)chat='/chat/new';value='';}}};
 const box={Promise,crypto:{randomUUID:()=> 'fixture'},Math:Object.assign(Object.create(Math),{random:()=>0}),Date:{now:()=>now},sleep:async ms=>{now+=ms;hook(ms);},diag(){},conversationKey:()=>chat,editorText:()=>value,getEditor:()=>editor,setTextareaValue:(_,v)=>{value=v;},truncateForSend:v=>v,attachImages:async()=>true,attachThumbs:()=>[{getAttribute:()=>now<101200?'blob:upload':'https://cdn.example/test.png'}],getSendBtn:()=>button,findContinueBtn:()=>button,isStopBtn:()=>false,isHardGenerating:()=>false,safeRead:(fn,fallback)=>{try{return fn();}catch{return fallback;}},safePredicate:fn=>!!fn(),visibleLimit:()=>null,userCount:()=>users,assistantCount:()=>0,streamLen:()=>users};
 vm.createContext(box);vm.runInContext(guard+'\n'+functions.typeAndSendRaw+'\n'+functions.clickContinueBtn+'\n'+functions.observeManualSend+`;this.api={send:typeAndSend,more:clickContinueBtn,cancel:cancelPendingSends,manual:observeManualSend,setup(reader,request){_contextReader=reader;_pacingRequest=request;}};`,box);
 box.api.setup(()=>context,async req=>{requests.push(req);if(options.noBridge)throw Error('bridge unavailable');if(req.action==='claim')return {ok:true,allowed:!blocked,paused:blocked,valid_until:now+30000,error:'cooldown'};if(req.action==='validate')return {ok:true,allowed:!options.revoked};return {ok:true};});
 return {...box.api,clicks,requests,get value(){return value;},set value(v){value=v;},set chat(v){chat=v;},set hook(fn){hook=fn;},set blocked(v){blocked=v;},stop(){context.stop++;box.api.cancel();}};
}
(async()=>{
 const fresh=fixture({fresh:true});await fresh.send('startup');assert.equal(fresh.clicks.length,1,'fresh chat may acquire its URL after this send');
 const image=fixture();await image.send('with picture',[{data:'inert'}]);assert.equal(image.clicks.length,1);assert(image.clicks[0]>=101200);assert.equal(image.requests.filter(x=>x.action==='finish'&&x.sent).length,1);await image.more();assert(image.clicks[1]-image.clicks[0]>=8000,'Continue shares the gate');
 for(const action of ['stop','chat','manual','draft']){const f=fixture();await f.send('first');let once=false;f.hook=()=>{if(once)return;once=true;if(action==='stop')f.stop();if(action==='chat')f.chat='/chat/other';if(action==='manual')f.manual();if(action==='draft')f.value='my new draft';};await assert.rejects(f.send('queued'),action==='draft'?/draft changed/:/cancelled/);assert.equal(f.clicks.length,1,action+' cancels queued send');if(action==='draft')assert.equal(f.value,'my new draft');}
 const uncertain=fixture({uncertain:true});const a=uncertain.send('maybe'),b=uncertain.send('never');await assert.rejects(a,/avoid sending it twice/);await assert.rejects(b,/cancelled/);assert.equal(uncertain.clicks.length,1,'ambiguous delivery never replays');
 for(const opts of [{noBridge:true},{revoked:true}]){const f=fixture(opts);await assert.rejects(f.send('do not send'));assert.equal(f.clicks.length,0);assert.equal(f.value,'');}
 const paused=fixture();paused.blocked=true;await assert.rejects(paused.send('paused'),/cooldown/);assert.equal(paused.clicks.length,0);assert.equal(paused.value,'');
 assert(fs.readFileSync('core/main.js','utf8').includes('if (!sent && !P.guardedSender)'),'library fallback cannot bypass guarded send');
 console.log('PASS DeepSeek: one image click, paced Continue, Stop/chat/manual/draft cancellation, uncertain delivery, missing bridge, revoked lease and cooldown.');
})().catch(e=>{console.error(e);process.exitCode=1;});
