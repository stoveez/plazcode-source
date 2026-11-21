const fs=require('fs'),assert=require('node:assert/strict');
const P=new Function(fs.readFileSync('core/parser.js','utf8')+';return RSParse;')();
const cmd='{"command":"list_commands","params":{}}';
const ran=(text)=>P.parseToolCalls(text).length;
const sig=(text)=>P.hasToolSignature(text);
// Real commands still run.
assert.equal(ran(cmd),1,'bare command envelope');
assert.equal(ran('I will list the commands first.\n'+cmd),1,'short preface, then the command');
assert.equal(ran('Checking.\n```json\n'+cmd+'\n```\nRunning it now.'),1,'last json fence');
assert.equal(ran('```\n'+cmd+'\n```'),1,'untagged fence');
assert.equal(ran('```text\n{"command":"example_one","params":{}}\n```\nNow the real one:\n```json\n'+cmd+'\n```'),1,'the LAST json fence is the actionable one');
// Examples, prompts for someone else, inline code and prose never run.
for(const [name,text] of [
 ['text fence',"Send this to your assistant:\n```text\nRun "+cmd+" and report back\n```\nThanks!"],
 ['plaintext fence','```plaintext\n'+cmd+'\n```'],
 ['markdown fence','```markdown\nUse '+cmd+'\n```'],
 ['inline code','To list commands send `'+cmd+'` as a message.'],
 ['sentence','You can run '+cmd+' whenever you like and then read the output of the tool carefully for any errors or surprises.'],
 ['extracted text label','plaintext\nPlease run:\n'+cmd+'\nand then report what happened.'],
]){
 assert.equal(ran(text),0,name+' must not execute');
 assert.equal(sig(text),false,name+' must not look like a command attempt (no error protocol reply)');
}
console.log('PASS only an actionable command envelope runs; examples, text fences, inline code and prose are ignored.');
