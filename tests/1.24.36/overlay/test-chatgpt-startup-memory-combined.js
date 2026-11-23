const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('core/main.js','utf8');const start=source.indexOf('  function startupFeedbackStages('),end=source.indexOf('  function startupConnectionError(',start);
const box={P:{id:'chatgpt'},inputBudget:()=>120000,diag(){}};vm.createContext(box);vm.runInContext(source.slice(start,end),box);
const memory=[{referenceText:'exact vault notes 🌟',text:'vault separate acknowledgement',ack:'Memory 1 read'},{referenceText:'exact project memory',text:'project separate acknowledgement',ack:'Memory 2 read'}];
let stages=box.startupFeedbackStages(memory,"Output of 'list_commands':\nscript_read {target_file}");assert.equal(stages.length,1);for(const page of memory)assert(stages[0].text.includes(page.referenceText));assert(stages[0].text.endsWith('nothing else.'));assert(!stages[0].ack);
stages=box.startupFeedbackStages([{referenceText:'x'.repeat(31000),text:'complete large memory',ack:'read'}],'commands');assert.equal(stages.length,2);assert.equal(stages[0].text,'complete large memory','Large memory keeps its complete acknowledged page');
stages=box.startupFeedbackStages([{referenceText:'line\n'.repeat(230),text:'complete long-line-count memory',ack:'read'}],'commands');assert.equal(stages.length,2,'Keep high-line-count memory out of the slow combined insertion path');
box.P.id='deepseek';assert.equal(box.startupFeedbackStages(memory,'commands').length,3,'DeepSeek retains its existing startup and pacing');
console.log('PASS small complete ChatGPT memory set uses one result/ready exchange; large memory and other providers retain their acknowledged pages.');
