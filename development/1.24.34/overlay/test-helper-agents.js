// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Helper agents (sub-agents): the roster rules in the background worker (queue of two, results delivered once,
// edit locks, closed tabs) and the pieces of the AI tab that feed it (lock keys, the helper's instructions).
const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),{parse}=require('acorn');
const background=fs.readFileSync('background.js','utf8'),main=fs.readFileSync('core/main.js','utf8'),css=fs.readFileSync('overlay.css','utf8');
function pick(source,name){let found;(function walk(n){if(!n||typeof n!=='object'||found)return;if(n.type==='FunctionDeclaration'&&n.id&&n.id.name===name){found=source.slice(n.start,n.end);return;}for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);})(parse(source,{ecmaVersion:'latest'}));assert(found,name+' not found');return found;}
const box={};vm.createContext(box);vm.runInContext(pick(background,'createHelperRoster')+';this.make=createHelperRoster;',box);
const same=(a,b,m)=>assert.deepStrictEqual(JSON.parse(JSON.stringify(a)),b,m);
let clock=1000;const roster=()=>box.make({limit:2,now:()=>clock});
const task=name=>'Build the '+name+' system in its own folder, follow the existing naming, and test it in Play mode before you finish.';
const spec=name=>({title:name,task:task(name),area:'ServerScriptService.'+name});
{
 const r=roster(),main1={tabId:10,chat:'notion|/chat/a'};
 assert.equal(r.add({tabId:null},[spec('A')]).ok,false,'needs a chat tab');
 assert.equal(r.add(main1,[]).ok,false,'needs at least one helper');
 assert.equal(r.add(main1,Array(5).fill(spec('A'))).ok,false,'at most four per call');
 assert.match(r.add(main1,[{title:'A',task:'too short'}]).error,/complete task/,'a helper needs a full task: it has not seen the chat');
 assert.match(r.add(main1,[{task:task('A')}]).error,/title/);
 const added=r.add(main1,[spec('Lobby'),spec('Shop'),spec('Coins')],{url:'https://www.notion.so/ai',engine:'roblox'});
 assert.equal(added.ok,true);same(added.helpers.map(h=>h.status),['queued','queued','queued']);
 const first=r.next(10);same(first.map(h=>h.title),['Lobby','Shop'],'two start, the third waits in line');
 assert.equal(r.next(10).length,0,'nothing more starts while two are busy');
 r.placed(first[0].id,{tabId:21,windowId:201});r.placed(first[1].id,{tabId:22,windowId:202});
 assert.equal(r.byTab(21).title,'Lobby');
 assert.equal(r.add({tabId:21},[spec('Nested')]).ok,false,'a helper cannot start helpers');
 r.progress(21,{working:true,sent:true});r.progress(21,{step:'script_read'});r.progress(21,{step:'multi_edit'});
 let view=r.list(10)[0];assert.equal(view.status,'working');assert.equal(view.step,'multi_edit');assert.equal(view.steps,2);
 assert.equal(r.list(10)[0].task,undefined,'the panel view never carries the full task text');
 // Locks: first agent to change a script holds it while it works.
 assert.equal(r.lock(21,['ServerScriptService.Lobby.Main']).ok,true);
 assert.equal(r.lock(21,['ServerScriptService.Lobby.Main']).ok,true,'the same helper may keep editing its script');
 const refused=r.lock(22,['serverscriptservice.lobby.main']);assert.equal(refused.ok,false,'another helper is refused (names compare without case)');assert.equal(refused.holder,'Lobby');
 const mainRefused=r.lock(10,['ServerScriptService.Lobby.Main']);assert.equal(mainRefused.ok,false,'the main agent is refused too while that helper works');
 assert.equal(r.lock(10,['ReplicatedStorage.Shared']).ok,true);
 const byMain=r.lock(22,['ReplicatedStorage.Shared']);assert.equal(byMain.ok,false);assert.equal(byMain.holder,'the main agent');
 assert.equal(r.lock(22,['ServerScriptService.Shop.Main','ReplicatedStorage.Shared']).ok,false,'one held key refuses the whole change');
 assert.equal(r.lock(21,['ServerScriptService.Shop.Main']).ok,true,'a refused request took no locks');
 // Finishing frees the slot and the helper's locks; the queued helper starts.
 clock=61000;const ended=r.finish(first[0].id,{status:'done',summary:'Lobby built in ServerScriptService.Lobby.'});
 assert.equal(ended.status,'done');assert.equal(r.finish(first[0].id,{status:'failed'}),null,'a finished helper cannot be ended twice');
 assert.equal(r.lock(22,['ServerScriptService.Lobby.Main']).ok,true,'locks are released when their helper finishes');
 const third=r.next(10);same(third.map(h=>h.title),['Coins']);
 const taken=r.take(10);assert.equal(taken.length,1);assert.equal(taken[0].summary,'Lobby built in ServerScriptService.Lobby.');assert.equal(r.take(10).length,0,'results are handed over once');
 // Stop and closed windows.
 same(r.stoppable(10,first[1].id).map(h=>h.title),['Shop']);assert.equal(r.stoppable(10).length,2);
 const gone=r.tabGone(22);assert.equal(gone.ended.length,1);assert.equal(gone.ended[0].status,'stopped','closing a helper window ends that helper');
 r.placed(third[0].id,{tabId:23,windowId:203});r.finish(third[0].id,{status:'failed',summary:'Could not start'});
 assert.equal(r.lock(10,['ServerScriptService.Lobby.Main']).ok,true,'no helpers left: nothing is locked for the main agent');
 assert.equal(r.clear(10).length,3,'clear removes finished helpers');assert.equal(r.list(10).length,0);
}
{
 const r=roster();r.add({tabId:10,chat:'a'},[spec('A'),spec('B')]);const started=r.next(10);r.placed(started[0].id,{tabId:21,windowId:1});
 const copy=roster();copy.load(JSON.parse(JSON.stringify(r.dump())));assert.equal(copy.list(10).length,2,'the roster survives a background worker restart');assert.equal(copy.byTab(21).title,'A');
 assert.equal(copy.add({tabId:10},[spec('C')]).helpers[0].id,3,'ids keep counting after a restart');
 const orphaned=copy.tabGone(10);assert.equal(orphaned.orphans.length,3,'closing the main chat ends its helpers');assert.equal(copy.list(10).length,0);
 const many=roster();assert.equal(many.add({tabId:1},Array(4).fill(spec('X'))).ok,true);assert.equal(many.add({tabId:1},Array(4).fill(spec('X'))).ok,true);assert.equal(many.add({tabId:1},[spec('X')]).ok,false,'at most eight working or waiting');
}
// AI-tab pieces.
const tab={A:{},RSParse:{}};vm.createContext(tab);vm.runInContext(pick(main,'helperLockKeys')+';'+pick(main,'helperBrief')+';this.keys=helperLockKeys;this.brief=helperBrief;',tab);
same([...tab.keys({path:'src/shop.lua',new_string:'local a = 1\nreturn a'})],['src/shop.lua'],'code is never a lock key');
same([...tab.keys({edits:[{script_path:'ServerScriptService.Shop'},{script_path:'ServerScriptService.Coins'}],source:'x'.repeat(400)})],['ServerScriptService.Shop','ServerScriptService.Coins']);
same([...tab.keys({code:'print(1)'})],[],'a command that names no script or file takes no lock');
const brief=tab.brief({task:'Build the shop.',area:'ServerScriptService.Shop'});
for(const need of ['HELPER','YOUR TASK: Build the shop.','ServerScriptService.Shop','E_HELPER_LOCK','NO command','cannot start helpers'])assert(brief.includes(need),'helper instructions mention '+need);
// The AI tab's side, run with stand-ins for the page: starting helpers, waiting for them, a helper's run and report.
(async()=>{
 const a=main.indexOf('  // ── Helper agents (after 1.24.32)'),b=main.indexOf('  // The critic window: the background worker opens a fresh chat');assert(a>0&&b>a,'helper block markers');
 const P2=new Function(fs.readFileSync('core/parser.js','utf8')+';return RSParse;')();
 function page(){
  const sent=[],submitted=[],loops=[];let roster=[],canSend=true,started=true,lastReply='';
  const env={sent,submitted,loops,A:{started:true,stop:false},RSParse:P2,location:{hostname:'www.notion.so',origin:'https://www.notion.so'},Date,Math,JSON,Promise,Number,String,Array,Object,Set,
   setTimeout:(fn)=>{env.timers.push(fn);return 0;},timers:[],
   P:{id:'notion',conversationKey:()=>'/chat/a',classifyText:()=>lastReply,lastAssistant:()=>({})},
   ui:{toast(){},renderAgents(rows){env.drawn=rows;},desktopAgentState:()=>({canTaskSend:canSend&&env.A.started}),desktopAgentAction(){}},
   diag(){},sleep:async()=>{},activeEngine:()=>'roblox',bareToolName:n=>n,stopLoop(){},
   startSession:async()=>{env.A.started=true;return {ready:true};},
   submitAndGetBase:async text=>{submitted.push(text);return 7;},agentLoop:base=>{loops.push(base);},
   bg:async msg=>{sent.push(msg.request);const r=msg.request;
    if(r.action==='start'){roster=r.helpers.map((h,i)=>({id:i+1,title:h.title,status:'queued',area:h.area}));return {ok:true,helpers:roster};}
    if(r.action==='list')return env.listReply?env.listReply():{ok:true,helpers:roster};
    if(r.action==='take'){const out=roster.filter(h=>!['queued','starting','working'].includes(h.status)&&!h.delivered);out.forEach(h=>h.delivered=true);return {ok:true,results:out};}
    if(r.action==='lock')return env.lockReply||{ok:true};
    return {ok:true,stopped:1};},
   set roster(v){roster=v;},get roster(){return roster;},set reply(v){lastReply=v;},set canSend(v){canSend=v;}};
  vm.createContext(env);vm.runInContext(main.slice(a,b)+';this.api={runHelpersTool,helperRun,helperAfterRun,onHelperUpdate,helperLockRefusal,helperChatUrl};',env);return env;
 }
 const out=text=>JSON.parse(text.slice(text.indexOf('{')));
 { // main chat: start, then wait until every helper has finished
  const m=page();const startedText=await m.api.runHelpersTool({action:'start',helpers:[{title:'Shop',task:task('Shop'),area:'SSS.Shop'}]});
  assert(startedText.startsWith("Output of 'plazcode_helpers'"));const req=m.sent[0];assert.equal(req.url,'https://www.notion.so/ai','Notion helpers open a clean AI chat');assert.equal(req.engine,'roblox');assert.equal(req.chat,'notion|/chat/a');
  assert.equal(m.A.helpersActive,true);
  let polls=0;m.listReply=()=>{polls++;if(polls===3)m.roster=[{id:1,title:'Shop',status:'done',summary:'Shop built.',startedAt:0,endedAt:60000}];return {ok:true,helpers:m.roster};};
  const waited=out(await m.api.runHelpersTool({action:'wait'}));assert.equal(waited.all_finished,true);assert.equal(waited.results[0].summary,'Shop built.');assert.equal(polls,3,'wait keeps asking until nothing is working');
  assert.equal(out(await m.api.runHelpersTool({action:'wait'})).results.length,0,'results are not repeated');
  assert.match(await m.api.runHelpersTool({action:'dance'}),/unknown action/);
 }
 { // main chat idle: finished helpers are sent to the AI as one message, only when all have finished
  const m=page();m.api.onHelperUpdate([{id:1,title:'A',status:'done',summary:'A ok'},{id:2,title:'B',status:'working'}]);await new Promise(r=>setImmediate(r));
  assert.equal(m.submitted.length,0,'nothing is sent while a helper still works');assert.equal(m.A.helpersActive,true);assert.equal(m.drawn.length,2,'the Agents panel is redrawn');
  m.roster=[{id:1,title:'A',status:'done',summary:'A ok'},{id:2,title:'B',status:'failed',summary:'B broke'}];m.api.onHelperUpdate(m.roster);await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
  assert.equal(m.submitted.length,1);assert(m.submitted[0].includes('not a new request from the user'));assert(m.submitted[0].includes('B broke'));assert.deepEqual(m.loops,[7],'the main agent continues with the report');
  const busy=page();busy.canSend=false;busy.roster=[{id:1,title:'A',status:'done',summary:'A ok'}];busy.api.onHelperUpdate(busy.roster);await new Promise(r=>setImmediate(r));
  assert.equal(busy.submitted.length,0,'a busy main chat is not interrupted');assert.equal(busy.sent.filter(r=>r.action==='take').length,0,'and its results stay in the roster');
 }
 { // helper tab: gets the task, sends its instructions, and reports its last reply as the summary
  const h=page();assert.equal(h.api.helperRun({id:4,title:'Shop',task:task('Shop'),area:'SSS.Shop',engine:'roblox'}).ok,true);
  for(let i=0;i<6;i++)await new Promise(r=>setImmediate(r));
  assert.equal(h.submitted.length,1);assert(h.submitted[0].includes('YOUR TASK: '+task('Shop')));assert.deepEqual(h.loops,[7]);assert.equal(h.A.helper.sent,true);
  assert.match(await h.api.runHelpersTool({action:'start',helpers:[{title:'x',task:task('x')}]}),/helper cannot start/,'helpers cannot start helpers');
  h.reply='The shop is built in ServerScriptService.Shop and tested.';h.api.helperAfterRun();h.timers.splice(0).forEach(fn=>fn());
  const report=h.sent.find(r=>r.action==='report');assert.equal(report.status,'done');assert.equal(report.summary,'The shop is built in ServerScriptService.Shop and tested.');
  h.api.helperAfterRun();h.timers.splice(0).forEach(fn=>fn());assert.equal(h.sent.filter(r=>r.action==='report').length,1,'one report per helper');
  const cut=page();cut.api.helperRun({id:5,title:'Coins',task:task('Coins'),engine:'roblox'});for(let i=0;i<6;i++)await new Promise(r=>setImmediate(r));
  cut.reply='{"command":"script_read","params":{"path":"a"}}';cut.api.helperAfterRun();cut.timers.splice(0).forEach(fn=>fn());
  assert.equal(cut.sent.find(r=>r.action==='report').status,'failed','a run that ends on a command is not a finished helper');
  const stopped=page();stopped.api.helperRun({id:6,title:'Lobby',task:task('Lobby'),engine:'roblox'});for(let i=0;i<6;i++)await new Promise(r=>setImmediate(r));
  stopped.A.userStopped=true;stopped.reply='Half done.';stopped.api.helperAfterRun();stopped.timers.splice(0).forEach(fn=>fn());assert.equal(stopped.sent.find(r=>r.action==='report').status,'stopped');
 }
 { // edit locks, as the AI sees them
  const l=page();l.lockReply={ok:false,key:'sss.shop.main',holder:'Shop'};
  const refusal=await l.api.helperLockRefusal('multi_edit',{path:'SSS.Shop.Main'});assert.match(refusal,/^ERROR: E_HELPER_LOCK: 'sss\.shop\.main' is being changed by helper "Shop"/);assert.match(refusal,/plazcode_helpers/);
  assert.equal(await l.api.helperLockRefusal('execute_luau',{code:'print(1)'}),'','no named script or file: no lock is asked for');
  l.lockReply={ok:true};assert.equal(await l.api.helperLockRefusal('multi_edit',{path:'SSS.Coins'}),'');
 }
 console.log('PASS helper agents in the AI tab: start/wait/stop tool, one report when all helpers finish, helper run and summary, cut-off and stopped runs, lock refusals.');
})().catch(e=>{console.error(e);process.exitCode=1;});
// Wiring that must stay together.
for(const need of ['"plazcode_helpers"','plazcode_helpers: "Start helper agents','name:\'plazcode_helpers\'','if (name === "plazcode_helpers") return runHelpersTool(args);','"rs-helper-run"','"rs-helper-update"','"rs-helper-stop"','E_HELPER_LOCK','id="rs-agents"','id="rs-agents-panel"','renderAgents'])assert(main.includes(need),'core/main.js has '+need);
assert(/const denied=\/\^\(\?:[^/]*plazcode_helpers/.test(main),'helpers cannot be started from inside a batch');
for(const need of ['case "helpers":','rs-helper-run','rs-helper-ping','rsHelperRoster','type: "popup"'])assert(background.includes(need),'background.js has '+need);
for(const need of ['#rs-agents-panel{','rs-agents-spin','conic-gradient','--pc-rgb','#rs-fix,#rs-agents)'])assert(css.includes(need),'overlay.css has '+need);
console.log('PASS helper agents: queue of two, complete-task check, results handed over once, edit locks between helpers and the main agent, closed windows, worker restart, lock keys, helper instructions and wiring.');
