// 1.24.30 (owner: "make it easy for me to inspect later on"): the desktop Logs page, driven with the real page
// code from agent/src/desktop.html and a stand-in for the app's /api/logs routes. Checks the day list, filters,
// search, the "what led up to this" view with Copy for AI, the empty state, that log text is never treated as
// HTML, and that the page fits a narrow window. Saves a screenshot for a person to look at.
const {chromium}=require('playwright'),fs=require('fs'),assert=require('assert');
const html=fs.readFileSync('agent/src/desktop.html','utf8'),clean=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const start=html.indexOf('  var Logsui = (function () {'),end=html.indexOf('  })();',start)+7;
assert(start>0&&end>start,'Logs page code found');
const code=html.slice(start,end);
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.PLAZCODE_CHROMIUM?{executablePath:process.env.PLAZCODE_CHROMIUM}:{}),args:['--no-sandbox']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:860}});
    await page.setContent(clean);await page.addStyleTag({content:'#nxSplash{display:none!important}'});
    await page.evaluate(()=>{document.documentElement.dataset.desktopTheme='default';document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));document.getElementById('page-logs').classList.add('active');});
    const now=Date.now(),day=(d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'))(new Date());
    const events=[
      {i:0,t:now-60000,src:'app',lvl:'info',cat:'startup',what:'app.start',text:'PlazCode 1.24.32 started',data:{file_check_ms:180}},
      {i:1,t:now-50000,src:'extension',lvl:'info',cat:'startup',what:'start.memoryPages',text:'{"pages":3}'},
      {i:2,t:now-40000,src:'extension',lvl:'info',cat:'turn',what:'turn.start',text:'{"kind":"work","preview":"make a shop UI"}'},
      {i:3,t:now-30000,src:'extension',lvl:'info',cat:'turn',what:'tool.start',text:'{"tool":"read_scripts"}'},
      {i:4,t:now-20000,src:'extension',lvl:'error',cat:'bridge',what:'bridge',text:'Bridge request /api/poll failed: TimeoutError <img src=x onerror=alert(1)>'},
      {i:5,t:now-10000,src:'app',lvl:'warn',cat:'app',what:'app.security',text:'Refused to pair with an extension that is not this installation’s official PlazCode-Extension'},
    ];
    await page.evaluate(({events,day})=>{
      window.calls=[];window.copied='';
      window.Byid=id=>document.getElementById(id);window.Toarray=v=>Array.prototype.slice.call(v);
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async t=>{window.copied=t;}}});
      window.Api=async(path)=>{window.calls.push(path);const u=new URL('http://x'+path),q=Object.fromEntries(u.searchParams);
        if(u.pathname==='/api/logs/days')return {days:[{day,events:6,errors:1,warnings:1},{day:'2026-10-30',events:2,errors:0,warnings:0}]};
        if(u.pathname==='/api/logs/day'){let list=events.slice().reverse();if(q.filter==='problems')list=list.filter(e=>e.lvl!=='info');else if(q.filter&&q.filter!=='all')list=list.filter(e=>e.cat===q.filter);if(q.q)list=list.filter(e=>JSON.stringify(e).toLowerCase().includes(q.q.toLowerCase()));return {total:list.length,events:list.slice(+q.offset,+q.offset+(+q.limit))};}
        if(u.pathname==='/api/logs/export')return {text:'PlazCode 1.24.32 log\n'+events.filter(e=>q.i==null||e.i<=+q.i).map(e=>e.what+' '+e.text).join('\n')};
        if(u.pathname==='/api/logs/open')return {ok:true};
        throw new Error('unexpected '+path);};
    },{events,day});
    await page.addScriptTag({content:code+';window.Logsui=Logsui;'});
    await page.evaluate(()=>Logsui.refresh());
    await page.waitForSelector('#logsList .lg-row');
    assert.equal(await page.locator('#logsList .lg-row').count(),6,'all events of today');
    assert.equal(await page.locator('#logsDays .lg-day').count(),2);
    assert.equal(await page.locator('#logsDays .lg-day').first().getAttribute('aria-current'),'true','today is selected');
    assert.equal(await page.locator('#logsList img').count(),0,'log text is never inserted as HTML');
    assert(await page.locator('#logsList').textContent().then(t=>t.includes('<img src=x')),'it is shown as plain text');
    await page.locator('[data-lg-filter=problems]').click();await page.waitForFunction(()=>document.querySelectorAll('#logsList .lg-row').length===2);
    assert.equal(await page.locator('#logsList .lg-row[data-lvl=error]').count(),1);
    await page.locator('[data-lg-filter=startup]').click();await page.waitForFunction(()=>document.querySelectorAll('#logsList .lg-row').length===2);
    await page.locator('[data-lg-filter=all]').click();await page.fill('#logsSearch','shop');await page.waitForFunction(()=>document.querySelectorAll('#logsList .lg-row').length===1);
    await page.fill('#logsSearch','nothing like this');await page.waitForSelector('#logsList .lg-empty');
    await page.fill('#logsSearch','');await page.waitForFunction(()=>document.querySelectorAll('#logsList .lg-row').length===6);
    await page.locator('#logsList .lg-row[data-lvl=error]').click();await page.waitForSelector('.lg-detail pre');
    await page.waitForFunction(()=>document.querySelector('.lg-detail pre').textContent.includes('turn.start'));
    assert.equal(await page.locator('#logsList .lg-row[data-lvl=error]').getAttribute('aria-expanded'),'true');
    await page.locator('.lg-detail .softbtn').click();await page.waitForFunction(()=>window.copied.includes('bridge'));
    assert(!(await page.evaluate(()=>window.copied)).includes('app.security'),'Copy for AI holds what led up to the error, not later events');
    await page.screenshot({path:process.env.PLAZCODE_LOGS_SCREENSHOT||'/tmp/plazcode-logs-page.png'});
    await page.locator('#logsOpenFolder').click();await page.waitForFunction(()=>window.calls.includes('/api/logs/open'));
    await page.setViewportSize({width:560,height:900});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'fits a narrow window');
    console.log('PASS Logs page: days, filters, search, empty state, what led up to an error with Copy for AI, plain-text log text, narrow window.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
