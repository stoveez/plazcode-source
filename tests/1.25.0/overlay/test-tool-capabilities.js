const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),{parse}=require('acorn');
const source=fs.readFileSync('core/main.js','utf8');let code;
function walk(n){if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration'&&n.id.name==='asStateTag')code=source.slice(n.start,n.end);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}walk(parse(source,{ecmaVersion:'latest'}));
function state(bridge,menu='sandbox',readOnly=false,engine='local'){
 const box={A:{bridge,toolList:[],sessionGen:1},P:{id:'offline',conversationKey:()=>'/c/test'},activeEngine:()=>engine,window:{__rsPermMode:()=>menu},safetySettings:{readOnly},RS:{FEEDBACK:{}},PlazCodeSafety:{stateLine:()=>''}};
 vm.createContext(box);vm.runInContext(code+';this.tag=asStateTag;',box);const text=box.tag(),match=text.match(/CAPABILITIES=(\[[^\]]*\])/);assert(match,text);return{text,caps:JSON.parse(match[1])};
}
const sandbox=state({connected:true,local_connected:true,local_full:false},'full');assert(sandbox.caps.includes('workspace_read'));assert(!sandbox.caps.includes('full_pc_access'),'a menu choice must never claim an ungranted native permission');
const full=state({connected:true,local_connected:true,local_full:true},'sandbox');assert(full.caps.includes('full_pc_access'));assert(full.caps.includes('window_listing'));assert(full.caps.includes('desktop_input'));
const unknown=state({connected:true,local_connected:true},'full');assert(!unknown.caps.includes('full_pc_access'));assert.match(unknown.text,/ACCESS VERIFYING/);
const offline=state({connected:false,local_connected:false,local_full:true});assert.deepEqual(offline.caps,[]);
const readonly=state({connected:true,local_connected:true,local_full:true},'full',true);assert(readonly.caps.includes('workspace_read'));assert(!readonly.caps.includes('workspace_write'));assert(!readonly.caps.includes('desktop_input'));
const studio=state({connected:true,roblox_connected:true,blender:true},'sandbox',false,'roblox');assert(studio.caps.includes('studio_read'));assert(studio.caps.includes('blender_read'));assert(!studio.caps.includes('workspace_read'));
console.log('PASS native-granted capabilities, stale menu/unknown/offline states, read-only restrictions and engine separation.');
