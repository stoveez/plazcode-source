const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<div id="host"></div>',{runScripts:'outside-only',url:'http://localhost',pretendToBeVisual:true}),w=dom.window;
 w.TextEncoder=TextEncoder;if(!w.crypto?.randomUUID){let seq=0;w.crypto={randomUUID:()=>`00000000-0000-4000-8000-0000000000${String(++seq).padStart(2,'0')}`};}
 try{
  w.eval(fs.readFileSync('core/skills-ui.js','utf8')+';window.Skills=PlazCodeSkillsUI;');
  let records=[],saves=0,sent=0,poll;w.setInterval=fn=>{poll=fn;return 1;};
  const api=async r=>{
   if(r.action==='list')return{ok:true,skills:structuredClone(records)};
   if(r.action==='workbench_load'){const s=records.find(x=>x.id===r.id);return{ok:true,skill:s,files:[{path:'SKILL.md',text:`---\nname: ${s?.title||r.id}\ndescription: ${s?.description||''}\n---\n${(s?.steps||[]).join('\n')}`}],read_only:false};}
   if(r.action==='export')return{ok:true,skill:{...records.find(s=>s.id===r.id),scope:''}};
   if(r.action==='save'){saves++;const old=records.find(s=>s.id===r.skill.id);assert.equal(r.revision,old?.revision||0);const skill={...r.skill,revision:r.revision+1};records=records.filter(s=>s.id!==skill.id).concat(skill);return{ok:true,skill};}
   throw Error(r.action);
  };
  const host=w.document.getElementById('host');host.getClientRects=()=>[{}];
  const ui=w.Skills.mount(host,api,async()=>{sent++;},()=>({}),async()=>{},async()=>({tasks:[]})),field=n=>host.querySelector('[data-sk='+n+']'),flush=()=>new Promise(r=>setTimeout(r,20));
  await ui.refresh();
  assert.equal(field('steps').value,'');
  assert.equal(field('import-panel').open,false);
  for(const name of ['description','domain','pitfalls','verification','confirmed'])assert(field(name).closest('details'),'Optional fields stay in collapsed sections');
  assert.equal(field('title').value,'');
  const text='Match the current UI style.\nReuse existing components and verify mobile layouts.';
  field('steps').value=text;field('scope').value='project:Game A';field('save').click();await flush();
  assert.equal(saves,1);assert.equal(sent,0,'Save does not start work');
  assert.equal(records[0].title,'Match the current UI style');
  assert.equal(records[0].steps.join(''),text);
  assert.equal(records[0].scope,'project:Game A');
  assert.equal(records[0].enabled,true);
  assert.equal(records[0].confirmed,false);
  assert.equal(records[0].verification.length,0);
  field('title').value='  My interface rules  ';field('save').click();await flush();
  assert.equal(records[0].title,'My interface rules');
  assert.equal(field('title').value,'My interface rules');
  // Polling preserves unsaved editor drafts; selecting card loads remote updates.
  field('steps').value='A draft being edited';field('steps').dispatchEvent(new w.Event('input'));
  records[0].revision++;records[0].steps=['External change'];
  await poll();
  assert.equal(field('steps').value,'A draft being edited','Polling never replaces an unsaved editor');
  field('list').querySelector('button').click();await flush();
  assert.equal(field('steps').value,'External change');
  // Unicode chunks and 30,000-byte limit.
  field('new').click();
  field('steps').value='🙂'.repeat(400);field('save').click();await flush();
  assert.equal(saves,3);
  assert(new TextEncoder().encode(records[1].title).length<=200);
  assert.equal(records[1].steps.join(''),'🙂'.repeat(400));
  assert(records[1].steps.every(s=>new TextEncoder().encode(s).length<=1000));
  field('new').click();
  field('steps').value='🙂'.repeat(8000);field('save').click();await flush();
  assert.equal(saves,3);
  assert.match(field('status').textContent,/30,000 bytes/);
  // Shared/community workflow records remain selectable without error.
  records.push({id:'global-workflow-example',title:'Shared lesson',description:'Keep compatible systems',domain:'local',scope:'',steps:['Inspect this project'],pitfalls:[],verification:['Check behavior'],confirmed:true,revision:1,community:true});
  await ui.refresh();
  assert(records.some(s=>s.id==='global-workflow-example'),'Shared records remain intact');
  console.log('PASS Workbench optional metadata, explicit names, automatic summaries, draft retention, Unicode byte limits, and shared record isolation.');
 }finally{w.close();}
})().catch(e=>{console.error(e);process.exit(1);});
