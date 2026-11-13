const { chromium } = require('playwright');const fs=require('fs'),path=require('path');
(async()=>{const src=process.env.SRC,out=process.env.OUT||'/tmp/bar-shots/pp';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--allow-file-access-from-files']});try{
const ctx=await browser.newContext({viewport:{width:Number(process.env.PW||400),height:Number(process.env.PH||640)},deviceScaleFactor:2});
await ctx.addInitScript((store)=>{const listeners=[];const get=(k,cb)=>{const v={...store};if(cb)setTimeout(()=>cb(v));return Promise.resolve(v);};
window.chrome={runtime:{id:'x',getManifest:()=>({version:'1.24.33'}),getURL:p=>p,onMessage:{addListener(){}},sendMessage:(m,cb)=>{const v={ok:true,connected:true,bridge_reachable:true,roblox_connected:true,local_connected:true,control_v2:true};if(cb)setTimeout(()=>cb(v));return Promise.resolve(v);},openOptionsPage(){},connect(){return {onMessage:{addListener(){}},onDisconnect:{addListener(){}},postMessage(){},disconnect(){}};},lastError:null},
storage:{local:{get,set:(u)=>{Object.assign(store,u);return Promise.resolve();},remove:()=>Promise.resolve()},onChanged:{addListener(f){listeners.push(f);}}},
tabs:{query:(q,cb)=>{const t=[{id:1,url:'https://chatgpt.com/c/x',active:true,title:'ChatGPT'}];if(cb)setTimeout(()=>cb(t));return Promise.resolve(t);},sendMessage:(id,m,cb)=>{if(cb)setTimeout(()=>cb({ok:true}));return Promise.resolve({ok:true});},create(){},update(){}},
permissions:{contains:(p,cb)=>{cb&&cb(true);return Promise.resolve(true);}},sidePanel:{open(){return Promise.resolve();}},action:{}};},{rsAppearance:{theme:process.env.PALETTE||'default',glow:'subtle',gradients:'on'},rsThinkingLevel:process.env.EFFORT||'high'});
const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('file://'+path.join(src,process.env.PAGE||'popup.html'));await page.waitForTimeout(900);
await page.screenshot({path:out+'/'+(process.env.NAME||'popup')+'.png',fullPage:true});console.log('errors',JSON.stringify(errors));
}finally{await browser.close();}})();
