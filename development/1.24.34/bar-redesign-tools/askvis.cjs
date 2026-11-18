const { chromium } = require('playwright');const { open } = require(__dirname + '/harness.cjs');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});try{const {page,errors}=await open(browser,{});
const vis=()=>page.evaluate(()=>!document.getElementById('rs-ask-plazcode').hidden);
const a=await vis();await page.click('#rs-engine .rs-mode-btn:nth-of-type(2)');await page.waitForTimeout(800);const b=await vis();
await page.click('#rs-engine .rs-mode-btn:nth-of-type(1)');await page.waitForTimeout(800);const c=await vis();
console.log('RS',a,'AS',b,'back to RS',c,'errors',JSON.stringify(errors));}finally{await browser.close();}})();
