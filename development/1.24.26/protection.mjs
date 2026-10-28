// Release signing uses Node's built-in Ed25519 implementation. Private keys never enter packages.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

export const DOMAIN = 'PlazCode release v1\n';
export const FILE_MANIFEST = 'plazcode-integrity.json';
export const EXT_MANIFEST = 'plazcode-extension-integrity.json';
const here = path.dirname(fileURLToPath(import.meta.url));
export const digest = data => createHash('sha256').update(data).digest('hex');
export function publicHex(key) { return createPublicKey(key).export({format:'der',type:'spki'}).subarray(-32).toString('hex'); }
function verificationKey(hex) {
  if (!/^[a-f0-9]{64}$/.test(hex)) throw new Error('A pinned Ed25519 public key is required.');
  return createPublicKey({key:Buffer.from('302a300506032b6570032100'+hex,'hex'),type:'spki',format:'der'});
}
export function envelope(payload, key) {
  const text=JSON.stringify(payload);
  return {payload:text,signature:sign(null,Buffer.from(DOMAIN+text),key).toString('hex')};
}
export function openEnvelope(raw, hex) {
  if (Buffer.byteLength(raw)>4*1024*1024) throw new Error('Signed manifest is too large.');
  const signed=JSON.parse(raw);
  if (typeof signed.payload!=='string' || !/^[a-f0-9]{128}$/.test(signed.signature) ||
      !verify(null,Buffer.from(DOMAIN+signed.payload),verificationKey(hex),Buffer.from(signed.signature,'hex'))) throw new Error('Invalid release signature.');
  const value=JSON.parse(signed.payload);
  if(value.schema!==1) throw new Error('Unsupported signature schema.');
  return value;
}
export function safePath(relative) {
  return typeof relative==='string' && relative.length>0 && relative.length<=512 &&
    !/[\\:\x00-\x1f]/.test(relative) && relative.split('/').every(p=>p && p!=='.' && p!=='..' && !/[. ]$/.test(p));
}
async function walk(root, prefix='') {
  let files=[];
  for(const entry of await fs.readdir(path.join(root,prefix),{withFileTypes:true})) {
    const relative=prefix ? prefix+'/'+entry.name : entry.name;
    if(!safePath(relative) || entry.isSymbolicLink()) throw new Error('Unsafe package path: '+relative);
    if(entry.isDirectory()) files.push(...await walk(root,relative));
    else if(entry.isFile()) files.push(relative);
    else throw new Error('Unsupported package entry: '+relative);
  }
  return files.sort();
}
const extensionRoots=new Set(['core','providers','icons','images','fonts','assets','_locales']);
const extensionNames=new Set(['manifest.json','background.js','protection.js','popup.js','popup.html','overlay.css','icon.png','ollama-page.js','ollama.html','firefox-transfer-check.js']);
export const extensionFile=name=>extensionRoots.has(name.split('/')[0]) || extensionNames.has(name);
const userNames=new Set(['config.json','config.local.json','plazcode-settings.json','bridge-pairing.json','memory.json','chat-history.json','checkpoints.json','catalog.json','creations.json','update-source.json']);
export function programFile(name) {
  const first=name.split('/')[0];
  if(userNames.has(name) || ['logs','skills','vault','vaults','memory','cache','caches','node_modules','target','.git'].includes(first)) return false;
  if([FILE_MANIFEST,'SHA256SUMS.txt','DEVELOPMENT.txt'].includes(name)) return false;
  // Program assets and fixed helpers, not arbitrary files a user keeps beside the app.
  return ['production-build.json','PlazCode'].includes(name) || extensionFile(name) || ['PlazCode-Extension','PlazCode-Extension-Firefox','PlazCode.app','runtime','macos','ui','agent'].includes(first) ||
    /\.(exe|dll|cmd|bat|ps1|command|py|cjs|cs)$/.test(name) && !name.includes('/') || name===EXT_MANIFEST;
}
async function writeEnvelope(file, value, key) { await fs.writeFile(file,JSON.stringify(envelope(value,key))+'\n'); }
async function fileRecords(root, names) {
  const records={};
  for(const name of names) {const raw=await fs.readFile(path.join(root,name));records[name]={sha256:digest(raw),bytes:raw.length};}
  return records;
}
export async function signExtension(root, key, channel) {
  const names=(await walk(root)).filter(extensionFile);
  const version=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8')).version;
  await writeEnvelope(path.join(root,EXT_MANIFEST),{schema:1,kind:'files',version,platform:'extension',channel,files:await fileRecords(root,names)},key);
}
export async function signInstallation(root, key, platform, channel) {
  const names=(await walk(root)).filter(programFile);
  const version=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8')).version;
  await writeEnvelope(path.join(root,FILE_MANIFEST),{schema:1,kind:'files',version,platform,channel,files:await fileRecords(root,names)},key);
}
export async function verifyTree(root, hex, manifest=FILE_MANIFEST) {
  const record=openEnvelope(await fs.readFile(path.join(root,manifest),'utf8'),hex);
  if(record.kind!=='files' || !record.files || !Object.keys(record.files).length) throw new Error('Invalid file manifest.');
  for(const [name,expected] of Object.entries(record.files)) {
    if(!safePath(name)) throw new Error('Unsafe manifest path.');
    let current=root;
    for(const part of name.split('/')) {current=path.join(current,part);if((await fs.lstat(current)).isSymbolicLink()) throw new Error('Symlink in signed path.');}
    const raw=await fs.readFile(current);
    if(raw.length!==expected.bytes || digest(raw)!==expected.sha256) throw new Error('Program file changed: '+name);
  }
  return record;
}
export async function obfuscate(root, maps, sourceRoot, publicKey, channel, key) {
  // No eval, string-array runtime, property renaming or control-flow flattening: preserve extension CSP and performance.
  const require=createRequire(path.join(sourceRoot,'release-tools/package.json'));
  const {minify}=require('terser');
  const report={};
  await fs.mkdir(maps,{recursive:true,mode:0o700});
  for(const folder of ['', 'PlazCode-Extension', 'PlazCode-Extension-Firefox']) {
    const base=path.join(root,folder);
    try {await fs.access(path.join(base,'manifest.json'));} catch {continue;}
    const template=await fs.readFile(path.join(here,'overlay/protection.js'),'utf8');
    await fs.writeFile(path.join(base,'protection.js'),template.replace('UNCONFIGURED_RELEASE_PUBLIC_KEY',publicKey).replace('UNCONFIGURED_RELEASE_CHANNEL',channel));
    for(const name of (await walk(base)).filter(n=>extensionFile(n) && n.endsWith('.js') && !n.startsWith('core/ultralab/'))) {
      const original=await fs.readFile(path.join(base,name),'utf8');
      const label=(folder ? folder+'/' : '')+name;
      const result=await minify({[label]:original},{mangle:{toplevel:false},compress:{defaults:false,dead_code:true,conditionals:true,booleans:true},keep_fnames:true,format:{comments:/SPDX-License-Identifier|@license|@preserve/i},sourceMap:{filename:label,url:false,includeSources:true}});
      if(!result.code || !result.map) throw new Error('Obfuscation failed: '+label);
      await fs.writeFile(path.join(base,name),result.code+'\n');
      const mapPath=path.join(maps,label+'.map');await fs.mkdir(path.dirname(mapPath),{recursive:true});await fs.writeFile(mapPath,result.map,{mode:0o600});
      report[label]={source_sha256:digest(original),sha256:digest(result.code+'\n')};
    }
    await signExtension(base,key,channel);
  }
  return report;
}
// The CLI provides the private key only in memory; obfuscate does not export it or add it to reports.
export async function protect(root, maps, sourceRoot, key, channel, platform) {
  const publicKey=publicHex(key);
  {
    const report=await obfuscate(root,maps,sourceRoot,publicKey,channel,key);
    await fs.writeFile(path.join(root,'production-build.json'),JSON.stringify({schema:1,channel,public_key:publicKey,files:report})+'\n');
    await signInstallation(root,key,platform,channel);
  }
}
async function signingKey() {
  const file=process.env.PLAZCODE_SIGNING_KEY_FILE;
  const pem=process.env.PLAZCODE_RELEASE_SIGNING_KEY || (file ? await fs.readFile(file,'utf8') : '');
  if(!pem) throw new Error('Missing release signing key. Protected packages cannot be built unsigned.');
  const key=createPrivateKey(pem);
  if(key.asymmetricKeyType!=='ed25519') throw new Error('An Ed25519 release key is required.');
  return key;
}
async function main([command,...args]) {
  if(command==='provision') {
    // Owner runs this on a trusted machine with gh secret permissions. No private key is printed or written.
    const {privateKey,publicKey}=generateKeyPairSync('ed25519');
    const pem=privateKey.export({format:'pem',type:'pkcs8'});
    execFileSync('gh',['secret','set','PLAZCODE_RELEASE_SIGNING_KEY','--repo','stoveez/plazcode-source'],{input:pem,stdio:['pipe','inherit','inherit']});
    const hex=publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');
    await fs.writeFile(path.join(here,'overlay/release-public-key.hex'),hex+'\n');
    console.log('Release key stored in GitHub Actions. Commit overlay/release-public-key.hex; never replace an established key without a rotation plan.');return;
  }
  if(command==='validation-key') {
    const [directory]=args;await fs.mkdir(directory,{recursive:true,mode:0o700});
    const {privateKey}=generateKeyPairSync('ed25519');
    await fs.writeFile(path.join(directory,'key.pem'),privateKey.export({format:'pem',type:'pkcs8'}),{mode:0o600});
    await fs.writeFile(path.join(directory,'public.hex'),publicHex(privateKey)+'\n');return;
  }
  if(command==='verify') {await verifyTree(args[0],args[1],args[2]);return;}
  const key=await signingKey();
  if(command==='protect') {
    const [root,maps,sourceRoot,platform]=args;
    const channel=process.env.PLAZCODE_PROTECTION_CHANNEL || 'release';
    if(!['release','validation'].includes(channel)) throw new Error('Invalid protection channel.');
    const pinned=(await fs.readFile(path.join(here,'overlay/release-public-key.hex'),'utf8')).trim();
    if(channel==='release' && publicHex(key)!==pinned) throw new Error('Signing key does not match the pinned production key.');
    await protect(root,maps,sourceRoot,key,channel,platform);return;
  }
  if(command==='sign-update') {
    const [feedPath,platform]=args;const feed=JSON.parse(await fs.readFile(feedPath,'utf8'));
    const pinned=(await fs.readFile(path.join(here,'overlay/release-public-key.hex'),'utf8')).trim();
    if(publicHex(key)!==pinned) throw new Error('Wrong production signing key.');
    feed.security=envelope({schema:1,kind:'update',channel:'release',version:feed.version,platform,sha256:feed.sha256},key);
    await fs.writeFile(feedPath,JSON.stringify(feed,null,2)+'\n');return;
  }
  throw new Error('Unknown protection command.');
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
