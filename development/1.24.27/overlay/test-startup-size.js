// 1.24.22 (owner, 2026-10-25): the startup must fit free plans. Claude and ClickUp free plans used up their limit on the
// startup alone and ChatGPT free refused it as too long. Every site now gets the short startup (core/lean-startup.js)
// unless the user turns on "Full startup" (off by default); the AI fetches the rest with plazcode_help when it needs it.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const read = (f) => fs.readFileSync(f, 'utf8');
const flags = {};
const windowStub = {
  __rsThinkingLevel: () => flags.level || 'default', __rsShowApproach: () => !!flags.approach, __rsBlender: () => !!flags.all,
  __rsExtraThinking: () => !!flags.all, __rsPlanMode: () => !!flags.all, __rsForge: () => !!flags.all, __rsMultiAgent: () => !!flags.all,
  __rsAutoDebug: () => true, __rsWorkMode: () => (flags.all ? 'thorough' : ''),
};
const ctx = vm.createContext({ window: windowStub, console });
for (const f of ['core/luau-knowledge.js', 'core/chat-creators.js', 'core/ultracode.js', 'core/feature-guide.js', 'core/clarification.js', 'core/config.js', 'core/lean-startup.js']) vm.runInContext(read(f), ctx, { filename: f });
const RS = vm.runInContext('RS', ctx), Lean = vm.runInContext('PlazCodeLeanStartup', ctx);
const notes = 'x'.repeat(1000); // site notes are about 1,000 characters (Claude 958, ChatGPT 757)
const LIMIT = 7000;              // startup message budget that fits ChatGPT free (and leaves room for the handshake line)
for (const engine of ['roblox', 'local']) {
  const full = RS.buildSystemPrompt({ siteName: 'Claude', engine, providerNotes: notes });
  const lean = RS.buildSystemPrompt({ siteName: 'Claude', engine, providerNotes: notes, leanStartup: true });
  assert(lean.startsWith(RS.SYS_MARKER), 'the short startup still starts with the marker');
  assert(lean.length < LIMIT, `${engine}: short startup is ${lean.length} characters`);
  assert(full.length > lean.length * 1.5, 'the full startup is still there for the switch');
  assert(lean.includes('plazcode_help'), 'the short startup points to plazcode_help');
  assert(lean.includes(notes), 'site notes are kept');
  assert(lean.includes('plazcode_features'), 'feature help stays');
  console.log(`${engine}: full ${full.length} -> short ${lean.length} characters`);
}
// Every switched-on mode is kept, and the startup still fits.
flags.all = true; flags.level = 'max'; flags.approach = true;
const busy = RS.buildSystemPrompt({ siteName: 'ChatGPT', engine: 'roblox', providerNotes: notes, customPrompt: 'Use tabs.', leanStartup: true });
for (const mark of ['PLAN MODE', 'EXTRA THINKING', 'MULTI-AGENT', 'FORGE GUI', 'THINKING LEVEL: MAX', "USER'S CUSTOM PROMPT", 'Use tabs.']) assert(busy.includes(mark), 'mode kept: ' + mark);
assert(busy.length < 12000, 'with every mode on the startup is ' + busy.length);
flags.all = false; flags.approach = false; flags.level = 'ultracode';
const ultra = RS.buildSystemPrompt({ siteName: 'ChatGPT', engine: 'roblox', leanStartup: true });
// 1.24.24: Ultra's compact guide (about 2,200 characters) rides in the startup instead of a forced 25,000-character lookup.
assert(ultra.includes('ULTRA MODE IS ON') && ultra.length < 8000, 'Ultra is the compact guide, not the whole pack: ' + ultra.length);
assert(!/before your first task, call plazcode_help/.test(ultra), 'no forced Ultra lookup before the first task');
flags.level = 'default';
// Notion keeps its own short preferences.
assert(!RS.buildSystemPrompt({ siteName: 'Notion', providerId: 'notion', engine: 'roblox', leanStartup: true }).includes('HELP ON DEMAND'));
// plazcode_help answers from the real full prompt.
assert(/PlazCode help - topic "luau"/.test(Lean.helpFor({ topic: 'luau', engine: 'roblox' })));

// main.js wiring.
const main = read('core/main.js');
assert(/leanStartup: \(typeof leanStartupOn === \"function\" && leanStartupOn\(\)\),/.test(main), 'systemPrompt asks for the short startup');
assert(/function leanStartupOn\(\) \{ return reliabilitySettings\.rsFullStartup !== true/.test(main), 'Full startup is off by default');
assert(/rsFullStartup:false,/.test(main) && /id="rs-full-startup"/.test(main), 'the Full startup switch exists, off by default');
assert(/if \(name === "plazcode_help"\) \{[\s\S]{0,300}PlazCodeLeanStartup\.helpFor\(/.test(main), 'plazcode_help runs');
assert(/tools\.push\(\{name:'plazcode_help'/.test(main), 'plazcode_help is in the command list');
assert(/vaultContext\(\(typeof leanStartupOn === \"function\" && leanStartupOn\(\)\) \? 'lean'/.test(main), 'the vault summary is the smallest one at startup');
assert(/let digest = offline \? toolFeedback : leanOn \? leanDigest\(0\) \+ addonsNote : fullDigest\(\);/.test(main) && /const leanOn = typeof leanStartupOn === \"function\" && leanStartupOn\(\);/.test(main), 'the short startup uses the compact command list');
// 1.24.24: richest list that still fits the site in ONE message (ClickUp would split it otherwise).
assert(/for \(const level of \[1, 2\]\) \{ if \(fitsOne\(readyPrompt\)\) break; digest = leanDigest\(level\) \+ addonsNote; readyPrompt = readyFor\(digest\);/.test(main), 'falls back to required-only, then names-only');
// The lean digest for a big Studio command list stays small.
const start = main.indexOf('const leanDigest = (level = 0) => {'), end = main.indexOf('\n      };', start) + 8;
const scoped = Array.from({ length: 160 }, (_, i) => ({ name: 'studio_command_' + i, inputSchema: { properties: { path: {}, value: {} }, required: ['path'] } }));
const leanDigest = vm.runInNewContext(main.slice(start, end).replace('const leanDigest = ', '(') + ')', { scoped });
const digestText = leanDigest();
const required = leanDigest(1), names = leanDigest(2);
assert(required.includes('studio_command_0{path}') && !required.includes('value?') && names.split('\n')[0].includes('studio_command_0,') && !names.split('\n')[0].includes('{'), 'required-only and names-only levels');
assert(names.length < required.length && required.length < digestText.length);
assert(digestText.length < 8000, 'startup command list for 160 commands is ' + digestText.length + ' characters');
// 1.24.24: every parameter is listed (? = optional) so the AI calls commands directly, without a lookup round trip each.
assert(digestText.includes('studio_command_0{path,value?}') && /Call them directly/.test(digestText) && !/Before using a command for the first time/.test(digestText));
// list_commands {command} returns one command's full parameters.
assert(/const oneCommand=String\(\(args&&\(args\.command\|\|args\.name\|\|args\.tool\)\)/.test(main));
// The manifest loads the module on every AI site.
const manifest = JSON.parse(read('manifest.json'));
for (const cs of manifest.content_scripts) if (cs.js.includes('core/main.js')) assert(cs.js.indexOf('core/lean-startup.js') > cs.js.indexOf('core/config.js') && cs.js.indexOf('core/lean-startup.js') < cs.js.indexOf('core/main.js'));
// The memory/vault summary has a smallest size with no brain map.
assert(/const lean = compact === 'lean';/.test(read('core/memory.js')) && /const mapText = lean \? '' :/.test(read('core/memory.js')));
console.log('Startup size: every site gets the short startup (under ' + LIMIT + ' characters), the command list is names only, Full startup is an off-by-default switch.');
