// DeepSeek, Qwen, Kimi and other sites read a reply as textContent, which glues the code block's header bar
// ("json", "Copy", "Download") and the paragraph before it straight onto the command. 1.24.31-1.24.32 required
// a command to start its own line, so these sites never ran the startup probe ("Startup handshake failed:
// DeepSeek did not produce the required list_commands tool call"). These shapes must run; prose and
// text-labelled blocks must not.
const fs=require('fs'),assert=require('node:assert/strict');
const P=new Function(fs.readFileSync('core/parser.js','utf8')+';return RSParse;')();
const probe='{"command":"list_commands"}',cmd='{"command":"list_windows","params":{}}';
const names=t=>P.parseToolCalls(t).map(c=>c.tool).join(',');
P.setFlatTranscript(false); // these sites are not marked flat: the general rule has to cover them
for(const [why,text,want] of [
 ['DeepSeek code block header glued on','jsonCopyDownload'+probe,'list_commands'],
 ['header on its own lines','json\nCopy\nDownload\n'+probe,'list_commands'],
 ['paragraph glued onto the header','Sure, here is the probe.jsonCopyDownload'+probe,'list_commands'],
 ['Qwen-style header','jsonCopy'+cmd,'list_windows'],
 ['header with "Copy code"','luaCopy code'+cmd,'list_windows'],
 ['sentence glued onto the command','Listing them.'+cmd,'list_windows'],
 ['sentence then a space','Listing them. '+cmd,'list_windows'],
 ['language then a space','json '+cmd,'list_windows'],
 ['header button then a space','jsonCopy '+cmd,'list_windows'],
]){assert.equal(names(text),want,why+' must run');assert.equal(P.hasToolSignature(text),true,why+' counts as a command attempt');}
for(const [why,text] of [
 ['prose example on the same line','To list windows send '+cmd],
 ['prose word then a space','Use '+cmd],
 ['example after a colon and a word','Example: send '+cmd],
 ['text-labelled block, glued','textCopy'+cmd],
 ['plaintext-labelled block with buttons','plaintextCopyDownload'+cmd],
 ['markdown-labelled block','markdown'+cmd],
 ['Plain Text label','Plain TextCopy'+cmd],
]){assert.equal(names(text),'',why+' must not run');assert.equal(P.hasToolSignature(text),false,why+' sends no error reply');}
P.setFlatTranscript(null);
console.log('PASS code blocks whose header is glued onto the command (DeepSeek, Qwen, ...) run; prose examples and text-labelled blocks do not.');
