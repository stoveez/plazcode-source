// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const guard=require('./core/stall-guard.js');
const progress='The first part is done. Next is the second part, which creates the remaining requested files.';
assert.equal(typeof guard.unfinishedProgress,'function','explicit unfinished work needs a completion decision');
for(const text of [progress,'Step 1 is complete. Next I will create the remaining requested files.'])assert.equal(guard.unfinishedProgress(text),true,text);
for(const text of ['All requested work is complete. Next you can deploy it.','The first part is done. Would you like me to continue?','The first part is done. Next, paste your API key to continue.','The first part is done. Next you need to configure the account.','The first part is done. Next, if you want, I can add optional tests.','Example: "The first part is done. Next is another part."','```text\n'+progress+'\n```','The first part is done. I need your approval before the next part.'])assert.equal(guard.unfinishedProgress(text),false,text);
const core=fs.readFileSync(process.argv[2] || 'core/main.js','utf8'),start=core.indexOf('  async function agentLoop('),end=core.indexOf('  // Mark the current assistant turn',start);
async function run({repeat=false,question=false,readOnly=false,stop=false}={}){
 const sent=[],ran=[],finished=[],errors=[],banners=[];let n=0;
 const A={started:true,sessionGen:1,toolList:[],taskRequest:'Create the requested two files',imageTools:new Set(),pendingReference:''};
 const tool=()=>({kind:'tool',text:'command',item:{dataset:{}},calls:[{tool:readOnly?'workspace_info':'write_file',arguments:{path:n?'second.txt':'first.txt',content:'safe'}}]});
 const box={Map,Set,Date,Promise,A,document:{hidden:false},RS:{toolCategory:name=>name==='write_file'?'edit':'read',FEEDBACK:{}},PlazCodeStallGuard:guard,PlazCodeToolGuard:{check:()=>[],repair:x=>x},
 P:{id:'deepseek',displayName:'DeepSeek',conversationKey:()=> 'chat-a',allItems:()=>[],isUserItem:()=>false,assistantCount:()=>n,lastAssistant:()=>null,isHardGenerating:()=>false,editorText:()=>'',setInputLock(){}},
 PlazCodeReliability:{createBudget:()=>({check:()=>null,consume(){},status:()=>({used:1})})},reliabilitySettings:{},activity:{active:()=>true,sync(){},step(){}},syncActivityItems(){},markActivity(){},
 diag:(name,value)=>{if(name==='loop.error')errors.push(value);},ui:{showStop(){},inputCover(){},toast(){},trackCard(){},banner:(_,name)=>banners.push(name)},beginTaskCheckpoint:async()=>{},finishTaskCheckpoint:async complete=>finished.push(complete),cowork:{take:async()=>null,snapshot:()=>({pending:[]})},
 activeEngine:()=> 'local',bg:async()=>({ok:true}),playSfx(){},SendAbortedError:class extends Error{},decorate:{toolBox(){}},condoLocked:()=>false,
 enhanceCreationBeforeTools:async()=>{},retainedResultCorrection:()=>null,isProviderPolicyRefusal:()=>false,isCapabilityRefuse:()=>false,planOnNow:()=>false,planWantsImplementation:()=>false,looksLikePlanOnly:()=>false,
 bareToolName:x=>x,remapToolName:x=>x,argSummary:()=>'',callBody:()=>'',rememberExecuted(){},asStateTag:()=>'',feedbackIsError:()=>false,compressToolFeedback:x=>x,stripOutputPrefix:x=>x,outSummary:x=>x,inputBudget:()=>100000,formatToolFeedback:x=>x,personalMemoryContext:()=>'',lastMemoryContext:'',prepareToolFeedback:x=>x,
 runTool:async call=>{ran.push(call.arguments.path);return 'Output: saved';},submitAndGetBase:async text=>{sent.push(text);return n;},
 waitForResponse:async()=>{n++;if(n>5)throw Error('unbounded progress loop');if(n===1)return tool();if(n===2){if(stop)A.stop=true;return{kind:'text',text:question?'The first part is done. Would you like me to continue?':progress};}if(repeat)return{kind:'text',text:progress};if(n===3)return tool();return{kind:'text',text:'All requested files are complete.'};}};
 vm.createContext(box);vm.runInContext(core.slice(start,end)+';this.loop=agentLoop;',box);await box.loop(0);
 assert.deepEqual(errors,[],'actual loop must not fail on missing fixture behavior');return{sent,ran,finished,banners};
}
(async()=>{
 let r=await run();assert.equal(r.ran.length,2);assert.equal(r.sent.length,3,'one continuation between two actual tool results');assert(r.sent[1].includes('Do not repeat'));assert(r.finished.includes(true));
 r=await run({repeat:true});assert.equal(r.ran.length,1);assert.equal(r.sent.length,2);assert(!r.finished.includes(true),'repeated progress is incomplete');assert(r.banners.includes('The AI stopped before finishing'));
 for(const opts of [{question:true},{readOnly:true},{stop:true}]){r=await run(opts);assert.equal(r.sent.length,opts.stop?1:1,'no unsolicited continuation');assert.equal(r.ran.length,1);}
 console.log('PASS explicit remaining work, actual tools/progress/tools/final flow, repeated-progress bound, questions, read-only work and Stop.');
})().catch(e=>{console.error(e);process.exitCode=1;});
