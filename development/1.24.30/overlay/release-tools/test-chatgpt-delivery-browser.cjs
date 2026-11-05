// Offline Chromium, native editing pipeline, complete production provider/core.
// No ChatGPT account, live website or real project tools are accessed.
const fs = require('node:fs'), assert = require('node:assert/strict');
const {chromium} = require('playwright');
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const modelPackages=['prosemirror-state','prosemirror-view','prosemirror-model','prosemirror-schema-basic','prosemirror-transform','orderedmap'];
async function pageFor(browser, core = false, model = false) {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => {
    const module=new URL(r.request().url()).pathname.match(/^\/fixture-modules\/([^/]+)\/dist\/index.js$/);
    if(module&&modelPackages.includes(module[1]))return r.fulfill({contentType:'text/javascript',body:fs.readFileSync('release-tools/node_modules/'+module[1]+'/dist/index.js','utf8')});
    return r.fulfill({contentType:'text/html',body:`<!doctype html><style>
    body{font:14px sans-serif}#timeline{padding-bottom:200px}form{position:fixed;bottom:20px;left:100px;width:650px}
    #prompt-textarea{white-space:pre-wrap;min-height:40px;max-height:160px;overflow:auto}button{height:30px}
    </style><main id="timeline"></main><form><div class="prosemirror-parent"><div id="prompt-textarea" contenteditable="true"></div></div>
    <button type="button" data-testid="send-button">Send</button></form>`});
  });
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
    window.fixtureTools=tools;window.fixtureLive={};
    const answer=msg=>{
      if(msg.type==='live-status')return {ok:true,bridge_reachable:true,connected:true,roblox_connected:true,local_connected:true,local_full:false,local_root:'/offline/workspace',profile_required:false,...window.fixtureLive};
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
  if(model){
    await page.evaluate(packages=>{const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports:Object.fromEntries(packages.map(n=>[n,'/fixture-modules/'+n+'/dist/index.js']))});document.head.append(map);},modelPackages);
    await page.addScriptTag({type:'module',content:`
      import {EditorState} from 'prosemirror-state';import {EditorView} from 'prosemirror-view';import {schema} from 'prosemirror-schema-basic';
      const host=document.createElement('div');document.querySelector('#prompt-textarea').replaceWith(host);
      const button=document.querySelector('button[data-testid="send-button"]');button.disabled=true;
      window.modelView=new EditorView(host,{state:EditorState.create({schema}),attributes:{id:'prompt-textarea'},dispatchTransaction(tr){modelView.updateState(modelView.state.apply(tr));button.disabled=!modelView.state.doc.textContent.trim();}});
      button.onclick=()=>{const text=modelView.state.doc.textBetween(0,modelView.state.doc.content.size,'\\n','\\n');sent.push(text);modelView.dispatch(modelView.state.tr.delete(0,modelView.state.doc.content.size));addItem('user',text,'model-user-'+sent.length);};
      window.modelReady=true;
    `});
    await page.waitForFunction(()=>window.modelReady);
  }
  if(core){
    await page.addStyleTag({path:'overlay.css'});
    for(const file of manifest.content_scripts.find(x=>x.js.includes('providers/chatgpt.js')).js){
      let code=fs.readFileSync(file,'utf8');
      if(file==='providers/chatgpt.js')code+=';window.provider=RSProvider;Object.assign(RSProvider.timings,{GEN_IDLE_MS:30,WARMUP_MS:100});Object.defineProperty(RSProvider.timings,"STABLE_MS",{value:100});';
      if(file==='core/main.js')code=code.replace('const TOKEN_CHARS = 4;','window.fixture={A,submitCore,agentLoop,stopLoop,startSession,decorate};const TOKEN_CHARS = 4;');
      await page.addScriptTag({content:code});
    }
    await page.waitForSelector('#rs-bar'); await page.waitForTimeout(450);
  }else await page.addScriptTag({content:fs.readFileSync('providers/chatgpt.js','utf8')+';window.provider=RSProvider;'});
  return {page,errors};
}
async function checks(browser){
  let failed=0,executed=0;
  async function check(name,core,fn,model=false){if(process.env.PLAZCODE_CHATGPT_TEST_ONLY&&!name.includes(process.env.PLAZCODE_CHATGPT_TEST_ONLY))return;executed++;const {page,errors}=await pageFor(browser,core,model);try{await fn(page);assert.deepEqual(errors,[]);console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.stack);}finally{await page.close();}}
  await check('startup uses one verified exchange with the live command catalog supplied first',true,async page=>{
    await page.locator('#rs-bar .rs-mode-btn[data-mode="local"]').click();
    const state=await page.evaluate(async()=>{
      autoReply=true;sequence=['```json\n{"command":"list_commands"}\n```','PlazCode is ready.'];
      await fixture.startSession();return{started:fixture.A.started,sent:sent.length,first:sent[0],calls:nativeCalls.length,draft:provider.editorText(),banner:document.body.innerText.slice(-1000)};
    });assert.equal(state.started,true,JSON.stringify(state));assert.equal(state.sent,1,'a matching already-delivered live catalog needs no second AI acknowledgement turn');assert(state.first.includes('AVAILABLE COMMANDS FROM CONNECTED BRIDGE'));assert(state.first.includes('read_file'));assert.equal(state.draft,'');
  });
  await check('startup never accepts a ready claim without the parsed connection probe',true,async page=>{
    const state=await page.evaluate(async()=>{autoReply=true;sequence=['PlazCode is ready.','PlazCode is ready.'];await fixture.startSession();return{started:fixture.A.started,calls:nativeCalls.length,sends:sent.length};});
    assert.equal(state.started,false);assert.equal(state.calls,0);assert.equal(state.sends,2,'only the existing single correction is allowed');
  });
  await check('startup re-checks native transport after a valid first probe',true,async page=>{
    const state=await page.evaluate(async()=>{
      autoReply=true;sequence=['```json\n{"command":"list_commands"}\n```','PlazCode is ready.'];
      const button=document.querySelector('button[data-testid="send-button"]'),native=button.onclick;
      button.onclick=()=>{native();fixtureLive={connected:false,local_connected:false,roblox_connected:false};};
      await fixture.startSession();return{started:fixture.A.started,calls:nativeCalls.length,sends:sent.length};
    });assert.equal(state.started,false);assert.equal(state.calls,0);assert.equal(state.sends,1);
  });
  await check('startup changed catalog falls back to a fresh result acknowledgement',true,async page=>{
    await page.locator('#rs-bar .rs-mode-btn[data-mode="local"]').click();
    const state=await page.evaluate(async()=>{
      autoReply=true;sequence=['```json\n{"command":"list_commands"}\n```','PlazCode is ready.'];
      const button=document.querySelector('button[data-testid="send-button"]'),native=button.onclick;
      button.onclick=()=>{native();if(sent.length===1)fixtureTools.push({name:'new_native_tool',server:'local',description:'A changed fixture catalog',inputSchema:{type:'object',properties:{},required:[]}});};
      await fixture.startSession();return{started:fixture.A.started,sends:sent.length,latest:sent.at(-1)};
    });assert.equal(state.started,true);assert.equal(state.sends,2);assert(state.latest.includes('new_native_tool'));
  });
  for(const change of ['permission','workspace'])await check('startup changed '+change+' supplies fresh native state before Ready',true,async page=>{
    await page.locator('#rs-bar .rs-mode-btn[data-mode="local"]').click();
    const state=await page.evaluate(async change=>{
      autoReply=true;sequence=['```json\n{"command":"list_commands"}\n```','PlazCode is ready.'];
      const button=document.querySelector('button[data-testid="send-button"]'),native=button.onclick;
      button.onclick=()=>{native();if(sent.length===1)fixtureLive=change==='permission'?{local_full:true}:{local_root:'/offline/new-workspace'};};
      await fixture.startSession();return{started:fixture.A.started,sends:sent.length,latest:sent.at(-1)};
    },change);assert.equal(state.started,true);assert.equal(state.sends,2);assert(state.latest.includes(change==='permission'?'full_pc_access':'/offline/new-workspace'));
  });
  await check('startup Full mode retains the acknowledged two-stage protocol',true,async page=>{
    await page.locator('#rs-full-startup').evaluate(n=>{n.checked=true;n.dispatchEvent(new Event('change',{bubbles:true}));});
    const state=await page.evaluate(async()=>{autoReply=true;sequence=['```json\n{"command":"list_commands"}\n```','PlazCode is ready.'];await fixture.startSession();return{started:fixture.A.started,sends:sent.length};});
    assert.equal(state.started,true);assert.equal(state.sends,2);
  });
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
  await check('field native user headings and actions cannot invalidate a startup receipt',true,async page=>{
    const state=await page.evaluate(async()=>{
      const native=addItem;addItem=(role,text,id)=>{const item=native(role,text,id);if(role==='user'){const body=item.querySelector('.markdown');body.className='whitespace-pre-wrap';body.setAttribute('data-user-message-bubble','');const heading=document.createElement('h5');heading.className='sr-only';heading.textContent='You said:';item.prepend(heading);const copy=document.createElement('button');copy.textContent='Copy';item.append(copy);}return item;};
      autoReply=true;sequence=['```json\n{"command":"list_commands"}\n```','PlazCode is ready.'];
      const result=await fixture.startSession();return{ready:!!result?.ready,started:fixture.A.started,sends:sent.length,draft:provider.editorText()};
    });assert.equal(state.ready,true,JSON.stringify(state));assert.equal(state.started,true);assert.equal(state.sends,1);assert.equal(state.draft,'');
  });
  await check('native sibling role heading and masked user bubble retain the send receipt',true,async page=>{
    const result=await page.evaluate(async()=>{
      const native=addItem;addItem=(role,text,id)=>{
        if(role!=='user')return native(role,text,id);
        const turn=document.createElement('article');turn.dataset.testid='conversation-turn-'+id;
        const heading=document.createElement('h4');heading.className='sr-only m-0 select-none';heading.dataset.messageAuthorRole='user';heading.textContent='You said:';
        const shell=document.createElement('div'),bubble=document.createElement('div');bubble.setAttribute('data-user-message-bubble','');bubble.className='bg-user-message text-user-message';
        const body=document.createElement('div');body.className='text-size-chat whitespace-pre-wrap';body.textContent=text;bubble.append(body);shell.append(bubble);turn.append(heading,shell);document.querySelector('#timeline').append(turn);
        fixture.decorate.sweep();return shell;
      };
      autoReply=true;sequence=['```json\n{"command":"list_commands"}\n```','PlazCode is ready.'];
      const state=await fixture.startSession();const items=provider.allItems().filter(provider.isUserItem);
      return{ready:!!state?.ready,sends:sent.length,users:items.length,body:items.map(x=>provider.classifyText(x,'.rs-chip')).join('\n'),masked:!!document.querySelector('.rs-hidden [data-user-message-bubble]')};
    });assert.equal(result.ready,true,JSON.stringify({...result,body:result.body.slice(0,30)}));assert.equal(result.sends,1);assert.equal(result.users,1,'the screen-reader heading is not an extra user message');assert(result.body.includes('⟦RS-SYS⟧'));assert(result.masked,'run actual whole-turn decoration before confirming the receipt');
  });
  await check('field semantic text beats outer content chrome and preserves literal UI words',false,async page=>{
    const result=await page.evaluate(()=>{
      const text='You said: keep Copy and 16:22 in this actual message.\n  Preserve this line too.';
      const item=addItem('user',text,'semantic-user'),body=item.querySelector('.markdown');body.className='whitespace-pre-wrap';body.setAttribute('data-user-message-bubble','');
      const outer=document.createElement('div');outer.setAttribute('data-message-content','');item.append(outer);outer.append(body);
      const heading=document.createElement('h5');heading.className='sr-only';heading.textContent='You said:';outer.prepend(heading);const action=document.createElement('button');action.textContent='Copy';outer.append(action);
      return{expected:text,plain:provider.itemText(item).trim(),classified:provider.classifyText(item,'.rs-chip').trim()};
    });assert.equal(result.plain,result.expected);assert.equal(result.classified,result.expected);
  });
  await check('field failed bootstrap cannot regain Ready or execute its probe through auto-resume',true,async page=>{
    const state=await page.evaluate(async()=>{
      provider.typeAndSend=async text=>{addItem('user',text,'failed-bootstrap-user');addItem('assistant','```json\n{"command":"list_commands"}\n```','failed-bootstrap-probe');throw Error('fixture: native commit has no provable receipt');};
      await fixture.startSession();await new Promise(r=>setTimeout(r,2300));return{started:fixture.A.started,running:fixture.A.running,confirmed:fixture.A._confirmedStartup,calls:nativeCalls.length,groups:document.querySelectorAll('#rs-task-checklist:not([hidden])').length};
    });assert.equal(state.started,false,JSON.stringify(state));assert.equal(state.running,false);assert.equal(state.confirmed,false);assert.equal(state.calls,0);assert.equal(state.groups,0);
  });
  await check('field history enumeration performs linear DOM reads and preserves turn identity',false,async page=>{
    const data=await page.evaluate(()=>{
      const count=500;for(let i=0;i<count;i++)addItem(i%2?'assistant':'user','history '+i,'history-'+i);
      const native=Element.prototype.getAttribute;let reads=0;Element.prototype.getAttribute=function(...args){reads++;return native.apply(this,args);};
      let items;try{items=provider.allItems();}finally{Element.prototype.getAttribute=native;}
      return{count:items.length,reads,first:provider.itemKey(items[0]),last:provider.itemKey(items.at(-1))};
    });assert.equal(data.count,500);assert.equal(data.first,'history-0');assert.equal(data.last,'history-499');assert(data.reads<500*150,'500 turns caused '+data.reads+' attribute reads');console.log('FIELD history500 attribute reads: '+data.reads);
  });
  await check('field full decoration pass shares one synchronous transcript snapshot',true,async page=>{
    await page.locator('#rs-bar .rs-mode-btn[data-mode="local"]').click();
    const data=await page.evaluate(()=>{
      fixture.A.started=true;
      for(let i=0;i<100;i++){
        addItem('assistant','```json\n'+JSON.stringify({command:'read_file',params:{path:'old-'+i+'.txt'}})+'\n```','old-command-'+i);
        addItem('user',"Output of 'read_file':\nold result "+i,'old-result-'+i);
      }
      const native=document.querySelectorAll.bind(document),attribute=Element.prototype.getAttribute;let scans=0,reads=0;Element.prototype.getAttribute=function(...args){reads++;return attribute.apply(this,args);};
      document.querySelectorAll=selector=>{if(String(selector).includes('[data-message-author-role]')&&String(selector).includes('[data-user-message-bubble]')&&String(selector).includes('.markdown'))scans++;return native(selector);};
      try{fixture.decorate._didFullSweep=false;fixture.decorate.sweep();}finally{document.querySelectorAll=native;Element.prototype.getAttribute=attribute;}
      const before=provider.allItems().length;addItem('assistant','Fresh native response','new-after-sweep');
      return{scans,reads,before,after:provider.allItems().length,cards:document.querySelectorAll('.rs-chip').length};
    });assert(data.scans<=4,'one pass scanned the entire transcript '+data.scans+' times');assert(data.reads<200*400,'one pass made '+data.reads+' attribute reads');assert.equal(data.before,200);assert.equal(data.after,201,'snapshot must expire before a later native message');assert(data.cards>=100);console.log('FIELD full sweep transcript scans: '+data.scans+', attribute reads: '+data.reads);
  });
  await check('bounded native typing yields during slow editing, never pastes or attaches',false,async page=>{
    const got=await page.evaluate(async()=>{
      const exec=document.execCommand.bind(document);let maxLines=0,beats=0,pastes=0;
      document.addEventListener('paste',()=>pastes++);
      document.execCommand=(cmd,ui,value)=>{if(cmd==='insertText'||cmd==='insertLineBreak'){const lines=cmd==='insertText'?String(value).split('\n').length:1;maxLines=Math.max(maxLines,lines);const until=performance.now()+lines*2;while(performance.now()<until){}}return exec(cmd,ui,value);};
      const timer=setInterval(()=>beats++,0),text=Array.from({length:180},(_,i)=>'line '+i).join('\n');
      const ok=await provider.typeAndSend(text);clearInterval(timer);return{ok,maxLines,beats,pastes,count:sent.length,text:sent[0]};
    });
    assert(got.maxLines<=5,'one bounded native edit received '+got.maxLines+' lines');assert(got.beats>15,'page must get regular turns while typing');assert.equal(got.pastes,0);assert.equal(got.count,1);assert.equal(got.ok,true);assert.equal(got.text,Array.from({length:180},(_,i)=>'line '+i).join('\n'));
  });
  await check('real ProseMirror bounds long JSON lines and preserves Unicode at chunk boundaries',false,async page=>{
    const got=await page.evaluate(async()=>{
      const text='x'.repeat(2047)+'🧪'+JSON.stringify({result:{content:'  long source 🧪 \\n'.repeat(5000)}});
      const exec=document.execCommand.bind(document);let maxChars=0,brokenPair=false,beats=0,pastes=0;
      document.addEventListener('paste',()=>pastes++);
      document.execCommand=(cmd,ui,value)=>{if(cmd==='insertText'){const s=String(value);maxChars=Math.max(maxChars,s.length);brokenPair ||= /^[\uDC00-\uDFFF]/.test(s)||/[\uD800-\uDBFF]$/.test(s);}return exec(cmd,ui,value);};
      const timer=setInterval(()=>beats++,0);const ok=await provider.typeAndSend(text);clearInterval(timer);
      return{ok,maxChars,brokenPair,beats,pastes,count:sent.length,exact:sent[0]===text,draft:provider.editorText()};
    });assert.equal(got.ok,true);assert.equal(got.count,1);assert(got.exact);assert.equal(got.draft,'');assert(got.maxChars<=2048);assert(got.beats>10);assert.equal(got.brokenPair,false);assert.equal(got.pastes,0);
  },true);
  for(const lines of [180,450])await check('real ProseMirror model preserves '+lines+' lines, blanks, indentation and Unicode',false,async page=>{
    const got=await page.evaluate(async lines=>{
      const text=Array.from({length:lines},(_,i)=>i%11===0?'':'  const line_'+i+' = "native 🧪";').join('\n');
      let beats=0;const timer=setInterval(()=>beats++,0);const ok=await provider.typeAndSend(text);clearInterval(timer);
      return{ok,count:sent.length,exact:sent[0]===text,draft:provider.editorText(),beats};
    },lines);assert.equal(got.ok,true);assert.equal(got.count,1);assert(got.exact);assert.equal(got.draft,'');assert(got.beats>5);
  },true);
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
  await check('confirmed receipt ignores PlazCode command-card labels in the same user turn',true,async page=>{
    const got=await page.evaluate(async()=>{
      const button=document.querySelector('button[data-testid="send-button"]'),native=button.onclick;
      button.onclick=()=>{native();const user=provider.allItems().filter(provider.isUserItem).at(-1),chip=document.createElement('div');chip.className='rs-chip';chip.textContent='read_file · result';user.prepend(chip);};
      const ok=await provider.typeAndSend("Output of 'read_file':\nreal exact result");return{ok,sends:sent.length};
    });assert.equal(got.ok,true);assert.equal(got.sends,1);
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
  if(!executed)throw Error('No ChatGPT delivery check matched the requested filter');
  if(failed)throw Error(failed+' ChatGPT delivery regressions failed');
  console.log(executed+' ChatGPT delivery checks passed.');
}
module.exports={pageFor};
if(require.main===module)(async()=>{const browser=await chromium.launch({headless:true,...(process.env.PLAZCODE_CHROMIUM?{executablePath:process.env.PLAZCODE_CHROMIUM}:{}),args:['--no-sandbox']});try{await checks(browser);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
