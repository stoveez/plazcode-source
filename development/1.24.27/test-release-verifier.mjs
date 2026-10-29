// Cross-language proof using the actual optimized, validation-key native executable.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createPrivateKey} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawn} from 'node:child_process';
import {signInstallation,publicHex,envelope} from './protection.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const binary=path.resolve(here,'../../build-src-1.24.27/PlazCode/agent/target/release/PlazCode');
assert.equal(process.platform,'linux','this headless integration fixture is Linux-only');
const key=createPrivateKey(await fs.readFile(process.env.PLAZCODE_SIGNING_KEY_FILE));
const info=JSON.parse(execFileSync(binary,['--protection-info'],{encoding:'utf8'}));
assert.equal(info.public_key,publicHex(key));assert.equal(info.channel,'validation');
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'plazcode-release-verifier-')),root=path.join(temporary,'PlazCode');
let processHandle,log;
try {
  await fs.mkdir(path.join(root,'core'),{recursive:true});await fs.mkdir(path.join(root,'PlazCode-Extension'));
  for(const name of ['manifest.json','PlazCode-Extension/manifest.json']) await fs.writeFile(path.join(root,name),JSON.stringify({version:'1.24.27'}));
  await fs.writeFile(path.join(root,'background.js'),'original');await fs.writeFile(path.join(root,'core/main.js'),'original');
  await fs.copyFile(binary,path.join(root,'PlazCode'));await fs.chmod(path.join(root,'PlazCode'),0o755);
  await fs.writeFile(path.join(root,'config.local.json'),'{}');
  await signInstallation(root,key,'linux','validation');
  execFileSync(binary,['--verify-package',root,'--verify-version','1.24.27']);
  assert.throws(()=>execFileSync(binary,['--verify-package',root,'--verify-version','0.0.0'],{stdio:'pipe'}));
  await fs.writeFile(path.join(root,'core/main.js'),'modified');
  assert.throws(()=>execFileSync(binary,['--verify-package',root,'--verify-version','1.24.27'],{stdio:'pipe'}));
  await fs.writeFile(path.join(root,'core/main.js'),'original');
  const config=path.join(temporary,'configuration'),workspace=path.join(temporary,'workspace');await fs.mkdir(config);await fs.mkdir(workspace);
  log=await fs.open(path.join(temporary,'native.log'),'w');
  processHandle=spawn(path.join(root,'PlazCode'),['--headless'],{env:{...process.env,LOCALAPPDATA:config,XDG_CONFIG_HOME:config,PLAZCODE_WORKSPACE_ROOT:workspace},stdio:['ignore',log.fd,log.fd]});
  let bearer;
  for(let attempt=0;attempt<100;attempt++) {
    try {bearer=await fs.readFile(path.join(config,'PlazCode/bridge-key'),'utf8');const response=await fetch('http://127.0.0.1:3000/api/status',{headers:{Authorization:'Bearer '+bearer},signal:AbortSignal.timeout(1000)});if(response.ok)break;} catch {}
    if(processHandle.exitCode!==null) throw new Error('Protected native startup failed: '+await fs.readFile(path.join(temporary,'native.log'),'utf8'));
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert(bearer,'automatic pairing credentials created without setup');
  const call=(url,body,authorized=true)=>fetch('http://127.0.0.1:3000'+url,{method:'POST',headers:{'Content-Type':'application/json',...(authorized?{Authorization:'Bearer '+bearer}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  assert.equal((await call('/api/skills',{action:'list'},false)).status,401);
  assert.equal((await call('/api/skills',{action:'list'})).status,200,'intact protected installation still runs normal authenticated requests');
  const row={bytes:1,sha256:'a'.repeat(64)};
  const metadata=envelope({schema:1,kind:'files',platform:'extension',version:'1.24.27',channel:'validation',files:{'background.js':row,'manifest.json':row,'protection.js':row}},key);
  const verifyLegacy=(value,origin)=>fetch('http://127.0.0.1:3000/api/integrity/extension',{method:'POST',headers:{'Content-Type':'application/json','X-PlazCode-Extension':'a'.repeat(32),Origin:origin},body:JSON.stringify(value),signal:AbortSignal.timeout(5000)});
  assert.equal((await verifyLegacy(metadata,'chrome-extension://'+'a'.repeat(32))).status,200,'old browsers can verify metadata before automatic pairing');
  assert.equal((await verifyLegacy(metadata,'https://evil.example')).status,403,'web origins cannot use the extension-only fallback');
  assert.equal((await verifyLegacy({...metadata,payload:'{}'},'chrome-extension://'+'a'.repeat(32))).status,403,'fallback still verifies the pinned signature');
  await fs.writeFile(path.join(root,'config.local.json'),'{"user_setting":true}');
  assert.equal((await call('/api/skills',{action:'list'})).status,200,'user settings are outside integrity checks');
  await fs.writeFile(path.join(root,'core/main.js'),'modified after startup');
  const blocked=await call('/api/skills',{action:'list'});assert.equal(blocked.status,409);assert.match(await blocked.text(),/official version/);
  assert.equal((await call('/api/stop',{})).status,200,'Stop remains available when program files fail verification');
  console.log('PASS optimized Rust verifies Node-signed files, blocks wrong versions/tampering before work, preserves automatic startup/authentication/user edits and keeps Stop available.');
} finally {
  if(processHandle && processHandle.exitCode===null) {processHandle.kill('SIGTERM');await new Promise(resolve=>{processHandle.once('exit',resolve);setTimeout(()=>{processHandle.kill('SIGKILL');resolve();},3000).unref();});}
  if(log)await log.close();await fs.rm(temporary,{recursive:true,force:true});
}
