const { chromium } = require('playwright');const fs=require('fs');const { open } = require(__dirname + '/harness.cjs');
(async()=>{const out=process.env.OUT||'/tmp/bar-shots/m';fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});try{const {page,errors}=await open(browser,{width:1280,height:900,store:process.env.LANG_CODE?{rsLanguage:process.env.LANG_CODE}:{}});
await page.click('#rs-settings-btn');await page.waitForTimeout(700);
const shot=async n=>{const bb=await (await page.$('#rs-menu')).boundingBox();await page.screenshot({path:out+'/'+n+'.png',clip:{x:bb.x-16,y:Math.max(0,bb.y-16),width:bb.width+32,height:Math.min(900,bb.height+32)}});};
await shot('ai');
for(const t of (process.env.TABS||'safety,automation,instructions,connections,general').split(',')){await page.click('.rs-menu-tab[data-rs-tab='+t+']');await page.waitForTimeout(550);await shot(t);}
if(process.env.SEARCH){await page.fill('.rs-menu-search',process.env.SEARCH);await page.waitForTimeout(400);await shot('search');}
console.log('errors',JSON.stringify(errors),'menu',JSON.stringify(await (await page.$('#rs-menu')).boundingBox()));
}finally{await browser.close();}})();
