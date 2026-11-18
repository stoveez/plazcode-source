// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
const fs=require('fs'),assert=require('node:assert/strict'),{createRequire}=require('module');
const source=process.cwd(),requireFrom=createRequire(source+'/release-tools/package.json');
const {chromium}=requireFrom('playwright'),fixturePath=source+'/release-tools/test-approval-modes-browser.cjs',req=createRequire(fixturePath);
const script=fs.readFileSync(fixturePath,'utf8'),prefix=script.slice(0,script.indexOf('\n(async()=>'));
const {load,choose}=new Function('require',prefix+';return {load,choose};')(req);
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 const {page,errors}=await load(browser,'ask');
 await page.evaluate(()=>{fixture.A.toolList=[{name:'write_file',server:'local',inputSchema:{type:'object',properties:{path:{type:'string'},content:{type:'string'}},required:['path','content']}}];fixture.A.toolNames=new Set(['write_file','plazcode_batch']);window.__rsEngine=()=> 'local';window.nativeCalls.length=0;});
 const batch=page.evaluate(()=>fixture.runTool({tool:'plazcode_batch',arguments:{calls:[{command:'write_file',params:{path:'src/rounds.js',content:'export const rounds = 5;'}},{command:'write_file',params:{path:'src/shop.js',content:'export const price = 25;'}}]}}));
 await page.waitForSelector('#rs-approve:not([hidden])');assert.equal(await page.evaluate(()=>nativeCalls.length),0);
 await page.setViewportSize({width:1280,height:900});await page.waitForTimeout(300);
 if(process.env.PLAZCODE_UI_PREVIEW_DIR){fs.mkdirSync(process.env.PLAZCODE_UI_PREVIEW_DIR,{recursive:true});await page.screenshot({path:require('path').join(process.env.PLAZCODE_UI_PREVIEW_DIR,'PlazCode-batch-approval.png')});}
 await page.locator('#rs-approve-allow').click();await page.waitForFunction(()=>nativeCalls.length===1);
 await page.waitForFunction(()=>!document.querySelector('#rs-approve').hidden && document.querySelector('#rs-approve').innerText.includes('shop.js'));
 assert.equal(await page.evaluate(()=>nativeCalls.length),1,'second command waits for its own approval');await page.locator('#rs-approve-allow').click();assert((await batch).includes('"complete":true'));assert.equal(await page.evaluate(()=>nativeCalls.length),2);
 const bad=await page.evaluate(()=>fixture.runTool({tool:'plazcode_batch',arguments:{calls:[{command:'write_file',params:{path:'never.txt',content:'never'}},{command:'write_file',params:{path:'invalid.txt'}}]}}));assert(bad.startsWith('ERROR'));assert.equal(await page.evaluate(()=>nativeCalls.length),2,'invalid later child blocks entire batch');
 const denied=page.evaluate(()=>fixture.runTool({tool:'plazcode_batch',arguments:{calls:[{command:'write_file',params:{path:'denied.txt',content:'never'}},{command:'write_file',params:{path:'remaining.txt',content:'never'}}]}}));await page.waitForSelector('#rs-approve:not([hidden])');await page.locator('#rs-approve-deny').click();assert((await denied).startsWith('ERROR'));assert.equal(await page.evaluate(()=>nativeCalls.length),2,'denial stops remaining commands');
 await choose(page,'bypass');const allowed=await page.evaluate(()=>fixture.runTool({tool:'plazcode_batch',arguments:{calls:[{command:'write_file',params:{path:'bypass.txt',content:'allowed'}},{command:'write_file',params:{path:'bypass2.txt',content:'allowed'}}]}}));assert(allowed.includes('"complete":true'));assert.equal(await page.evaluate(()=>nativeCalls.length),4);assert.deepEqual(errors,[]);
 console.log('PASS actual Chromium PlazCode core/UI: separate child approvals, preflight before any write, denial stops remaining commands, bypass preserves selected mode; screenshot is the real UI on an isolated offline page.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
