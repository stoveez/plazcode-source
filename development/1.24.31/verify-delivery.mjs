import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {verifyTree,digest} from './protection.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const root=process.argv[2],source=path.join(repo,'build-src-1.24.31/PlazCode');
assert(root,'Usage: node development/1.24.31/verify-delivery.mjs /extracted/PlazCode');
const pinned=(await fs.readFile(path.join(repo,'development/1.24.31/overlay/release-public-key.hex'),'utf8')).trim();
const record=await verifyTree(root,pinned);
assert.equal(record.version,'1.24.31');assert.equal(record.channel,'release');
for(const sub of ['', 'PlazCode-Extension','PlazCode-Extension-Firefox']){
  const folder=path.join(root,sub),manifest=JSON.parse(await fs.readFile(path.join(folder,'manifest.json')));
  assert.equal(manifest.version,'1.24.31');
  assert.deepEqual(await fs.readFile(path.join(folder,'overlay.css')),await fs.readFile(path.join(source,'overlay.css')));
  await verifyTree(folder,pinned,'plazcode-extension-integrity.json');
  assert.deepEqual(await fs.readFile(path.join(folder,'LICENSE')),await fs.readFile(path.join(source,'LICENSE')));
  assert.deepEqual(await fs.readFile(path.join(folder,'THIRD-PARTY-NOTICES.txt')),await fs.readFile(path.join(source,'THIRD-PARTY-NOTICES.txt')));
}
const report=JSON.parse(await fs.readFile(path.join(root,'PlazCode-Extension/production-build.json')));
assert.equal(report.public_key,pinned);assert.equal(report.channel,'release');
const variant=report.release_variant;
assert.deepEqual(Object.keys(variant).sort(),['layout','mark','schema','seed_sha256']);
assert.notEqual(variant.seed_sha256,digest(Buffer.alloc(32)));
for(const prefix of ['', 'PlazCode-Extension/','PlazCode-Extension-Firefox/']){
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root,prefix+'core/release-variant.json'))),variant);
}
for(const [name,row] of Object.entries(report.files)){
  const relative=name.replace(/^PlazCode-Extension-Firefox\//,'PlazCode-Extension/');
  let raw=await fs.readFile(path.join(source,relative));
  if(name.endsWith('protection.js')) raw=Buffer.from((await fs.readFile(path.join(repo,'development/1.24.31/overlay/protection.js'),'utf8')).replace('UNCONFIGURED_RELEASE_PUBLIC_KEY',pinned).replace('UNCONFIGURED_RELEASE_CHANNEL','release'));
  const canonical=raw.toString().replace(/\r\n/g,'\n');
  assert([digest(raw),digest(Buffer.from(canonical)),digest(Buffer.from(canonical.replace(/\n/g,'\r\n')))].includes(row.source_sha256),'Reviewed source differs: '+name);
  const actual=await fs.readFile(path.join(root,name));
  assert.equal(digest(actual),row.sha256,'Packaged code differs: '+name);
  if(raw.toString().replace(/^\uFEFF/,'').startsWith('// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary')) assert(actual.toString().includes('LicenseRef-PlazCode-Proprietary'),'Missing current first-party notice: '+name);
}
const notices=await fs.readFile(path.join(root,'runtime/THIRD-PARTY-RUST-LICENSES.txt'),'utf8');
assert(notices.includes('option-ext@0.2.0')&&notices.includes('MPL-2.0')&&notices.includes('Permission is hereby granted'));
assert((await fs.readFile(path.join(root,'runtime/luau/LICENSE'),'utf8')).includes('MIT'));
console.log(JSON.stringify({platform:record.platform,version:record.version,channel:record.channel,signedFiles:Object.keys(record.files).length,reviewedSources:Object.keys(report.files).length,release_variant:variant,signatures:'verified',sourceProvenance:'verified',licences:'proprietary first-party and original dependency notices verified'}));
