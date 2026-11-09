// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
const fs=require('fs'),assert=require('node:assert/strict');
const skills=new Function(fs.readFileSync(__dirname+'/core/agent_skills.js','utf8')+';return AgentScriptSkills;')();
(async()=>{
 const before=Array.from({length:6000},(_,i)=>'original '+i+'\r\n').join('');let data=before;const calls=[];
 const output=await skills.run('append_file',{path:'large.txt',content:'new line\n'},async call=>{
  calls.push(call);if(call.tool==='file_info')return 'File: large.txt';
  if(call.tool==='read_file')return "Output of 'read_file':\nlarge.txt\n"+before.split(/\r?\n/).slice(0,4000).map((s,i)=>(i+1)+' | '+s).join('\n');
  assert.equal(call.tool,'write_file');const a=call.arguments;
  if(a.append){data+=(a.ensure_newline&&data&&!data.endsWith('\n')?'\n':'')+a.content;return "Output of 'write_file':\nAppended large.txt (9 chars).";}
  data=a.content;return "Output of 'write_file':\nOverwrote large.txt.";
 });
 assert.ok(data===before+'new line\n','append must retain EVERY original byte beyond the read/paging limit');
 assert.equal(calls.length,1,'append does not fetch a clipped numbered read and rewrite it');assert.equal(calls[0].arguments.append,true);
 assert(output.startsWith("Output of 'append_file':"));assert(output.includes('Appended'));assert(!output.includes('Overwrote'));
 let attempts=0;const error=await skills.run('append_file',{path:'large.txt',content:'more'},async call=>{attempts++;assert.equal(call.arguments.append,true);return 'ERROR calling write_file: append mode is unsupported; update the complete app.';});
 assert.equal(attempts,1);assert(error.startsWith('ERROR'));assert.equal(data,before+'new line\n','native errors never fall back to lossy read/rewrite');
 const guard=require('./core/tool-guard.js'),parser=new Function(fs.readFileSync(__dirname+'/core/parser.js','utf8')+';return RSParse;')();
 const legacy=[{name:'write_file',inputSchema:{type:'object',properties:{path:{type:'string'},content:{type:'string'}},required:['path','content']}},{name:'append_file',inputSchema:{type:'object',properties:{path:{type:'string'},content:{type:'string'}},required:['path','content']}}];
 assert(guard.check({tool:'append_file',arguments:{path:'large.txt',content:'more'}},legacy).some(x=>x.includes('E_NATIVE_VERSION')),'an older app cannot silently ignore append flags and overwrite');
 const current=structuredClone(legacy);Object.assign(current[0].inputSchema.properties,{append:{type:'boolean'},ensure_newline:{type:'boolean'}});
 assert.equal(guard.check({tool:'append_file',arguments:{path:'large.txt',content:'more'}},current).length,0);
 const main=fs.readFileSync(__dirname+'/core/main.js','utf8'),start=main.indexOf('  async function runCommandBatch('),end=main.indexOf('  async function runToolImpl(',start);let writes=0;
 const vm=require('vm'),box={A:{toolList:legacy},RSParse:parser,remapToolName:x=>x,PlazCodeToolGuard:guard,runTool:async()=>{writes++;return 'must not write';}};
 vm.createContext(box);vm.runInContext(main.slice(start,end)+';this.batch=runCommandBatch;',box);
 const blocked=await box.batch({calls:[{command:'write_file',params:{path:'first.txt',content:'new'}},{command:'append_file',params:{path:'large.txt',content:'tail'}}]});
 assert(blocked.includes('E_NATIVE_VERSION')&&blocked.includes('no batch command ran'));assert.equal(writes,0,'unsupported append is caught in all-child preflight before an earlier write');
 console.log('PASS append extra preserves complete CRLF prefix, one native append, truthful label and no fallback/replay after error.');
})().catch(e=>{console.error(e.message.split("\n")[0]);process.exitCode=1;});
