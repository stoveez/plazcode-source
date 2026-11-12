// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// 1.24.33 (owner, 2026-11-12: "people can't use Blender tools / can't model while on RobloxScript"). The real
// PlazCode AI-tab code in Chromium (shared fixture, fake background). Blender commands always reached Blender; what
// stopped the AI was what it was told. This checks what the AI is told in RobloxScript (and AgentScript) now.
const fs=require('fs'),assert=require('node:assert/strict'),{createRequire}=require('module');
const source=process.cwd(),requireFrom=createRequire(source+'/release-tools/package.json');
const {chromium}=requireFrom('playwright'),fixturePath=source+'/release-tools/test-approval-modes-browser.cjs',req=createRequire(fixturePath);
const script=fs.readFileSync(fixturePath,'utf8'),prefix=script.slice(0,script.indexOf('\n(async()=>'));
const {load}=new Function('require',prefix+';return {load};')(req);
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 const {page,errors}=await load(browser,'bypass');
 const run=(engine,setup,tool,args)=>page.evaluate(async({engine,setup,tool,args})=>{
  window.__rsEngine=()=>engine;
  const base=[{name:'execute_luau',server:'roblox'},{name:'read_file',server:'local'}];
  fixture.A.toolList=setup.cached?base.concat([{name:'blender_add_cube',server:'blender',description:'Add a cube.'},{name:'blender_list_objects',server:'blender',description:'List objects.'}]):base;
  fixture.A.toolNames=new Set(fixture.A.toolList.map(t=>t.name));fixture.A.toolsAt=Date.now();
  fixture.A.bridge={connected:true,blender:setup.blender,roblox_connected:engine==='roblox'?setup.studio:false,local_connected:true,
   servers:[{id:'roblox',alive:setup.studio,tools:3},{id:'local',alive:true,tools:2}].concat(setup.blender?[{id:'blender',alive:true,tools:2}]:[])};
  // A fresh harmless field each time, so PlazCode's "you already made this exact read" guard does not answer instead.
  window.__probe=(window.__probe||0)+1;const before=nativeCalls.length;const text=String(await fixture.runTool({tool,arguments:Object.assign({probe:window.__probe},args||{})}));
  return {text,reached:nativeCalls.slice(before).map(c=>c.name)};
 },{engine,setup,tool,args});
 const on={blender:true,studio:false,cached:true};

 // Studio closed, Blender connected: the AI is told to go ahead in Blender, not to stop and ask for Studio.
 let r=await run('roblox',on,'list_commands');
 assert.match(r.text,/Blender IS connected and works in RobloxScript/);assert.match(r.text,/list_commands \{"server":"blender"\}/);
 assert.doesNotMatch(r.text,/Tell the user in one short sentence to open their place/,'no stop-and-ask-for-Studio while Blender is connected');
 // Studio closed, no Blender: unchanged.
 r=await run('roblox',{blender:false,studio:false,cached:false},'list_commands');
 assert.match(r.text,/Roblox Studio is currently OFFLINE/);
 // A Blender command runs in RobloxScript with Studio closed and with Studio open.
 for(const studio of [false,true]){r=await run('roblox',{...on,studio},'blender_add_cube',{name:'door'});assert.deepEqual(r.reached,['blender_add_cube'],'reached Blender, Studio open='+studio);}
 // Studio open: the Studio command list also says Blender is connected.
 r=await run('roblox',{...on,studio:true},'list_commands');
 assert.match(r.text,/Also connected right now: [^\n]*blender \(2 commands\)/);
 // Blender connected after the chat cached its list: asking for Blender's commands fetches the list again.
 r=await run('roblox',{blender:true,studio:true,cached:false},'list_commands',{server:'blender'});
 assert.doesNotMatch(r.text,/no server named "blender"/);assert.match(r.text,/blender commands/);
 // The status line that rides on every result says Blender belongs to this mode.
 const tag=await page.evaluate(()=>{window.__rsEngine=()=>'roblox';fixture.A.bridge={connected:true,blender:true,roblox_connected:false};return fixture.asStateTag();});
 assert.match(tag,/ENGINE=ROBLOXSCRIPT/);assert.match(tag,/BLENDER ON/);assert.match(tag,/"blender_write"/);assert.match(tag,/Blender commands \(blender_\*\) belong to this mode too/);
 const noBlender=await page.evaluate(()=>{fixture.A.bridge={connected:true,blender:false,roblox_connected:true};return fixture.asStateTag();});
 assert.doesNotMatch(noBlender,/belong to this mode too/);
 // Not connected: the AI points the person at Apps & servers (the old Blender-panel steps are gone).
 r=await page.evaluate(async()=>{window.__rsEngine=()=>'roblox';fixture.A.bridge={connected:true,blender:false,roblox_connected:true};const old=chrome.runtime.sendMessage;chrome.runtime.sendMessage=(msg,cb)=>{const v=/^blender_/.test(msg.type)?{ok:false,blender:false}:null;if(v){if(cb)queueMicrotask(()=>cb(v));return Promise.resolve(v);}return old(msg,cb);};try{return String(await fixture.runTool({tool:'blender_add_cube',arguments:{}}));}finally{chrome.runtime.sendMessage=old;}});
 assert.match(r,/Apps & servers/);assert.doesNotMatch(r,/N-panel/);
 // AgentScript keeps working the same way.
 r=await run('local',{...on,studio:false},'blender_add_cube',{});assert.deepEqual(r.reached,['blender_add_cube']);
 assert.deepEqual(errors,[]);
 console.log('PASS Blender in RobloxScript (real AI-tab code, Chromium): Studio closed no longer stops Blender work, Blender commands run with Studio open or closed, the command list and status line name Blender, a late Blender connection is picked up, plain Apps & servers pointer.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
