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
  ['motion-vfx', 'PlazCode MOTION/VFX RULES:'], ['rules-general', '- ONE command block per reply'], ['rule-execute-luau', '- execute_luau: wrap code in BOTH markers'],
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
  /*GOLDEN-START*/
  'roblox-full': { chars: 43788, sha256: '71ce88b968816f6c99fb88bd946c34aef77d53d1db5a266c678da1f6b60fa201' },
  'roblox-compact-14000': { chars: 12401, sha256: '39968c0a0637500051539312b3aa0a24c6d859acc30d8c4f762600613f8d8ed3' },
  'roblox-full-all-modes': { chars: 51829, sha256: '65cc360313ef7b520aab9c59bf4733c2ddbd8a7aa2e9f311fabc00515e9a031d' },
  'roblox-compact-all-modes': { chars: 20442, sha256: 'fe961416de88eaaed0160c97ec24aed0bf00e416440eaa096243b094b349d1e1' },
  'roblox-full-ultra': { chars: 68902, sha256: '91a756514c82b4d7857355d561077afeae866b2c6cb5fc9c6dfbb45c030e9166' },
  'roblox-compact-ultra': { chars: 14562, sha256: '8c8074eb1dcbcab9a5beeaec34ef9a97fe6c5d43c612eea3dd66da76538c1f98' },
  'roblox-full-custom-site': { chars: 43943, sha256: '300d0e6f738a3855f3ffa9e1ffb27f7b835abb1c0798f64d176279c6153fe4c2' },
  'local-full': { chars: 10007, sha256: '247726b69c57ae7b620e6314e6d6e5dfd62054eed84b73fff21d37b0656fcd09' },
  'local-compact-14000': { chars: 10007, sha256: '247726b69c57ae7b620e6314e6d6e5dfd62054eed84b73fff21d37b0656fcd09' },
  'local-full-access': { chars: 10975, sha256: '53597096939b9f04848d645054eb0a0daed485fd5369ce8acbf8d58855cb92ef' },
  'local-custom-site': { chars: 10129, sha256: '551cc752922838703bf9438a88e5b6048cb91ae9fdc14f23d600c3eef2140a90' },
  'notion-roblox': { chars: 7063, sha256: '723381745599a7e3c349fc703a407b41971c88bf1ac0fb0bbd0cfeabe32f3af9' },
  'notion-local': { chars: 5560, sha256: '1bbcc64400bba5dceec0e6c7dbd291af7902093dae612d659f95c9966cda3376' },
  /*GOLDEN-END*/
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
