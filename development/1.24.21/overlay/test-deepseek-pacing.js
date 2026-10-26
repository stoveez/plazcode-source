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
  assert(/Math\.max\(normalizeCooldown\([^)]*rsCommandCooldown : 0\), normalizeCooldown\(P\.minSecondsBetweenSends\)\)/.test(main));
  // The notice is shown once per site.
  assert(/if \(P\.startNotice\) \{\s*const noticeKey = "rsNoticeSeen:" \+ P\.id;/.test(main) && /chrome\.storage\.local\.set\(\{ \[noticeKey\]: true \}\)/.test(main));
  console.log('DeepSeek: at least 5 seconds between automatic messages, and a one-time notice about account suspensions.');
})().catch((e) => { console.error(e); process.exit(1); });
