// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const parser=new Function(fs.readFileSync('core/parser.js','utf8')+';return RSParse;')();
const G=require('./core/tool-guard.js');
const file='ServerScriptService.GamepassService';
const tools=[{name:'script_read',inputSchema:{type:'object',additionalProperties:false,properties:{target_file:{type:'string'}},required:['target_file']}},
  {name:'write_file',inputSchema:{type:'object',additionalProperties:false,properties:{path:{type:'string'},content:{type:'string'}},required:['path','content']}}];
for(const envelope of [{command:'script_read',target_file:file},{tool:'script_read',path:file},
  {command:'script_read',arguments:{arguments:{file_path:file}}},{command:'script_read',params:JSON.stringify({target_file:file})}]){
  const calls=parser.parseToolCalls(JSON.stringify(envelope));assert.equal(calls.length,1);
  const call=G.repair(calls[0],tools);assert.deepEqual(G.check(call,tools),[]);assert.deepEqual(call.arguments,{target_file:file});
}
for(const envelope of [{command:'write_file',path:'first',params:{path:'second',content:'x'}},
  {command:'write_file',params:{path:'first',content:'x'},arguments:{path:'second',content:'x'}},
  {command:'script_read',params:{target_file:'first',path:'second'}},
  {command:'script_read',path:'first',file_path:'second'}]){
  const [call]=parser.parseToolCalls(JSON.stringify(envelope));assert(call);assert(G.check(G.repair(call,tools),tools).length,'conflicting values never run');
}
// Two distinct real paths are never guessed/renamed, and a valid property named arguments stays nested.
const move=[{name:'move',inputSchema:{type:'object',additionalProperties:false,properties:{path:{type:'string'},target_file:{type:'string'}},required:['path','target_file']}}];
let call={tool:'move',arguments:{file_path:'x'}};G.repair(call,move);assert(G.check(call,move).length);assert.equal(call.arguments.file_path,'x');
call=parser.normalizeCall({command:'script_read',target_file:file,params:{target_file:file}});assert.deepEqual(G.check(G.repair(call,tools),tools),[]);
assert.equal(parser.normalizeCall({command:'x',params:[]}),null);
assert.equal(parser.normalizeCall({command:'list_commands',server:'other',params:{server:'roblox'}}),null);
assert.equal(parser.normalizeCall({command:'list_commands',server:' roblox ',params:{server:'roblox'}}).arguments.server,'roblox');

const main=fs.readFileSync('core/main.js','utf8');
const start=main.indexOf('  function arenaToolReference('),end=main.indexOf('  // Migration only:',start);
const schema={type:'object',additionalProperties:false,required:['description','mode','items'],properties:{
  description:{type:'string',description:'A detailed field explanation. '.repeat(100)},mode:{enum:['Edit','Client','Server']},
  items:{type:'array',minItems:1,items:{type:'object',required:['action'],properties:{action:{enum:['press','release']},duration:{type:'number',maximum:10}}}},
  exact:{const:{description:'literal data',title:'also literal'}},sample:{default:{description:'default data'}},
  ref:{$ref:'#/$defs/k'},choose:{oneOf:[{type:'string'},{type:'integer',minimum:1}]},
  title:{type:'string'},examples:{type:'string'}},$defs:{k:{type:'string',pattern:'^x'}}};
const box={RS:{TOOL_NOTES:{script_read:'Read before editing.'}},bareToolName:n=>n};vm.createContext(box);
vm.runInContext(main.slice(start,end)+';this.brief=arenaToolReference;',box);
const text=box.brief({name:'script_read',description:'Read a script.',inputSchema:schema});
const result=JSON.parse(text.split('\nschema: ')[1].split('\n⚠')[0]);
assert(result.properties.description && result.properties.title && result.properties.examples,'property names are not schema annotations');
assert.equal(result.properties.description.description,undefined);
assert.deepEqual(result.properties.exact.const,schema.properties.exact.const,'constant objects remain exact data');
assert.deepEqual(result.properties.sample.default,schema.properties.sample.default);
assert.deepEqual(result.properties.items,schema.properties.items);assert.deepEqual(result.$defs,schema.$defs);
assert.deepEqual(result.required,schema.required);assert.deepEqual(result.properties.mode.enum,schema.properties.mode.enum);
assert(text.includes('Read before editing.'));assert(text.length<JSON.stringify(schema).length/2,'verbose annotations do not bloat each Arena turn');

// Exercise the actual list_commands branch: all names and helper access remain; targeted calls return the full schema.
const a=main.indexOf('    if (name === "list_commands" || name === "list_tools") {',main.indexOf('async function runToolImpl'));
const b=main.indexOf('    // ── Image attachment plumbing',a);assert(a>0&&b>a);
Object.assign(box,{A:{toolList:[...tools,{name:'complex',server:'roblox',description:'Full description.',inputSchema:schema}],bridge:{connected:true,roblox_connected:true}},
  ensureTools:async()=>{},activeEngine:()=> 'roblox',P:{id:'arena'},RSAnim:{describeCommands:()=>['animation_test: Animate.\n    bones:array']},
  PlazCodeClarification:{DESCRIPTION:'plazcode_clarify {question,options} — Ask the user.'},diag(){},connectedAddonsNote:()=> 'Also connected: blender',});
vm.runInContext('this.catalogue=async function(args){const name="list_commands";'+main.slice(a,b)+'};',box);
(async()=>{
  const short=await box.catalogue({});
  for(const name of ['script_read','write_file','complex','animation_test','plazcode_checklist','plazcode_clarify'])assert(short.includes(name),name);
  assert(short.indexOf('plazcode_checklist')<short.indexOf('schema:'),'helper names remain on the first page');
  assert(short.includes('Also connected: blender'));
  const full=await box.catalogue({command:'complex'});assert(full.includes(JSON.stringify(schema)),'full schema descriptions and constraints on request');
  assert(!full.includes('animation_test'),'a targeted lookup does not resend unrelated tools');
  assert((await box.catalogue({command:'animation_test'})).includes('bones:array'));
  assert((await box.catalogue({command:'no_such_tool'})).startsWith('ERROR:'));
  console.log('PASS Arena call shapes: flat/nested paths, conflict rejection, compact schemas preserve constraints and full targeted references remain available.');
})().catch(e=>{console.error(e);process.exit(1);});
