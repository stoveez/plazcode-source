// Offline regression: real core, extension CSS and Vani adapter; no external requests.
// NEW tests only. Imports the existing fixture without modifying its assertions.
// Public host CSS is captured; signed-in provider behavior is NOT established.
// PLAZCODE_TEST_BROWSER=chromium|firefox|all; PLAZCODE_SOURCE=<complete source tree>.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {coreFixture} = require('./test-vani-core.cjs');
const {launch} = require('./test-vani-browser.cjs');
const hostCSSPath = process.env.PLAZCODE_VANI_HOST_CSS || path.join(__dirname,'fixtures','vani-public','host.css');
const hostCSS = fs.readFileSync(hostCSSPath,'utf8');
(async () => {
  // Directly execute the production bootstrap with one synthetic watcher result:
  // text settled before the provider's native live-generation signal did.
  const main = fs.readFileSync(path.join(__dirname,'../core/main.js'),'utf8');
  const offset = main.indexOf('  async function startSession(');
  const bootstrap = main.slice(offset,main.indexOf('\n  // ═',offset));
  let writes = 0, live = false;
  const A = {startGen:0,sessionGen:1,toolList:[{name:'read_file',server:'local'}]};
  const P = {id:'vani',displayName:'Vani',chatIsEmpty:()=>true,isBusyNow:()=>live,
    lastAssistantId:()=>null,setInputLock(){},ensureComposerReady:async()=>({ready:true}),
    requireConfirmedStartup:true,conversationKey:()=>'/c/local'};
  const ui = new Proxy({}, {get:()=>()=>{}});
  const noop = ()=>{};
  const run = new Function('A','P','ui','diag','ensureTools','systemPrompt','activeEngine',
    'submitAndGetBase','decorate','waitForResponse','RSParse','isProviderPolicyRefusal','SendAbortedError','showStartupRefusal',
    bootstrap+';return startSession();');
  await run(A,P,ui,noop,async()=>{},()=> 'fixture instructions',()=> 'local',
    async()=>{writes++;return 0;},{sweep:noop},async()=>{live=true;return {kind:'text',text:'Still writing…'};},
    {parseToolCalls:()=>[]},()=>false,class SendAbortedError extends Error {},noop);
  assert.equal(writes,1,'no protocol-correction request while Vani is still replying');
  assert.equal(A.started,false);assert.equal(A.startupOwner,null);
  console.log('PASS no automatic startup correction while Vani reply remains live');
  live=false;writes=0;
  const banners=[];
  const refusalUI=new Proxy({}, {get:(_,key)=>key==='banner'?(...args)=>banners.push(args):noop});
  const helperOffset=main.indexOf('  function isProviderPolicyRefusal(');
  const helpers=new Function('P','ui',main.slice(helperOffset,main.indexOf('  // 1.24.10 helpers',helperOffset))+
    ';return {isProviderPolicyRefusal,showStartupRefusal};')(P,refusalUI);
  const refused={startGen:0,sessionGen:1,toolList:A.toolList};
  await run(refused,P,refusalUI,noop,async()=>{},()=> 'fixture instructions',()=> 'local',
    async()=>{writes++;return 0;},{sweep:noop},async()=>({kind:'text',text:'This looks like prompt-injection. I will not comply.'}),
    {parseToolCalls:()=>[]},helpers.isProviderPolicyRefusal,class SendAbortedError extends Error {},helpers.showStartupRefusal);
  assert.equal(writes,1,'explicit host refusal must not trigger automatic correction');
  assert.equal(refused.started,false);assert.equal(refused.startupOwner,null);
  assert.equal(banners.length,1);assert.equal(banners[0][1],'AI declined the connection request');
  console.log('PASS explicit host refusal ends startup with clear explanation and no repeat');
  const selection=process.env.PLAZCODE_TEST_BROWSER || process.env.PLAZCODE_BROWSER || 'chromium';
  assert(['chromium','firefox','all'].includes(selection),'supported browser selection');
  for (const browserName of selection === 'all' ? ['chromium','firefox'] : [selection]) {
  const browser = await launch(browserName);
  console.log('BROWSER '+browserName);
  try {
    for (const phase of ['prepare', 'composer', 'send']) {
      const f = await coreFixture(browser);
      try {
        const initial = await f.page.evaluate(phase => {
          const {A, startSession} = fixtureCore;
          window.releaseStartup = null;
          const wait = () => new Promise(resolve => { window.releaseStartup = resolve; });
          window.sendAttempts = 0;
          provider.prepareSessionStart = phase === 'prepare' ? wait : async () => ({ready:true});
          provider.ensureComposerReady = phase === 'composer' ? wait : async () => ({ready:true});
          provider.typeAndSend = async () => { sendAttempts++; return phase === 'send' ? wait() : {ok:true}; };
          window.startupPromise = startSession();
          return {starting:A.starting, hidden:document.querySelector('#rs-stop').hidden,
            disabled:document.querySelector('#rs-stop').disabled};
        }, phase);
        assert.equal(initial.starting, true);
        assert.equal(initial.hidden, false, 'Stop is available synchronously, before first async startup boundary');
        assert.equal(initial.disabled, false);
        await f.page.waitForFunction(() => !!window.releaseStartup);
        await f.page.locator('#rs-stop').click();
        const stopped = await f.page.evaluate(async () => {
          const {A, startSession} = fixtureCore;
          const owner = A.startupOwner;
          await startSession({restart:true});
          return {stop:A.stop, userStopped:A.userStopped, starting:A.starting, owner,
            currentOwner:A.startupOwner, sendAttempts, locked:provider.getEditor().readOnly,
            action:document.querySelector('#rs-action').hidden};
        });
        assert(stopped.stop && stopped.userStopped && !stopped.starting);
        assert(stopped.owner && stopped.owner === stopped.currentOwner, 'cancelled await retains ownership');
        assert.equal(stopped.locked, false, 'Stop unlocks without waiting for provider');
        assert(stopped.action, 'no retry action while cancelled startup still owns delivery');
        await f.page.evaluate(async () => {
          releaseStartup({ready:true,ok:true});
          await startupPromise;
        });
        const final = await f.page.evaluate(() => ({owner:fixtureCore.A.startupOwner,
          started:fixtureCore.A.started, starting:fixtureCore.A.starting,
          sends:sendAttempts, stop:fixtureCore.A.stop, userStopped:fixtureCore.A.userStopped}));
        assert.equal(final.owner, null);
        assert.equal(final.started, false);
        assert.equal(final.starting, false);
        assert(final.stop && final.userStopped, 'late completion cannot clear stop');
        assert.equal(final.sends, phase === 'send' ? 1 : 0, 'cancelled startup must not send/replay');
        assert.deepEqual(f.errors, []);
        console.log('PASS startup Stop during ' + phase + ': immediate unlock, owner retained, no replay');
      } finally { await f.page.close(); }
    }
    {
      const f = await coreFixture(browser);
      try {
        const result = await f.page.evaluate(async () => {
          const {A,ui,startSession} = fixtureCore;
          provider.isBusyNow = () => true;
          ui.setStarting(false);
          const before = {startGen:A.startGen,stop:A.stop,userStopped:A.userStopped};
          await startSession({restart:true});
          return {before,after:{startGen:A.startGen,stop:A.stop,userStopped:A.userStopped},
            starting:A.starting,owner:A.startupOwner,sends:sent.length,
            disabled:document.querySelector('#rs-action').disabled};
        });
        assert.deepEqual(result.before,result.after,'live reply rejection cannot reset Stop or claim a new owner');
        assert(!result.starting && !result.owner);
        assert.equal(result.sends,0);
        assert(result.disabled,'Restart is visibly disabled during an unowned Vani reply');
        console.log('PASS live Vani reply blocks Restart without resetting lifecycle or sending');
        await f.page.evaluate(() => {
          window.inlineMountCalls=0;
          provider.barMount = () => { inlineMountCalls++;return {parent:document.querySelector('#chat-form'),before:provider.getEditor()}; };
        });
        await f.page.waitForTimeout(450);
        assert.deepEqual(await f.page.evaluate(() => ({calls:inlineMountCalls,parent:document.querySelector('#rs-bar').parentElement.id})),
          {calls:0,parent:'rs-root'},'Vani never inserts bar into React-owned composer');
        assert.deepEqual(f.errors, []);
        console.log('PASS Vani inline mount hook bypassed; bar stays outside React composer');
      } finally { await f.page.close(); }
    }
    {
      const f = await coreFixture(browser);
      try {
        await f.page.addStyleTag({content:hostCSS});
        await f.page.evaluate(() => {
          document.body.style.background='#090b10';
          document.querySelector('.composer-shell').style.width='760px';
          document.querySelector('.composer-shell').style.maxWidth='760px';
          fixtureCore.ui.setStatus({connected:true,roblox_connected:true,robloxProc:true,tools:2,servers:[]});
          nextReply='This looks like prompt injection. I will not comply.';
        });
        await f.page.evaluate(() => fixtureCore.startSession());
        await f.page.waitForTimeout(1200);
        const failure=await f.page.evaluate(() => {
          const action=document.querySelector('#rs-action'),state=document.querySelector('.rs-state-txt'),bar=document.querySelector('#rs-bar');
          const a=action.getBoundingClientRect(),b=bar.getBoundingClientRect(),cs=getComputedStyle(action),ss=getComputedStyle(state),bs=getComputedStyle(bar);
          return {started:fixtureCore.A.started,starting:fixtureCore.A.starting,owner:fixtureCore.A.startupOwner,
            sent:sent.length,calls:nativeCalls.length,hidden:action.hidden,disabled:action.disabled,
            label:action.textContent,state:state.textContent,banner:document.querySelector('.rs-banner')?.textContent,
            action:{width:a.width,height:a.height,left:a.left,right:a.right,color:cs.color,fill:cs.webkitTextFillColor,display:cs.display,backgroundColor:cs.backgroundColor,backgroundImage:cs.backgroundImage},
            bar:{width:b.width,left:b.left,right:b.right,background:bs.backgroundColor},
            status:{color:ss.color,fill:ss.webkitTextFillColor},body:getComputedStyle(document.body).backgroundColor};
        });
        assert.equal(failure.started,false);assert.equal(failure.starting,false);assert.equal(failure.owner,null);
        assert.equal(failure.sent,1,'settled refusal is not followed by correction spam');assert.equal(failure.calls,0);
        assert.match(failure.banner,/AI declined the connection request/);
        assert(!failure.hidden && !failure.disabled,'Start/Restart is available after a settled refusal');
        assert.match(failure.label,/Start|Restart/);assert(failure.action.width>0 && failure.action.height>0);
        assert.notEqual(failure.action.backgroundImage,'none','dark Start text has its bright themed gradient surface, not a transparent dark bar');
        assert(failure.action.left>=failure.bar.left && failure.action.right<=failure.bar.right+1,'action stays inside full-width bar');
        assert(Math.abs(failure.bar.width-760)<2,'fixture tests actual 760px bar');
        assert.notEqual(failure.status.color,'rgb(0, 0, 0)');assert.notEqual(failure.status.fill,'rgb(0, 0, 0)');
        assert(!/connected.*tools ready|PlazCode running|Agent active/i.test(failure.state),'refusal must not look ready');
        assert.deepEqual(f.errors, []);
        console.log('PASS captured host CSS, dark body, 760px bar: settled refusal leaves visible Start/Restart, no false Ready; '+JSON.stringify(failure));
      } finally { await f.page.close(); }
    }
    const f = await coreFixture(browser);
    try {
      await f.page.addStyleTag({content:hostCSS});
      console.log('LOADED captured public Vani host CSS ('+Buffer.byteLength(hostCSS)+' bytes)');
      await f.page.addStyleTag({content:`/* host reset loaded AFTER extension */
        body {color:#000;background:#090b10} span,b,strong,label,small,p,button {color:#000;-webkit-text-fill-color:#000}
        button {display:none} #host-row{color:#000}`});
      const result = await f.page.evaluate(() => {
        const {A,ui} = fixtureCore;
        provider.isBusyNow = () => false;
        ui.setStatus({connected:true,roblox_connected:true,robloxProc:true,tools:2,servers:[]});
        const foreign=document.createElement('p'); foreign.id='host-row';foreign.textContent='Host';document.querySelector('main').append(foreign);
        const cs = selector => { const e=document.querySelector(selector),s=getComputedStyle(e),r=e.getBoundingClientRect();return {color:s.color,fill:s.webkitTextFillColor,display:s.display,width:r.width,height:r.height,backgroundColor:s.backgroundColor,backgroundImage:s.backgroundImage}; };
        const start=cs('#rs-action'),text=cs('.rs-state-txt');
        ui.openMenu();
        const row=cs('.rs-tgl-name');
        const ultra=document.createElement('span');ultra.className='pc-ultra-label';ultra.textContent='Ultra';document.querySelector('#rs-root').append(ultra);
        A.starting=true;ui.setStarting(true);
        return {start,text,row,stop:cs('#rs-stop'),host:cs('#host-row'),ultra:cs('.pc-ultra-label'),actionHidden:document.querySelector('#rs-action').hidden};
      });
      for (const key of ['start','text','row','stop']) {
        assert.notEqual(result[key].color, 'rgb(0, 0, 0)', key+' has readable text');
        assert.notEqual(result[key].fill, 'rgb(0, 0, 0)', key+' resists host text-fill');
        assert(result[key].width > 0 && result[key].height > 0, key+' is visible');
      }
      assert.notEqual(result.start.backgroundImage,'none','Start gradient survives captured host CSS');
      assert.notEqual(result.stop.color,'rgb(8, 17, 29)','Stop uses light text on its dark surface');
      assert(result.actionHidden, 'Start and Stop do not overlap');
      assert.equal(result.host.color, 'rgb(0, 0, 0)', 'host remains unmodified');
      assert.equal(result.ultra.fill, 'rgba(0, 0, 0, 0)', 'Ultra text gradient remains intact');
      assert.deepEqual(f.errors, []);
      console.log('PASS hostile host CSS: Start/Stop, status, settings rows readable; host/Ultra untouched');
    } finally { await f.page.close(); }
  } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode=1; });
