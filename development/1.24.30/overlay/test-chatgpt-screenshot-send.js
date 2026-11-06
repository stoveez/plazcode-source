const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),acorn=require('acorn'),{JSDOM}=require('jsdom');
const source=fs.readFileSync('providers/chatgpt.js','utf8');const functions={};
function walk(n){if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration')functions[n.id.name]=source.slice(n.start,n.end);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}walk(acorn.parse(source,{ecmaVersion:'latest'}));
(async()=>{
 for(const behavior of ['input','paste','ignored','avatar','bad-file']){
  const dom=new JSDOM('<section id="composer"><div contenteditable="true"></div><img src="https://example.test/existing.png"></section>',{runScripts:'outside-only'}),w=dom.window,d=w.document,box=d.querySelector('section'),ed=box.querySelector('div');let uploads=0;
  if(behavior==='input'){const i=d.createElement('input');i.type='file';i.accept='image/png';box.append(i);Object.defineProperty(i,'files',{writable:true});}
  const receive=()=>{uploads++;if(['input','paste'].includes(behavior)){const image=d.createElement('img');image.src='blob:uploaded-screenshot';box.append(image);}if(behavior==='avatar'){const image=d.createElement('img');image.src='https://example.test/avatar.png';box.append(image);}};
  box.querySelector('input')?.addEventListener('change',receive);ed.addEventListener('paste',receive);
  class Transfer{constructor(){this.files=[];this.items={add:f=>this.files.push(f)};Object.defineProperty(this.items,'length',{get:()=>this.files.length});}}
  class Paste extends w.Event{constructor(type,o){super(type,o);this.clipboardData=o.clipboardData;}}
  const ctx=dom.getInternalVMContext();Object.assign(w,{DataTransfer:Transfer,ClipboardEvent:Paste,getEditor:()=>ed,composerFrame:()=>box,safeQuery:(n,s)=>n.querySelector(s),safeQueryAll:(n,s)=>[...n.querySelectorAll(s)],safeClosest:(n,s)=>n.closest(s),safeRead:(f,fallback)=>{try{return f();}catch{return fallback;}},fileFromImage:()=>{if(behavior==='bad-file')throw Error('invalid image');return new w.File(['image'],'shot.png',{type:'image/png'});},waitFor:async pred=>!!pred()});
  vm.runInContext(functions.attachImages+';globalThis.attach=attachImages;',ctx);
  assert.equal(await w.attach([{data:'image'}]),['input','paste'].includes(behavior));assert.equal(uploads,behavior==='bad-file'?0:1,'exactly one upload transport');w.close();
 }
 for(const behavior of ['ready','upload-failed','disabled','delayed-receipt']){
  const dom=new JSDOM('<div contenteditable="true"></div>',{runScripts:'outside-only'}),w=dom.window,ed=w.document.querySelector('div');let clicks=0;
  const rows=[];const button={disabled:behavior==='disabled',click(){clicks++;if(behavior!=='delayed-receipt'){rows.push({id:'sent-'+clicks,text:ed.textContent});ed.textContent='';}}};
  let now=100000;w.Date.now=()=>now;w.setTimeout=(fn,ms)=>{now+=ms;queueMicrotask(fn);return 1;};
  Object.assign(w,{sendContext:()=>({session:1,stop:0}),isStopped:()=>false,conversationKey:()=>'/c/test',allItems:()=>rows,isUserItem:()=>true,itemKey:r=>r.id,itemText:r=>r.text,classifyText:r=>r.text,clearEditor:()=>{ed.textContent='';},diag(){},getEditor:()=>ed,truncateForSend:x=>x,safeRead:(f,fallback)=>{try{return f();}catch{return fallback;}},setEditorText:async(e,text,check,wrote)=>{check();e.textContent=text;wrote(text);},attachImages:async()=>behavior!=='upload-failed',waitFor:async pred=>!!pred(),sendButton:()=>button,editorText:()=>ed.textContent,stopButton:()=>null});
  // This isolated unit exercises image transport; the complete provider's
  // native receipt collectors are covered by the full-core browser suite.
  Object.assign(w,{normalizeReceiptText:x=>String(x||'').replace(/\s+/g,' ').trim(),receiptUsers:()=>rows,receiptKey:r=>r.id,userText:r=>r.text});
  vm.runInContext('let _locked=false,sendGeneration=0,lastConfirmedDelivery=null;'+functions.waitBudget+';'+functions.typeAndSend+';globalThis.send=typeAndSend;',dom.getInternalVMContext());
  if(['upload-failed','disabled','delayed-receipt'].includes(behavior))await assert.rejects(w.send('Screenshot feedback',[{data:'image'}]));else assert.equal(await w.send('Screenshot feedback',[{data:'image'}]),true);
  assert.equal(clicks,['ready','delayed-receipt'].includes(behavior)?1:0);assert.equal(ed.style.opacity,'');assert(!w.document.documentElement.classList.contains('rs-chatgpt-injecting'));w.close();
 }
 console.log('PASS ChatGPT screenshot upload confirmation, one transport, no avatar false confirmation, failure/disabled send refusal and exactly one commit even without immediate receipt.');
})().catch(e=>{console.error(e);process.exitCode=1;});
