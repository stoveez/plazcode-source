import assert from 'node:assert/strict';
import {generateKeyPairSync,createDecipheriv} from 'node:crypto';
import {variantSeed,variantInfo,deriveVariant,packConfig} from './release-variant.mjs';
import {sealTextPack,openTextPack} from './protection.mjs';

const {privateKey}=generateKeyPairSync('ed25519');
const first=deriveVariant(privateKey,'1.24.32','release');
assert.equal(first,deriveVariant(privateKey,'1.24.32','release'));
assert.notEqual(first,deriveVariant(privateKey,'1.24.32','release'));
assert.notEqual(first,deriveVariant(privateKey,'1.24.32','validation'));
assert.throws(()=>variantSeed('invalid'));
const payload={'config:0':'Hello ✓','skills:0':['a','b']};
for(let layout=0;layout<3;layout++){
  const seed=Buffer.alloc(32,layout),config=packConfig('1.24.32',seed);
  assert.equal(config.layout,layout);
  const packed=sealTextPack(payload,'1.24.32',seed);
  assert.deepEqual(packed,sealTextPack({'skills:0':['a','b'],'config:0':'Hello ✓'},'1.24.32',seed),'identical content seals identically across native packages');
  const changedContent=sealTextPack({...payload,'config:0':'Different content'},'1.24.32',seed);
  const nonce=raw=>raw.subarray(layout===0?8+config.padding:layout===1?8:24,layout===0?20+config.padding:layout===1?20:36);
  assert.notDeepEqual(nonce(packed),nonce(changedContent),'different plaintext must not reuse the GCM nonce');
  assert.notDeepEqual(config.key,config.nonceKey,'separate key domains');
  const tag=layout===0?packed.subarray(-16):layout===1?packed.subarray(20+config.padding,36+config.padding):packed.subarray(8,24);
  const ciphertext=layout===0?packed.subarray(20+config.padding,-16):layout===1?packed.subarray(36+config.padding):packed.subarray(36,-config.padding);
  const pad=layout===0?packed.subarray(8,8+config.padding):layout===1?packed.subarray(20,20+config.padding):packed.subarray(-config.padding);
  const decoder=createDecipheriv('aes-256-gcm',config.key,nonce(packed));decoder.setAAD(Buffer.concat([config.magic,pad]));decoder.setAuthTag(tag);
  const compressed=Buffer.concat([decoder.update(ciphertext),decoder.final()]);
  assert.equal(compressed[9],255,'gzip header must be independent of the build OS');
  assert.deepEqual(openTextPack(packed,'1.24.32',seed),payload);
  assert.throws(()=>openTextPack(packed,'1.24.32',Buffer.alloc(32,layout+1)));
  assert.throws(()=>openTextPack(packed,'1.24.32',seed));
  for(const index of [0,8,Math.floor(packed.length/2),packed.length-1]){
    const changed=Buffer.from(packed);changed[index]^=1;
    assert.throws(()=>openTextPack(changed,'1.24.32',seed));
  }
  for(const size of [0,8,20,36])assert.throws(()=>openTextPack(packed.subarray(0,size),'1.24.32',seed));
  const descriptor=variantInfo('1.24.32',seed);
  assert.equal(descriptor.mark.length,16);
  assert.equal(descriptor.seed_sha256.length,64);
  assert.notEqual(descriptor.mark,variantInfo('1.24.32',seed).mark);
  assert.deepEqual(Object.keys(descriptor).sort(),['layout','mark','schema','seed_sha256']);
}
assert.throws(()=>openTextPack(sealTextPack({},'1.24.32'),'1.24.32'));
console.log('PASS deterministic per-version variants, all three authenticated layouts, foreign variant/version and tamper/truncation rejection; reports contain hash/mark only.');
