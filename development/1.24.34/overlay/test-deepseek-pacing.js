// 1.24.22 (owner, 2026-10-25): some DeepSeek users were suspended. On DeepSeek PlazCode waits at least 5 seconds between
// the messages it sends by itself, and tells the user once that DeepSeek may still act on automated use.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const main = fs.readFileSync('core/main.js', 'utf8'), ds = fs.readFileSync('providers/deepseek.js', 'utf8');
assert(/minSecondsBetweenSends: 5,/.test(ds) && /startNotice: \{/.test(ds), 'DeepSeek asks for a 5 second pause and a notice');
// waitCommandCooldown runs for real: the site minimum applies, a longer user setting wins, user prompts never wait.
const a = main.indexOf('  let _lastCommandSendAt = 0;'), b = main.indexOf('  function jitterBeforeSend()', a);
let now = 1000000; const waits = [];
const env = { P: { minSecondsBetweenSends: 5 }, reliabilitySettings: { rsCommandCooldown: 0 }, diag: () => {}, Date: { now: () => now }, Number, Math,
  sleep: async (ms) => { waits.push(ms); now += ms; } };
vm.createContext(env); vm.runInContext(main.slice(a, b) + ';this.wait=waitCommandCooldown;', env);
(async () => {
  await env.wait(false); now += 1000; waits.length = 0;
  await env.wait(false); assert.equal(waits.reduce((x, y) => x + y, 0), 4000, 'waited the rest of the 5 seconds');
  env.reliabilitySettings.rsCommandCooldown = 8; now += 1000; waits.length = 0;
  await env.wait(false); assert.equal(waits.reduce((x, y) => x + y, 0), 7000, 'the longer user setting wins');
  waits.length = 0; await env.wait(true); assert.equal(waits.length, 0, 'a message the user typed is never held back');
  env.P = {}; env.reliabilitySettings.rsCommandCooldown = 0; now += 100; waits.length = 0;
  vm.runInContext('P = this.P', env);
  // Other sites: no pause unless the user set one.
  assert(/Math\.max\(normalizeCooldown\([^)]*rsCommandCooldown : 0\), normalizeCooldown\(typeof P !== \"undefined\" && P \? P\.minSecondsBetweenSends : 0\)\)/.test(main));
  // The notice is shown once per site.
  assert(/if \(P\.startNotice\) \{\s*const noticeKey = "rsNoticeSeen:" \+ P\.id;/.test(main) && /chrome\.storage\.local\.set\(\{ \[noticeKey\]: true \}\)/.test(main));
  console.log('DeepSeek: at least 5 seconds between automatic messages, and a one-time notice about account suspensions.');
})().catch((e) => { console.error(e); process.exit(1); });

// The provider-level guard covers direct UI sends as well as the core sender.
const guard=ds.slice(ds.indexOf('  const MIN_SEND_GAP_MS'),ds.indexOf('  async function typeAndSendRaw('));
function paced(raw,random=()=>0){
 let clock=0;const waits=[],events=[];
 const scope={Promise,Math:{max:Math.max,min:Math.min,floor:Math.floor,round:Math.round,random},Date:{now:()=>clock},
  sleep:async ms=>{waits.push(ms);clock+=ms;},diag:(name,data)=>events.push({name,...data}),
  typeAndSendRaw:(...args)=>raw({now:()=>clock,advance:ms=>clock+=ms},...args)};
 vm.createContext(scope);vm.runInContext(guard+';this.send=typeAndSend;',scope);
 return {send:scope.send,waits,events,advance:ms=>clock+=ms};
}
(async()=>{
 const starts=[],images=[{data:'image'}],opts={origin:'creator'};let release;
 const blocker=new Promise(resolve=>release=resolve);
 const q=paced(async(clock,text,media,options)=>{starts.push({at:clock.now(),text,media,options});if(text==='creator'){await blocker;clock.advance(12000);}return text;},()=>0.5);
 const first=q.send('creator',images,opts),second=q.send('library',images,opts);
 await new Promise(setImmediate);assert.equal(starts.length,1,'concurrent UI sends never overlap');assert.equal(starts[0].at,0,'first send has no wait');
 release();assert.equal(await first,'creator');assert.equal(await second,'library');
 assert.equal(starts[1].at,20900,'pause starts after the slow first send finishes');assert.equal(starts[1].media,images,'images pass through unchanged');
 assert.equal(q.waits.reduce((a,b)=>a+b,0),8900);assert(q.waits.every(ms=>ms<=250),'poll in short sleep slices');assert.equal(starts[1].options,opts,'forward optional arguments');assert.equal(q.events[0].name,'send.pace');assert.equal(q.events[0].ms,8900);
 const waitCount=q.waits.length;q.advance(9800);await q.send('long reply');assert.equal(q.waits.length,waitCount,'replies outlasting the full cooldown add no delay');
 const before=q.waits.reduce((a,b)=>a+b,0);q.advance(1000);await q.send('fast reply');assert.equal(q.waits.reduce((a,b)=>a+b,0)-before,7900,'wait only the remaining interval plus jitter');const jitterBefore=q.waits.reduce((a,b)=>a+b,0);q.advance(8100);await q.send('within jitter');assert.equal(q.waits.reduce((a,b)=>a+b,0)-jitterBefore,800,'include remaining jitter even after eight seconds');
 let attempt=0;const errors=paced(async()=>{if(++attempt===1)throw Error('send failed');return 'recovered';});
 const failed=errors.send('one'),recovered=errors.send('two');await assert.rejects(failed,/send failed/);assert.equal(await recovered,'recovered');assert.equal(errors.waits.reduce((a,b)=>a+b,0),8000,'failures are paced and do not poison queued sends');
 for(const [random,expected] of [[()=>0,8000],[()=>0.999999,9799.9982]]){const edge=paced(async()=>{},random);await edge.send('first');await edge.send('second');assert(Math.abs(edge.waits.reduce((a,b)=>a+b,0)-expected)<0.001);}
 assert.equal((ds.match(/function typeAndSend\(/g)||[]).length,1);assert.equal((ds.match(/function typeAndSendRaw\(/g)||[]).length,1);
 assert(/setInputLock, writeDraft, typeAndSend, stopGeneration/.test(ds),'provider export uses the paced wrapper');
 console.log('PASS DeepSeek shared send queue: first send immediate, completion-based interval, jitter, long replies, direct calls and failure recovery.');
})().catch(error=>{console.error(error);process.exitCode=1;});
