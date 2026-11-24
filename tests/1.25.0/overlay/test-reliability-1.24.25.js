const fs = require('node:fs'), assert = require('node:assert/strict'), vm = require('node:vm');
const main = fs.readFileSync('core/main.js','utf8'), bg = fs.readFileSync('background.js','utf8');
const creator = bg.slice(bg.indexOf('async function creatorResponse('),bg.indexOf('async function refreshProcStatus('));
const ctx = {Error}; vm.createContext(ctx); vm.runInContext(creator,ctx);
const planGate = main.slice(main.indexOf('    // Plan Mode: until'), main.indexOf('    // Ask mode:'));
const gate = new Function('A','bareName','PlazCodeSafety','requestApproval','alwaysHas',`return (async()=>{alwaysHas=alwaysHas||(()=>false);const deletes=false,safetyEngine='studio',args={};const planOnNow=()=>true;${planGate}return 'ran';})()`);
(async()=>{
  let prompts=0;
  const A={planApproved:false,approveAll:new Set(['execute_luau'])}, safety={isChange:()=>true};
  assert.equal(await gate(A,'execute_luau',safety,async()=>{prompts++;return true;}),'ran');
  assert.equal(prompts,0,'task approval is honored in Plan Mode');
  await gate(A,'write_file',safety,async()=>{prompts++;return true;}); assert.equal(prompts,1,'other changes still ask');
  A.approveAll=null; await gate(A,'execute_luau',safety,async()=>{prompts++;return true;}); assert.equal(prompts,2,'a new task asks again');
  await gate(A,'execute_luau',safety,async()=>{prompts++;return true;},tool=>tool==='execute_luau'); assert.equal(prompts,2,'saved approval survives a new task in Plan Mode');
  await assert.rejects(ctx.creatorResponse(new Response('',{status:404})),/does not provide creation previews/);
  await assert.rejects(ctx.creatorResponse(new Response('body too large',{status:413})),/smaller draft/);
  await assert.rejects(ctx.creatorResponse(new Response('',{status:200})),/invalid response/);
  assert.equal((await ctx.creatorResponse(new Response('{"ok":true,"records":[]}'))).ok,true);
  assert.equal((await ctx.creatorResponse(new Response('{"error":"revision changed"}',{status:400}))).error,'revision changed');
  assert.equal(ctx.extensionVersionWarning('1.24.25','1.24.25'),'');
  assert.match(ctx.extensionVersionWarning('1.24.25','1.24.24'),/loaded folder/);
  assert.equal(ctx.extensionVersionWarning('','1.24.24'),'');
  const version=require('./core/version.js'), now=Date.now();
  for(const status of [{latest:'1.24.25',checked_at:now-3600000},{latest:'1.24.25',checked_at:now,check_error:'Offline'}]){
    const result=version.describe('1.24.24',status,now);assert.match(result.label,/^Outdated/);assert.equal(result.color,'#ff696c');
  }
  console.log('1.24.25: task approval boundaries, creator HTTP responses, extension mismatch checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
