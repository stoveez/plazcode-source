// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),main=fs.readFileSync('core/main.js','utf8');
const a=main.indexOf('  async function attachAutoDebug('),b=main.indexOf('  async function collectAutoDebug(',a);
let resolve,chat='a',collects=0;const pending=new Promise(r=>resolve=r),A={sessionGen:1,stop:false};
const box={A,P:{id:'claude',conversationKey:()=>chat},PlazCodeSafety:{isChange:n=>n==='edit_file'},activeEngine:()=> 'roblox',collectAutoDebug:()=>{collects++;return pending;},diag(){}};
vm.createContext(box);vm.runInContext(main.slice(a,b)+';this.attach=attachAutoDebug;',box);
(async()=>{
 const early=await box.attach('edit_file','Output: done');assert.equal(early,'Output: done');assert.equal(collects,1,'optional check starts without holding the result');
 resolve('\nConsole warning: missing asset');await new Promise(setImmediate);
 const next=await box.attach('script_read','Output: source');assert(next.includes('Console warning'));assert.equal(collects,1,'reads do not start extra console checks');
 assert.equal(await box.attach('script_read','Output: again'),'Output: again','each diagnostic rides once');
 A.debugReady={scope:'claude|a|1',text:'private old project warning'};chat='b';assert.equal(await box.attach('script_read','Output: new chat'),'Output: new chat','no cross-chat warning leak');
 console.log('PASS optional diagnostics: no delivery wait, one scoped warning handoff, no extra read probes or cross-chat leaks.');
})().catch(e=>{console.error(e);process.exitCode=1;});
