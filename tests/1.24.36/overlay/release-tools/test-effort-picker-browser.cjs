// Actual desktop styles, settings cards and inline picker: every effort must be clickable.
const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const html=fs.readFileSync('agent/src/desktop.html','utf8');
const start=html.indexOf('function PlazCodeMountEffortPicker(select){');
const picker=html.slice(start,html.indexOf('  PlazCodeMountEffortPicker(document.querySelector',start));
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.PLAZCODE_CHROMIUM?{executablePath:process.env.PLAZCODE_CHROMIUM}:{}),args:['--no-sandbox']});try{
 for(const viewport of [{width:1914,height:1028},{width:900,height:560},{width:560,height:420}]){
  const page=await browser.newPage({viewport});await page.route('**/*',route=>route.abort());
  await page.setContent(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
  await page.evaluate(()=>{
   document.documentElement.dataset.desktopTheme='default';document.documentElement.style.setProperty('--nx-blur','16px');
   const reasoning=document.querySelector('select[data-pref="rsThinkingLevel"]').closest('.settingcard');
   const instructions=document.querySelector('#customInstructions').closest('.settingcard');
   const grid=document.createElement('div');grid.className='settingsgrid';
   const card=title=>{const c=document.createElement('div');c.className='settingcard';c.innerHTML='<h3>'+title+'</h3><p>Settings card</p>';return c;};
   grid.append(card('Execution'),reasoning,card('Automation'),instructions);
   const content=document.createElement('main');content.className='content';content.style.height='100vh';content.style.flex='none';const section=document.createElement('section');section.className='page active';section.append(grid);content.append(section);document.body.replaceChildren(content);
   document.querySelector('select[data-pref="rsThinkingLevel"]').value='max';window.changes=[];document.querySelector('select[data-pref="rsThinkingLevel"]').addEventListener('change',event=>changes.push(event.target.value));
  });
  await page.addScriptTag({content:picker+'\nPlazCodeMountEffortPicker(document.querySelector(\'select[data-pref="rsThinkingLevel"]\'));'});
  const trigger=page.locator('.pc-effort-picker .pc-effort-trigger'),panel=page.locator('.pc-effort-options');
  for(const value of ['default','low','mid','high','max','ultracode']){
   await trigger.click();const option=panel.locator('[data-value="'+value+'"]');await option.evaluate(node=>node.scrollIntoView({block:'nearest'}));
   const hit=await option.evaluate(node=>{const r=node.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return y>=0&&y<innerHeight&&node.contains(document.elementFromPoint(x,y));});
   assert(hit,'effort '+value+' is visible and unobscured at '+JSON.stringify(viewport));await option.click();
   assert.equal(await page.locator('select[data-pref="rsThinkingLevel"]').inputValue(),value);assert.equal(await panel.isVisible(),false);assert.equal(await page.locator('.pc-effort-lift').count(),0,'close restores card stacking');
  }
  assert.deepEqual(await page.evaluate(()=>changes),['default','low','mid','high','max','ultracode']);
  await trigger.click();await page.keyboard.press('Home');await page.keyboard.press('End');await page.keyboard.press('Enter');assert.equal(await page.locator('select[data-pref="rsThinkingLevel"]').inputValue(),'ultracode');
  await trigger.click();await page.keyboard.press('Escape');assert.equal(await trigger.getAttribute('aria-expanded'),'false');assert.equal(await page.locator('.pc-effort-lift').count(),0);
  if(process.env.PLAZCODE_EFFORT_SCREENSHOTS){fs.mkdirSync(process.env.PLAZCODE_EFFORT_SCREENSHOTS,{recursive:true});await trigger.click();await page.screenshot({path:process.env.PLAZCODE_EFFORT_SCREENSHOTS+'/'+viewport.width+'x'+viewport.height+'.png'});}
  await page.close();
 }
 const canonical=fs.readFileSync('core/effort-picker.js','utf8');assert.equal(picker.trim(),canonical.slice(canonical.indexOf('function PlazCodeMountEffortPicker(select){'),canonical.indexOf("if(typeof module")).trim(),'desktop and shared picker stay in sync');
 console.log('PASS desktop effort choices stay above adjacent blurred cards and selectable at large/short/narrow sizes; keyboard selection, Escape and stacking cleanup preserved.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
