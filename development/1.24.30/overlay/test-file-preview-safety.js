const assert=require('node:assert/strict'),fs=require('fs'),safety=require('./core/safety.js');
for(const name of ['write_file','edit_file']){
 assert(safety.filePreview(name,'local',{preview:true}));
 for(const args of [{},{preview:false},{preview:'true'}])assert(!safety.filePreview(name,'local',args));
 assert(!safety.filePreview(name,'studio',{preview:true}));assert(!safety.filePreview('addon__'+name,'local',{preview:true}));
}
for(const name of ['run_command','delete_path','execute_luau','mouse_click'])assert(!safety.filePreview(name,'local',{preview:true}));
const core=fs.readFileSync('core/main.js','utf8');assert(core.includes('TRUSTED_READS.has(call)) || filePreview'));
const native=fs.readFileSync('agent/src/main.rs','utf8');assert(native.includes('if safety::file_preview(engine,name,&args)'));assert(native.includes('safety::is_change(engine, name) && !preview'));
console.log('PASS preview classification is restricted to exact native file tools and boolean true; arbitrary commands and add-ons keep all mutation restrictions.');
