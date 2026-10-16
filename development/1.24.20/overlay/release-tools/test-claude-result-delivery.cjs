// SPDX-License-Identifier: GPL-3.0-or-later
// Offline native Chromium regression. Actual incoming Claude adapter + native
// contenteditable editing/selection. ProseMirror-shaped DOM ONLY: this is not
// the ProseMirror library, Claude's controlled model, backend, or persistence.
// Native receipts here are a local DOM-text consumer, never live host evidence.
// A zero-delay task deliberately relocates selection/replaces the editor at the
// adapter's chunk yield. One fault case returns false for one execCommand;
// all remaining edits go through Chromium's real native implementation.
// No source stripping, markup flattening, replay, tool calls, or live network.
// PLAZCODE_SOURCE: complete extension tree. PLAZCODE_CLAUDE_PROVIDER: candidate.
// PLAZCODE_CHROMIUM: executable. PLAZCODE_CLAUDE_REPORT: optional JSON evidence.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const prepared=path.resolve(__dirname,'../../../../build-src-1.24.20/PlazCode');
const root=process.env.PLAZCODE_SOURCE||path.resolve(__dirname,'..');
const providerPath=process.env.PLAZCODE_CLAUDE_PROVIDER||[path.join(root,'providers/claude.js'),path.join(prepared,'providers/claude.js')].find(p=>fs.existsSync(p));
const {chromium}=require(require.resolve('playwright',{paths:[path.join(root,'release-tools'),path.join(prepared,'release-tools'),__dirname]}));
const source=fs.readFileSync(providerPath,'utf8'),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const symbols=['local TICKETS = {','  ["<ticket>"] = "left < right > end",','  marker = "###LUA###",','  ticks = "```lua",','  tabs = "\tkeep\tspaces  exact",','  unicode = "🦊 café é 中文 العربية",','}'];
const long=['PREFIX_SENTINEL',...symbols,...Array.from({length:135},(_,i)=>`local readerLed${i} = "${'x'.repeat(55)}"`),'TAIL_SENTINEL'].join('\n');
const cases=[
 {name:'ordinary-literal-angle-hashes-fences-tabs-unicode',body:symbols.join('\n'),mode:'ordinary'},
 {name:'ordinary-9k-plus-complete-prefix-body-tail',body:long,mode:'ordinary'},
 {name:'ordinary-empty-lines-preserved-in-observation',body:'PREFIX\n\n\nlocal TICKETS = {}\n\nTAIL',mode:'ordinary'},
 {name:'ordinary-CRLF-observed-without-stripping',body:'PREFIX\r\nlocal TICKETS = {}\r\nTAIL',mode:'ordinary'},
 {name:'selection-reset-at-chunk-yield-final-line-preserved',body:long,mode:'select-all'},
 {name:'editor-remount-at-chunk-yield-final-line-preserved',body:long,mode:'remount-select-all'},
 {name:'editor-remount-without-selection-recovery',body:long,mode:'remount'},
 {name:'one-native-insert-command-fails-final-line-preserved',body:long,mode:'fail-one-insert'},
 {name:'stop-during-chunk-yield',body:long,mode:'stop'},
 {name:'conversation-change-during-chunk-yield',body:long,mode:'route-change'}
];
(async()=>{
 const executablePath=process.env.PLAZCODE_CHROMIUM||(fs.existsSync('/usr/local/bin/chromium')?'/usr/local/bin/chromium':undefined);
 const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--no-sandbox']});
 const results=[];let failed=0;
 try{for(const test of cases.filter(t=>!process.env.PLAZCODE_CLAUDE_CASE||t.name.includes(process.env.PLAZCODE_CLAUDE_CASE))){const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>.ProseMirror{width:750px;min-height:100px;white-space:pre-wrap}button{width:100px;height:30px}</style><main><section id="messages"></section><form><div class="ProseMirror" role="textbox" contenteditable="true"><p><br></p></div><button type="button" aria-label="Send message">Send</button></form></main>'}));
 // The route is fulfilled entirely locally; there is no Claude request.
 await page.goto('https://claude.ai/chat/offline-result-delivery');
 await page.addScriptTag({content:source+';window.provider=RSProvider;'});
 const text="Output of 'execute_luau':\n"+test.body;
 const observed=await page.evaluate(async({text,mode})=>{
  const original=document.querySelector('.ProseMirror'),nativeExec=document.execCommand.bind(document);
  const events=[],commands=[],receipts=[];let lines=0,scheduled=false,interfered=false,stopped=false,failures=0,nonemptyInserts=0;
  const projection=s=>s.replace(/[\r\n]/g,'');
  const snapshot=e=>({textContent:e.textContent,innerText:e.innerText,html:e.innerHTML});
  document.execCommand=function(name,ui,value){
   if(name==='insertText'&&String(value||'')){nonemptyInserts++;if(mode==='fail-one-insert'&&nonemptyInserts===5){failures++;commands.push({name,ok:false,injected:true});return false;}}
   const ok=nativeExec(name,ui,value);commands.push({name,ok});return ok;
  };
  const select=target=>{target.focus();const range=document.createRange();range.selectNodeContents(target);getSelection().removeAllRanges();getSelection().addRange(range);};
  const input=e=>{events.push({type:e.inputType,chars:e.target.textContent.length});if(e.inputType==='insertLineBreak')lines++;
   if(!scheduled&&lines===26&&['select-all','remount-select-all','remount','stop','route-change'].includes(mode)){scheduled=true;setTimeout(()=>{
    let current=document.querySelector('.ProseMirror');if(mode.startsWith('remount')){const copy=current.cloneNode(true);current.replaceWith(copy);current=copy;current.addEventListener('input',input);}
    if(mode==='select-all'||mode==='remount-select-all')select(current);
    if(mode==='stop')stopped=true;
    if(mode==='route-change')history.replaceState({},'', '/chat/another-fixture-chat');
    interfered=true;
   },0);}
  };
  original.addEventListener('input',input);
  // Local receipt consumes actual native DOM text; no source is assigned here.
  document.querySelector('button').onclick=()=>{const e=document.querySelector('.ProseMirror');receipts.push(snapshot(e));const row=document.createElement('div');row.dataset.testid='user-message';row.textContent=e.textContent;document.querySelector('#messages').append(row);e.replaceChildren();};
  window.__rsLimitOutgoing=value=>{value=String(value);if(value.length>120000)throw Error('input limit');return value;};
  provider.init({diag(){},isStopped:()=>stopped});provider.setInputLock(true);
  let error=null;try{await provider.typeAndSend(text);}catch(e){error=e.message;}
  const current=document.querySelector('.ProseMirror'),receipt=receipts[0];const sel=getSelection();let remainingTail=null;try{const tail=document.createRange();tail.selectNodeContents(current);tail.setStart(sel.anchorNode,sel.anchorOffset);remainingTail=tail.toString();}catch{}const caret={collapsed:sel?.isCollapsed,rangeCount:sel?.rangeCount,anchorName:sel?.anchorNode?.nodeName,anchorOffset:sel?.anchorOffset,inside:current.contains(sel?.anchorNode),remainingTail};
  return {error,caret,clicks:receipts.length,receipts,events,commands,interfered,failures,originalConnected:original.isConnected,draft:snapshot(current),
   receiptExact:!!receipt&&receipt.textContent===text,receiptProjectionExact:!!receipt&&projection(receipt.textContent)===projection(text),
   receiptHasPrefix:!!receipt&&receipt.textContent.includes('PREFIX_SENTINEL'),receiptHasTail:!!receipt&&receipt.textContent.includes('TAIL_SENTINEL'),
   projectedTail24Present:!!receipt&&receipt.textContent.replace(/\s+/g,'').includes(text.replace(/\s+/g,'').slice(-24)),
   createdLiteralTicketElement:!!document.querySelector('ticket')};
 },{text,mode:test.mode});
 const entry={name:test.name,mode:test.mode,sourceChars:text.length,sourceSHA256:hash(text),...observed};
 try{assert.deepEqual(errors,[],'unexpected page exceptions');if(test.mode==='ordinary'){assert.equal(observed.clicks,1,'ordinary source must submit once');assert.equal(observed.receiptProjectionExact,true,'non-newline payload characters changed');assert.equal(observed.createdLiteralTicketElement,false,'HTML-like source became markup');if(test.body===long)assert.equal(observed.receiptExact,true,'ordinary long native DOM text must remain exact');}else{if(test.mode==='fail-one-insert')assert.equal(observed.failures,1,'native failure injection must execute');else assert.equal(observed.interfered,true,'chunk-yield task must execute');assert.equal(observed.clicks,0,'unsafe or cancelled composition must fail closed BEFORE any send');assert(observed.error,'unsafe composition must report explicit failure');assert(observed.draft.textContent.length>0,'unsafe composition must preserve the remaining draft, not clean it up');}entry.pass=true;console.log('PASS',test.name);}catch(e){failed++;entry.pass=false;entry.assertion=e.message;console.log('FAIL',test.name,JSON.stringify({error:observed.error,clicks:observed.clicks,sourceChars:text.length,receiptChars:observed.receipts[0]?.textContent.length,prefix:observed.receiptHasPrefix,tail:observed.receiptHasTail,tail24:observed.projectedTail24Present,assertion:e.message}));}
 results.push(entry);await page.close();}
 }finally{await browser.close();}
 const report={providerPath,providerSHA256:hash(source),note:'Native Chromium editing/selection; ProseMirror-shaped DOM only. Acceptance and receipts are simulated DOM-text consumers, not Claude/ProseMirror/server evidence.',passed:results.length-failed,failed,results};
 if(process.env.PLAZCODE_CLAUDE_REPORT)fs.writeFileSync(process.env.PLAZCODE_CLAUDE_REPORT,JSON.stringify(report,null,2));
 console.log('SOURCE claude.js sha256='+report.providerSHA256);console.log(`${report.passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
