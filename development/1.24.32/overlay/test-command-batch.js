// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),{parse}=require('acorn');
const P=new Function(fs.readFileSync('core/parser.js','utf8')+';return RSParse;')(),guard=require('./core/tool-guard.js'),main=fs.readFileSync('core/main.js','utf8');
const json=c=>JSON.stringify(c);
const c1={command:'read_file',params:{path:'a'}},c2={command:'edit_file',params:{path:'a',old_string:'x',new_string:'y'}};
assert.equal(P.parseToolCalls(json(c1)+'\n'+json(c2)).length,2,'collect complete sibling envelopes');
assert.equal(P.parseToolCalls(json({tool:'plazcode_batch',params:{calls:[c1,c2]}}))[0].tool,'plazcode_batch','nested children never escape their batch');
assert.equal(P.parseToolCalls(json({command:'plazcode_batch',params:{calls:[c1,c2]}}).slice(0,-1)).length,0,'incomplete outer batch never executes children');
assert(P.commandDiagnosis('{"command":"edit_file","params":{"new_string":"cut').includes('unfinished string'));
assert(P.commandDiagnosis('{"command":"edit_file","params":{"path":bad}}').includes('JSON parsing reported'));
let fn;function walk(n){if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration'&&n.id.name==='runCommandBatch')fn=main.slice(n.start,n.end);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}walk(parse(main,{ecmaVersion:'latest'}));
function fixture(fail='',changeAfter=''){
 const ran=[],steps=[],A={stop:false,sessionGen:1,toolList:[{name:'read_file',inputSchema:{type:'object',properties:{path:{type:'string'}},required:['path']}},{name:'edit_file',inputSchema:{type:'object',properties:{path:{type:'string'},old_string:{type:'string'},new_string:{type:'string'}},required:['path','old_string','new_string']}}]},box={A,RSParse:P,P:{conversationKey:()=>'/chat/a'},Date,Math,BATCH_OWNERS:new WeakMap(),PlazCodeToolGuard:guard,remapToolName:n=>n,activeEngine:()=> 'local',activity:{step:(n)=>steps.push(n)},ui:{trackCard(){}},argSummary:()=>'',RS:{toolCategory:()=> 'read'},diag(){},runTool:async call=>{ran.push(call);if(call.tool===changeAfter)A.sessionGen++;return call.tool===fail?'ERROR: denied':'Output of '+call.tool+': completed';},feedbackIsError:s=>s.startsWith('ERROR'),outSummary:s=>s,compressToolFeedback:s=>s,bareToolName:n=>n,PlazCodeReliability:{redact:s=>s},stripOutputPrefix:s=>s,currentProject:'Game A'};
 vm.createContext(box);vm.runInContext(fn+';this.batch=runCommandBatch;',box);return {batch:box.batch,ran,A,steps,box};
}
(async()=>{
 const normal=fixture();const out=await normal.batch({calls:[c1,c2]});assert.equal(normal.ran.length,2);assert(out.includes('"complete":true'));assert.deepEqual(normal.steps,['read_file','edit_file']);
 for(const entry of [{name:'read_file',args:{path:'a'}},{command:'read_file',path:'a'},{tool:'read_file',arguments:'{"path":"a"}'}]){
  const same=fixture();const result=await same.batch({calls:[entry]});assert.equal(same.ran.length,1,JSON.stringify({entry,result}));assert.equal(same.ran[0].arguments.path,'a');
 }
 for(const entry of [null,[],{params:{path:'a'}},{command:'read_file',params:{path:'a'},args:{path:'b'}},{command:'read_file',params:{path:'a'},path:'b'}]){
  const malformed=fixture();const result=await malformed.batch({calls:[c1,entry]});assert.equal(malformed.ran.length,0);assert.match(result,/E_SHAPE.*calls\[1\]/);
 }
 {const unknown=fixture();const result=await unknown.batch({calls:[{command:'not_a_tool',params:{}}]});assert.equal(unknown.ran.length,0);assert.match(result,/E_COMMAND.*calls\[0\].*list_commands/);}
 const invalid=fixture();await invalid.batch({calls:[c1,{command:'edit_file',params:{path:'a'}}]});assert.equal(invalid.ran.length,0,'preflight every child before any runs');
 const fail=fixture('read_file');const err=await fail.batch({calls:[c1,c2]});assert.equal(fail.ran.length,1);assert(err.includes('"not_run":1'));assert(err.includes('NOT rolled back'));
 const moved=fixture('','read_file');await moved.batch({calls:[c1,c2]});assert.equal(moved.ran.length,1,'new session cancels remaining batch');
 const bounded=fixture();await bounded.batch({calls:Array(9).fill(c1)});assert.equal(bounded.ran.length,0);await bounded.batch({calls:[{command:'plazcode_batch',params:{calls:[c1]}}]});assert.equal(bounded.ran.length,0);
 let used=1;const limited=fixture();limited.A.taskBudget={check:()=>used>=1?'Command budget reached':'',consume:()=>used++};await limited.batch({calls:[c1,c2]});assert.equal(limited.ran.length,1,'child calls respect command budget');
 // Reads next to each other run together; changes keep their written order; a failure holds back later
 // changes but never cancels reads; picture/tab reads keep their place in line.
 const safety=require('./core/safety.js'),read=p=>({command:'read_file',params:{path:p}}),tick=()=>new Promise(r=>setTimeout(r,5));
 const timed=(failing=[])=>{const f=fixture(),log=[];let active=0;f.max=0;f.log=log;f.box.PlazCodeSafety=safety;
  f.A.toolList.push({name:'window_screenshot',inputSchema:{type:'object',properties:{}}});
  f.box.runTool=async call=>{const key=call.tool+':'+(call.arguments.path||'');active++;f.max=Math.max(f.max,active);log.push('start '+key+' active='+active);await tick();active--;log.push('end '+key);return failing.includes(call.arguments.path)?'ERROR: missing':'Output of '+call.tool+': ok';};return f;};
 {const t=timed();const text=await t.batch({calls:[read('a'),read('b'),c2,read('c')]});
  assert.equal(t.max,2,'two neighbouring reads run at the same time');
  assert.deepEqual(t.log.slice(0,2),['start read_file:a active=1','start read_file:b active=2']);
  assert.equal(t.log[4],'start edit_file:a active=1','the change waits for the reads before it');
  const body=JSON.parse(text.slice(text.indexOf('{')));assert.equal(body.complete,true);assert.deepEqual(body.results.map(r=>r.index),[1,2,3,4],'results keep the written order');}
 {const t=timed(['bad']);const text=await t.batch({calls:[read('bad'),read('b'),c2,read('c')]});
  const body=JSON.parse(text.slice(text.indexOf('{')));
  assert.deepEqual(body.results.map(r=>r.not_run?'skip':r.ok?'ok':'fail'),['fail','ok','skip','ok'],'a failed read does not cancel other reads but holds back the change');
  assert.equal(body.not_run,1);assert(text.startsWith('ERROR in plazcode_batch'));}
 {const t=timed();const text=await t.batch({calls:[{command:'window_screenshot',params:{}},{command:'window_screenshot',params:{}}]});assert.equal(t.max,1,'picture reads stay one at a time');assert(text.includes('"complete":true'));}
 {const t=fixture('edit_file');t.box.PlazCodeSafety=safety;const text=await t.batch({calls:[c2,c1,c2]});assert.deepEqual(t.ran.map(c=>c.tool),['edit_file','read_file'],'after a failed change, reads still run and later changes do not');assert(text.includes('"not_run":1'));}
 console.log('PASS command batching: complete sibling and nested shapes, no partial outer execution, ordered safety dispatch, all-child preflight, first-error/session/size/budget stops, reads in parallel with ordered changes, and useful malformed-command diagnoses.');
})().catch(e=>{console.error(e);process.exitCode=1;});
