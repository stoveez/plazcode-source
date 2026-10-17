const {chromium,firefox}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('agent/src/desktop.html','utf8');
const clean=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const setup=html.slice(html.indexOf('  function Setupsettingssections('),html.indexOf('  function Go('));
const effort=html.slice(html.indexOf('  function Rendereffort('),html.indexOf('  function Rendersettings('));
const go=html.slice(html.indexOf('  function Go('),html.indexOf('  function ',html.indexOf('  function Go(')+20));
(async()=>{for(const [name,engine] of [['chromium',chromium],['firefox',firefox]]){
 const browser=await engine.launch({headless:true}),page=await browser.newPage();
 await page.route('http://plazcode.test/**',route=>route.fulfill({contentType:'text/html',body:clean}));
 await page.goto('http://plazcode.test/');await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(()=>{window.Byid=id=>document.getElementById(id);window.Toarray=x=>Array.from(x);window.Refreshupdates=()=>{};window.Rendertools=window.Measuredescriptions=window.Renderlogs=window.Loadcatalog=()=>{};window.Templateui=window.Skillsui={refresh(){}};window.Modelui=window.Uibuilder={pause(){},startPolling(){}};window.Explorerui={pause(){},refresh(){}};window.Follow=false;});
 await page.addScriptTag({content:setup+effort+go});
 await page.evaluate(()=>{window.memoryRefreshes=0;Setupsettingssections(()=>memoryRefreshes++);Go('settings');});
 const sections=page.locator('#page-settings details.settings-section');assert(await sections.count()>5);
 for(let i=0;i<await sections.count();i++){assert(await sections.nth(i).locator('summary h3').isVisible());assert(await sections.nth(i).locator('summary p').isVisible());assert.equal(await sections.nth(i).getAttribute('open'),null);}
 const first=sections.first();await first.locator('summary').click();assert(await first.locator('.settings-section-body').isVisible());await first.locator('summary').click();assert(await first.locator('.settings-section-body').isHidden());
 await first.locator('summary').focus();await page.keyboard.press('Enter');assert(await first.locator('.settings-section-body').isVisible());
 await page.evaluate(()=>{const input=document.querySelector('#page-settings select');input.value=input.options[input.options.length-1].value;window.preservedValue=input.value;input.addEventListener('change',()=>window.retainedListener=true);window.savedInput=input;document.querySelectorAll('#page-settings details').forEach(d=>d.open=true);});
 for(const [width,height] of [[1280,720],[1140,800],[700,500]]){
  await page.setViewportSize({width,height});
  const geometry=await page.locator('.content').evaluate(n=>{n.scrollTop=n.scrollHeight;const r=n.getBoundingClientRect();return {bottom:r.bottom,client:n.clientHeight,height:n.scrollHeight,top:n.scrollTop,overflow:getComputedStyle(n).overflowY};});
  assert(geometry.bottom<=height+1,`${name}: viewport bottom reachable at ${width}×${height}`);assert.equal(geometry.overflow,'scroll');assert(geometry.height>geometry.client);assert(Math.abs(geometry.top+geometry.client-geometry.height)<2);
  const nav=await page.locator('.nav').evaluate(n=>{n.scrollTop=n.scrollHeight;const r=n.getBoundingClientRect(),s=n.querySelector('[data-page=settings]').getBoundingClientRect();return {bottom:r.bottom,settings:s.bottom,top:r.top,settingsTop:s.top};});
  assert(nav.bottom<=height);assert(nav.settings<=nav.bottom+1);assert(nav.settingsTop>=nav.top-1);
 }
 await page.evaluate(()=>{const input=savedInput;input.closest('details').open=false;input.closest('details').open=true;input.dispatchEvent(new Event('change'));});assert.equal(await page.evaluate(()=>savedInput.value),await page.evaluate(()=>preservedValue));assert(await page.evaluate(()=>retainedListener));
 await page.evaluate(()=>Go('updates'));assert(await page.locator('#page-updates').isVisible());assert.equal(await page.locator('.navbtn.active').getAttribute('data-page'),'updates');
 for(const level of ['default','low','mid','high','max','ultracode']){
  await page.evaluate(level=>Rendereffort(level),level);
  const colors=await page.locator('#titleEffort').evaluate(n=>[getComputedStyle(n).color,getComputedStyle(n.querySelector('span')).color]);assert.equal(colors[0],colors[1]);
 }
 assert((await page.locator('#titleEffort').textContent()).includes('Effort: Ultracode'));assert(!(await page.locator('#titleEffort').textContent()).includes('Beta'));assert.equal(await page.locator('option[value=ultracode]').last().textContent(),'Ultracode (Beta)');
 console.log(`${name}: bounded workspace scrolling at three sizes, reachable sidebar bottom, expandable Settings preserving values/listeners, Updates navigation, and whole effort label color passed.`);await browser.close();
}})().catch(e=>{console.error(e);process.exitCode=1;});
