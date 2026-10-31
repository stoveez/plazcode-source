// 1.24.30 (owner: move PlazCode's valuable text into the app; "ENSURE that nothing is conflicted. No startup
// breaking"). Proof that the packaging step changes nothing a user or an AI sees:
//  1. The real files are transformed exactly as packaging does (moveText), sealed and reopened.
//  2. The transformed modules load with NO text yet (as on a page before the app answers): nothing breaks.
//  3. Every exported prompt/help/skill function returns byte-identical results to the original source,
//     across engines, sites, switches, every help topic/command and every Studio Skill with many arguments.
//  4. A wrong version cannot open the sealed file, and the loader refuses to invent missing text.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {moveText,sealTextPack,openTextPack,TEXT_PACK_FILES} from './protection.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const source=process.argv[2]?path.resolve(process.argv[2]):path.resolve(here,'../../build-src-1.24.30/PlazCode');
const require=createRequire(path.join(source,'release-tools/package.json'));
const acorn=require('acorn');
const read=name=>fs.readFileSync(path.join(source,name),'utf8');
const version=JSON.parse(read('manifest.json')).version;

const transformed={},pack={};let moved=0;
for(const [name,prefix] of Object.entries(TEXT_PACK_FILES)){const out=moveText(read(name),prefix,acorn);transformed[name]=out.code;Object.assign(pack,out.pack);moved+=out.moved;}
// Optional: a real packaged zip (scrambled code + sealed file exactly as users get them) replaces the
// in-memory transform, so the comparison also covers minification and the real packaging run.
const packagedZip=process.argv[3]?path.resolve(process.argv[3]):'';
const packagedFiles={};
if(packagedZip){
  const {execFileSync}=await import('node:child_process');
  const out=fs.mkdtempSync(path.join((await import('node:os')).tmpdir(),'plazcode-textpack-zip-'));
  execFileSync(process.platform==='win32'?'python':'python3',['-I','-c','import sys,zipfile;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',packagedZip,out]);
  const ext=path.join(out,'PlazCode','PlazCode-Extension');
  for(const name of ['core/text-pack.js',...Object.keys(TEXT_PACK_FILES)])packagedFiles[name]=fs.readFileSync(path.join(ext,name),'utf8');
  assert(packagedFiles['core/text-pack.js'].includes('REQUIRED')||/!0|true/.test(packagedFiles['core/text-pack.js']));
  const real=openTextPack(fs.readFileSync(path.join(ext,'core/text-pack.bin')),version);
  assert.deepEqual(Object.keys(real).sort(),Object.keys(pack).sort(),'the package moved exactly the planned text');
  for(const key of Object.keys(pack))assert.deepEqual(real[key],pack[key],key);
  for(const name of Object.keys(TEXT_PACK_FILES))assert(!packagedFiles[name].includes('local HttpService = game:GetService("HttpService")\nlocal Lighting'),'no Luau library text in the package');
  console.log('packaged zip:',path.basename(packagedZip),'text pack verified');
}
const sealed=sealTextPack(pack,version);
assert.deepEqual(openTextPack(sealed,version),pack,'sealed text reopens exactly');
assert.throws(()=>openTextPack(sealed,'0.0.0'),'another version cannot open it');
const plain=Buffer.from(JSON.stringify(pack));
for(const sample of Object.values(pack).flat().filter(t=>t.length>60).slice(0,40))assert(!sealed.includes(Buffer.from(sample.slice(0,40))),'sealed file holds no readable text');
const before=Object.keys(TEXT_PACK_FILES).reduce((n,f)=>n+read(f).length,0),after=Object.values(transformed).reduce((n,c)=>n+c.length,0);
console.log(`moved ${moved} texts (${plain.length} characters); the three files shrink from ${before} to ${after} characters; sealed ${sealed.length} bytes`);
assert(after<before*0.45,'most of the text left the extension');
for(const name of Object.keys(TEXT_PACK_FILES))for(const sample of ['ULTRA','RobloxScript','game:GetService("HttpService")'])if(read(name).includes('function skillsLibLua')&&sample.includes('HttpService'))assert(!transformed[name].includes('local HttpService = game:GetService'),'Luau library left studio_skills.js');

const flags={};
const windowStub={__rsThinkingLevel:()=>flags.level||'default',__rsShowApproach:()=>!!flags.approach,__rsBlender:()=>!!flags.all,__rsExtraThinking:()=>!!flags.all,__rsPlanMode:()=>!!flags.all,__rsForge:()=>!!flags.all,__rsMultiAgent:()=>!!flags.all,__rsAutoDebug:()=>true,__rsWorkMode:()=>(flags.all?'thorough':'')};
const FILES=['core/luau-knowledge.js','core/chat-creators.js','core/ultracode.js','core/feature-guide.js','core/clarification.js','core/text-pack.js','core/config.js','core/lean-startup.js','core/studio_skills.js'];
function load(useMoved,textPack){
  const context=vm.createContext({window:windowStub,console,chrome:{runtime:{sendMessage:(message,reply)=>reply(textPack?{ok:true,pack:textPack}:{ok:false,error:'app not answering yet'}),lastError:null}}});
  for(const name of FILES){
    let code=useMoved&&transformed[name]?transformed[name]:read(name);
    if(useMoved&&name==='core/text-pack.js')code=code.replace('const REQUIRED = false;','const REQUIRED = true;');
    if(useMoved&&packagedFiles[name])code=packagedFiles[name];
    vm.runInContext(code,context,{filename:name});
  }
  return context;
}
// 2. Loading before the app answers must not throw (nothing is read at load time).
const early=load(true,null);
assert.equal(vm.runInContext('PlazCodeText.loaded()',early),false);
assert.throws(()=>vm.runInContext("RS.buildSystemPrompt({siteName:'Claude',engine:'roblox'})",early),/app not answering yet \(missing config:/,'without the app a clear message, never invented text');

const original=load(false,null),packaged=load(true,pack);
await vm.runInContext('PlazCodeText.ready()',packaged);
assert.equal(vm.runInContext('PlazCodeText.loaded()',packaged),true);
let compared=0;
function same(label,expression){
  const run=context=>{try{return {value:vm.runInContext(expression,context)};}catch(error){return {error:String(error&&error.message||error)};}};
  const a=run(original),b=run(packaged);
  assert.deepEqual(b,a,label);compared++;
}
const sites=["{siteName:'Claude',engine:'roblox'}","{siteName:'ChatGPT',engine:'local'}","{siteName:'Notion',providerId:'notion',engine:'roblox'}","{siteName:'DeepSeek',engine:'roblox',customPrompt:'Use tabs.',providerNotes:'x'.repeat(900)}","{siteName:'Gemini',engine:'local',fullAccess:true}","{siteName:'Claude',engine:'blender'}"];
const states=[{},{all:true,level:'max',approach:true},{level:'ultracode'},{level:'high'}];
const RSKEYS=vm.runInContext('Object.keys(RS).filter(k=>typeof RS[k]==="function")',original);
for(const state of states){
  Object.keys(flags).forEach(k=>delete flags[k]);Object.assign(flags,state);
  for(const site of sites)for(const lean of ['true','false']){
    const opts=site.replace(/}$/,`,leanStartup:${lean}}`);
    for(const fn of RSKEYS)same(`RS.${fn}(${opts}) ${JSON.stringify(state)}`,`JSON.stringify(RS.${fn}(${opts}))`);
  }
  for(const fn of RSKEYS)for(const args of ['','"Claude","note","extra"','[{name:"execute_luau",description:"x"},{name:"read_file"}]','"build a shop"'])same(`RS.${fn}(${args})`,`JSON.stringify(RS.${fn}(${args}))`);
}
// Every help topic and every command's help, and the short startup core for each engine.
const LEAN='PlazCodeLeanStartup';
for(const fn of ['listTopics','topicListText'])for(const engine of ["'roblox'","'local'",''])same(`${fn}(${engine})`,`JSON.stringify(${LEAN}.${fn}(${engine}))`);
const topics=vm.runInContext(`${LEAN}.TOPICS.map?${LEAN}.TOPICS.map(t=>t.id||t.name||t):Object.keys(${LEAN}.TOPICS)`,original);
const commands=vm.runInContext('RobloxScriptSkills.SKILL_OPS',original);
for(const engine of ['roblox','local']){
  same(`buildLeanCore ${engine}`,`JSON.stringify(${LEAN}.buildLeanCore({engine:'${engine}',siteName:'Claude'}))`);
  for(const topic of [...topics,'unknown topic',''])same(`helpFor topic ${topic}`,`JSON.stringify(${LEAN}.helpFor({topic:${JSON.stringify(String(topic))},engine:'${engine}'}))`);
  for(const command of [...commands,'read_file','execute_luau','nope'])same(`helpFor command ${command}`,`JSON.stringify(${LEAN}.helpFor({command:${JSON.stringify(command)},engine:'${engine}'}))`);
}
// Every Studio Skill, including the five template builders, with several argument sets.
const argSets=['{}',"{preset:'cyberpunk'}","{preset:'warm night',clock_time:20.5,shadows:false}","{preset:'nope'}","{parent_path:'Workspace.Part',color:[255,10,3],width:2,segments:40,target_path:'Workspace.B'}","{parent_path:'Workspace.Part',texture:'rbxassetid://1'}","{position:[1,2,3],radius:12,color:[0,0,255]}","{component_type:'card_inventory',title:'Cards',count:6,dropup:true}","{component_type:'cards',title:'X\"y',count:2}","{paths:'ServerScriptService.Main, Workspace.Script',cursor:3,max_chars:'5000'}","{folders:['ReplicatedStorage'],list_only:true}","{name:'Shop',type:'health_bar',material:'Grass',style:'isometric'}"];
for(const op of commands)for(const args of argSets)same(`buildLuau ${op} ${args}`,`JSON.stringify(RobloxScriptSkills.buildLuau(${JSON.stringify(op)},${args}))`);
same('SKILLS_LIB_LUA','RobloxScriptSkills.SKILLS_LIB_LUA');
same('describeCommands','JSON.stringify(RobloxScriptSkills.describeCommands())');
console.log(`PASS text pack: ${compared} prompt/help/skill outputs identical to the original source, safe load before the app answers, sealed per version`);
