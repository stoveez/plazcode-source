const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const parser=new Function(fs.readFileSync('core/parser.js','utf8')+';return RSParse;')();
const bare='</｜DSML｜>\n';
const valid='<｜DSML｜invoke name="write_file"><｜DSML｜parameter name="path" string="true">example.txt</｜DSML｜parameter><｜DSML｜parameter name="content" string="true">'+bare.repeat(48)+'</｜DSML｜parameter></｜DSML｜invoke>';
assert.equal(parser.parseToolCalls(valid)[0].arguments.content,bare.repeat(48).trimEnd());
const source=fs.readFileSync('core/main.js','utf8'),from=source.indexOf('  async function waitForResponse('),to=source.indexOf('\n  // ═',from);
async function run({streaming=false,stopWorks=true,reply,prefix='',token='fresh',changeOwner=false}={}){
 let now=1000,hard=streaming,count=streaming?1:48,stops=0;const item={dataset:{}};
 const A={sessionGen:1,sendToken:'before',stop:false,detectedTool:null};
 const P={id:'deepseek',displayName:'DeepSeek',conversationKey:()=> 'chat-a',isHardGenerating:()=>hard,isGenerating:()=>hard,
 readAssistant:()=>({item,reply:reply??prefix+bare.repeat(count),thinking:''}),lastAssistantId:()=>token,assistantCount:()=>2,scanError:()=>null,isTooLongMsg:()=>false,isBusyMsg:()=>false,turnComplete:()=>!hard,turnHalted:()=>false,findContinueBtn:()=>null,
 stopGeneration:()=>{stops++;if(stopWorks)hard=false;},editorText:()=>''};
 const box={A,P,RSParse:parser,T:{RESPONSE_TIMEOUT_MS:30000,STABLE_MS:500,WARMUP_MS:100,REASON_NOREPLY_MS:100,PRESTART_MS:100,GEN_STOP_GRACE_MS:250},Date:{now:()=>now},document:{hidden:false},bgMode:false,diag(){},log(){},ui:{toast(){}},sleep:async ms=>{now+=ms;count++;if(changeOwner)A.sessionGen++;if(now>40000)throw Error('protocol was never resolved');}};
 vm.createContext(box);vm.runInContext(source.slice(from,to)+';this.watch=waitForResponse;',box);
 const result=await box.watch(1);return{result,stops,elapsed:now-1000};
}
(async()=>{
 let r=await run();assert.equal(r.result.kind,'parse_error');
 assert.equal(parser.orphanDsmlClosers(valid),0);
 assert.equal(parser.orphanDsmlClosers(valid.slice(0,valid.indexOf('</｜DSML｜parameter></｜DSML｜invoke>'))),0,'an unfinished parameter may contain literal tags');
 assert.equal(parser.orphanDsmlClosers(bare.repeat(48)),48);
assert.equal(parser.orphanDsmlClosers('A prose example: '+bare.repeat(48)),0);
assert.equal(parser.orphanDsmlClosers('```text\n'+bare.repeat(48)+'```'),0);
assert.equal(parser.orphanDsmlClosers(JSON.stringify({command:'write_file',params:{path:'example.txt',content:bare.repeat(48)}})),0,'tool data is never protocol runaway');
 assert.equal(r.result.reason,'dsml_orphan');assert.equal(r.stops,0);
 r=await run({streaming:true});assert.equal(r.result.kind,'parse_error');assert.equal(r.result.reason,'dsml_orphan');assert.equal(r.stops,1);assert(r.elapsed<10000,'growing orphan tokens are bounded');
 const complete='<｜DSML｜invoke name="read_file"><｜DSML｜parameter name="path" string="true">safe.txt</｜DSML｜parameter></｜DSML｜invoke>\n';
 r=await run({streaming:true,prefix:complete});assert.equal(r.result.kind,'tool');assert.equal(r.stops,1);assert.equal(r.result.calls.length,1);assert.equal(r.result.calls[0].arguments.path,'safe.txt');
 r=await run({streaming:true,prefix:'<｜DSML｜tool_calls>\n'+complete});assert.equal(r.result.kind,'parse_error');assert.equal(r.stops,1);assert.equal(r.result.calls,undefined,'unclosed outer wrappers never release partial child calls');
 r=await run({streaming:true,prefix:'{"command":"read_file","params":{"path":"safe.json"}}\n'});assert.equal(r.result.kind,'tool');assert.equal(r.stops,1);assert.equal(r.result.calls.length,1);assert.equal(r.result.calls[0].arguments.path,'safe.json');
 for(const text of ['{"command":"write_file","params":{"content":"'+bare.repeat(48),'<｜DSML｜invoke name="write_file"><｜DSML｜parameter name="content" string="true">'+bare.repeat(48),'```text\n'+complete+bare.repeat(48)])assert.equal(parser.dsmlClosingRun(text),null,'unfinished arguments and literal examples cannot be interrupted as trailers');
 r=await run({streaming:true,stopWorks:false});assert.equal(r.result.kind,'protocol_error');assert.equal(r.stops,1,'never hammer Stop or send while a native stop is unconfirmed');
 r=await run({streaming:true,reply:bare.repeat(2)});assert.equal(r.result.kind,'parse_error');assert.equal(r.stops,1,'a few frozen invalid tokens cannot hang forever either');
 r=await run({streaming:true,changeOwner:true});assert.equal(r.result.kind,'stopped');assert.equal(r.stops,0,'old owner cannot stop another session');
 r=await run({streaming:true,token:'before',reply:bare.repeat(48)});assert.equal(r.stops,0,'historical orphan text cannot stop a fresh native generation');
 for(const text of ['```text\n'+bare.repeat(48)+'```',JSON.stringify({result:{format:'plazcode-result/1',content:bare.repeat(48)}})]){r=await run({reply:text});assert.equal(r.stops,0);assert.equal(r.result.kind,'text');}
 const painted=[],visual={A:{started:true,running:true},P:{id:'deepseek',classifyText:()=>bare.repeat(48),isAssistantItem:()=>true},RSParse:parser};
 vm.createContext(visual);const cs=source.indexOf('    classify(item, next) {'),ce=source.indexOf('    sweep() {',cs);vm.runInContext('this.view={'+source.slice(cs,ce)+'chip:(_,opts)=>painted.push(opts)};',Object.assign(visual,{painted}));
 visual.view.classify({dataset:{},querySelector:()=>null},null);assert.equal(painted[0].whole,true);assert.equal(painted[0].label,'Tool format');assert.equal(painted[0].phase,'run');
 visual.A.running=false;visual.view.classify({dataset:{},querySelector:()=>null},null);assert.equal(painted[1].phase,'err','orphan tokens never become a green completed command');
 // The actual loop gets one format correction, then pauses. It never routes
 // orphan tokens to a tool or silently completes the user's task.
 let sent=0,ran=0;const finished=[],banners=[];
 const box={Map,Set,Date,Promise,A:{started:true,sessionGen:1,toolList:[],taskRequest:'Read tools one per turn'},
 P:{id:'deepseek',displayName:'DeepSeek',conversationKey:()=> 'chat-a',allItems:()=>[],isUserItem:()=>false,assistantCount:()=>1,lastAssistant:()=>null,isHardGenerating:()=>false,editorText:()=>'',setInputLock(){}},document:{hidden:false},
 PlazCodeReliability:{createBudget:()=>({})},reliabilitySettings:{},condoLocked:()=>false,activity:{active:()=>true,sync(){}},syncActivityItems(){},markActivity(){},diag(){},
 ui:{showStop(){},inputCover(){},toast(){},setStatus(){},banner:(_,name)=>banners.push(name)},beginTaskCheckpoint:async()=>{},finishTaskCheckpoint:async complete=>finished.push(complete),cowork:{take:async()=>null,snapshot:()=>({pending:[]})},
 activeEngine:()=> 'local',bg:async()=>({ok:true}),playSfx(){},SendAbortedError:class extends Error{},decorate:{toolBox(){}},RS:{toolCategory:()=> 'tool'},RSParse:parser,
 runTool:async()=>{ran++;return 'must not run';},submitAndGetBase:async text=>{assert(text.includes('E_PROTOCOL'));sent++;return 0;},waitForResponse:async()=>({kind:'parse_error',reason:'dsml_orphan',raw:bare.repeat(48),item:{}})};
 vm.createContext(box);const start=source.indexOf('  async function agentLoop('),end=source.indexOf('  // Mark the current assistant turn',start);vm.runInContext(source.slice(start,end)+';this.loop=agentLoop;',box);
 await box.loop(0);assert.equal(sent,1);assert.equal(ran,0);assert(banners.includes('AI repeated an unusable tool format'));assert(!finished.includes(true));assert.equal(box.A.running,false);
 console.log('PASS ended/growing orphan DSML, confirmed bounded Stop, one format repair/no tools/no false completion, literal data and session ownership.');
})().catch(e=>{console.error(e);process.exitCode=1;});
