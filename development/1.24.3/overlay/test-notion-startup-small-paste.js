const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
(async()=>{for(const behavior of ['retain','reject','stop','remount','foreign']){
 const dom=new JSDOM('<main><section id="composer"><div role="textbox" contenteditable="true" data-placeholder="Frage Notion AI"></div><div role="button" data-testid="agent-chat-send-button" aria-label="Nachricht senden">Send</div></section></main>',{url:'https://app.notion.com/ai',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 let ed=w.document.querySelector('[role=textbox]'),model='',commits=0,pastes=0,stopped=false;const sent=[];
 w.HTMLElement.prototype.getBoundingClientRect=function(){return {left:200,top:600,width:650,height:this===ed?40:100,right:850,bottom:700};};
 class Transfer{constructor(){this.data={};}setData(k,v){this.data[k]=v;}getData(k){return this.data[k]||'';}}
 class Paste extends w.Event{constructor(type,options){super(type,options);this.clipboardData=options.clipboardData;}}
 w.DataTransfer=Transfer;w.ClipboardEvent=Paste;w.document.execCommand=()=>false;
 ed.addEventListener('paste',e=>{
  e.preventDefault();pastes++;const plain=e.clipboardData.getData('text/plain');assert(plain.length<=600);assert(plain.split('\n').length<=13);
  if(behavior==='reject')return;
  const selection=w.getSelection();if(!selection.isCollapsed)model='';model+=plain;ed.textContent=model;
  if(behavior==='stop')stopped=true;
  if(behavior==='remount'){const next=ed.cloneNode();next.textContent='User draft';ed.replaceWith(next);ed=next;}
 });
 w.document.querySelector('[role=button]').addEventListener('click',()=>{
  commits++;sent.push(model);model='';ed.textContent='';const row=w.document.createElement('div');row.setAttribute('data-agent-service-scroll-anchor','user-'+commits);row.style.justifyContent='flex-end';row.textContent=sent.at(-1);w.document.body.append(row);w.provider.invalidateItems();w.history.replaceState({},'','/chat/small-paste');
 });
 try{
  vm.runInContext(fs.readFileSync('providers/notion.js','utf8')+';globalThis.provider=RSProvider;',dom.getInternalVMContext());const p=w.provider;p.init({isStopped:()=>stopped});p.setInputLock(true);
  if(behavior==='foreign'){const file=w.document.createElement('div');file.setAttribute('data-testid','attachment');file.textContent='My reference.png';w.document.querySelector('#composer').prepend(file);}
  const startup='⟦RS-SYS⟧\n'+('Keep **literal** C:\\Exact\\File <tags> 🧠\n').repeat(180)+'\nEmit list_commands first.';
  assert(startup.length>2500&&startup.length<32768);const ok=await p.typeAndSend(startup);
  if(behavior==='retain'){
   assert(ok,p.sendFailureDetail());assert.equal(sent[0],startup);assert.equal(commits,1);assert(pastes>1);assert.equal(w.document.querySelector('[data-testid=attachment]'),null);
   const result="Output of 'list_commands':\n"+'read_file {path}\n'.repeat(3000);assert(await p.typeAndSend(result),p.sendFailureDetail());assert.equal(sent[1],result);assert.equal(commits,2);
  }else{assert.equal(ok,false);assert.equal(commits,0);if(behavior==='foreign'){assert.equal(pastes,0);assert(w.document.querySelector('[data-testid=attachment]').isConnected);}if(behavior==='remount')assert.equal(ed.textContent,'User draft');}
  p.setInputLock(false);console.log('PASS Notion small-paste '+behavior+': unavailable native editing/file upload, German composer, exact complete startup/catalogue and no partial or duplicate commit.');
 }finally{w.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
