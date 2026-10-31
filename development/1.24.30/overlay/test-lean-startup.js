// Lean startup, phase 1: core/lean-startup.js (the short startup message, the on-demand help topics, topic routing and the
// once-per-chat tracker). The module is not wired into the running startup yet; this test proves it is correct on its own and
// that nothing from today's full prompt would be lost (every key phrase is either in the short core or in a help topic).
//   node test-lean-startup.js            (prints a before/after size table)
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');

const same = require('node:assert').deepEqual; // loose: the vm context makes its own Array / Object
const root = __dirname;
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// ── Load the real builders and the new module in one vm context, exactly like the page does (shared global scope) ──
const flags = {};
const windowStub = {
  __rsThinkingLevel: () => flags.level || 'default', __rsShowApproach: () => false, __rsBlender: () => !!flags.blender,
  __rsExtraThinking: () => false, __rsPlanMode: () => false, __rsForge: () => false, __rsMultiAgent: () => false,
  __rsAutoDebug: () => true, __rsWorkMode: () => '',
};
const context = vm.createContext({ window: windowStub, console });
for (const file of ['core/luau-knowledge.js', 'core/chat-creators.js', 'core/ultracode.js', 'core/clarification.js', 'core/config.js', 'core/lean-startup.js']) {
  vm.runInContext(read(file), context, { filename: file });
}
const RS = vm.runInContext('RS', context);
const CLARIFY = vm.runInContext('PlazCodeClarification', context);
const Lean = vm.runInContext('PlazCodeLeanStartup', context);
assert(Lean && typeof Lean.buildLeanCore === 'function', 'globalThis.PlazCodeLeanStartup is published');
assert.equal(Lean.SYS_MARKER, RS.SYS_MARKER, 'same marker as config.js');

const fullPrompt = RS.buildSystemPrompt({ siteName: 'this AI site', engine: 'roblox' });
const compactPrompt = RS.buildSystemPrompt({ siteName: 'this AI site', engine: 'roblox', maxChars: 1000 });
const localPrompt = RS.buildSystemPrompt({ siteName: 'this AI site', engine: 'local' });
const localAccessPrompt = RS.buildSystemPrompt({ siteName: 'this AI site', engine: 'local', fullAccess: true });
flags.blender = true;
const blenderPrompt = RS.buildSystemPrompt({ siteName: 'this AI site', engine: 'roblox' });
flags.blender = false;
assert(blenderPrompt.includes('BLENDER MCP IS CONNECTED') && !fullPrompt.includes('BLENDER MCP IS CONNECTED'));

// ── 1. The short core ──
const NO_URL = /https?:|www\.|\.com\b|\.org\b|\.io\b/i;
for (const engine of ['roblox', 'local']) {
  const core = Lean.buildLeanCore({ engine });
  assert(core.length <= Lean.CORE_MAX_CHARS && Lean.CORE_MAX_CHARS <= 4500, `${engine} core is ${core.length} chars (cap ${Lean.CORE_MAX_CHARS})`);
  assert(core.startsWith(RS.SYS_MARKER + '\n'), engine + ': the marker leads');
  assert.equal(core.indexOf(RS.SYS_MARKER), core.lastIndexOf(RS.SYS_MARKER), engine + ': one marker only');
  assert(!NO_URL.test(core), engine + ': no URLs in the core: ' + (core.match(NO_URL) || [])[0]);
  for (const needle of ['plazcode_help', '```json', '{"command": "name", "params"', 'list_commands', 'PlazCode is ready.', 'FORMATTING RULE (MANDATORY)', 'ONE command', 'plazcode_checklist', 'Goal:']) {
    assert(core.includes(needle), `${engine} core contains ${needle}`);
  }
  // The handshake is ONE line starting with IMPORTANT: Your very first action (core/main.js strips it from session reminders by that pattern).
  const handshake = core.match(/^IMPORTANT: Your very first action[^\r\n]*/m);
  assert(handshake, engine + ': handshake line present');
  assert(handshake[0].includes('`list_commands`') && handshake[0].includes('reply with exactly "PlazCode is ready."'), engine + ': handshake asks for list_commands then the exact ready reply');
  const reminder = core.replace(/^IMPORTANT: (?:Your very first action|after the list_commands result)[^\r\n]*/gm, 'The startup handshake has already completed for this conversation.');
  assert(!reminder.includes('Your very first action') && !reminder.includes('reply with exactly "PlazCode is ready."'), engine + ': session reminders can strip the handshake');
  assert.equal(Lean.buildLeanCore({ engine }), core, engine + ': deterministic');
  assert.equal(Lean.buildLeanCore({ engine, provider: 'claude', siteName: 'Claude' }).replace(/Claude's own features/, "this AI site's own features"), core, engine + ': only the site name changes between providers');
  assert(Lean.buildLeanCore({ engine, siteName: 'Claude' }).includes("Claude's own features"));
}
const robloxCore = Lean.buildLeanCore({ engine: 'roblox' }), localCore = Lean.buildLeanCore({ engine: 'local' });
assert(robloxCore.includes('execute_luau') && robloxCore.includes('###LUA###') && robloxCore.includes('###END_LUA###') && robloxCore.includes('###LUA:Server###'), 'Roblox core has the execute_luau marker format');
assert(robloxCore.includes('Roblox Studio') && !robloxCore.includes('AGENTSCRIPT'));
assert(localCore.includes('AGENTSCRIPT') && localCore.includes('edit_file') && localCore.includes('run_command'));
assert(!localCore.includes('###LUA###') && !localCore.includes('execute_luau') && !localCore.includes('Roblox Studio'), 'AgentScript core has no Roblox text');
assert.equal(Lean.buildLeanCore().length, robloxCore.length, 'default engine is Roblox');
assert.equal(Lean.buildLeanCore({ engine: 'unreal' }), robloxCore, 'legacy engine ids fold into Roblox');
assert.equal(Lean.buildLeanCore({ engine: 'anim' }), robloxCore);
assert(Lean.buildLeanCore({ engine: 'local', fullAccess: true }).includes('FULL PC ACCESS IS ON') && !localCore.includes('FULL PC ACCESS IS ON'));
assert(Lean.buildLeanCore({ engine: 'local', fullAccess: true }).length <= Lean.CORE_MAX_CHARS);
assert.equal(Lean.supports({ provider: 'notion' }), false, 'Notion keeps its own preference-style text');
assert.equal(Lean.supports({ provider: 'chatgpt' }), true);
// The core names the help tool and only topics that exist.
for (const engine of ['roblox', 'local']) {
  const core = Lean.buildLeanCore({ engine });
  const line = core.split('\n').find(l => l.startsWith('HELP ON DEMAND'));
  assert(line, engine + ': has the help line');
  const listed = (line.match(/Topics: (.*?)\. An unknown/) || [])[1];
  assert(listed, engine + ': help line lists topics');
  for (const item of listed.split(',').map(t => t.trim().replace(/ \(.*$/, '').replace(/ \(.*/, ''))) {
    const name = item.split(' ')[0];
    assert(Lean.listTopics(engine).some(t => t.name === name), `${engine}: help line names a real topic: ${name}`);
  }
}

// ── 2. Nothing from the full prompts is lost: every anchor is in the real prompt AND in the lean core or a topic ──
for (const phrase of Lean.ANCHORS.roblox) assert(fullPrompt.includes(phrase) || compactPrompt.includes(phrase) || blenderPrompt.includes(phrase) || CLARIFY.INSTRUCTION.includes(phrase), 'anchor is a real phrase of the current Roblox prompt: ' + phrase);
for (const phrase of Lean.ANCHORS.local) assert(localPrompt.includes(phrase) || localAccessPrompt.includes(phrase) || CLARIFY.INSTRUCTION.includes(phrase) || fullPrompt.includes(phrase), 'anchor is a real phrase of the current AgentScript prompt: ' + phrase);
assert(Lean.ANCHORS.roblox.length >= 50 && Lean.ANCHORS.local.length >= 15);
for (const phrase of ['NEVER HALLUCINATE a Studio', 'PLAY-MODE RULE', 'NEVER DELETE', 'PERFECT CREATION']) assert(Lean.ANCHORS.roblox.includes(phrase), 'required anchor listed: ' + phrase);
for (const engine of ['roblox', 'local']) {
  const cover = Lean.coverage({ engine });
  same(cover.missing, [], `${engine}: every anchor reachable, missing: ${cover.missing.join(' | ')}`);
  assert.equal(Object.keys(cover.where).length, cover.total);
  assert(Object.values(cover.where).every(Boolean));
}
const coverRoblox = Lean.coverage({ engine: 'roblox' }).where;
assert.equal(coverRoblox['PLAY-MODE RULE'], 'core', 'the safety rules stay in the core');
assert.equal(coverRoblox['NEVER HALLUCINATE a Studio'], 'core');
assert.equal(coverRoblox['NEVER DELETE'], 'core');
assert.equal(coverRoblox['PERFECT CREATION'], 'core');
assert.equal(coverRoblox['PROJECT MEMORY'], 'topic:memory');
assert.equal(coverRoblox['UNIVERSAL ROBLOX/LUAU ENGINEERING DOCTRINE'], 'topic:luau');
assert.equal(coverRoblox['ANIMATION TOOLS'], 'topic:animation');

// ── 3. Topics ──
const robloxTopics = Lean.listTopics('roblox').map(t => t.name), localTopics = Lean.listTopics('local').map(t => t.name);
for (const name of ['rules', 'play-mode', 'luau', 'studio-gui', 'animation', 'motion', 'studio-skills', 'web', 'screenshots', 'creators', 'blender', 'debug-agents', 'memory', 'checklist', 'scope', 'mcp', 'clarify', 'ultra']) assert(robloxTopics.includes(name), 'Roblox topic: ' + name);
for (const name of ['agentscript', 'full-access', 'memory', 'checklist', 'scope', 'mcp', 'clarify']) assert(localTopics.includes(name), 'AgentScript topic: ' + name);
assert(!localTopics.includes('luau') && !localTopics.includes('studio-gui') && !robloxTopics.includes('agentscript'));
same(Lean.listTopics().map(t => t.name), robloxTopics, 'default list is the Roblox one');
assert(Lean.listTopics('roblox').every(t => t.title && Array.isArray(t.aliases)));
const diagnosis = Lean.diagnose();
for (const [name, info] of Object.entries(diagnosis)) {
  assert(info.chars > 100, `topic ${name} has text (${info.chars})`);
  same(info.missing, [], `topic ${name} lacks required phrases: ${info.missing.join(' | ')}`);
  assert(info.chars < Lean.HELP_MAX_CHARS - 500, `topic ${name} fits one reply (${info.chars})`);
}
same(Object.keys(diagnosis).sort(), Array.from(new Set([...robloxTopics, ...localTopics])).sort());
assert.equal(Lean.TOPICS.luau, Lean.TOPICS.luau, 'topic text is stable');
assert(Lean.TOPICS['play-mode'].includes('PLAY-MODE RULE'));
for (const name of Object.keys(Lean.TOPICS)) assert.equal(typeof Lean.TOPICS[name], 'string');
assert(Lean.TOPICS.blender.includes('blender_send_to_studio') && !windowStub.__rsBlender() , 'asking for the Blender topic leaves the Blender hook as it was');
assert.equal(flags.blender, false);
assert.equal(Object.prototype.hasOwnProperty.call(windowStub, '__rsBlender'), true);

// Every paragraph of every topic is real text from the current builders (so nothing is duplicated or can drift).
const originals = [fullPrompt, compactPrompt, blenderPrompt, localPrompt, localAccessPrompt, CLARIFY.INSTRUCTION, vm.runInContext('PlazCodeUltracode.build("roblox","",0)', context)];
for (const name of Object.keys(Lean.TOPICS)) {
  const text = Lean.TOPICS[name];
  for (const chunk of text.split('\n\n').map(c => c.trim()).filter(Boolean)) {
    assert(originals.some(o => o.includes(chunk)), `topic ${name}: this paragraph is not in any real prompt: ${chunk.slice(0, 80)}`);
  }
}
// ...and it is pulled at call time: reword the prompt and the topic follows.
const reworded = { buildSystemPrompt: options => RS.buildSystemPrompt(options).replace('PLAY-MODE RULE', 'PLAY-MODE REWORDED'), TOOL_NOTES: RS.TOOL_NOTES, SYS_MARKER: RS.SYS_MARKER };
Lean.use({ RS: reworded });
assert(Lean.TOPICS['play-mode'].includes('PLAY-MODE REWORDED') && !Lean.TOPICS['play-mode'].includes('PLAY-MODE RULE'), 'topics follow the live prompt text');
assert(Lean.diagnose()['play-mode'].missing.includes('PLAY-MODE RULE'), 'diagnose notices a reworded section');
Lean.use({ RS: { buildSystemPrompt: () => 'nothing useful', TOOL_NOTES: {} } });
assert(Lean.coverage({ engine: 'roblox' }).missing.includes('MOTION/VFX RULES'), 'coverage reports a phrase that is nowhere');
assert(Lean.helpFor({ topic: 'luau' }).includes('could not be loaded') && Lean.helpFor({ topic: 'luau' }).includes('Topics for plazcode_help'), 'a topic that cannot load still answers with the list');
Lean.use({});
assert(Lean.TOPICS['play-mode'].includes('PLAY-MODE RULE'), 'back to the real prompt');

// ── 4. Aliases and help ──
const aliasCases = {
  ui: 'studio-gui', gui: 'studio-gui', UI: 'studio-gui', hud: 'studio-gui', animation: 'animation', anim: 'animation', Animation: 'animation', luau: 'luau', code: 'luau', coding: 'luau',
  memory: 'memory', blender: 'blender', ultra: 'ultra', 'play-mode': 'play-mode', 'Play Mode': 'play-mode', play_mode: 'play-mode', 'motion/vfx': 'motion', vfx: 'motion', motion: 'motion',
  checklist: 'checklist', scope: 'scope', mcp: 'mcp', creators: 'creators', skills: 'studio-skills', 'studio-skills': 'studio-skills', ' MEMORY ': 'memory',
};
for (const [alias, topic] of Object.entries(aliasCases)) assert.equal(Lean.resolveTopic(alias), topic, 'alias ' + alias);
assert.equal(Lean.resolveTopic('nope'), '');
assert.equal(Lean.resolveTopic(''), '');
assert.equal(Lean.resolveTopic(null), '');
const reply = (args) => { const text = Lean.helpFor(args); assert.equal(typeof text, 'string'); assert(text.length > 0 && text.length <= Lean.HELP_MAX_CHARS, 'reply size ' + text.length + ' for ' + JSON.stringify(args)); return text; };
for (const engine of ['roblox', 'local']) for (const t of Lean.listTopics(engine)) {
  const text = reply({ topic: t.name, engine });
  assert(text.includes(`topic "${t.name}"`), 'header names the topic');
  assert(text.includes(Lean.TOPICS[t.name].slice(0, 200)), 'help returns the topic text for ' + t.name);
  for (const alias of t.aliases) assert.equal(reply({ topic: alias, engine }), text, `${t.name}: alias ${alias} gives the same text`);
}
assert(reply({ topic: 'ui' }).includes('MODERN UI & HUD') && reply({ topic: 'gui' }).includes('ui_set_property'));
assert(reply({ topic: 'play-mode' }).includes('###LUA:Server###'));
assert(reply('luau').includes('NATIVE-FIRST ARCHITECTURE'), 'a plain string works as the topic');
// Unknown topic -> topic list, never a dead end.
const unknown = reply({ topic: 'banana' });
assert(unknown.includes('Unknown topic "banana"'));
for (const name of robloxTopics) assert(unknown.includes(`- ${name}:`), 'unknown-topic reply lists ' + name);
assert(unknown.includes('plazcode_help {command'));
assert(reply({ topic: 'play' }).includes('PLAY-MODE RULE') && reply({ topic: 'zzz-gui' }).includes('Unknown topic'));
assert(reply({ topic: 'studio' }).includes('STUDIO SKILLS'), 'studio is an alias');
for (const odd of [undefined, null, {}, [], 7, '', '   ', { topic: '' }, { topic: 42 }, { topic: {} }, { topic: 'x'.repeat(5000) }, { command: 'x'.repeat(5000) }, { command: {} }, { topic: '<script>alert(1)</script>' }]) {
  const text = reply(odd);
  assert(text.includes('Topics for plazcode_help') || text.includes('Unknown topic') || text.includes('No built-in reference'), 'odd input still gets a useful answer: ' + String(JSON.stringify(odd)).slice(0, 40));
}
assert(!reply({ topic: 'x'.repeat(5000) }).includes('x'.repeat(100)), 'long input is not echoed back');
assert(reply({ topic: 'luau', engine: 'local' }).includes('not this mode') && reply({ topic: 'luau', engine: 'local' }).includes('- agentscript:'), 'a Roblox-only topic in AgentScript mode points at the right list');
assert(reply({ topic: 'agentscript' }).includes('not this mode') && reply({ topic: 'agentscript', engine: 'local' }).includes('DIFF-FIRST EDITING'));
assert(reply({ topic: 'full-access', engine: 'local' }).includes('process_kill'));
assert(reply({ topic: 'memory', engine: 'local' }).includes('PLAZCODE_MEMORY.md'));
// Command help.
const animCommand = reply({ command: 'animation_set_pose' });
assert(animCommand.includes('animation_set_pose') && animCommand.includes('list_commands') && animCommand.includes('topic "animation"'));
assert(reply({ command: 'execute_luau' }).includes('print()'), 'curated tool notes are included');
assert(reply({ command: 'multi_edit' }).includes('old_string'));
assert(reply({ command: 'ui_set_color' }).includes('ui_set_color'));
assert(reply({ command: '`web_search`' }).includes('web_search'));
assert(reply({ command: 'animation_made_up_name' }).includes('belongs to topic "animation"'), 'an unknown command with a known prefix points at its topic');
assert(reply({ command: 'list_roblox_studios' }).includes('DO NOT EXIST'), 'the made-up studio tools are explained as not existing');
const noCommand = reply({ command: 'totally_made_up_command' });
assert(noCommand.includes('No built-in reference') && noCommand.includes('never invent one'));
assert(noCommand.includes('Topics for plazcode_help'), 'unknown command -> topic list');
assert(reply({ command: 'read_file', engine: 'local' }).includes('read_file'));
assert(reply({ topic: 'play-mode', command: 'start_stop_play' }).includes('start_stop_play'));
assert.equal(reply({ topic: 'play-mode', command: 'start_stop_play' }).split('PlazCode help - topic').length, 2, 'topic and command together give one topic block');
assert.equal(reply({}), Lean.topicListText('roblox'), 'no arguments -> the topic list');
assert.equal(reply({ engine: 'local' }), Lean.topicListText('local'));
assert.equal(reply({ topic: 'luau' }), reply({ topic: 'luau' }), 'help is deterministic');
// The biggest possible reply stays inside the cap: Ultra is the largest topic.
const biggest = Math.max(...Object.values(diagnosis).map(d => d.chars));
assert(biggest < Lean.HELP_MAX_CHARS - 100, 'largest topic ' + biggest);
const capped = (() => { Lean.use({ RS: { buildSystemPrompt: o => RS.buildSystemPrompt(o).replace('TASK CHECKLIST: ', 'TASK CHECKLIST: ' + 'x'.repeat(40000) + ' '), TOOL_NOTES: RS.TOOL_NOTES } }); try { return Lean.helpFor({ topic: 'checklist' }); } finally { Lean.use({}); } })();
assert(capped.length <= Lean.HELP_MAX_CHARS && capped.includes('[Shortened'), 'an oversized topic is shortened, never longer than the cap');

// ── 5. Routing ──
const routes = (text, options) => Lean.routeTopics(text, options);
assert(routes('Make me a shop UI with a coin counter').includes('studio-gui'));
assert(routes('fix the HUD health bar').includes('studio-gui'));
assert(routes('Animate the sword swing with keyframes').includes('animation'));
assert(routes('change the idle animation id to 12345').includes('motion'));
assert(routes('add a fire particle effect on hit').includes('motion'));
assert(routes('why does my script error when I playtest').includes('play-mode') && routes('why does my script error when I playtest').includes('luau'));
assert(routes('make the lighting look like sunset and add terrain').includes('studio-skills'));
assert(routes('create a model of a medieval castle').includes('creators'));
assert(routes('import this from Blender').includes('blender'));
assert(routes('look at this screenshot').includes('screenshots'));
assert(routes('search the web for TweenService docs').includes('web'));
assert(routes('sell a developer product for robux').includes('developer-products'));
assert(routes('update the project memory').includes('memory'));
assert(routes('show me the checklist').includes('checklist'));
assert(routes('run the debugger and read the output panel').includes('debug-agents'));
for (const chatter of ['hi', 'Hello!', 'thanks', 'thank you so much', 'what can you do?', 'ok', '', '   ', null, undefined]) same(routes(chatter), [], 'no topic for: ' + chatter);
same(routes('Make a UI and animate it and add particles and fix the script', { max: 2 }).length, 2);
same(routes('Make a UI', { max: 0 }), []);
assert(!routes('Make a shop UI', { exclude: ['ui'] }).includes('studio-gui'), 'exclude accepts aliases');
same(routes('Make a shop UI and animate it'), routes('Make a shop UI and animate it'), 'deterministic');
const noLocalInRoblox = routes('fix the failing npm tests in this repo, read the files');
assert(!noLocalInRoblox.includes('agentscript') && !noLocalInRoblox.includes('full-access'));
assert(routes('fix the failing npm tests in this repo', { engine: 'local' }).includes('agentscript'));
assert(routes('delete C:\\Users\\me\\old and kill the process', { engine: 'local' }).includes('full-access'));
assert(!routes('Make a shop UI with particles', { engine: 'local' }).includes('studio-gui'), 'Roblox topics are never routed in AgentScript mode');
for (const engine of ['roblox', 'local']) for (const name of routes('ui animation vfx script lighting model blender screenshot web debug memory checklist files git full pc access play mode developer product', { engine, max: 99 })) {
  assert(Lean.listTopics(engine).some(t => t.name === name), `${engine}: routed topic exists: ${name}`);
}
for (const route of Lean.ROUTES) assert(route.engines.every(e => ['roblox', 'local'].includes(e)) && Lean.resolveTopic(route.name) === route.name, 'route target is a topic: ' + route.name);

// ── 6. Once per chat ──
const tracker = Lean.createTracker();
same(tracker.delivered('chat-a'), []);
const first = Lean.pushFor('Build a shop UI with a coin counter', tracker, 'chat-a');
assert(first.topics.includes('studio-gui') && first.text.includes('MODERN UI & HUD') && first.text.includes('[PlazCode reference for this request - topic "studio-gui"]'));
assert(tracker.has('chat-a', 'studio-gui') && tracker.has('chat-a', 'ui') && !tracker.has('chat-b', 'ui'));
const second = Lean.pushFor('Now make the UI bigger', tracker, 'chat-a');
same(second.topics, []);
assert.equal(second.text, '', 'a topic already pushed into this chat is not pushed again');
const other = Lean.pushFor('Build a shop UI', tracker, 'chat-b');
assert(other.topics.includes('studio-gui'), 'another chat gets it once too');
const mixed = Lean.pushFor('Make the UI animate with keyframes', tracker, 'chat-a');
assert(!mixed.topics.includes('studio-gui') && mixed.topics.includes('animation'), 'only the topics not delivered yet are pushed');
tracker.reset('chat-a');
assert(Lean.pushFor('Build a shop UI', tracker, 'chat-a').topics.includes('studio-gui'), 'reset (new chat) allows the push again');
same(tracker.fresh('chat-z', ['ui', 'gui', 'animation', 'nope']), ['studio-gui', 'animation']);
tracker.mark('chat-z', ['animation', 'bogus']);
same(tracker.delivered('chat-z'), ['animation']);
tracker.reset();
assert.equal(tracker.size(), 0);
const small = Lean.createTracker(2);
for (const id of ['1', '2', '3']) small.mark(id, 'ui');
assert.equal(small.size(), 2, 'the tracker forgets the oldest chats');
const budgeted = Lean.pushFor('script with a UI and animation and lighting', Lean.createTracker(), 'x', { budget: 12000, max: 4 });
assert(budgeted.text.length <= 12000 + 12000, 'budget stops further topics');
assert(budgeted.topics.length >= 1);
same(Lean.pushFor('hello', Lean.createTracker(), 'x'), { topics: [], text: '' });
assert(Lean.pushFor('Make a UI').topics.includes('studio-gui'), 'works without a tracker');
assert(Lean.pushFor('fix the failing tests', Lean.createTracker(), 'l', { engine: 'local' }).text.includes('DIFF-FIRST EDITING'));

// ── 7. Load mode: require() (UMD) gives the same module; the file touches no page or network ──
const required = require('./core/lean-startup.js');
delete globalThis.PlazCodeLeanStartup;
assert.equal(typeof required.buildLeanCore, 'function');
assert.equal(required.buildLeanCore({ engine: 'roblox' }), robloxCore);
assert.equal(required.helpFor({ topic: 'luau' }).includes('could not be loaded'), true, 'without the builders a topic degrades to the list, it does not throw');
required.use({ RS, Clarification: CLARIFY, window: windowStub });
assert.equal(required.helpFor({ topic: 'play-mode' }), Lean.helpFor({ topic: 'play-mode' }), 'require() with use() gives the same help');
same(required.coverage({ engine: 'roblox' }).missing, []);
const source = read('core/lean-startup.js');
assert(!/\b(?:fetch\(|XMLHttpRequest|WebSocket|chrome\.|document\.|localStorage|sessionStorage|indexedDB|eval\(|new Function)/.test(source.replace(/\/\/.*$/gm, '')), 'no page, storage or network access');
assert(source.startsWith('// SPDX-License-Identifier: GPL-3.0-or-later'));

// ── 8. If a content-script list loads it, it must come after config.js ──
for (const entry of JSON.parse(read('manifest.json')).content_scripts || []) {
  const scripts = entry.js || [], at = scripts.indexOf('core/lean-startup.js');
  if (at >= 0) assert(at > scripts.indexOf('core/config.js') && scripts.indexOf('core/config.js') >= 0, 'lean-startup.js loads after config.js');
}

// ── Before / after ──
const withClarify = text => text + CLARIFY.INSTRUCTION;
const rows = [
  ['Roblox, full', withClarify(fullPrompt), robloxCore],
  ['Roblox, compact (14,000 sites)', withClarify(RS.buildSystemPrompt({ siteName: 'this AI site', engine: 'roblox', maxChars: 14000 })), robloxCore],
  ['AgentScript (local)', withClarify(localPrompt), localCore],
];
const lines = rows.map(([name, before, after]) => `${name.padEnd(32)} ${String(before.length).padStart(6)} -> ${String(after.length).padStart(5)} chars  (saves ${String(before.length - after.length).padStart(6)}, ${Math.round(100 - 100 * after.length / before.length)}% smaller)`);
assert(robloxCore.length < 0.12 * rows[0][1].length, 'the Roblox lean core is under 12% of the full startup');
assert(robloxCore.length < 0.4 * rows[1][1].length);
assert(localCore.length < 0.4 * rows[2][1].length);
console.log(lines.join('\n'));
console.log(`Lean startup passed: Roblox core ${robloxCore.length} chars, AgentScript core ${localCore.length}, ${Lean.listTopics('roblox').length} Roblox topics, ${Lean.listTopics('local').length} AgentScript topics, ${Lean.ANCHORS.roblox.length + Lean.ANCHORS.local.length} anchors all reachable.`);
