const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('core/main.js','utf8');
// 1.24.24: the send block starts with the budgeted assembly (PlazCode extras fit the user's input limit).
const start=source.indexOf("          // 1.24.24: everything PlazCode adds to a result fits the user's input limit (see fitExtra).");
assert(start>=0);
const end=source.indexOf('          markActivity(',start);
const code=source.slice(start,end);
async function check(feedback,images,failures=0,kind,completedWork=0){
 const tool=(feedback.match(/^Output of '([^']+)'/)||[])[1]||'read_file';
 const sent=[];const box={completedWork,P:{conversationKey:()=>'/c/test'},activeEngine:()=> 'local',completedFeedback:null,completeFeedback:feedback,call:{tool},isErr:failures>0,stateTag:'[SYSTEM_STATE: fixture]',resultPageSize:()=>120000,stripOutputPrefix:s=>s.replace(/^Output of '[^']*':\n?/,''),feedbackIsError:s=>s.startsWith('ERROR'),feedback,failedToolAttempts:failures,calls:[{tool,params:{}}],characterLimits:{rsInputLimitEnabled:true,rsInputCharLimit:120000},lastMemoryContext:'',personalMemoryContext:()=>'Saved memory context',compressToolFeedback:t=>t,A:{sessionGen:1,pendingImages:images,requestKind:kind},base:9,diag(){},ui:{banner(){}},submitAndGetBase:async(text,attachments)=>{sent.push({text,attachments});return 10;}};
 vm.createContext(box);
 // Load the real provider-feedback helper used by the production send block.
 vm.runInContext(source.slice(source.indexOf('  function prepareToolFeedback('),source.indexOf('  async function attachAutoDebug(')),box);
 vm.runInContext(source.slice(source.indexOf('  function inputBudget() {'),source.indexOf('  function resultPageSize() {')),box);
 vm.runInContext(source.slice(source.indexOf('  function formatToolFeedback('),source.indexOf('  function prepareToolFeedback(')),box);
 await vm.runInContext('(async()=>{for(let i=0;i<1;i++){'+code+'}})()',box);
 assert.equal(sent.length,1);const result=JSON.parse(sent[0].text.split('\n')[1]).result;
 assert.equal(result.content,feedback.replace(/^Output of '[^']*':\n?/,''));assert.equal(result.tool,tool);assert.equal(result.ok,failures===0);
 assert(sent[0].text.includes('Saved memory context'));assert(sent[0].text.endsWith('[SYSTEM_STATE: fixture]'));assert.equal(sent[0].attachments,images);assert.equal(box.base,10);
 if(kind==='quick')assert(sent[0].text.includes(completedWork>0?'Finish only any remaining work already requested':'quick user request'));if(failures>=3)assert(sent[0].text.includes('try a different approach'));if(images)assert.equal(result.kind,'image');
 assert.equal(box.A.pendingImages,null);
}
(async()=>{await check("Output of 'read_file':\n1 | exact text",null);await check('ERROR: script not found',null,1);await check('Screenshot result',[{data:'exact image'}]);await check('ERROR: third failure',null,3);await check("Output of 'list_commands':\nread_file",null,0,'quick');await check("Output of 'write_file':\nsaved",null,0,'quick',1);assert(!source.includes('if (A.toolCallsSinceReminder >= REMIND_TOOLS_EVERY)'));console.log('Actual tool-feedback send block delivers success/error/images once, retains changed memory context, and keeps running after repeated failures with a change-approach note without scheduled reminders.');})().catch(e=>{console.error(e);process.exitCode=1;});
