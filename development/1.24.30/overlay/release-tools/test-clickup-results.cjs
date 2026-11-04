// Production ClickUp/core/parser, simulated AI, isolated bridge. No live project.
const {chromium,firefox}=require('playwright'),assert=require('node:assert/strict');
const {pageFor}=require('./test-clickup-browser.cjs');
async function check(browser,name){
 const {page,errors}=await pageFor(browser,false,true);
 page.on("pageerror",e=>console.log("fixture page error: "+e.message));
 const result=await page.evaluate(async()=>{
  await fixture.startSession();if(!fixture.A.started)throw Error('Startup failed');
  const notices=[],banner=fixture.ui.banner;fixture.ui.banner=(...args)=>{notices.push(args);return banner(...args);};
  const a=fixture.A,extra=Array.from({length:20},(_,i)=>({name:'blender_fixture_'+i,server:'blender',description:'Full schema '+i+' '+('precise Unicode 🧪 parameter rules; '.repeat(45)),inputSchema:{type:'object',properties:{code:{type:'string',description:'Complete code; preserve every character.'}},required:['code']}}));
  a.toolList.push(...extra);a.toolsAt=Date.now();
  const scene='SCENE RESULT\n'+('🧪 Exact object names, materials and geometry data.\n'.repeat(950))+'END OF SCENE';
  const nativeSend=chrome.runtime.sendMessage;
  chrome.runtime.sendMessage=(msg,cb)=>{
   if(msg.type==='call_tool'&&msg.name==='execute_blender_code'){
    nativeCalls.push(msg);const value={ok:true,text:scene};if(cb)queueMicrotask(()=>cb(value));return Promise.resolve(value);
   }
   return nativeSend(msg,cb);
  };
  const blender=await fixture.runTool({tool:'list_commands',arguments:{server:'blender'}});
  const roblox=await fixture.runTool({tool:'list_commands',arguments:{server:'roblox'}});
  if(blender.length<18000||roblox.length<18000)throw Error('References must exceed the old ClickUp bound');
  const steps=[
   {request:{command:'execute_blender_code',params:{code:'print("large-scene-fixture")'}},expected:"Output of 'execute_blender_code':\n"+scene},
   {request:{command:'list_commands',server:'blender'},expected:blender},
   {request:{command:'list_commands',params:{server:'roblox'}},expected:roblox},
   {request:{command:'execute_luau',params:{code:'return game:GetService("StarterGui"):GetChildren()'}},expected:null}
  ];
  const first=steps.shift();let current=first,restored='',pages=0,reads=0;const restoredResults=[];
  const button=provider.composerFrame().querySelector('[data-test="refinement-prompt-submit-button"]'),send=button.onclick;
  autoReply=false;
  button.onclick=e=>{
   send(e);const text=sent.at(-1).text;let next;
   const envelope=text.match(/^Output of '[^']+':\n([^\n]+)/);
   const packet=envelope?JSON.parse(envelope[1]).result:null;
   if(packet?.format!=='plazcode-result/1')throw Error('AI receives the versioned result envelope');
   if(packet.kind==='retained_result'){
    restored=packet.content.text;pages++;next=packet.next_call;
   }else if(packet.kind==='retained_page'){
    const meta=packet.content;if(meta.offset!==restored.length)throw Error('page starts exactly at the prior boundary');
    restored+=meta.text;pages++;reads++;
    if((meta.next_offset??meta.total_characters)!==restored.length)throw Error('no missing/duplicate page characters');
    if(meta.next_offset!==null)next={command:'plazcode_result_read',params:{id:meta.id,offset:meta.next_offset,limit:1000000}};
   }else restored=typeof packet.content==='string'?packet.content:JSON.stringify(packet.content);
   if(!next){if(current.expected){const expected=current.expected.replace(/^Output of '[^']+':\n/,'');if(restored!==expected)throw Error('Paged result changed or wrong server catalog: '+current.request.command+' (got '+restored.length+', expected body '+expected.length+')');restoredResults.push(restored);restored='';}current=steps.shift();next=current?.request;}
   addItem('assistant',next?'```json\n'+JSON.stringify(next)+'\n```':'Fixture task complete.','result-sequence-'+sent.length);
  };
  const before=sent.length,base=provider.assistantCount();
  addItem('user','Build an interactive Roblox shop using Blender models and the exact available schemas.','user-fixture-task');
  addItem('assistant','```json\n'+JSON.stringify(first.request)+'\n```','first-tool');
  await fixture.agentLoop(base);
  const owned=provider.allItems().filter(x=>provider.isUserItem(x)&&(/^Output of '/.test(provider.itemText(x))));
  for(const row of owned)row.classList.remove('rs-hidden');
  provider.enforceComposer();
  const masked=owned.length>0&&owned.every(row=>getComputedStyle(row.querySelector('[data-test="chat-item-content-area__message-body"]')).display==='none');
  return {notices,masked,messages:sent.slice(before).map(x=>x.text),calls:nativeCalls.map(x=>({name:x.name,args:x.arguments})),pages,reads,restored:restoredResults.map(x=>({length:x.length,gui:x.includes('ui_create_screen')&&x.includes('ui_create_component'),blender:x.includes('blender_fixture_19')})),running:a.running,editable:provider.getEditor().getAttribute('contenteditable')};
 });
 assert.deepEqual(result.notices,[],JSON.stringify(result.notices));
 assert.equal(result.restored.length,3,JSON.stringify(result));assert(result.restored[1].blender);assert(result.restored[2].gui);
 assert(result.messages.every(x=>x.length<18000));assert(result.reads>3);
 assert(result.masked,'paged tool feedback stays masked after host class resets');
 assert.equal(result.calls.filter(x=>x.name==='execute_blender_code').length,1,'never rerun the Blender operation to retrieve pages');
 assert.equal(result.calls.filter(x=>x.name==='execute_luau'&&x.args.code.includes('StarterGui')).length,1,'UI inspection command dispatched once');
 assert(!result.running);assert.equal(result.editable,'true');assert.deepEqual(errors,[]);
 console.log('PASS '+name+' full core: large Blender result, top-level Blender catalog, complete Roblox GUI catalog, exact retained pages and one dispatch per operation');
 await page.close();
}
(async()=>{for(const [name,engine]of [['chromium',chromium],['firefox',firefox]]){
 if(process.env.PLAZCODE_TEST_BROWSER&&process.env.PLAZCODE_TEST_BROWSER!==name)continue;
 const browser=await engine.launch({headless:true,...(name==='chromium'&&process.env.PLAZCODE_CHROMIUM?{executablePath:process.env.PLAZCODE_CHROMIUM}:{}),args:name==='chromium'?['--no-sandbox']:[]});
 let timer;try{await Promise.race([check(browser,name),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('ClickUp result fixture timed out')),240000);})]);}finally{clearTimeout(timer);await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
