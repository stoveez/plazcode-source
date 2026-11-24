const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('providers/notion.js','utf8');
const a=src.indexOf('  const AI_LANDING_RE'),b=src.indexOf('  const isCleanAiLanding');
assert(a>0&&b>a,'route helpers found');
const code=src.slice(a,src.indexOf('\n',b))+';this.api={threadId,isAiThread,isAiLanding,isCleanAiLanding};';
function at(pathname,search){const ctx={location:{pathname,search},URLSearchParams};vm.createContext(ctx);vm.runInContext(code,ctx);return ctx.api;}
let r=at('/chat','?wfv=chat&at=abc123');
assert.equal(r.threadId(),'abc123','custom-agent chat id comes from ?at=');
assert(r.isAiThread()&&!r.isAiLanding(),'agent chat is a thread, not a landing');
r=at('/chat','?wfv=chat');
assert.equal(r.threadId(),'');assert(r.isAiLanding()&&r.isCleanAiLanding(),'bare /chat stays a clean landing');
r=at('/chat','?t=xyz');assert.equal(r.threadId(),'xyz','older ?t= still works');
r=at('/chat/old1','');assert.equal(r.threadId(),'old1','path id still works');
r=at('/ai','?at=zzz');assert.equal(r.threadId(),'','?at= outside /chat is ignored');
r=at('/chat','?at=abc&q=hello');assert(r.isAiThread()&&!r.isCleanAiLanding(),'thread with launch text is not a clean landing');
console.log('Notion custom-agent chats are recognised by ?at= and landings stay clean.');
