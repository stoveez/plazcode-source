// Notion's transcript is flat textContent: prose and the code block after it are
// joined with no line break, and the code block's language label is glued to the
// JSON. 1.24.32 dropped every such command (the card stayed on "processing" and
// the turn ended). These shapes must run; quoted examples still must not.
const fs=require('fs'),assert=require('node:assert/strict');
const P=new Function(fs.readFileSync('core/parser.js','utf8')+';return RSParse;')();
const cmd='{"command":"list_windows","params":{}}',cmd2='{"command":"run_command","params":{"command":"dir"}}';
const names=(text)=>P.parseToolCalls(text).map(c=>c.tool);
P.setFlatTranscript(true);
for(const [name,text] of [
 ['command only',cmd],
 ['sentence glued to the command','I will list the windows now.'+cmd],
 ['language label glued in','I will list the windows now.JSON'+cmd],
 ['plain-text label glued in','I will list the windows now.Plain Text'+cmd],
 ['label and copy button text','Checking.JSONCopy'+cmd],
 ['reasoning text, inline name, then command','Analyzing tool command executionI think I will send the next command on its own, ensuring it is safe to invoke list_windows without retrying.'+cmd],
 ['closing sentence',"Listing them."+cmd+'I will wait for the result before continuing with the next step of the build.'],
]){
 assert.deepEqual(names(text),['list_windows'],name+' must run');
 assert.equal(P.hasToolSignature(text),true,name+' must count as a command attempt');
 assert.equal(P.hasCommandShape(text),true,name+' must have a command shape');
}
assert.deepEqual(names('Two things at once.JSON'+cmd+'JSON'+cmd2),['list_windows','run_command'],'several command blocks in one reply all run');
assert.deepEqual(names('Earlier you could send {"command":"example_one","params":{}} as a message, but that is only an illustration of the format and not something I am going to run here, because the window list is what matters right now and nothing else should change on this computer until I have read it carefully and compared it with the task. Now the real one.JSON'+cmd),['list_windows'],'an example far before the real command does not run');
const prose='You can send '+cmd+' whenever you like, and then read the output of the tool carefully for any errors or surprises before doing anything else. That is how the format works in general: one object, a command name, and a params object holding the exact fields the command lists.';
assert.deepEqual(names(prose),[],'a command quoted in the middle of prose does not run');
assert.equal(P.hasToolSignature(prose),false,'and sends no error protocol reply');
// Line-structured providers keep the stricter rules and gain batches of fences.
P.setFlatTranscript(false);
assert.deepEqual(names('To list windows send '+cmd),[],'same-line prose example stays ignored on line-structured sites');
assert.deepEqual(names('First.\n```json\n'+cmd+'\n```\nThen.\n```json\n'+cmd2+'\n```'),['list_windows','run_command'],'two json fences in a row run as one batch');
assert.deepEqual(names('json\n'+cmd+'\njson\n'+cmd2),['list_windows','run_command'],'two extracted code blocks run as one batch');
assert.deepEqual(names('Use {"command":"example_one","params":{}} like this:\njson\n'+cmd),['list_windows'],'an inline example just before the real block does not veto it');
P.setFlatTranscript(null);
assert.equal(/flatTranscript:\s*true/.test(fs.readFileSync('providers/notion.js','utf8')),true,'Notion declares its flat transcript');
console.log('PASS Notion flat-transcript commands run after prose/labels; batches of blocks run; quoted examples stay ignored.');
