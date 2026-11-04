// Offline Chromium, native editing pipeline, complete production provider/core.
// No ChatGPT account, live website or real project tools are accessed.
const fs = require('node:fs'), assert = require('node:assert/strict');
const {chromium} = require('playwright');
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
async function pageFor(browser, core = false) {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => r.fulfill({contentType:'text/html',body:`<!doctype html><style>
    body{font:14px sans-serif}#timeline{padding-bottom:200px}form{position:fixed;bottom:20px;left:100px;width:650px}
    #prompt-textarea{white-space:pre-wrap;min-height:40px;max-height:160px;overflow:auto}button{height:30px}
    </style><main id="timeline"></main><form><div class="prosemirror-parent"><div id="prompt-textarea" contenteditable="true"></div></div>
    <button type="button" data-testid="send-button">Send</button></form>`}));
  await page.goto('https://chatgpt.com/c/offline-delivery-test');
  await page.evaluate(() => {
    window.sent = []; window.nativeCalls = []; window.autoReply = false; window.sequence = [];
    window.addItem = (role,text,id) => {
      const item = document.createElement('div'); item.dataset.messageAuthorRole=role; item.dataset.messageId=id;
      const body = document.createElement('div'); body.className='markdown';body.style.whiteSpace='pre-wrap';body.textContent=text;
      item.append(body); document.querySelector('#timeline').append(item); return item;
    };
    document.querySelector('form').onsubmit = e => e.preventDefault();
    document.querySelector('button').onclick = () => {
      const ed=document.querySelector('#prompt-textarea'),text=ed.innerText;
      sent.push(text); ed.innerHTML=''; addItem('user',text,'user-'+sent.length);
      if(autoReply) addItem('assistant',sequence.shift()||'Sequence complete.','ai-'+sent.length);
    };
    const tools=[['read_file','path'],['search_files','pattern']].map(([name,key])=>({name,server:'local',description:'Offline read-only test',inputSchema:{type:'object',properties:{[key]:{type:'string'}},required:[key]}}));
    const answer=msg=>{
      if(msg.type==='live-status')return {ok:true,bridge_reachable:true,connected:true,roblox_connected:true,local_connected:true,profile_required:false};
      if(msg.type==='call_tool'){
        if(msg.arguments?.path==='PLAZCODE_MEMORY.md'||msg.arguments?.code?.includes('read_scripts'))return {ok:true,text:'Not found: no startup memory in offline fixture'};
        nativeCalls.push(msg);return {ok:true,text:'READ ONLY RESULT\nline one\nline two\n'+(msg.arguments.path||msg.arguments.pattern)};
      }
      if(msg.type==='rs-memory')return {ok:true,memory:{entries:[]}};
      return {ok:true,fresh:true,connected:true,mcpAlive:true,roblox_connected:true,local_connected:true,tools,skills:[],templates:[],servers:[]};
    };
    const get=(_k,cb)=>{const value={rsApprovalMode:'bypass'};if(cb)queueMicrotask(()=>cb(value));return Promise.resolve(value);};
    window.chrome={runtime:{id:'offline',getManifest:()=>({version:'1.24.30'}),getURL:p=>'https://chatgpt.com/fixture/'+p,onMessage:{addListener(){}},sendMessage:(msg,cb)=>{const v=answer(msg);if(cb)queueMicrotask(()=>cb(v));return Promise.resolve(v);}},storage:{local:{get,set:()=>Promise.resolve(),remove:()=>Promise.resolve()},onChanged:{addListener(){}}}};
  });
  if(core){
    await page.addStyleTag({path:'overlay.css'});
    for(const file of manifest.content_scripts.find(x=>x.js.includes('providers/chatgpt.js')).js){
      let code=fs.readFileSync(file,'utf8');
      if(file==='providers/chatgpt.js')code+=';window.provider=RSProvider;Object.assign(RSProvider.timings,{GEN_IDLE_MS:30,WARMUP_MS:100});Object.defineProperty(RSProvider.timings,"STABLE_MS",{value:100});';
      if(file==='core/main.js')code=code.replace('const TOKEN_CHARS = 4;','window.fixture={A,submitCore,agentLoop,stopLoop};const TOKEN_CHARS = 4;');
      await page.addScriptTag({content:code});
    }
    await page.waitForSelector('#rs-bar'); await page.waitForTimeout(450);
  }else await page.addScriptTag({content:fs.readFileSync('providers/chatgpt.js','utf8')+';window.provider=RSProvider;'});
  return {page,errors};
}
async function checks(browser){
  let failed=0;
  async function check(name,core,fn){const {page,errors}=await pageFor(browser,core);try{await fn(page);assert.deepEqual(errors,[]);console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.stack);}finally{await page.close();}}
  await check('multiline draft reads exactly through native blocks and breaks',false,async page=>{
    const got=await page.evaluate(async()=>{
      const ed=provider.getEditor();ed.innerHTML='<p>first</p><p>second<br>third</p>';
      if(provider.editorText()!=='first\nsecond\nthird')throw Error('Paragraph boundaries must be preserved: '+JSON.stringify(provider.editorText()));
      ed.innerHTML='';const text='first line\n  indented 🧪\n\nlast line';const result=await provider.writeDraft(text,'');
      const read=provider.editorText(),cleared=await provider.writeDraft('',read);
      if(!cleared.ok||provider.editorText()!=='')throw Error('writeDraft must clear an existing draft');
      return {ok:result.ok,text:read,html:ed.innerHTML};
    });
    assert.equal(got.ok,true,JSON.stringify(got));assert.equal(got.text,'first line\n  indented 🧪\n\nlast line');
  });
  await check('bounded native typing yields during slow editing, never pastes or attaches',false,async page=>{
    const got=await page.evaluate(async()=>{
      const exec=document.execCommand.bind(document);let maxLines=0,beats=0,pastes=0;
      document.addEventListener('paste',()=>pastes++);
      document.execCommand=(cmd,ui,value)=>{if(cmd==='insertText'||cmd==='insertLineBreak'){const lines=cmd==='insertText'?String(value).split('\n').length:1;maxLines=Math.max(maxLines,lines);const until=performance.now()+lines*2;while(performance.now()<until){}}return exec(cmd,ui,value);};
      const timer=setInterval(()=>beats++,0),text=Array.from({length:180},(_,i)=>'line '+i).join('\n');
      const ok=await provider.typeAndSend(text);clearInterval(timer);return{ok,maxLines,beats,pastes,count:sent.length,text:sent[0]};
    });
    assert(got.maxLines<=1,'one synchronous edit received '+got.maxLines+' lines');assert(got.beats>15,'page must get regular turns while typing');assert.equal(got.pastes,0);assert.equal(got.count,1);assert.equal(got.ok,true);assert.equal(got.text,Array.from({length:180},(_,i)=>'line '+i).join('\n'));
  });
  await check('disabled Send cannot become a phantom receipt during an assistant redraw',true,async page=>{
    const got=await page.evaluate(async()=>{
      fixture.A.stop=false;fixture.A.started=true;
      document.querySelector('button[data-testid="send-button"]').disabled=true;
      const real=setTimeout;window.setTimeout=(fn,ms,...args)=>real(fn,Math.min(ms,5),...args);
      let t=Date.now();Date.now=()=>t+=150;
      real(()=>addItem('assistant','Old reply remounted','old-remount'),15);
      let error='';try{await fixture.submitCore('Output of \'read_file\':\nfirst\nlast\n\nnext action');}catch(e){error=e.message;}
      return{error,count:sent.length,draft:provider.editorText(),confirmed:!!fixture.A.confirmedSubmit};
    });
    assert(got.error,'unconfirmed send must fail explicitly: '+JSON.stringify(got));assert.equal(got.count,0);assert.equal(got.draft,'');assert.equal(got.confirmed,false);
  });
  await check('ambiguous native click is never replayed and leaves no owned result draft',false,async page=>{
    const got=await page.evaluate(async()=>{
      document.querySelector('button').onclick=()=>sent.push('clicked but not accepted');
      const real=setTimeout;window.setTimeout=(fn,ms,...args)=>real(fn,Math.min(ms,1),...args);let t=Date.now();Date.now=()=>t+=150;
      let error='';try{await provider.typeAndSend('Output of read_file:\nnot accepted');}catch(e){error=e.message;}
      return{error,count:sent.length,draft:provider.editorText()};
    });assert(got.error);assert.equal(got.count,1);assert.equal(got.draft,'');
  });
  await check('late receipt survives virtualization without waiting for an assistant',false,async page=>{
    const got=await page.evaluate(async()=>{
      addItem('user','Old user message','old-user');addItem('assistant','Old assistant message','old-ai');
      const button=document.querySelector('button');button.onclick=()=>{
        const ed=provider.getEditor(),text=ed.innerText;sent.push(text);ed.innerHTML='';
        setTimeout(()=>{document.querySelector('#timeline').innerHTML='';addItem('user',text,'new-user');},150);
      };
      const ok=await provider.typeAndSend('Output of read_file:\nnew result');return{ok,count:sent.length,users:provider.userCount(),assistants:provider.assistantCount()};
    });assert.equal(got.ok,true);assert.equal(got.count,1);assert.equal(got.users,1);assert.equal(got.assistants,0);
  });
  await check('unchanged historical receipt and a new user draft cannot confirm or erase a failed send',false,async page=>{
    const got=await page.evaluate(async()=>{
      const text='Output of read_file:\nold result';addItem('user',text,'existing-user');
      document.querySelector('button').onclick=()=>{sent.push('failed click');provider.getEditor().innerText='My new draft';};
      const real=setTimeout;window.setTimeout=(fn,ms,...args)=>real(fn,Math.min(ms,1),...args);let t=Date.now();Date.now=()=>t+=150;
      let error='';try{await provider.typeAndSend(text);}catch(e){error=e.message;}
      return{error,count:sent.length,draft:provider.editorText()};
    });assert(got.error);assert.equal(got.count,1);assert.equal(got.draft,'My new draft');
  });
  await check('composer-only mutations skip transcript work; mixed changes and remounts do not',false,async page=>{
    const got=await page.evaluate(()=>{
      const ed=provider.getEditor();document.documentElement.classList.add('rs-chatgpt-injecting');ed.innerHTML='<p>own draft</p>';
      const inside={target:ed.firstChild.firstChild},outside={target:document.querySelector('#timeline')};
      const own=provider.ignoreMutationRecords([inside]),mixed=provider.ignoreMutationRecords([inside,outside]);
      const replacement=provider.ignoreMutationRecords([{target:ed.parentNode,removedNodes:[ed]}]);
      document.documentElement.classList.remove('rs-chatgpt-injecting');const normal=provider.ignoreMutationRecords([inside]);
      return{own,mixed,replacement,normal};
    });assert.deepEqual(got,{own:true,mixed:false,replacement:false,normal:false});
  });
  await check('Stop interrupts native typing before any send',false,async page=>{
    const got=await page.evaluate(async()=>{
      let stopped=false;provider.init({isStopped:()=>stopped,sendContext:()=>({session:1,stop:stopped?1:0})});
      const exec=document.execCommand.bind(document);let edits=0;
      document.execCommand=(...args)=>{const r=exec(...args);if(++edits===8)stopped=true;return r;};
      let code='';try{await provider.typeAndSend(Array.from({length:100},(_,i)=>'line '+i).join('\n'));}catch(e){code=e.code;}
      return{code,count:sent.length,edits};
    });assert.equal(got.count,0);assert.equal(got.code,'CHATGPT_CANCELLED');assert(got.edits<15);
  });
  await check('full core completes 15 distinct read-only tool turns exactly once',true,async page=>{
    const got=await page.evaluate(async()=>{
      fixture.A.stop=false;fixture.A.started=true;fixture.A.approveAll=true;
      autoReply=true;sequence=Array.from({length:15},(_,i)=>'```json\n'+JSON.stringify({command:'read_file',params:{path:'offline-'+i+'.txt'}})+'\n```');
      const base=provider.assistantCount();addItem('user','Do the fifteen isolated reads','task');addItem('assistant',sequence.shift(),'ai-initial');
      await fixture.agentLoop(base);
      return{paths:nativeCalls.filter(x=>x.name==='read_file').map(x=>x.arguments.path),sent:sent.length,draft:provider.editorText(),running:fixture.A.running};
    });assert.deepEqual(got.paths,Array.from({length:15},(_,i)=>'offline-'+i+'.txt'));assert.equal(got.sent,15);assert.equal(got.draft,'');assert.equal(got.running,false);
  });
  await check('lost reply after successful call five recovers its result without executing it twice',true,async page=>{
    const got=await page.evaluate(async()=>{
      fixture.A.stop=false;fixture.A.started=true;fixture.A.approveAll=true;provider.timings.PRESTART_MS=1200;
      const calls=Array.from({length:15},(_,i)=>i===4?{command:'search_files',params:{pattern:'*.md'}}:{command:'read_file',params:{path:'offline-'+i+'.txt'}});
      const encode=call=>'```json\n'+JSON.stringify(call)+'\n```';sequence=calls.map(encode);autoReply=false;
      document.querySelector('button[data-testid="send-button"]').onclick=()=>{
        const ed=provider.getEditor(),text=ed.innerText;sent.push(text);ed.innerHTML='';addItem('user',text,'user-'+sent.length);
        if(sent.length===5){addItem('assistant','','ai-empty-five');return;}
        if(sent.length===6&&text.includes('Nothing was executed'))sequence.unshift(encode(calls[4]));
        addItem('assistant',sequence.shift()||'Sequence complete.','ai-'+sent.length);
      };
      const base=provider.assistantCount();addItem('user','Do fifteen isolated reads with one dropped handoff','task');addItem('assistant',sequence.shift(),'ai-first');
      await fixture.agentLoop(base);
      return{calls:nativeCalls.filter(x=>['search_files','read_file'].includes(x.name)).map(x=>[x.name,x.arguments]),sent:sent.length,recovery:sent[5],draft:provider.editorText(),running:fixture.A.running};
    });
    assert.equal(got.calls.length,15,JSON.stringify(got));assert.equal(got.calls.filter(x=>x[0]==='search_files').length,1);
    assert.equal(got.sent,16,'only one saved-result handoff; no duplicate-read round trip');
    assert(got.recovery.includes('READ ONLY RESULT')&&got.recovery.includes('*.md'),'recovery must carry the completed search result');
    assert(!got.recovery.includes('Nothing was executed'));assert.equal(got.draft,'');assert.equal(got.running,false);
  });
  if(failed)throw Error(failed+' ChatGPT delivery regressions failed');
}
module.exports={pageFor};
if(require.main===module)(async()=>{const browser=await chromium.launch({headless:true,...(process.env.PLAZCODE_CHROMIUM?{executablePath:process.env.PLAZCODE_CHROMIUM}:{}),args:['--no-sandbox']});try{await checks(browser);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
