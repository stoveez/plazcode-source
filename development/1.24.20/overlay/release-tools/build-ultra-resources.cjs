#!/usr/bin/env node
'use strict';
// Deterministic Ultra-only catalog builder. Never executes source-pack code.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(process.argv[2]||'.'),bundle=path.join(root,'ultra');
const sort=xs=>xs.sort((a,b)=>a<b?-1:a>b?1:0);
function files(dir,prefix=''){
 return sort(fs.readdirSync(dir)).flatMap(name=>{
  const rel=prefix+name,p=path.join(dir,name),st=fs.lstatSync(p);
  if(st.isSymbolicLink())throw Error('Ultra must not contain symlinks: '+rel);
  return st.isDirectory()?files(p,rel+'/'):st.isFile()?[rel]:[];
 });
}
function markdown(relative){
 const text=fs.readFileSync(path.join(bundle,relative),'utf8');
 const front=text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
 if(!front)throw Error('Missing frontmatter: '+relative);
 const field=key=>{
  const match=front[1].match(new RegExp('^'+key+': *(.*)$','m'));
  if(!match||!match[1].trim()||/^[>|]/.test(match[1]))throw Error('Use one-line '+key+': '+relative);
  const raw=match[1].trim();
  if(raw.startsWith('"'))return JSON.parse(raw);
  if(raw.startsWith("'"))return raw.slice(1,-1).replace(/''/g,"'");
  return raw;
 };
 return {name:field('name'),use_when:field('description'),body:text.slice(front[0].length).trim()};
}
const write=(p,value)=>fs.writeFileSync(p,JSON.stringify(value,null,2)+'\n');
const all=files(bundle),entries=[],modules={};
const sourceFlag=process.argv.indexOf('--source-input');
let sourceInput;
const hashRecords=(folder,paths)=>paths.map(resource=>{const bytes=fs.readFileSync(path.join(folder,resource));return {resource,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};});
if(sourceFlag>=0){
 if(!process.argv[sourceFlag+1])throw Error('Missing --source-input directory');
 const original=path.resolve(process.argv[sourceFlag+1]),paths=sort(files(original));
 sourceInput={file_count:paths.length,files:hashRecords(original,paths)};
}else{
 const existing=path.join(bundle,'INVENTORY.json');
 if(!fs.existsSync(existing))throw Error('Initial build requires --source-input <original-package>');
 sourceInput=JSON.parse(fs.readFileSync(existing,'utf8')).source_input;
 if(!sourceInput||!Array.isArray(sourceInput.files)||sourceInput.file_count!==sourceInput.files.length)throw Error('Missing source-input hash provenance; use --source-input');
}

for(const resource of all.filter(p=>/^skills\/[^/]+\/SKILL\.md$/.test(p)||/^agents\/[^/]+\.md$/.test(p))){
 const m=markdown(resource),slug=resource.split('/')[1].replace(/\.md$/,'');
 if(m.name!==slug||!/^[-a-z0-9]+$/.test(slug))throw Error('Name/path mismatch: '+resource);
 const agent=resource.startsWith('agents/');
 entries.push({id:'bundled-ultra-'+slug,title:'Ultra internal '+(agent?'agent':'skill')+': '+slug,resource,use_when:m.use_when});
 // Full lightweight core methods stay available through the existing readLab API;
 // large pipeline skills are read on demand via the indexed native resources.
 if(!agent&&!slug.startsWith('ul-'))modules[slug]=m;
}
for(const [slug,resource,use_when] of [
 ['guide','GUIDE.md','Read once for a substantive Roblox task at Ultra effort; adapt to actual available tools.'],
 ['vault','vault/00-Index.md','Find relevant seeded lessons, API facts and open decisions; source verification labels are not new test results.'],
 ['resources','resources.json','Discover exact allowlisted resource paths; paginate long results.'],
 ['catalog','index.json','Discover all hidden Ultra methods and when to read them.'],
 ['changes','CHANGES.md','Review source enhancements and documented unverified work and limitations.']
])entries.push({id:'bundled-ultra-'+slug,title:'Ultra internal reference: '+slug,resource,use_when});
entries.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
if(new Set(entries.map(e=>e.id)).size!==entries.length)throw Error('Duplicate Ultra ID');
const generated=['resources.json','index.json','INVENTORY.json'];
const resources=sort([...new Set([...all,...generated])]);
for(const entry of entries)if(!resources.includes(entry.resource))throw Error('Missing resource '+entry.resource);
for(const name of ['GUIDE.md','vault/00-Index.md','PLAZCODE-ADAPTER.md','LICENSE-SyphoDev.txt','skills/ul-ui-builder/references/fonts/OFL.txt'])if(!all.includes(name))throw Error('Missing required '+name);
write(path.join(bundle,'index.json'),entries);write(path.join(bundle,'resources.json'),resources);
fs.mkdirSync(path.join(root,'agent/src'),{recursive:true});
write(path.join(root,'agent/src/ultra-index.json'),entries);write(path.join(root,'agent/src/ultra-resources.json'),resources);
const coreFile=path.join(root,'core/ultracode.js'),source=fs.readFileSync(coreFile,'utf8');
const begin=source.indexOf('  const labModules='),end=source.indexOf('  const labPolicy=',begin);
if(begin<0||end<0)throw Error('Ultra runtime method-map markers are missing');
fs.writeFileSync(coreFile,source.slice(0,begin)+'  const labModules='+JSON.stringify(modules)+';\n'+source.slice(end));
const records=resources.filter(p=>p!=='INVENTORY.json').map(resource=>{
 const bytes=fs.readFileSync(path.join(bundle,resource));
 return {resource,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
});
write(path.join(bundle,'INVENTORY.json'),{
 format:1,kind:'Ultra completed replacement',resource_count:resources.length,catalog_count:entries.length,
 skill_count:entries.filter(e=>e.resource.startsWith('skills/')).length,agent_count:entries.filter(e=>e.resource.startsWith('agents/')).length,
 hash_scope:'Every allowlisted file except INVENTORY.json itself (to avoid a self-referential hash).',
 legal_notice_provenance:'LICENSE-SyphoDev.txt and skills/ul-ui-builder/references/fonts/OFL.txt were restored byte-for-byte from the preceding 1.24.19 Ultra package with user authorization. The supplied FredokaOne-Regular.ttf is byte-identical to the corresponding baseline font. No old functional resources restored.',
 source_input:sourceInput,files:records
});
console.log(JSON.stringify({skills:entries.filter(e=>e.resource.startsWith('skills/')).length,agents:entries.filter(e=>e.resource.startsWith('agents/')).length,catalog:entries.length,resources:resources.length,hashed_files:records.length}));
