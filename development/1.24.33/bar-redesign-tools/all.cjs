const { chromium } = require('playwright');const { open } = require(__dirname + '/harness.cjs');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});try{const {page,errors}=await open(browser,{});
await page.evaluate(()=>{for(const id of ['rs-stop','rs-fix','rs-agents','rs-ask-plazcode','rs-undo','rs-cowork-queue'])document.getElementById(id).hidden=false;document.getElementById('rs-cowork').setAttribute('aria-pressed','true');document.getElementById('rs-cowork').textContent='Co-Work: On';document.querySelector('#rs-agents .rs-agents-num').textContent='2';});
await page.waitForTimeout(300);const bb=await (await page.$('#rs-bar')).boundingBox();
await page.screenshot({path:'/tmp/bar-shots/all.png',clip:{x:bb.x-70,y:bb.y-24,width:bb.width+100,height:bb.height+48}});
// hover + ripple frame
const b=await (await page.$('#rs-enhance')).boundingBox();await page.mouse.move(b.x+20,b.y+12);await page.mouse.down();await page.waitForTimeout(120);
await page.screenshot({path:'/tmp/bar-shots/ripple.png',clip:{x:b.x-30,y:b.y-20,width:200,height:70}});await page.mouse.up();
const a=await (await page.$('#rs-action')).boundingBox();await page.mouse.click(a.x+a.width/2,a.y+a.height/2);await page.waitForTimeout(140);
console.log('sparks',await page.evaluate(()=>document.querySelectorAll('#rs-sparks>span').length));
await page.screenshot({path:'/tmp/bar-shots/sparks.png',clip:{x:a.x-80,y:a.y-70,width:a.width+160,height:150}});
console.log('errors',JSON.stringify(errors));
}finally{await browser.close();}})();
