const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const memory=require('./core/memory.js'),main=fs.readFileSync('core/main.js','utf8');
const entries=[{id:1,text:'PRIVATE GLOBAL NOTE BODY'},{id:2,project:'Game A',text:'PRIVATE CURRENT PROJECT BODY'},{id:3,project:'Game B',text:'UNRELATED PROJECT CONTENT'}];
const summary=memory.availability({automatic:true,entries},'Game A');assert(summary.includes('2 saved notes'));assert(!summary.includes('PRIVATE')&&!summary.includes('UNRELATED'));assert(summary.includes('on demand'));assert(summary.includes('Learning is on'));assert(summary.length<800);
assert(memory.availability({automatic:false,entries},'Game B').includes('Learning is off'));
const a=main.indexOf('  async function startupMemoryStages('),b=main.indexOf('  function startupFeedbackStages(',a);
(async()=>{
 let calls=0;const box={leanStartupOn:()=>true,inputBudget:()=>120000,PlazCodeMemory:{vaultActive:()=>true,vaultReadAllPages:async()=>{calls++;return[{text:'full saved note'}];}},readProjectMemoryText:async()=>{calls++;return 'full project memory';},diag(){}};
 vm.createContext(box);vm.runInContext(main.slice(a,b)+';this.stages=startupMemoryStages;',box);
 assert.equal((await box.stages()).length,0);assert.equal(calls,0,'default must not fetch every vault/project note behind the scenes');
 box.leanStartupOn=()=>false;const full=await box.stages();assert.equal(full.length,2);assert.equal(calls,2);assert(full[0].referenceText.includes('full saved note'));assert(full[1].referenceText.includes('full project memory'));assert(full.every(s=>s.ackRe));
 console.log('PASS default memory summary preserves scope/learning rules without note dumps or bulk reads; Full startup still loads and acknowledges complete memory pages.');
})().catch(e=>{console.error(e);process.exitCode=1;});
