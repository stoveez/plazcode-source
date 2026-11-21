// Lean startup, phase 0: MEASURE the startup message PlazCode sends today. Read-only: it only loads the
// real prompt builders (core/config.js plus the helpers it reads) in a node vm, builds the prompt for a matrix of
// engines / size limits / toggles, prints how big every section is, and pins a SHA-256 of every complete output.
//
// Why the pins: the lean startup work must be switchable. With lean OFF the text has to stay byte-for-byte what it
// is today. If you change the wording on purpose, run:   node test-startup-sections.js --update-golden
// and paste the printed table over GOLDEN below. If this test fails and you did NOT mean to change the startup
// text, you changed what every AI receives.
//
//   node test-startup-sections.js --table     prints the per-section size table.
//   PLAZCODE_STARTUP_REPORT=file.json         also writes the numbers as JSON.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto'), assert = require('node:assert/strict');

const root = __dirname;
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// ── Load the real builders exactly like the other prompt tests (shared vm context, window stub with the mode hooks) ──
const flags = {};
const windowStub = {
  __rsThinkingLevel: () => flags.level || 'default',
  __rsShowApproach: () => !!flags.approach,
  __rsBlender: () => !!flags.blender,
  __rsExtraThinking: () => !!flags.extra,
  __rsPlanMode: () => !!flags.plan,
  __rsForge: () => !!flags.forge,
  __rsMultiAgent: () => !!flags.multi,
  __rsAutoDebug: () => flags.debug !== false,
  __rsWorkMode: () => flags.work || '',
};
const context = vm.createContext({ window: windowStub, console });
for (const file of ['core/luau-knowledge.js', 'core/chat-creators.js', 'core/ultracode.js', 'core/clarification.js', 'core/feature-guide.js', 'core/config.js']) {
  vm.runInContext(read(file), context, { filename: file });
}
const RS = vm.runInContext('RS', context);
const CLARIFY = vm.runInContext('PlazCodeClarification', context);
assert.equal(typeof RS.buildSystemPrompt, 'function');
assert.equal(typeof CLARIFY.INSTRUCTION, 'string');

// ── The matrix. "startup" is what core/main.js sends: buildSystemPrompt() + the clarification text (memory is per user). ──
const MODES = { extra: true, plan: true, multi: true, forge: true, blender: true, level: 'max', work: 'thorough', approach: true };
const CUSTOM = { siteName: 'Claude', customPrompt: 'Always answer in French.', providerNotes: 'Site rule: keep replies short.' };
const CASES = [
  ['roblox-full', { engine: 'roblox' }, {}],
  ['roblox-compact-14000', { engine: 'roblox', maxChars: 14000 }, {}],
  ['roblox-full-all-modes', { engine: 'roblox' }, MODES],
  ['roblox-compact-all-modes', { engine: 'roblox', maxChars: 14000 }, MODES],
  ['roblox-full-ultra', { engine: 'roblox' }, { level: 'ultracode' }],
  ['roblox-compact-ultra', { engine: 'roblox', maxChars: 14000 }, { level: 'ultracode' }],
  ['roblox-full-custom-site', { engine: 'roblox', ...CUSTOM }, {}],
  ['local-full', { engine: 'local' }, {}],
  ['local-compact-14000', { engine: 'local', maxChars: 14000 }, {}],
  ['local-full-access', { engine: 'local', fullAccess: true }, {}],
  ['local-custom-site', { engine: 'local', ...CUSTOM }, {}],
  ['notion-roblox', { engine: 'roblox', providerId: 'notion' }, {}],
  ['notion-local', { engine: 'local', providerId: 'notion' }, {}],
];

// ── Section maps: an ordered list of [name, text the section starts with]. Sections tile the output exactly. ──
const COMMON_TAIL = [
  ['mode-thinking-level', '━━━ THINKING LEVEL'], ['mode-extra-thinking', '━━━ EXTRA THINKING MODE'], ['mode-plan', '━━━ PLAN MODE'],
  ['mode-auto-debugger', '━━━ AUTOMATIC DEBUGGER'], ['mode-multi-agent', '━━━ MULTI-AGENT'], ['mode-forge-gui', '━━━ FORGE GUI MODE'],
  ['mode-blender', '━━━ BLENDER MCP IS CONNECTED'], ['mode-work', '━━━ WORK MODE'], ['mode-autofix-note', '(Auto-fix is watching'],
  ['site-rules', '━━━ ADDITIONAL RULES FOR THIS SITE'], ['custom-prompt', "━━━ USER'S CUSTOM PROMPT"],
  ['request-scope', 'REQUEST SCOPE:'], ['feature-help', 'FEATURE HELP:'], ['mcp-policy', 'CONTEXTUAL MCP USE:'], ['chat-creators', 'CHAT MODEL/UI CREATION:'],
  ['ultra', 'ULTRA —'], ['approach-summary', 'VISIBLE APPROACH SUMMARY'], ['approach-off', 'SHOW_APPROACH=OFF'],
  ['task-checklist', 'TASK CHECKLIST:'], ['clarification', '\nBEFORE ACTING:'],
];
const ROBLOX_FULL = [
  ['marker', '⟦RS-SYS⟧'], ['context', 'CONTEXT:'], ['format-fence-rule', '⚠️ FORMATTING RULE'], ['format-json', '━━━ STANDARD COMMAND FORMAT'],
  ['format-luau', '━━━ SPECIAL FORMAT FOR execute_luau'], ['luau-doctrine', '━━━ UNIVERSAL ROBLOX/LUAU ENGINEERING DOCTRINE'],
  ['motion-vfx', 'PlazCode MOTION/VFX RULES:'], ['rules-general', '- AT MOST TWO (2) COMMANDS PER REPLY'], ['rule-execute-luau', '- execute_luau: wrap code in BOTH markers'],
  ['rule-play-mode', '- PLAY-MODE RULE'], ['rules-build-delete-errors', '- BUILD UI/OBJECTS FIRST'], ['project-memory', ' ━━━ PROJECT MEMORY'],
  ['act-directly', '━━━ YOU CAN ACT DIRECTLY IN THE USER'], ['studio-skills', 'STUDIO SKILLS & VIRTUAL TOOLS'], ['skills-web', '- WEB: `web_search`'],
  ['skills-screenshots', '- SCREENSHOT: `plazcode_screenshot`'], ['skills-plugins-analysis', '- STUDIO PLUGINS:'], ['skills-gui-mutation', '- GUI MUTATION'],
  ['skills-asset-bridge', '- ASSET BRIDGE:'], ['animation-tools', 'ANIMATION TOOLS:'], ['handshake', 'IMPORTANT: Your very first action'], ...COMMON_TAIL,
];
const ROBLOX_COMPACT = [
  ['marker', '⟦RS-SYS⟧'], ['context', 'CONTEXT:'], ['format', 'FORMATTING (MANDATORY)'], ['rules', 'RULES:\n'], ['rule-handshake', '- Your FIRST action'],
  ['rule-hallucinate-ids', '- NEVER HALLUCINATE'], ['rule-understand-perfect-delete', '- Done = one short'], ['project-memory', 'PROJECT MEMORY:'],
  ['skills-index', 'SKILLS (full params'], ['animation', 'ANIMATION:'], ['offline-site', 'If list_commands comes back Studio-offline'], ...COMMON_TAIL,
];
const LOCAL = [
  ['marker', '⟦RS-SYS⟧'], ['context', 'CONTEXT:'], ['local-capabilities', 'AGENTSCRIPT gives you FULL control'], ['format-fence-rule', '⚠️ FORMATTING RULE'],
  ['format-json', 'COMMAND FORMAT'], ['auto-action', '━━━ AUTO-ACTION PROTOCOL'], ['error-recovery', '━━━ SILENT ERROR RECOVERY'], ['diff-first', '━━━ DIFF-FIRST EDITING'],
  ['state-line', '━━━ STATE LINE'], ['rules', '\nRULES:'], ['full-pc-access', '━━━ FULL PC ACCESS IS ON'], ['act-directly', 'YOU CAN ACT DIRECTLY ON'],
  ['handshake', 'IMPORTANT: Your very first action'], ...COMMON_TAIL,
];
const NOTION = [
  ['preferences', 'PlazCode project connection'], ...COMMON_TAIL,
];

function sectionMap(name, text) {
  if (name.startsWith('notion')) return NOTION;
  if (name.startsWith('local')) return LOCAL;
  // The compact roblox prompt is the one that has "SKILLS (full params come from list_commands".
  return text.includes('SKILLS (full params come from list_commands') ? ROBLOX_COMPACT : ROBLOX_FULL;
}

function split(text, map) {
  const found = [];
  for (const [name, needle] of map) {
    const at = text.indexOf(needle);
    if (at < 0) continue;
    if (name !== 'marker' && text.indexOf(needle, at + 1) >= 0 && !['mode-autofix-note'].includes(name)) {
      // A needle that appears twice would make the split ambiguous; keep the first and tell the maintainer.
      split.warnings.push(`${name}: start text appears more than once`);
    }
    found.push({ name, at });
  }
  found.sort((a, b) => a.at - b.at);
  if (!found.length || found[0].at !== 0) found.unshift({ name: 'preamble', at: 0 });
  return found.map((f, i) => ({ name: f.name, start: f.at, chars: (i + 1 < found.length ? found[i + 1].at : text.length) - f.at }));
}
split.warnings = [];

const UPDATE = process.argv.includes('--update-golden');

// ── Build everything ──
const results = {};
for (const [name, options, modes] of CASES) {
  for (const key of Object.keys(flags)) delete flags[key];
  Object.assign(flags, modes);
  const base = RS.buildSystemPrompt({ siteName: 'this AI site', ...options });
  const startup = base + CLARIFY.INSTRUCTION; // exactly what systemPrompt() in core/main.js returns, minus the per-user memory text
  const again = RS.buildSystemPrompt({ siteName: 'this AI site', ...options }) + CLARIFY.INSTRUCTION;
  assert.equal(again, startup, name + ': the startup text must be deterministic');
  // Notion gets a plain "user preferences" text without the marker (core/main.js adds what that site needs).
  if (!name.startsWith('notion')) assert(startup.startsWith(RS.SYS_MARKER), name + ': the marker leads the message');
  const sections = split(startup, sectionMap(name, startup));
  assert.equal(sections.reduce((sum, s) => sum + s.chars, 0), startup.length, name + ': sections tile the whole text');
  results[name] = {
    chars: startup.length,
    sha256: crypto.createHash('sha256').update(startup, 'utf8').digest('hex'),
    sections: Object.fromEntries(sections.map(s => [s.name, s.chars])),
  };
}
for (const key of Object.keys(flags)) delete flags[key];

// ── Facts that must hold today (they describe the baseline lean startup is measured against) ──
const r = results;
assert(r['roblox-full'].chars > 35000, 'full Roblox startup is the big one (' + r['roblox-full'].chars + ')');
assert(r['roblox-compact-14000'].chars < 14000, 'a 14,000 limit picks the compact text');
assert(r['roblox-compact-14000'].chars < r['roblox-full'].chars);
assert.equal(r['local-compact-14000'].sha256, r['local-full'].sha256, 'AgentScript has no compact variant: the size limit changes nothing');
for (const name of ['luau-doctrine', 'motion-vfx', 'project-memory', 'studio-skills', 'animation-tools', 'handshake', 'request-scope', 'mcp-policy', 'chat-creators', 'task-checklist', 'clarification']) {
  assert(r['roblox-full'].sections[name] > 0, 'roblox-full has a measured section: ' + name);
}
for (const name of ['context', 'format', 'rules', 'skills-index', 'animation', 'request-scope', 'task-checklist']) {
  assert(r['roblox-compact-14000'].sections[name] > 0, 'roblox-compact has a measured section: ' + name);
}
for (const name of ['local-capabilities', 'auto-action', 'error-recovery', 'diff-first', 'state-line', 'handshake']) {
  assert(r['local-full'].sections[name] > 0, 'local-full has a measured section: ' + name);
}
assert(r['local-full-access'].sections['full-pc-access'] > 0 && !r['local-full'].sections['full-pc-access'], 'FULL PC ACCESS text only appears when it is on');
assert(r['roblox-full-all-modes'].chars > r['roblox-full'].chars + 4000, 'the Blender, thinking and plan modes add real text');
assert(r['roblox-full-ultra'].sections.ultra > 1000, 'Ultra adds its own always-on block');
assert.deepEqual(split.warnings, [], 'section start texts are unique: ' + split.warnings.join('; '));

// ── Print the table ──
function table() {
  const lines = [];
  for (const [name, entry] of Object.entries(results)) {
    lines.push(`${name.padEnd(28)} ${String(entry.chars).padStart(6)} chars  (~${Math.round(entry.chars / 4)} tokens)`);
    for (const [section, chars] of Object.entries(entry.sections)) lines.push(`    ${section.padEnd(30)} ${String(chars).padStart(6)}`);
  }
  return lines.join('\n');
}
if (process.env.PLAZCODE_STARTUP_REPORT) fs.writeFileSync(process.env.PLAZCODE_STARTUP_REPORT, JSON.stringify(results, null, 1));
if (process.argv.includes('--table') || UPDATE) console.log(table());

// ── Golden pins (lean OFF must reproduce these exactly) ──
const GOLDEN = {
  'roblox-full': { chars: 44162, sha256: 'a8c2683ba611d3987476b8f95b40dcaca9d10462b57cd88d15072a70569a81ef' },
  'roblox-compact-14000': { chars: 13682, sha256: '02eb47f030a14fd7f1b9f4428ae7dfc4f57c4e54eba2ac7f941d8bb05078db76' },
  'roblox-full-all-modes': { chars: 52283, sha256: '244d640705049957cf307c4cba70780312a486b0337eb379723a93a6ddce8423' },
  'roblox-compact-all-modes': { chars: 21803, sha256: '9d495054063aa15013d101edf40cf37072c3582426208e1be546c4518030ede9' },
  'roblox-full-ultra': { chars: 69276, sha256: '4424a3273e0e010f98767c308ce3c82e693479e57012bd0eb878e10ef0d828f9' },
  'roblox-compact-ultra': { chars: 15843, sha256: 'd99f25276a200df663d8cd012adbdf8eddd4ecf597879c8b5ee34f44853a7835' },
  'roblox-full-custom-site': { chars: 44317, sha256: '6c3a5990ffaf5f993452e1695204da3e9a2a6c508f6efe2b90998315adc460b1' },
  'local-full': { chars: 10698, sha256: '2c279843078feaa22a4ac4fdfa1ad28fa58cbb10ef6bfd4bbf845e2011e07565' },
  'local-compact-14000': { chars: 10698, sha256: '2c279843078feaa22a4ac4fdfa1ad28fa58cbb10ef6bfd4bbf845e2011e07565' },
  'local-full-access': { chars: 12201, sha256: 'ff1a2bc493b8a40338f14397f57f12d5669a4e869f94472de44ab98fff204c94' },
  'local-custom-site': { chars: 10820, sha256: 'c3abb50175005b143b657b3b62574149f2fae6e42846a8c393395532a5a6fa70' },
  'notion-roblox': { chars: 7384, sha256: '2abc52548df5b3f57a73b987ecb6b4bb8020aba1e3861dcfc1b8604a56abe679' },
  'notion-local': { chars: 5881, sha256: '35c2c9b1227dc9a43d09842ef94f248de918adccf785432f766818f3f35498b0' },
};
if (UPDATE) {
  console.log('\nconst GOLDEN = {');
  for (const [name, entry] of Object.entries(results)) console.log(`  '${name}': { chars: ${entry.chars}, sha256: '${entry.sha256}' },`);
  console.log('};');
  process.exit(0);
}
for (const [name, entry] of Object.entries(results)) {
  const pin = GOLDEN[name];
  assert(pin, name + ': no golden pin yet. Run with --update-golden and paste the table into GOLDEN.');
  assert.equal(entry.chars, pin.chars, name + ': the startup text changed size (was ' + pin.chars + ', now ' + entry.chars + '). If intended, update GOLDEN.');
  assert.equal(entry.sha256, pin.sha256, name + ': the startup text changed. If intended, update GOLDEN (node test-startup-sections.js --update-golden).');
}
assert.deepEqual(Object.keys(GOLDEN).sort(), Object.keys(results).sort(), 'every golden pin has a case and every case a pin');
console.log(`Startup sections measured for ${Object.keys(results).length} cases; full Roblox ${r['roblox-full'].chars} chars, compact ${r['roblox-compact-14000'].chars}, AgentScript ${r['local-full'].chars}; golden pins match.`);
