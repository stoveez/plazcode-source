const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<div id="host"></div>',{runScripts:'outside-only',url:'http://localhost',pretendToBeVisual:true}),w=dom.window;
 w.TextEncoder=TextEncoder;if(!w.crypto?.randomUUID)w.crypto={randomUUID:()=>'00000000-0000-4000-8000-000000000002'};
 try{
  w.eval(fs.readFileSync('core/skills-ui.js','utf8')+'\nwindow.Skills=PlazCodeSkillsUI;');
  let stored=[];
  const api=async request=>{
   if(request.action==='list')return{ok:true,skills:JSON.parse(JSON.stringify(stored))};
   if(request.action==='workbench_load'){const s=stored.find(x=>x.id===request.id);return{ok:true,skill:s,files:[{path:'SKILL.md',text:`---\nname: ${s?.title||request.id}\ndescription: ${s?.description||''}\n---\n`}],read_only:String(request.id).startsWith('starter-')};}
   if(request.action==='save'){const skill={...request.skill,revision:(request.revision||0)+1};stored=stored.filter(s=>s.id!==skill.id).concat(skill);return{ok:true,skill};}
   if(request.action==='export')return{ok:true,skill:{...stored[0],scope:''}};
   return{ok:false,error:'Unexpected call '+request.action};
  };
  const host=w.document.getElementById('host');host.getClientRects=()=>[{}];
  const ui=w.Skills.mount(host,api,async()=>{},()=>({}),async()=>{},async()=>({tasks:[]}));
  const field=name=>host.querySelector('[data-sk='+name+']'),flush=()=>new Promise(r=>setTimeout(r,20));
  await ui.refresh();
  // 1. Saving via Classic Fields persists local scope, strips scope from shared packs, and generates adaptation prompt.
  field('title').value='Shop UI';
  field('steps').value='Inspect existing ScreenGui\nReuse project spacing';
  field('verification').value='Test mobile and keyboard navigation';
  field('confirmed').checked=true;
  field('scope').value='project:Game A';
  field('save').click();await flush();
  assert.equal(stored[0].title,'Shop UI');
  assert.equal(stored[0].scope,'project:Game A');
  assert.equal(stored[0].enabled,true);
  const packed=w.Skills.packSkills([stored[0]],'Public Pack');
  assert.equal(packed.skills[0].scope,undefined,'project scope is stripped from shared packs');
  const adapted=w.Skills.adaptation(stored[0],'Make a shop in this game');
  assert.match(adapted,/Inspect the project structure/);
  assert.match(adapted,/do not copy and paste/);
  assert.match(adapted,/Make a shop in this game/);
  // 2. Starter skills are read-only in Workbench; + New Skill lets the user save a fresh editable skill.
  stored=[{id:'starter-syphodev-roblox-code',title:'roblox-code',description:'Starter reference',domain:'roblox',scope:'',steps:['Read full instructions'],pitfalls:[],verification:['Check this project'],confirmed:true,revision:1,community:false}];
  await ui.refresh();
  assert.match(field('list').textContent,/Roblox scripting/);
  field('list').querySelector('button').click();await flush();
  assert.equal(field('editor-text').readOnly,true);
  assert.equal(field('delete').hidden,true);
  field('new').click();
  field('title').value='Custom copy';
  field('steps').value='Adapt to current project';
  field('confirmed').checked=false;
  field('save').click();await flush();
  assert(!stored.at(-1).id.startsWith('starter-syphodev-'));
  assert.equal(stored.at(-1).title,'Custom copy');
  assert.equal(stored.at(-1).confirmed,false);
  assert.equal(stored.at(-1).enabled,true);
  console.log('PASS skill persistence form, project adaptation, public scope removal, and read-only starter isolation.');
 }finally{w.close();}
})().catch(e=>{console.error(e);process.exit(1);});
