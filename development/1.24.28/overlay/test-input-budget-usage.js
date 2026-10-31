// 1.24.24 (owner, 2026-10-26): on Claude, "This message exceeds your 12000 character input limit" appeared
// even for normal prompts, and people reported higher plan usage since 1.24.22.
// 1. PlazCode's own extras (changed vault summary, one-time task reference, notes) were added to a command
//    result with no budget, so a normal result plus extras broke the user's input limit. They now fit the
//    limit: shortened, or held for the next result. The real assembly code from core/main.js runs here.
// 2. Usage: the short startup lists every parameter (no lookup round trip per new command), Ultra mode no
//    longer re-sends the 25,000-character Ultra pack with every request, and templates are capped at 8,000.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const main = fs.readFileSync('core/main.js', 'utf8');
const slice = (from, to, includeTo) => { const a = main.indexOf(from), b = main.indexOf(to, a); assert(a > 0 && b > a, 'found ' + from.slice(0, 40)); return main.slice(a, includeTo ? b + to.length : b); };
const helpers = slice('  function inputBudget() {', '  function resultPageSize() {');
const assembly = slice("          // 1.24.24: everything PlazCode adds to a result fits the user's input limit (see fitExtra).", '          toSend += quickNote;', true);

function run({ limit = 12000, enabled = true, feedback, memory = '', lastMemory = '', reference = '', calls = [{ tool: 'script_read', params: {} }], failed = 0, kind = 'task' }) {
  const ctx = vm.createContext({ String, Math, Infinity, RegExp });
  ctx.characterLimits = { rsInputLimitEnabled: enabled, rsInputCharLimit: limit };
  ctx.compressed = 0;
  vm.runInContext(helpers + `
    var lastMemoryContext = ${JSON.stringify(lastMemory)};
    function personalMemoryContext() { return ${JSON.stringify(memory)}; }
    function compressToolFeedback(text) { compressed++; const page = inputBudget() - 600; return '[PlazCode retained the COMPLETE result. first page]\\n' + String(text).slice(0, page); }
    var A = { pendingReference: ${JSON.stringify(reference)}, requestKind: ${JSON.stringify(kind)} };
    var feedback = ${JSON.stringify(feedback)}, failedToolAttempts = ${failed}, calls = ${JSON.stringify(calls)};
    var out = (function () { ${assembly}\n return toSend + failNote; })();`, ctx);
  return { sent: ctx.out, pending: ctx.A.pendingReference, last: ctx.lastMemoryContext, compressed: ctx.compressed };
}
const R = (n, c = 'r') => c.repeat(n);

// The screenshot case: 12,000 limit, a normal 9,000-character result, a changed 3,000-character vault summary
// and a 20,000-character one-time reference (skills + templates). Before: about 32,000 characters -> error.
let r = run({ feedback: R(9000, 'f'), memory: 'VAULT' + R(3000, 'v'), reference: R(20000, 'x') });
assert(r.sent.length <= 12000, 'fits the 12,000 limit: ' + r.sent.length);
assert(r.sent.startsWith(R(9000, 'f')), 'the command result itself is never cut');
assert(/shortened this reference to fit your input limit/.test(r.sent), 'the reference is shortened, and says so');
assert.equal(r.last, '', 'the vault summary that did not fit waits for a later message');
// Little room left: the reference waits for the next result instead.
r = run({ feedback: R(11300, 'f'), reference: R(5000, 'x') });
assert(r.sent.length <= 12000 && !r.sent.includes('One-time task reference') && r.pending.length === 5000, 'no room -> held for the next result');
// Default limit (120,000): everything rides in full, as before.
r = run({ limit: 120000, feedback: R(9000, 'f'), memory: 'VAULT' + R(3000, 'v'), reference: R(20000, 'x') });
assert(r.sent.includes('VAULT') && r.sent.includes(R(20000, 'x')) && r.pending === '' && r.last.startsWith('VAULT'));
// Limit switched off: no budget at all.
r = run({ enabled: false, feedback: R(50000, 'f'), reference: R(30000, 'x') });
assert(r.sent.includes(R(30000, 'x')) && r.compressed === 0);
// The AI's own vault write is not echoed back to it (that was a full vault summary after every job).
r = run({ limit: 120000, feedback: 'Output of plazcode_vault: written', memory: 'VAULT NEW', lastMemory: 'VAULT OLD', calls: [{ tool: 'plazcode_vault', params: { action: 'write' } }] });
assert(!r.sent.includes('VAULT NEW') && r.last === 'VAULT NEW', 'own vault write: not echoed, marked as known');
// A result that is already too big with its status/debug lines is paged, so it still fits.
r = run({ feedback: R(13000, 'f'), failed: 3 });
assert(r.compressed === 1 && r.sent.length <= 12000 && /commands in a row failed/.test(r.sent));

// Usage: Ultra pack once per chat (Full startup) and not at all with the short startup.
assert(/1\.24\.24 usage fix: this attached the whole Ultra pack/.test(main) && /!\(typeof leanStartupOn==="function"&&leanStartupOn\(\)\)\)\{/.test(main) && /if\(ultraText&&A\.ultraTaskSent!==key\)/.test(main), 'Ultra pack is not re-sent with every request');
assert(/PlazCodeTemplates\.reference\(matches\.matches,P\.sysMaxChars \? Math\.max\(1800,P\.sysMaxChars-800\) : 8000\)/.test(main), 'templates capped at 8,000 per request');
assert(/These are the commands with their parameters \(\? = optional\)\. Call them directly\./.test(main), 'no lookup round trip per new command');
const lean = fs.readFileSync('core/lean-startup.js', 'utf8');
assert(!/before an area you have no rules for/.test(lean) && /the rules above cover normal work/.test(lean), 'the startup no longer pushes help lookups');
assert(/PlazCodeUltracode\.build\(engine, opts\.providerId, 4000\)/.test(fs.readFileSync('core/config.js', 'utf8')), 'Ultra compact guide in the short startup');
console.log('Input limit and usage: PlazCode extras always fit the limit (shortened or held), the AI calls commands directly, Ultra is not re-sent per request.');
