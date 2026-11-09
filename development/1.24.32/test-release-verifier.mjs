// Cross-language proof using the actual optimized, validation-key native executable.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createPrivateKey} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {signInstallation,publicHex,envelope,sealTextPack} from './protection.mjs';
import {variantInfo} from './release-variant.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const binary=path.resolve(here,'../../build-src-1.24.32/PlazCode/agent/target/release/PlazCode');
assert.equal(process.platform,'linux','this headless integration fixture is Linux-only');
const key=createPrivateKey(await fs.readFile(process.env.PLAZCODE_SIGNING_KEY_FILE));
const info=JSON.parse(execFileSync(binary,['--protection-info'],{encoding:'utf8'}));
assert.deepEqual(info.release_variant,variantInfo('1.24.32'));
assert.equal(info.public_key,publicHex(key));assert.equal(info.channel,'validation');
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'plazcode-release-verifier-')),root=path.join(temporary,'PlazCode');
let processHandle,log;
try {
  await fs.mkdir(path.join(root,'core'),{recursive:true});await fs.mkdir(path.join(root,'PlazCode-Extension'));
  for(const name of ['manifest.json','PlazCode-Extension/manifest.json']) await fs.writeFile(path.join(root,name),JSON.stringify({version:'1.24.32'}));
  await fs.writeFile(path.join(root,'background.js'),'original');await fs.writeFile(path.join(root,'core/main.js'),'original');
  await fs.copyFile(binary,path.join(root,'PlazCode'));await fs.chmod(path.join(root,'PlazCode'),0o755);
  await fs.writeFile(path.join(root,'config.local.json'),'{}');
  // 1.24.30: text moved out of the extension, sealed by the packaging script for this version.
  const textPack={'config:0':'Long instruction text ✓','skills:1':['local x = ',' -- end']};
  await fs.mkdir(path.join(root,'PlazCode-Extension/core'),{recursive:true});
  await fs.writeFile(path.join(root,'PlazCode-Extension/core/text-pack.bin'),sealTextPack(textPack,'1.24.32'));
  await fs.writeFile(path.join(root,'PlazCode-Extension/core/release-variant.json'),JSON.stringify(variantInfo('1.24.32')));
  await fs.writeFile(path.join(root,'PlazCode-Extension/core/text-pack.js'),'original');
  await signInstallation(root,key,'linux','validation');
  execFileSync(binary,['--verify-package',root,'--verify-version','1.24.32']);
  assert.throws(()=>execFileSync(binary,['--verify-package',root,'--verify-version','0.0.0'],{stdio:'pipe'}));
  await fs.writeFile(path.join(root,'core/main.js'),'modified');
  assert.throws(()=>execFileSync(binary,['--verify-package',root,'--verify-version','1.24.32'],{stdio:'pipe'}));
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
  const metadata=envelope({schema:1,kind:'files',platform:'extension',version:'1.24.32',channel:'validation',files:{'background.js':row,'manifest.json':row,'protection.js':row}},key);
  // 1.24.30: Chromium derives an unpacked extension's ID from its folder; the app accepts only its own folder's ID.
  const chromiumId=folder=>[...createHash('sha256').update(folder).digest().subarray(0,16)].flatMap(b=>[b>>4,b&15]).map(n=>String.fromCharCode(97+n)).join('');
  const officialId=chromiumId(await fs.realpath(path.join(root,'PlazCode-Extension'))),copyId=chromiumId('/home/someone/edited-copy/PlazCode-Extension');
  const verifyLegacy=(value,origin,id=officialId)=>fetch('http://127.0.0.1:3000/api/integrity/extension',{method:'POST',headers:{'Content-Type':'application/json','X-PlazCode-Extension':id,Origin:origin},body:JSON.stringify(value),signal:AbortSignal.timeout(5000)});
  assert.equal((await verifyLegacy(metadata,'chrome-extension://'+officialId)).status,200,'old browsers can verify metadata before automatic pairing');
  assert.equal((await verifyLegacy(metadata,'https://evil.example')).status,403,'web origins cannot use the extension-only fallback');
  assert.equal((await verifyLegacy({...metadata,payload:'{}'},'chrome-extension://'+officialId)).status,403,'fallback still verifies the pinned signature');
  assert.equal((await verifyLegacy(metadata,'chrome-extension://'+copyId,copyId)).status,403,'an extension from another folder cannot use the fallback');
  const pair=id=>fetch('http://127.0.0.1:3000/api/pair',{method:'POST',headers:{'Content-Type':'application/json','X-PlazCode-Extension':id,Origin:'chrome-extension://'+id},body:'{}',signal:AbortSignal.timeout(5000)});
  const paired=await pair(officialId);assert.equal(paired.status,200,'the official PlazCode-Extension folder pairs automatically');assert.equal((await paired.json()).key,bearer);
  const refused=await pair(copyId);assert.equal(refused.status,403);assert.match(await refused.text(),/not the official one/,'a copied or edited extension is refused with a clear reason');
  const borrowed=await fetch('http://127.0.0.1:3000/api/skills',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+bearer,Origin:'chrome-extension://'+copyId},body:'{"action":"list"}',signal:AbortSignal.timeout(5000)});
  assert.equal(borrowed.status,403,'a copy that somehow holds the pairing key is still refused');
  const text=origin=>fetch('http://127.0.0.1:3000/api/text-pack',{headers:{Authorization:'Bearer '+bearer,...(origin?{Origin:'chrome-extension://'+origin}:{})},signal:AbortSignal.timeout(5000)});
  const served=await text(officialId);assert.equal(served.status,200,'the app opens the text sealed by the packaging script');assert.deepEqual(await served.json(),textPack);
  assert.equal((await text(copyId)).status,403,'an unofficial extension never receives the text');
  assert.equal((await fetch('http://127.0.0.1:3000/api/text-pack',{signal:AbortSignal.timeout(5000)})).status,401,'not without pairing');
  await fs.writeFile(path.join(root,'config.local.json'),'{"user_setting":true}');
  assert.equal((await call('/api/skills',{action:'list'})).status,200,'user settings are outside integrity checks');
  const recordPath=path.join(root,'PlazCode-Extension/core/release-variant.json'),originalRecord=await fs.readFile(recordPath);
  await fs.writeFile(recordPath,'{}');assert.equal((await call('/api/skills',{action:'list'})).status,409,'variant canary fails after startup');
  assert.equal((await call('/api/stop',{})).status,200,'Stop available after variant failure');
  await fs.writeFile(recordPath,originalRecord);
  const packPath=path.join(root,'PlazCode-Extension/core/text-pack.bin'),originalPack=await fs.readFile(packPath),wrongPack=sealTextPack(textPack,'1.24.32',Buffer.alloc(32,93));
  await fs.writeFile(packPath,wrongPack);assert.equal((await text(officialId)).status,409,'foreign release pack rejected by native loader');
  assert.equal((await call('/api/skills',{action:'list'})).status,409);await fs.writeFile(packPath,originalPack);
  await fs.writeFile(path.join(root,'core/main.js'),'modified after startup');
  const blocked=await call('/api/skills',{action:'list'});assert.equal(blocked.status,409);assert.match(await blocked.text(),/official version/);
  assert.equal((await call('/api/stop',{})).status,200,'Stop remains available when program files fail verification');
  console.log('PASS optimized Rust verifies Node-signed files, blocks wrong versions/tampering before work, preserves automatic startup/authentication/user edits and keeps Stop available.');
} finally {
  if(processHandle && processHandle.exitCode===null) {processHandle.kill('SIGTERM');await new Promise(resolve=>{processHandle.once('exit',resolve);setTimeout(()=>{processHandle.kill('SIGKILL');resolve();},3000).unref();});}
  if(log)await log.close();await fs.rm(temporary,{recursive:true,force:true});
}
