const fs=require('fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<div id="host"></div>',{runScripts:'outside-only',url:'http://localhost',pretendToBeVisual:true}),w=dom.window;
 w.TextEncoder=TextEncoder;w.crypto={randomUUID:()=>'00000000-0000-4000-8000-000000000001'};
 w.eval(fs.readFileSync('core/skills-ui.js','utf8')+';window.Skills=PlazCodeSkillsUI;');
 let records=JSON.parse(fs.readFileSync('agent/src/starter-skills-index.json','utf8')),blocked=null,listCalls=0;
 const api=async r=>{
  if(r.action==='list'){listCalls++;if(blocked)await blocked;return{ok:true,skills:JSON.parse(JSON.stringify(records))};}
  if(r.action==='workbench_load'){const s=records.find(x=>x.id===r.id);return{ok:true,skill:s,files:[{path:'SKILL.md',text:`---\nname: ${s?.title||r.id}\ndescription: ${s?.description||''}\n---\n${(s?.steps||[]).join('\n')}`}],read_only:String(r.id).startsWith('starter-')};}
  if(r.action==='workbench_save_file'){const s=records.find(x=>x.id===r.id);s.revision=(s.revision||0)+1;return{ok:true,skill:{...s}};}
  if(r.action==='export')return{ok:true,skill:{...records.find(s=>s.id===r.id),scope:''}};
  if(r.action==='read')return{ok:true,bundle:{content:'Full instructions. ',next_offset:null}};
  if(r.action==='save'){const skill={...r.skill,revision:1};records.push(skill);return{ok:true,skill};}
  throw Error('Unexpected request '+r.action);
 };
 let poll;w.setInterval=fn=>{poll=fn;return 1;};
 const host=w.document.getElementById('host');host.getClientRects=()=>[{}];
 const ui=w.Skills.mount(host,api,async()=>{},()=>({}),async()=>{},async()=>({tasks:[]}));
 const field=n=>host.querySelector('[data-sk='+n+']'),flush=()=>new Promise(r=>setTimeout(r,20));
 await ui.refresh();
 assert.equal(field('list').querySelectorAll('[data-sk-card]').length,11);
 assert.equal(field('new').textContent,'+ New Skill');
 field('search').value='animations';field('search').dispatchEvent(new w.Event('input'));
 assert.equal(field('list').querySelectorAll('[data-sk-card]').length,1);
 field('list').querySelector('button').click();await flush();
 assert.equal(field('detail-title').textContent,'Character animations');
 assert.equal(field('read').hidden,false);
 field('read').click();await flush();
 assert.equal(field('instructions').hidden,false);
 assert.equal(field('instructions').textContent,'Full instructions. ');
 // Creating a new skill via classic fields falls back to description/step name and enables automatic matching.
 field('new').click();
 assert.equal(field('detail-title').textContent,'New skill');
 field('steps').value='Inspect the current movement system\nAdapt only compatible parts';
 field('verification').value='Test movement and cooldowns';
 field('save').click();await flush();
 assert.equal(records.at(-1).title,'Inspect the current movement system');
 assert.equal(records.at(-1).enabled,true);
 assert.equal(records.at(-1).confirmed,false);
 assert.equal(field('detail-title').textContent,'Inspect the current movement system');
 // Live poll updates list without clobbering unsaved editor fields or overlapping slow polls.
 records.push({id:'ai-created',title:'Inventory methods',description:'Choose an inventory design that fits this game.',steps:['Inspect this game'],pitfalls:[],verification:['Check behavior'],confirmed:false,enabled:true});
 field('search').value='inventory';
 field('title').value='Draft Name Kept';
 await poll();
 assert(field('list').textContent.includes('Inventory methods'));
 assert.equal(field('title').value,'Draft Name Kept','Automatic list sync preserves the open editor');
 let release;blocked=new Promise(r=>release=r);
 const before=listCalls,first=poll();await Promise.resolve();await poll();
 assert.equal(listCalls,before+1,'A slow skills read never overlaps the next poll');
 blocked=null;release();await first;
 w.close();
 console.log('PASS Workbench starter skills, readable names, search, full read toggle, name fallback and non-overlapping poll sync.');
})().catch(e=>{console.error(e);process.exitCode=1;});
