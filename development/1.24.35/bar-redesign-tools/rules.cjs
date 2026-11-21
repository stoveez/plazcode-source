const { chromium } = require('playwright');const { open } = require(__dirname + '/harness.cjs');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});try{const {page}=await open(browser,{});if(process.env.LIGHT)await page.evaluate(()=>{document.documentElement.classList.add('rs-light');});await page.waitForTimeout(200);
const cdp=await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
const {root}=await cdp.send('DOM.getDocument',{depth:-1});const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:process.env.SEL});
const m=await cdp.send('CSS.getMatchedStylesForNode',{nodeId});const prop=process.env.PROP;
for(const r of m.matchedCSSRules){for(const p of r.rule.style.cssProperties){if(p.name===prop)console.log(r.rule.selectorList.text.slice(0,200),'=>',p.value,p.important?'!':'');}}
const inl=m.inlineStyle&&m.inlineStyle.cssProperties.filter(p=>p.name===prop);if(inl&&inl.length)console.log('INLINE',JSON.stringify(inl));
}finally{await browser.close();}})();
