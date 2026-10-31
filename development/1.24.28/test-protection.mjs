import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {generateKeyPairSync,webcrypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {envelope,openEnvelope,publicHex,parseSigningKey,protect,verifyTree,signInstallation,encryptMaps,decryptMaps,safePath,FILE_MANIFEST,EXT_MANIFEST} from './protection.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const source=path.resolve(here,'../../build-src-1.24.28/PlazCode');
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'plazcode-protection-'));
const root=path.join(directory,'package'),maps=path.join(directory,'private-maps');
const {privateKey}=generateKeyPairSync('ed25519'),other=generateKeyPairSync('ed25519');
const hex=publicHex(privateKey);
const seed=privateKey.export({format:'der',type:'pkcs8'}).subarray(-32).toString('hex');
assert.equal(publicHex(parseSigningKey('ed25519-seed:'+seed)),hex);
assert.throws(()=>parseSigningKey('ed25519-seed:not-a-private-seed'));
try {
  for(const base of ['', 'PlazCode-Extension','PlazCode-Extension-Firefox']) {
    await fs.mkdir(path.join(root,base,'core'),{recursive:true});
    await fs.writeFile(path.join(root,base,'manifest.json'),JSON.stringify({version:'1.24.28',manifest_version:3}));
    await fs.writeFile(path.join(root,base,'background.js'),'function addNumbers(first, second) { return first + second; } globalThis.answer = addNumbers(3, 4);\n');
    await fs.writeFile(path.join(root,base,'core/main.js'),'globalThis.mainLoaded = true;\n');
    await fs.writeFile(path.join(root,base,'core/space # %.txt'),'packaged asset with URL-sensitive characters');
  }
  await fs.writeFile(path.join(root,'PlazCode'),'test native executable');
  await fs.writeFile(path.join(root,'config.json'),'user settings');
  await fs.mkdir(path.join(root,'skills'));await fs.writeFile(path.join(root,'skills/custom.md'),'user skill');
  await protect(root,maps,source,privateKey,'validation','linux');
  await verifyTree(root,hex);
  const portable=await fs.readFile(path.join(root,'PlazCode-Extension',EXT_MANIFEST),'utf8');
  assert(!Object.values(JSON.parse(JSON.parse(portable).payload).files).some(row=>'mode' in row),'browser signatures do not depend on Windows versus Unix modes');
  for(const base of ['', 'PlazCode-Extension','PlazCode-Extension-Firefox']) {
    const folder=path.join(root,base);await verifyTree(folder,hex,EXT_MANIFEST);
    const code=await fs.readFile(path.join(folder,'background.js'),'utf8');
    assert(!code.includes('first, second'),'local variables are obfuscated');assert(!code.includes('sourceMappingURL'));
    const ctx={};vm.runInNewContext(code,ctx);assert.equal(ctx.answer,7,'transformed program behavior retained');
  }
  const report=JSON.parse(await fs.readFile(path.join(root,'PlazCode-Extension/production-build.json')));
  assert(report.files['core/main.js'].source_sha256);assert.equal(report.channel,'validation');
  assert((await fs.readdir(maps)).length>0,'decoder maps retained outside package');
  const encrypted=path.join(directory,'decoder.encrypted.json'),decoded=path.join(directory,'decoded');
  await encryptMaps(maps,encrypted,privateKey);await decryptMaps(encrypted,decoded,privateKey);
  assert.equal(await fs.readFile(path.join(decoded,'core/main.js.map'),'utf8'),await fs.readFile(path.join(maps,'core/main.js.map'),'utf8'));
  await assert.rejects(decryptMaps(encrypted,path.join(directory,'wrong'),other.privateKey),/Wrong decoder key/);
  const ciphertext=JSON.parse(await fs.readFile(encrypted,'utf8'));const forged=Buffer.from(ciphertext.ciphertext,'base64');forged[0]^=1;ciphertext.ciphertext=forged.toString('base64');await fs.writeFile(encrypted,JSON.stringify(ciphertext));
  await assert.rejects(decryptMaps(encrypted,path.join(directory,'forged'),privateKey));

  assert(!(await fs.readdir(root)).some(n=>n.endsWith('.map')||n.endsWith('.pem')));
  await fs.writeFile(path.join(root,'config.json'),'edited settings');await fs.writeFile(path.join(root,'skills/custom.md'),'edited skill');await verifyTree(root,hex);
  const original=await fs.readFile(path.join(root,'core/main.js'));
  await fs.writeFile(path.join(root,'core/main.js'),'tampered');await assert.rejects(verifyTree(root,hex),/changed/);
  await fs.writeFile(path.join(root,'core/main.js'),original);await verifyTree(root,hex);
  await assert.rejects(verifyTree(root,publicHex(other.privateKey)),/signature/);
  const raw=await fs.readFile(path.join(root,FILE_MANIFEST),'utf8');const bad=JSON.parse(raw);bad.payload=bad.payload.replace('1.24.28','0.0.0');
  assert.throws(()=>openEnvelope(JSON.stringify(bad),hex),/signature/);
  const update=envelope({schema:1,kind:'update',version:'1.24.28',platform:'windows',sha256:'a'.repeat(64)},privateKey);
  assert.equal(openEnvelope(JSON.stringify(update),hex).platform,'windows');
  await fs.rename(path.join(root,'background.js'),path.join(directory,'backup.js'));await assert.rejects(verifyTree(root,hex));await fs.rename(path.join(directory,'backup.js'),path.join(root,'background.js'));
  if(process.platform!=='win32') {
    await fs.rename(path.join(root,'core/main.js'),path.join(directory,'original.js'));await fs.symlink(path.join(directory,'original.js'),path.join(root,'core/main.js'));await assert.rejects(verifyTree(root,hex),/Symlink/);await fs.unlink(path.join(root,'core/main.js'));await fs.rename(path.join(directory,'original.js'),path.join(root,'core/main.js'));
  }
  for(const name of ['../escape','/absolute','a\\b','C:/escape','a//b','a./b']) assert(!safePath(name));
  // Run the real packaged extension verifier, including its Ed25519 and file-hash operations.
  const extension=path.join(root,'PlazCode-Extension');
  let fallbackCalls=0,nativeOnline=true;
  function verifier(legacy=false) {
    const crypto=legacy?{subtle:{importKey:()=>Promise.reject(Object.assign(new Error('Unsupported algorithm'),{name:'NotSupportedError'})),digest:webcrypto.subtle.digest.bind(webcrypto.subtle)}}:webcrypto;
    const context={crypto,URL,TextEncoder,TextDecoder,Uint8Array,AbortSignal,Date,Promise,JSON,Error,chrome:{runtime:{getManifest:()=>({version:'1.24.28'}),getURL:n=>'chrome-extension://'+'a'.repeat(32)+'/'+n}},fetch:async (url,options)=>{
      if(url==='http://127.0.0.1:3000/api/integrity/extension') {fallbackCalls++;if(!nativeOnline)throw new Error('Connection refused');openEnvelope(options.body,hex);return new Response('{"ok":true}');}
      const name=decodeURIComponent(new URL(url).pathname.slice(1));
      try {const bytes=await fs.readFile(path.join(extension,name));return new Response(bytes);} catch {return new Response('',{status:404});}
    }};
    vm.createContext(context);return context;
  }
  let context=verifier();vm.runInContext(await fs.readFile(path.join(extension,'protection.js'),'utf8'),context);await context.PlazCodeIntegrity.check();
  context=verifier(true);vm.runInContext(await fs.readFile(path.join(extension,'protection.js'),'utf8'),context);await context.PlazCodeIntegrity.check();assert.equal(fallbackCalls,1,'older browsers use offline native signature verification without setup');
  nativeOnline=false;context=verifier(true);vm.runInContext(await fs.readFile(path.join(extension,'protection.js'),'utf8'),context);
  await assert.rejects(context.PlazCodeIntegrity.check(),/Open the updated PlazCode app/);
  nativeOnline=true;await context.PlazCodeIntegrity.check();assert.equal(fallbackCalls,3,'opening the app recovers without reloading the extension or changing setup');
  await fs.writeFile(path.join(extension,'core/main.js'),'modified in loaded extension folder');
  context=verifier();vm.runInContext(await fs.readFile(path.join(extension,'protection.js'),'utf8'),context);await assert.rejects(context.PlazCodeIntegrity.check(),/official version/);
  console.log('PASS signed manifests, wrong keys/payloads, missing/modified files, symlinks, user-data edits, CSP-safe obfuscation, private maps and packaged extension verification.');
} finally {await fs.rm(directory,{recursive:true,force:true});}
