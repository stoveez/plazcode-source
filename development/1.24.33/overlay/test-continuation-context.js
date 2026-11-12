// Exercise the actual Continue handler: a different tab's newest note must never replace the selected chat.
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(__dirname + '/core/main.js', 'utf8');
const start = source.indexOf('      yes.onclick=async()=>{');
const action = source.slice(start, source.indexOf('      offerNode.append(', start));
async function run({states = {}, latest = null, vault = '', noteFails = false} = {}) {
  const noteReads = [], messages = [];
  const box = {
    yes:{}, no:{}, never:{}, status:{}, offerBusy:false, A:{started:true, sessionGen:1},
    P:{id:'claude', conversationKey:() => '/chat/destination', editorText:() => ''},
    location:{href:'https://claude.ai/chat/destination'}, key:'offer',
    transfer:{chat_id:'chatgpt|/c/source'}, chatNoteStates:states,
    latestHere:() => latest, noteKey:id => vault ? vault + '|' + id : id,
    PlazCodeMemory:{parseTransfer:() => ({context:'EXACT SELECTED CHAT EXCERPT'}),
      chatNoteLatest:async (path, exclude) => { noteReads.push({path, exclude}); if (noteFails) throw Error('offline'); return {path, text:'EXACT SELECTED CHAT NOTE'}; }},
    sleep:() => new Promise(() => {}), bg:async () => ({ok:false}), engramScope:() => '',
    submitAndGetBase:async text => { messages.push(text); return 0; },
    rememberChoice(){}, closeOffer(){}, agentLoop(){}
  };
  vm.createContext(box); vm.runInContext(action, box); await box.yes.onclick();
  assert.equal(messages.length, 1, box.status.textContent);
  assert(messages[0].includes('never blindly repeat an uncertain mutation'));
  return {noteReads, message:messages[0]};
}
(async () => {
  const exact = '11 Chats/source.md', other = '11 Chats/unrelated-project.md';
  let result = await run({states:{'chatgpt|/c/source':{path:exact}}, latest:{chat_id:'gemini|other', path:other}});
  assert.equal(result.noteReads[0].path, exact); assert(result.message.includes('EXACT SELECTED CHAT NOTE'));
  result = await run({latest:{chat_id:'gemini|other', path:other}});
  assert.equal(result.noteReads.length, 0); assert(result.message.includes('EXACT SELECTED CHAT EXCERPT'));
  result = await run({latest:{chat_id:'chatgpt|/c/source', path:exact}});
  assert.equal(result.noteReads[0].path, exact);
  result = await run({states:{'chatgpt|/c/source':{path:exact}, 'claude|/chat/destination':{path:exact}}});
  assert.equal(result.noteReads.length, 0); assert(result.message.includes('EXACT SELECTED CHAT EXCERPT'));
  result = await run({vault:'second', states:{'chatgpt|/c/source':{path:other}, 'second|chatgpt|/c/source':{path:exact}}});
  assert.equal(result.noteReads[0].path, exact);
  result = await run({states:{'chatgpt|/c/source':{path:exact}}, noteFails:true});
  assert(result.message.includes('EXACT SELECTED CHAT EXCERPT'));
  console.log('Continuation reads only the selected chat note in the active vault; missing/unreadable/own notes retain its excerpt.');
})().catch(e => {console.error(e); process.exitCode = 1;});
