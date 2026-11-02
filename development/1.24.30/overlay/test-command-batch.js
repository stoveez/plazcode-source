// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),{parse}=require('./release-tools/node_modules/acorn');
const P=require('./core/parser.js'),guard=require('./core/tool-guard.js'),main=fs.readFileSync('core/main.js','utf8');
const json=c=>JSON.stringify(c);
const c1={command:'read_file',params:{path:'a'}},c2={command:'edit_file',params:{path:'a',old_string:'x',new_string:'y'}};
assert.equal(P.parseToolCalls(json(c1)+'\n'+json(c2)).length,2,'collect complete sibling envelopes');
assert.equal(P.parseToolCalls(json({tool:'plazcode_batch',params:{calls:[c1,c2]}}))[0].tool,'plazcode_batch','nested children never escape their batch');
assert.equal(P.parseToolCalls(json({command:'plazcode_batch',params:{calls:[c1,c2]}}).slice(0,-1)).length,0,'incomplete outer batch never executes children');
assert(P.commandDiagnosis('{"command":"edit_file","params":{"new_string":"cut').includes('unfinished string'));
assert(P.commandDiagnosis('{"command":"edit_file","params":{"path":bad}}').includes('JSON parsing reported'));
let fn;function walk(n){if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration'&&n.id.name==='runCommandBatch')fn=main.slice(n.start,n.end);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}walk(parse(main,{ecmaVersion:'latest'}));
function fixture(fail='',changeAfter=''){
 const ran=[],steps=[],A={stop:false,sessionGen:1,toolList:[{name:'read_file',inputSchema:{type:'object',properties:{path:{type:'string'}},required:['path']}},{name:'edit_file',inputSchema:{type:'object',properties:{path:{type:'string'},old_string:{type:'string'},new_string:{type:'string'}},required:['path','old_string','new_string']}}]},box={A,P:{conversationKey:()=>'/chat/a'},Date,Math,BATCH_OWNERS:new WeakMap(),PlazCodeToolGuard:guard,remapToolName:n=>n,activeEngine:()=> 'local',activity:{step:(n)=>steps.push(n)},ui:{trackCard(){}},argSummary:()=>'',RS:{toolCategory:()=> 'read'},diag(){},runTool:async call=>{ran.push(call);if(call.tool===changeAfter)A.sessionGen++;return call.tool===fail?'ERROR: denied':'Output of '+call.tool+': completed';},feedbackIsError:s=>s.startsWith('ERROR'),outSummary:s=>s,compressToolFeedback:s=>s,bareToolName:n=>n,PlazCodeReliability:{redact:s=>s},stripOutputPrefix:s=>s,currentProject:'Game A'};
 vm.createContext(box);vm.runInContext(fn+';this.batch=runCommandBatch;',box);return {batch:box.batch,ran,A,steps};
}
(async()=>{
 const normal=fixture();const out=await normal.batch({calls:[c1,c2]});assert.equal(normal.ran.length,2);assert(out.includes('"complete":true'));assert.deepEqual(normal.steps,['read_file','edit_file']);
 const invalid=fixture();await invalid.batch({calls:[c1,{command:'edit_file',params:{path:'a'}}]});assert.equal(invalid.ran.length,0,'preflight every child before any runs');
 const fail=fixture('read_file');const err=await fail.batch({calls:[c1,c2]});assert.equal(fail.ran.length,1);assert(err.includes('"not_run":1'));assert(err.includes('NOT rolled back'));
 const moved=fixture('','read_file');await moved.batch({calls:[c1,c2]});assert.equal(moved.ran.length,1,'new session cancels remaining batch');
 const bounded=fixture();await bounded.batch({calls:Array(9).fill(c1)});assert.equal(bounded.ran.length,0);await bounded.batch({calls:[{command:'plazcode_batch',params:{calls:[c1]}}]});assert.equal(bounded.ran.length,0);
 let used=1;const limited=fixture();limited.A.taskBudget={check:()=>used>=1?'Command budget reached':'',consume:()=>used++};await limited.batch({calls:[c1,c2]});assert.equal(limited.ran.length,1,'child calls respect command budget');
 console.log('PASS command batching: complete sibling and nested shapes, no partial outer execution, ordered safety dispatch, all-child preflight, first-error/session/size/budget stops and useful malformed-command diagnoses.');
})().catch(e=>{console.error(e);process.exitCode=1;});
