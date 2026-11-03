const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const {parse}=require('./release-tools/node_modules/acorn');
const source=fs.readFileSync('core/main.js','utf8');
function functions(names){const found={};function walk(n){if(!n?.type)return;if(n.type==='FunctionDeclaration'&&names.includes(n.id.name))found[n.id.name]=source.slice(n.start,n.end);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v?.type)walk(v);}walk(parse(source,{ecmaVersion:'latest'}));return names.map(n=>{assert(found[n],n);return found[n];}).join('\n');}
const healthy={ok:true,bridge_reachable:true,connected:true,roblox_connected:true,local_connected:true};
async function startup(statuses){
 let now=1000,checks=0,executed=0,sends=0;const banners=[],queue=statuses.slice();
 const box={window:{},A:{started:false,startGen:0,sessionGen:1,toolList:[{name:'script_read',server:'roblox',inputSchema:{properties:{target_file:{}},required:['target_file']}}]},
 P:{id:'chatgpt',displayName:'ChatGPT',chatIsEmpty:()=>true,conversationKey:()=>'/c/test',lastAssistantId:()=>null,lastAssistant:()=>({}),setInputLock(){},ensureComposerReady:async()=>({ready:true}),isBusyNow:()=>false},
 bg:async()=>{checks++;return queue.length>1?queue.shift():queue[0];},activeEngine:()=> 'roblox',Date:{now:()=>now},sleep:async ms=>{now+=ms;},
 ensureTools:async()=>{},systemPrompt:()=> 'Startup instructions.',diag(){},RUN_CMD:'PlazCode',SendAbortedError:class extends Error{},
 ui:{setStarting(){},updateStartGate(){},inputCover(){},setStarted(){},toast(){},trackCard(){},banner:(...x)=>banners.push(x)},
 decorate:{sweep(){},toolBox(){}},rememberSession(){},rememberExecuted(){},startupTurnIdentity(){},rememberStartupOutcome(){},
 submitAndGetBase:async()=>++sends,waitForResponse:async()=>sends===1?{kind:'tool',calls:[{tool:'list_commands',arguments:{}}],item:{}}:{kind:'text',text:'PlazCode is ready.'},
 RSParse:{parseToolCalls:()=>[]},isProviderPolicyRefusal:()=>false,runTool:async()=>{executed++;return "Output of 'list_commands':\nscript_read";},
 };
 vm.createContext(box);vm.runInContext(functions(['startupConnectionError','requireStartupConnection','startupFeedbackStages','startSession']),box);
 const result=await box.startSession();return {result,box,banners,checks,executed,sends};
}
(async()=>{
 let t=await startup([healthy]);assert(t.result.ready);assert(t.box.A.started);assert.equal(t.checks,3);assert.equal(t.executed,1);
 for(const bad of [{ok:false,error:'app unavailable'},{...healthy,roblox_connected:false},{...healthy,profile_required:true}]){
  t=await startup([bad]);assert(!t.result?.ready);assert(!t.box.A.started);assert.equal(t.executed,0);assert.equal(t.sends,0);assert(t.banners.length);
 }
 t=await startup([healthy,healthy,{...healthy,connected:false}]);assert(!t.result?.ready);assert(!t.box.A.started,'A model ready reply cannot override a dropped command bridge');
 t=await startup([healthy,{...healthy,roblox_connected:false}]);assert(!t.result?.ready);assert.equal(t.sends,1,'Do not request a ready acknowledgement after losing Studio');
 const box={A:{toolList:[{name:'old_cached_tool'}]},refreshPersonalMemory:async()=>{},bg:async()=>({ok:true,fresh:false,tools:[{name:'old_cached_tool'}],error:'bridge not connected'}),diag(){},Date,setTimeout};
 vm.createContext(box);vm.runInContext(functions(['ensureTools']),box);await box.ensureTools(true);assert.equal(box.A.toolList.length,0,'Forced startup cannot use a failed refresh disguised by cached tools');
 let refreshes=0;box.A.toolList=[{name:'fresh_cached_tool'}];box.A.toolsAt=Date.now();box.TOOLS_TTL_MS=120000;box.syncDesktopToolSnapshot=()=>{};box.refreshPersonalMemory=async()=>{refreshes++;};await box.ensureTools(false);assert.equal(refreshes,0,'A current catalogue does not fetch all memory again');
 console.log('PASS actual startup: live app/profile/engine checks before sends, before acknowledgement and before Ready; lost transport and cached catalogues never confirm readiness.');
})().catch(e=>{console.error(e);process.exitCode=1;});
