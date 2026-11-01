// Public descriptors only: the release variant seed never enters reports or source archives.
import {createHash,hkdfSync} from 'node:crypto';
export const DEVELOPMENT_SEED='00'.repeat(32);
export function variantSeed(value=process.env.PLAZCODE_RELEASE_VARIANT||DEVELOPMENT_SEED){
  if(!/^[a-f0-9]{64}$/.test(value))throw Error('Invalid release variant configuration');
  return Buffer.from(value,'hex');
}
export function deriveVariant(key,version,channel){
  return Buffer.from(hkdfSync('sha256',key.export({format:'der',type:'pkcs8'}),Buffer.from(version),Buffer.from('PlazCode build variant v1\n'+channel),32)).toString('hex');
}
export function variantDigest(domain,version,seed=variantSeed()){
  return createHash('sha256').update(domain+'\n').update(seed).update(version).digest();
}
export function variantInfo(version,seed=variantSeed()){
  return {schema:1,seed_sha256:createHash('sha256').update(seed).digest('hex'),mark:variantDigest('PlazCode release mark v1',version,seed).subarray(0,8).toString('hex'),layout:seed[0]%3};
}
export function packConfig(version,seed=variantSeed()){
  return {key:variantDigest('PlazCode text pack v2',version,seed),nonceKey:variantDigest('PlazCode text pack nonce v2',version,seed),magic:variantDigest('PlazCode pack header v2',version,seed).subarray(0,8),mark:Buffer.from(variantInfo(version,seed).mark,'hex'),padding:8+seed[1]%24,layout:seed[0]%3};
}
