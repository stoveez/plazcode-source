'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=process.cwd(),read=p=>fs.readFileSync(path.join(root,p),'utf8'),json=p=>JSON.parse(read(p)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const bundle=path.join(root,'ultra'),index=json('agent/src/ultra-index.json'),resources=json('agent/src/ultra-resources.json'),inv=json('ultra/INVENTORY.json');
assert.deepEqual(json('ultra/index.json'),index);assert.deepEqual(json('ultra/resources.json'),resources);
assert.equal(new Set(index.map(e=>e.id)).size,index.length);assert.equal(new Set(resources).size,resources.length);
assert.equal(inv.resource_count,resources.length);assert.equal(inv.catalog_count,index.length);
assert.equal(inv.skill_count,index.filter(e=>e.resource.startsWith('skills/')).length);
assert.equal(inv.agent_count,index.filter(e=>e.resource.startsWith('agents/')).length);
assert.equal(inv.files.length,resources.length-1);assert.equal(inv.source_input.file_count,inv.source_input.files.length);
for(const e of inv.source_input.files){const final=inv.files.find(f=>f.resource===e.resource);assert(final,e.resource);assert.equal(final.sha256,e.sha256,'Source package changed: '+e.resource);assert.equal(final.bytes,e.bytes);}
for(const e of index){assert(e.id.startsWith('bundled-ultra-'));assert(resources.includes(e.resource),e.resource);assert(e.use_when);}
function allFiles(dir,prefix=''){return fs.readdirSync(dir).sort().flatMap(n=>fs.statSync(path.join(dir,n)).isDirectory()?allFiles(path.join(dir,n),prefix+n+'/'):[prefix+n]);}
assert.deepEqual(allFiles(bundle).sort(),resources);
const extensionBundle=path.join(root,'PlazCode-Extension/ultra');if(fs.existsSync(extensionBundle)){assert.deepEqual(allFiles(extensionBundle).sort(),resources,'Extension Ultra has stale or missing files');for(const p of resources)assert.equal(sha(fs.readFileSync(path.join(extensionBundle,p))),sha(fs.readFileSync(path.join(bundle,p))),'Root/extension mismatch '+p);}
for(const entry of inv.files){const bytes=fs.readFileSync(path.join(bundle,entry.resource));assert.equal(bytes.length,entry.bytes);assert.equal(sha(bytes),entry.sha256,entry.resource);assert(bytes.length<=1024*1024,entry.resource+' exceeds native read limit');}
for(const p of resources){assert(!p.startsWith('/')&&!p.split('/').includes('..'));assert(!p.startsWith('core-skills/'));}
const listedSkills=resources.filter(r=>/^skills\/[^/]+\/SKILL\.md$/.test(r));assert.equal(listedSkills.length,inv.skill_count);
const expectedNew=['luau-compile-gate','roblox-tooling','roblox-input','roblox-camera','roblox-physics','roblox-npc-ai','roblox-server-data','roblox-audio','roblox-localization','roblox-monetization','roblox-analytics','roblox-publish-checklist'];
for(const n of expectedNew)assert(index.some(e=>e.id==='bundled-ultra-'+n&&e.resource==='skills/'+n+'/SKILL.md'));
for(const n of ['UIFormat','UIBind','UIToast'])assert(resources.includes('skills/ul-ui-builder/references/'+n+'.luau'));
for(const p of ['GUIDE.md','CHANGES.md','vault/00-Index.md','LICENSE-SyphoDev.txt','skills/ul-ui-builder/references/fonts/OFL.txt','PLAZCODE-ADAPTER.md','skills/ul-check-suite/check_code.py','skills/luau-compile-gate/scripts/compile_check.lua'])assert(resources.includes(p),p);
// Every source vault wikilink resolves uniquely, rather than assuming root-relative paths.
for(const p of resources.filter(p=>p.startsWith('vault/')&&p.endsWith('.md'))){for(const m of read('ultra/'+p).matchAll(/\[\[([^\]|#]+)(?:[^\]]*)\]\]/g)){const name=m[1].replace(/\.md$/,'');assert.equal(resources.filter(p=>p.startsWith('vault/')&&path.basename(p,'.md')===name).length,1,'vault link '+m[1]);}}
let effort='default';const box=vm.createContext({window:{__rsThinkingLevel:()=>effort}});
vm.runInContext(read('core/ultracode-deepseek.js')+'\n'+read('core/ultracode.js')+'\n'+read('core/config.js')+';this.mode=PlazCodeUltracode;this.config=RS;',box);
for(const provider of ['clickup','notion','deepseek','chatgpt'])for(const e of ['default','low','mid','high','max']){effort=e;const p=box.config.buildSystemPrompt({engine:'roblox',providerId:provider});assert(!p.includes('ULTRA COMPANION'));assert(!p.includes('ULTRA —'));}
effort='ultracode';for(const provider of ['clickup','notion','deepseek','chatgpt']){const p=box.config.buildSystemPrompt({engine:'roblox',providerId:provider});assert(p.includes('ULTRA COMPANION'));assert(p.includes('bundled-ultra-guide'));assert(p.includes('bundled-ultra-vault'));assert(p.includes('built-in Ultra interface methods'));}
const latestUI=box.mode.task('roblox','Make a UI menu');for(const text of ['bundled-ultra-check-ui-rules','385956923','UNVERIFIED','do not mix'])assert(latestUI.includes(text),text);
const queries=[['Make a shop GUI HUD','ul-ui-builder'],['fix Luau script','luau-compile-gate'],['gamepad keyboard touch input','roblox-input'],['camera zoom','roblox-camera'],['physics collision','roblox-physics'],['npc pathfinding','roblox-npc-ai'],['datastore saving','roblox-server-data'],['sound audio music','roblox-audio'],['translate localization','roblox-localization'],['purchase gamepass receipt','roblox-monetization'],['analytics funnel','roblox-analytics'],['publish release','roblox-publish-checklist'],['rokit toolchain','roblox-tooling']];
for(const [q,id] of queries){const task=box.mode.task('roblox',q);assert(task.includes('bundled-ultra-'+id),q);assert(task.length<=5400);for(const m of task.matchAll(/bundled-ultra-[-a-z0-9]+/g))assert(index.some(e=>e.id===m[0]),m[0]);}
for(const e of ['local','blender']){assert(!box.mode.task(e,'Roblox GUI map').includes('bundled-ultra-'));assert(box.mode.task(e,'Roblox GUI').includes('do not authorize Studio operations'));}
for(const b of [0,100,800,1600,5400,6000,10000,NaN])assert(box.mode.task('roblox',queries.map(q=>q[0]).join(' '),b).length<=Math.max(800,Math.min(Number.isFinite(b)?b:5400,6000)));
assert.equal(box.mode.readLab('missing'),null);
for(const p of listedSkills.filter(p=>!p.split('/')[1].startsWith('ul-'))){const name=p.split('/')[1];const method=box.mode.readLab(name);assert(method&&method.body.length>10,name);assert(read('ultra/'+p).includes(method.body),name+' runtime copy is stale');}
assert(!read('core/ultracode-deepseek.js').includes('\ufffd'));
// Deterministic builder + automatic discovery of a newly added skill. Work only in scratch.
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'plazcode-ultra-builder-'));
try{
 fs.cpSync(bundle,path.join(scratch,'ultra'),{recursive:true});fs.mkdirSync(path.join(scratch,'core'));fs.copyFileSync(path.join(root,'core/ultracode.js'),path.join(scratch,'core/ultracode.js'));
 const builder=path.join(root,'release-tools/build-ultra-resources.cjs');cp.execFileSync(process.execPath,[builder,scratch]);
 for(const p of ['ultra/INVENTORY.json','ultra/index.json','ultra/resources.json','agent/src/ultra-index.json','agent/src/ultra-resources.json','core/ultracode.js'])assert.equal(fs.readFileSync(path.join(scratch,p),'utf8'),read(p),p+' non-deterministic');
 const d=path.join(scratch,'ultra/skills/future-method');fs.mkdirSync(d);fs.writeFileSync(path.join(d,'SKILL.md'),'---\nname: future-method\ndescription: "Use for future feature tests."\n---\nFuture method body.\n');
 cp.execFileSync(process.execPath,[builder,scratch]);const added=JSON.parse(fs.readFileSync(path.join(scratch,'agent/src/ultra-index.json'),'utf8'));assert(added.some(e=>e.id==='bundled-ultra-future-method'));assert(fs.readFileSync(path.join(scratch,'core/ultracode.js'),'utf8').includes('Future method body.'));
 fs.symlinkSync('/tmp',path.join(scratch,'ultra/unsafe-link'));assert.throws(()=>cp.execFileSync(process.execPath,[builder,scratch],{stdio:'pipe'}));
}finally{fs.rmSync(scratch,{recursive:true,force:true});}
console.log(`PASS Ultra enhanced package: ${inv.skill_count} skills, ${inv.agent_count} agents, ${index.length} catalog entries, ${resources.length} allowlisted files, ${inv.files.length} verified SHA-256s; selected-only injection, engine isolation, bounded routing, vault links, deterministic extensibility and symlink rejection.`);
