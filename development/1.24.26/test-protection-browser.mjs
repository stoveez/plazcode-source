// Exercise the actual protected extension and browser Ed25519 implementations, offline.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {protect} from './protection.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),source=path.resolve(here,'../../build-src-1.24.26/PlazCode');
const require=createRequire(path.join(source,'release-tools/package.json')),{chromium,firefox}=require('playwright');
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'plazcode-protected-browser-')),root=path.join(temporary,'PlazCode');
const {privateKey}=generateKeyPairSync('ed25519');
try {
  await fs.cp(path.join(source,'PlazCode-Extension'),root,{recursive:true});
  await fs.cp(path.join(source,'PlazCode-Extension'),path.join(root,'PlazCode-Extension'),{recursive:true});
  execFileSync(process.env.PYTHON || 'python3',[path.join(source,'release-tools/build-firefox.py'),path.join(root,'PlazCode-Extension'),path.join(root,'PlazCode-Extension-Firefox'),path.join(temporary,'raw-firefox.zip')]);
  await fs.writeFile(path.join(root,'PlazCode'),'browser-fixture native placeholder');
  await protect(root,path.join(temporary,'private-maps'),source,privateKey,'validation','linux');
  const profile=path.join(temporary,'chromium-profile'),ext=path.join(root,'PlazCode-Extension');
  const context=await chromium.launchPersistentContext(profile,{headless:true,channel:'chromium',args:['--disable-extensions-except='+ext,'--load-extension='+ext,'--no-sandbox']});
  try {
    let worker=context.serviceWorkers()[0];if(!worker)worker=await context.waitForEvent('serviceworker',{timeout:30000});
    assert.equal(await worker.evaluate(async()=>{await PlazCodeIntegrity.check();return true;}),true);
    assert.equal(await worker.evaluate(()=>chrome.runtime.getManifest().version),'1.24.26');
    console.log('PASS actual protected Chromium service worker: signed assets verified, normal startup reached.');
  } finally {await context.close();}
  // The established real-extension fixture checks that the transformed Ultra pack still works.
  execFileSync(process.execPath,[path.join(source,'release-tools/test-ultra-extension-browser.cjs')],{cwd:root,stdio:'inherit',timeout:120000});
  const folder=path.join(root,'PlazCode-Extension-Firefox');
  const server=http.createServer(async(req,res)=>{
    try {
      const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);
      if(!name){res.setHeader('content-type','text/html');res.end('<!doctype html><title>Protected Firefox verification</title>');return;}
      const resolved=path.resolve(folder,name);if(!resolved.startsWith(folder+path.sep)){res.writeHead(403).end();return;}
      res.setHeader('content-type',name.endsWith('.js')?'application/javascript':'application/octet-stream');res.end(await fs.readFile(resolved));
    } catch {res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await firefox.launch({headless:true});
  try {
    const page=await browser.newPage(),base='http://127.0.0.1:'+server.address().port+'/';
    async function load() {
      await page.goto(base);await page.evaluate(base=>{globalThis.chrome={runtime:{getURL:name=>base+name,getManifest:()=>({version:'1.24.26'})}};},base);
      await page.addScriptTag({url:base+'protection.js'});
      return page.evaluate(async()=>{try{await PlazCodeIntegrity.check();return 'verified';}catch(e){return e.message;}});
    }
    assert.equal(await load(),'verified');
    await fs.appendFile(path.join(folder,'core/main.js'),'\n// modified');
    assert.match(await load(),/official version/);
    console.log('PASS Firefox: real packaged obfuscated verifier accepts intact files and rejects modified code.');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
} finally {await fs.rm(temporary,{recursive:true,force:true});}
