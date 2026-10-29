// Ultra = the UltraLab pack. Checks the pack files, the routing, the always-on text, the ultralab_read
// and roblox_docs tools, the safety rules and the licences. Run from the PlazCode source root.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = process.cwd();
const core = (p) => path.join(root, 'core', p);
const read = (p) => fs.readFileSync(p, 'utf8');
const BINARY = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.zip', '.exe', '.dll', '.woff', '.woff2', '.ttf', '.otf', '.webp']);

// ---------- 1. the pack on disk ----------
const packRoot = core('ultralab');
const files = [];
(function walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, e.name); if (e.isDirectory()) walk(full); else files.push(full); } })(packRoot);
const rel = (f) => path.relative(packRoot, f).split(path.sep).join('/');
const onDisk = new Map(files.map((f) => [rel(f), f]));
const index = JSON.parse(read(core('ultralab/INDEX.json')));
const indexed = new Map(index.map((e) => [e.path, e]));
assert.equal(indexed.size, index.length, 'INDEX.json lists every path once');
for (const [p, e] of indexed) {
  assert(onDisk.has(p), 'INDEX.json lists a file that is not there: ' + p);
  assert.equal(fs.statSync(onDisk.get(p)).size, e.bytes, 'size in INDEX.json: ' + p);
  assert.equal(e.kind, BINARY.has(path.extname(p).toLowerCase()) ? 'binary' : e.kind, 'kind of ' + p);
  if (e.kind === 'text') assert(!fs.readFileSync(onDisk.get(p)).subarray(0, 4096).includes(0), 'a text file has binary bytes: ' + p);
}
for (const p of onDisk.keys()) if (p !== 'INDEX.json') assert(indexed.has(p), 'file missing from INDEX.json: ' + p);
for (const p of onDisk.keys()) {
  assert(!/(^|\/)__pycache__\//.test(p) && !/\.pyc$/.test(p) && path.basename(p) !== '.py' && !/\.DS_Store$|Thumbs\.db$/.test(p), 'junk file in the pack: ' + p);
  assert(!/(^|\/)LOCAL\.md$/.test(p), 'a personal LOCAL.md must never ship: ' + p);
}
assert(index.length > 700 && index.length < 1200, 'pack size sanity: ' + index.length);

const pack = JSON.parse(read(core('ultralab-pack.json')));
const skillDirs = fs.readdirSync(core('ultralab/skills'), { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(core('ultralab/skills/' + d.name + '/SKILL.md'))).map((d) => d.name).sort();
assert.deepEqual(Object.keys(pack.skills).sort(), skillDirs, 'the pack json has every skill folder, and only those');
assert.equal(skillDirs.length, 53);
const agentFiles = fs.readdirSync(core('ultralab/agents')).filter((f) => f.endsWith('.md')).sort();
assert.deepEqual(Object.keys(pack.agents).map((n) => n.replace(/^agent:/, '') + '.md').sort(), agentFiles, 'the pack json has every agent file');
assert.equal(agentFiles.length, 7);

function frontmatter(text) { const m = /^---\s*\n([\s\S]*?)\n---/.exec(text); return m ? m[1] : ''; }
for (const name of skillDirs) {
  const text = read(core('ultralab/skills/' + name + '/SKILL.md'));
  assert.equal(pack.skills[name].text, text.trim(), name + ': pack text matches the file');
  const fm = frontmatter(text);
  const nm = /^name:\s*(.+)$/m.exec(fm), ds = /^description:\s*(.+)$/m.exec(fm);
  assert(nm && ds, name + ': needs name and description in its header');
  assert.equal(nm[1].trim().replace(/^["']|["']$/g, ''), name, name + ': header name matches the folder');
  assert(ds[1].trim().length > 20, name + ': description is too short to route by');
  assert(text.length > 200, name + ': skill text is nearly empty');
  for (const script of pack.skills[name].scripts) assert(indexed.has('skills/' + name + '/' + script), name + ': listed script is missing: ' + script);
  // every backticked file path a skill mentions must exist in the pack
  for (const m of new Set([...text.matchAll(/`((?:scripts|references|examples|agents|skills)\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+)`/g)].map((x) => x[1]))) {
    const candidates = m.startsWith('skills/') ? [m] : ['skills/' + name + '/' + m, m, 'references/' + m];
    assert(candidates.some((c) => indexed.has(c)), name + ' mentions a file that is not in the pack: ' + m);
  }
}
for (const f of agentFiles) assert.equal(pack.agents['agent:' + f.replace(/\.md$/, '')], read(core('ultralab/agents/' + f)).trim(), f + ': agent text matches');
assert.equal(Object.keys(pack.vault).length, 18);
for (const [name, text] of Object.entries(pack.vault)) assert.equal(text, read(core('ultralab/vault/' + name)).trim(), 'vault note ' + name);

// nothing in the pack may carry secrets or hidden instructions aimed at the AI
const textFiles = [...indexed.values()].filter((e) => e.kind === 'text' && !/\.svg$/.test(e.path)).map((e) => e.path);
for (const p of textFiles) {
  const text = read(onDisk.get(p));
  assert(!/(?:ghp_|github_pat_|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|hf_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY)/.test(text), 'secret-looking text in ' + p);
  assert(!/ignore (?:all |any )?(?:previous|prior|above) instructions|do not tell the user|without telling the user|disregard (?:the )?(?:system|user)/i.test(text), 'hidden-instruction text in ' + p);
}

// ---------- 2. licences and credit ----------
for (const f of ['LICENSE-SyphoDev.txt', 'ONLINE-SOURCES.md', 'PLAZCODE-NOTES.md', 'README.md', 'skills/ul-ui-builder/references/fonts/OFL.txt', 'skills/ROQER-ADOPTION.md']) assert(indexed.has(f), 'missing notice file ' + f);
assert(/SyphoDev/.test(read(core('ultralab/LICENSE-SyphoDev.txt'))) && /may not sell/i.test(read(core('ultralab/LICENSE-SyphoDev.txt'))));
assert(/youtube\.com\/@SyphoDev/.test(read(core('ultralab/PLAZCODE-NOTES.md'))), 'credit link to SyphoDev');
for (const font of [...indexed.keys()].filter((p) => /\.ttf$/i.test(p))) assert(indexed.has(font.replace(/[^/]+$/, 'OFL.txt')), 'a font ships without its OFL licence: ' + font);
assert(/SIL OPEN FONT LICENSE/i.test(read(core('ultralab/skills/ul-ui-builder/references/fonts/OFL.txt'))));
for (const bad of ['PlazCode-Extension/ultra', 'PlazCode-Extension/ultragui', 'core/ultracode-deepseek.js', 'agent/src/ultra-index.json', 'agent/src/ultragui-index.json'])
  assert(!fs.existsSync(path.join(root, bad)), 'the old Ultra must be gone: ' + bad);
assert(!/unofficial|ULTRALAB-FORK|UltraLab fork/i.test(read(core('ultracode.js'))), 'no fork wording in the module');
assert(!fs.existsSync(path.join(root, 'ULTRALAB-FORK.md')));

// ---------- 3. the module, run against the real files ----------
function load({ fail = false, failFirst = 0 } = {}) {
  let clock = 1_000_000, calls = 0;
  const ctx = {
    console, setTimeout, clearTimeout, Promise,
    chrome: { runtime: { getURL: (p) => 'ext://' + p } },
    fetch: async (url) => {
      calls++;
      if (fail || calls <= failFirst) return { ok: false, status: 503, json: async () => { throw new Error('503'); }, text: async () => '' };
      const p = decodeURIComponent(url.replace(/^ext:\/\//, ''));
      const file = path.join(root, p);
      if (!file.startsWith(path.join(root, 'core') + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return { ok: false, status: 404, json: async () => { throw new Error('404'); }, text: async () => '' };
      const raw = fs.readFileSync(file);
      return { ok: true, status: 200, json: async () => JSON.parse(raw.toString('utf8')), text: async () => raw.toString('utf8') };
    },
    Date: class extends Date { static now() { return clock; } },
  };
  const vmctx = vm.createContext(ctx);
  vm.runInContext(read(core('ultracode.js')) + '\n;globalThis.U = PlazCodeUltracode;', vmctx);
  return { U: vmctx.U, tick: (ms) => { clock += ms; }, fetchCalls: () => calls };
}
const { U, tick } = load();
const J = (s) => JSON.parse(s);

// always-on text
const full = U.build('roblox', 'claude', 0), small = U.build('roblox', 'deepseek', 0), compact = U.build('roblox', 'clickup', 14000), other = U.build('local', 'claude', 0);
for (const [label, text] of [['full', full], ['deepseek', small], ['compact', compact], ['other engine', other]]) {
  assert(text.startsWith('ULTRA \u2014'), label + ': starts with the Ultra marker');
  assert(text.includes('THINK=ultracode') && /another level is selected|ignore/i.test(text), label + ': says it stops applying when Ultra is not selected');
}
assert(!other.includes('ultralab_read') && /Roblox Studio methods do not apply/.test(other) && other.length < 1200, 'other engines get only the short working method');
assert(compact.length < 3000, 'compact text fits small sites: ' + compact.length);
assert(compact.includes('ultralab_read') && compact.includes('roblox_docs') && compact.includes('UI-1 to UI-13'));
assert(small.length < full.length && small.length < 30000);
assert(full.length < 40000, 'always-on text stays bounded: ' + full.length);
for (const text of [full, small]) {
  assert(text.includes('one command per reply') && /startup handshake/.test(text), 'PlazCode protocol rules present');
  assert(text.includes('ultralab_read') && text.includes('roblox_docs'));
  assert(/TEXTURE_ENABLED stays false/.test(text) && text.includes('rbxassetid://385956923'), 'the Check-UI texture stays off');
  assert(/Always ask the user before you run upload_icons\.py/.test(text), 'upload and paid scripts need approval');
  assert(/CHECK SUITE GATE/.test(text) && /CODE-1 to CODE-18/.test(text), 'the Check Suite gate is in the prompt');
}
assert(/Hard rules against hallucinated code/.test(full) && /Working steps/.test(full), 'the full UltraLab prompt is included');
for (const name of skillDirs) assert(full.includes('- skill ' + name + ':'), 'index line for ' + name);
for (const f of agentFiles) assert(full.includes('- agent ' + f.replace(/\.md$/, '') + ':'), 'index line for agent ' + f);
assert(!/- agent /.test(small), 'the short prompt lists skills only');
const compactList = U.build('roblox', 'x', 9000);
for (const name of skillDirs) assert(compactList.includes(name), 'compact list names ' + name);

// routing (plurals, word stems, no accidental big skills)
const route = (q) => Array.from(U.routedNames(q));
assert.deepEqual(route('hello, how are you'), ['ul-check-suite']);
assert.deepEqual(Array.from(U.touched('hello')), []);
assert(route('write the scripts for the shop').includes('ul-luau-code'), 'plural: scripts');
assert(route('Add monetization').includes('roblox-monetization'), 'stem: monetization');
assert(route('please translate the menus').includes('roblox-localization') && route('please translate the menus').includes('ul-ui-builder'), 'stem: translate + plural menus');
assert(route('build a lobby map').includes('ul-map-builder') && !route('build a lobby map').includes('ul-game-pipeline'), 'a map does not pull the whole-game pipeline');
assert(route('make me a game about pets').includes('ul-game-pipeline'));
assert(route('fix the lag').includes('luau-performance') && route('profiling the fps').includes('luau-profiling'));
assert(route('my remotes can be exploited').includes('review-for-exploits'));
assert(route('animate the walk cycle').includes('agent:ul-agent-animation'));
assert(route('a gamepad menu').includes('roblox-input') && route('a gamepad menu').includes('gui-verify'));
assert(route('npcs that pathfinding to the player').includes('roblox-npc-ai'));
assert(route('rojo and selene setup').includes('roblox-tooling'));
assert(route('use parallel luau actors').includes('parallel-luau'));
assert(!route('the cable guy').includes('ul-ui-builder'), 'no match inside other words');
assert.equal(new Set(route('shop gui with scripts and a map')).size, route('shop gui with scripts and a map').length, 'no duplicates');
const everyRouted = new Set();
for (const q of ['code', 'remote', 'mesh', 'gui', 'vfx', 'animation', 'sound', 'map', 'full game', 'texture', 'datastore', 'input', 'physics', 'monetization', 'localization', 'rojo', 'lag', 'parallel']) for (const n of route(q)) everyRouted.add(n);
for (const n of everyRouted) assert(n.startsWith('agent:') ? pack.agents[n] : pack.skills[n], 'a route points at a missing skill: ' + n);

(async () => {
  // request text
  const gui = await U.taskAsync('roblox', 'Build me a shop GUI with scripts', { provider: 'claude', maxChars: 0 });
  assert(gui.startsWith('ULTRA TASK METHODS'), 'task text header');
  for (const n of ['ul-check-suite', 'ul-ui-builder', 'check-ui-rules', 'ul-luau-code']) assert(gui.includes('ULTRA SKILL ' + n + ':'), 'routed skill text: ' + n);
  assert(gui.includes('ULTRA VAULT') && gui.includes('status: unverified'), 'vault notes carry their status');
  assert(gui.length < 150000 + 40000, 'task text stays near the budget: ' + gui.length);
  const smallTask = await U.taskAsync('roblox', 'Build a map, a mesh, a shop gui and animation', { provider: 'deepseek', maxChars: 0 });
  assert(smallTask.length < 40000 + 20000, 'small provider budget: ' + smallTask.length);
  assert(/NOT INCLUDED/.test(smallTask) && smallTask.length < gui.length + 200000);
  const cappedTask = await U.taskAsync('roblox', 'Build a map, a mesh, a shop gui and animation', { provider: 'notion', maxChars: 8000 });
  assert(cappedTask.length < 60000, 'sites with a small prompt budget get the small task text: ' + cappedTask.length);
  const huge = await U.taskAsync('roblox', 'make me a game with a map, mesh, shop gui, animation, vfx, sound, texture, scripts and datastore', { provider: 'claude', maxChars: 0 });
  assert(/NOT INCLUDED/.test(huge) && huge.length < 150000 + 40000, 'a huge request is cut at the budget: ' + huge.length);
  assert.equal(await U.taskAsync('roblox', 'hi there', {}), 'ULTRA: this request names no Roblox build area, so no skill text is added. Use the index above, or ultralab_read, if a skill is needed.');
  assert.equal(await U.taskAsync('local', 'build a map', {}), other, 'other engines get the short text');
  assert.equal(await U.taskAsync('blender', 'build a map', {}), other);

  // loading failures are reported and retried later
  const bad = load({ fail: true });
  assert(/ULTRA PACK NOT LOADED/.test(await bad.U.taskAsync('roblox', 'make a gui', {})));
  assert.equal(bad.U.status(), 'failed');
  const calls = bad.fetchCalls();
  await bad.U.taskAsync('roblox', 'make a gui', {});
  assert.equal(bad.fetchCalls(), calls, 'no retry storm inside five seconds');
  bad.tick(6000);
  await bad.U.taskAsync('roblox', 'make a gui', {});
  assert(bad.fetchCalls() > calls, 'retries after a pause');
  const flaky = load({ failFirst: 1 });
  assert(/NOT LOADED/.test(await flaky.U.taskAsync('roblox', 'make a gui', {})));
  flaky.tick(6000);
  assert(/ULTRA SKILL ul-ui-builder/.test(await flaky.U.taskAsync('roblox', 'make a gui', {})), 'recovers after a transient failure');
  const dead = load({ fail: true });
  assert.equal(J(await dead.U.runTool({ action: 'list' })).ok, false, 'tool reports a missing index');

  // ultralab_read
  const list = J(await U.runTool({ action: 'list', prefix: 'skills/ul-check-suite/' }));
  assert(list.ok && list.count >= 4 && list.files.every((f) => f.path.startsWith('skills/ul-check-suite/')));
  const all = J(await U.runTool({ action: 'list' }));
  assert(all.ok && all.count === index.length && all.files.length === index.length && all.truncated === false, 'the full listing returns every file');
  const page1 = J(await U.runTool({ action: 'read', path: 'skills/ul-check-suite/SKILL.md', limit: 100 }));
  assert(page1.ok && page1.text.length === 100 && page1.more === true && page1.next_offset === 100 && page1.total_chars === read(core('ultralab/skills/ul-check-suite/SKILL.md')).length);
  const page2 = J(await U.runTool({ action: 'read', path: 'skills/ul-check-suite/SKILL.md', offset: page1.next_offset, limit: 100 }));
  assert.equal(page1.text + page2.text, read(core('ultralab/skills/ul-check-suite/SKILL.md')).slice(0, 200));
  const whole = J(await U.runTool({ action: 'read', path: 'skills/ul-check-suite/SKILL.md' }));
  assert(whole.ok && whole.text.length <= 40000);
  const last = J(await U.runTool({ action: 'read', path: 'GUIDE.md', offset: 999999 }));
  assert(last.ok && last.text === '' && last.more === false && last.next_offset === null);
  const sized = J(await U.runTool({ action: 'read', path: 'GUIDE.md', limit: 9999999, offset: -5 }));
  assert(sized.ok && sized.offset === 0, 'limits are clamped');
  const png = [...indexed.values()].find((e) => e.kind === 'binary' && /\.png$/.test(e.path));
  const refused = J(await U.runTool({ action: 'read', path: png.path }));
  assert(!refused.ok && /binary/.test(refused.error));
  for (const bad of ['../manifest.json', 'skills/../../manifest.json', '/etc/passwd', 'skills/nope.md', '', 'skills', 'C:\\Windows\\win.ini', 'skills/ul-check-suite/../ul-3d-model/SKILL.md'])
    assert.equal(J(await U.runTool({ action: 'read', path: bad })).ok, false, 'rejected path: ' + bad);
  const hit = J(await U.runTool({ action: 'search', query: 'rbxassetid://385956923' }));
  assert(hit.ok && hit.hits.length >= 1 && hit.hits.every((h) => /^[^:]+:\d+: /.test(h)));
  const scoped = J(await U.runTool({ action: 'search', query: 'selectiongroup', prefix: 'vault/' }));
  assert(scoped.ok && scoped.hits.length >= 1 && scoped.hits.every((h) => h.startsWith('vault/')));
  const many = J(await U.runTool({ action: 'search', query: 'the' }));
  assert(many.ok && many.hits.length === 80, 'search is capped at 80 hits');
  assert(many.hits.every((h) => !/\.svg:/.test(h)), 'art files are skipped unless asked for by prefix');
  assert.equal(J(await U.runTool({ action: 'search' })).ok, false);
  assert.equal(J(await U.runTool({ action: 'delete' })).ok, false);
  assert.equal(J(await U.runTool({})).ok, false);
  assert.equal(J(await U.runTool(null)).ok, false);
  const skill = await U.readSkill('ul-check-suite');
  assert(skill && skill.body.includes('UI-1') && (await U.readSkill('ul-agent-map')).body.length > 100 && (await U.readSkill('missing')) === null);

  // ---------- 4. wiring in the app ----------
  const main = read(core('main.js'));
  assert(/name:'ultralab_read'/.test(main) && /name:'roblox_docs'/.test(main), 'both tools are listed');
  assert(/window\.__rsThinkingLevel\?\.\(\) === 'ultracode' && activeEngine\(\) === 'roblox' && typeof PlazCodeUltracode !== 'undefined' && PlazCodeUltracode\.runTool/.test(main), 'tools are listed only for Ultra on Roblox');
  assert(/ultralab_read\|sequentialthinking/.test(main), 'reading the pack is not counted as project work');
  assert(/maxChars:P\.sysMaxChars\|\|0/.test(main) && /opts\.maxChars \|\| 0/.test(read(core('config.js'))), 'the site prompt budget reaches Ultra');
  assert(!/Built-in Ultra methods activate only/.test(main) && /ultralab_read tool/.test(main));
  const start = main.indexOf('    if (name === "ultralab_read") {'), stop = main.indexOf('    if (name === "plazcode_skills") {');
  assert(start > 0 && stop > start);
  const block = main.slice(start, stop);
  const runBlock = new Function('name', 'args', 'bg', 'window', 'PlazCodeUltracode', 'URL', 'return (async()=>{' + block + '; return "unhandled"; })()');
  const ultra = { __rsThinkingLevel: () => 'ultracode' }, normal = { __rsThinkingLevel: () => 'max' };
  const sent = [];
  const bg = async (m) => { sent.push(m); if (m.type === 'web_fetch') return { ok: true, text: 'PAGE ' + m.url }; return { ok: true, results: [{ title: 'Players', url: 'https://create.roblox.com/docs/reference/engine/classes/Players' }, { title: 'Evil', url: 'https://evil.example/docs' }, { title: 'Sneaky', url: 'https://create.roblox.com.evil.example/docs/x' }, { title: 'Bad', url: 'nonsense' }], text: 'ignored' }; };
  const call = (name, args, win = ultra, b = bg) => runBlock(name, args, b, win, { runTool: async (a) => JSON.stringify({ ok: true, echo: a }) }, URL);
  assert(/only at Ultra effort/.test(await call('ultralab_read', { action: 'list' }, normal)) && /only at Ultra effort/.test(await call('roblox_docs', { query: 'x' }, normal)));
  assert.equal(await call('plazcode_skills', {}), 'unhandled', 'other tools fall through');
  assert(/Output of 'ultralab_read'/.test(await call('ultralab_read', { action: 'list' })));
  const okUrl = await call('roblox_docs', { url: 'https://create.roblox.com/docs/reference/engine/classes/Players' });
  assert(/PAGE https:\/\/create\.roblox\.com\/docs\/reference\/engine\/classes\/Players/.test(okUrl) && sent.at(-1).max_chars === 24000);
  assert.equal(sent.at(-1).type, 'web_fetch');
  await call('roblox_docs', { url: 'https://create.roblox.com/docs', max_chars: 999999 }); assert.equal(sent.at(-1).max_chars, 60000);
  await call('roblox_docs', { url: 'https://create.roblox.com/docs', max_chars: 10 }); assert.equal(sent.at(-1).max_chars, 500);
  const before = sent.length;
  for (const bad of ['http://create.roblox.com/docs/x', 'https://create.roblox.com.evil.example/docs/x', 'https://evil.example/create.roblox.com/docs/', 'https://create.roblox.com@evil.example/docs/x', 'https://create.roblox.com/other', 'https://create.roblox.com/', 'https://create.roblox.com/docsevil', 'https://developer.roblox.com/docs/x', 'javascript:alert(1)', 'file:///etc/passwd', 'https://create.roblox.com:8443/docs/x', 'https://user:pw@create.roblox.com/docs/x', 'not a url'])
    assert(/ERROR: roblox_docs only reads/.test(await call('roblox_docs', { url: bad })), 'refused url ' + bad);
  assert(sent.slice(before).every((m) => !/evil|other|etc\/passwd|javascript/.test(m.url || '')), 'no refused url was fetched');
  const searched = await call('roblox_docs', { query: 'Players service' });
  assert(sent.at(-1).type === 'web_search' && sent.at(-1).query === 'site:create.roblox.com/docs Players service');
  assert(searched.includes('Players') && !searched.includes('evil.example') && !searched.includes('nonsense'), 'only docs pages are returned');
  const none = await call('roblox_docs', { query: 'zzz' }, ultra, async () => ({ ok: true, results: [{ title: 'x', url: 'https://example.com/a' }] }));
  assert(/No create\.roblox\.com\/docs page matched/.test(none) && /UNVERIFIED/.test(none));
  assert(/ERROR in roblox_docs: boom/.test(await call('roblox_docs', { query: 'x' }, ultra, async () => ({ ok: false, error: 'boom' }))));
  assert(/ERROR in roblox_docs: boom/.test(await call('roblox_docs', { url: 'https://create.roblox.com/docs/x' }, ultra, async () => ({ ok: false, error: 'boom' }))));
  assert(/needs a query or a url/.test(await call('roblox_docs', {})));
  assert(/needs a query or a url/.test(await call('roblox_docs', null)));

  // safety: reading the pack and the docs never asks for approval
  const safety = require(core('safety.js'));
  for (const t of ['ultralab_read', 'roblox_docs', 'roblox__ultralab_read']) assert.equal(safety.isChange(t, 'roblox'), false, t + ' is a read');
  assert.equal(safety.isChange('execute_luau', 'roblox'), true);
  const log = require(core('action-log.js'));
  assert(log.describe({ tool: 'ultralab_read', target: 'skills/x' }).look && log.describe({ tool: 'roblox_docs' }).look);
  assert.equal(log.describe({ tool: 'roblox_docs' }).text, 'Looked up the Roblox docs');
  assert(require(core('stall-guard.js')).isRead('ultralab_read'));

  // ---------- 5. manifest ----------
  const manifest = JSON.parse(read(path.join(root, 'manifest.json')));
  const war = manifest.web_accessible_resources.flatMap((e) => e.resources);
  assert(war.includes('core/ultralab-pack.json') && war.includes('core/ultralab/*'), 'the pack is reachable from the AI sites');
  const wild = new RegExp('^' + 'core/ultralab/*'.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  for (const p of ['core/ultralab/INDEX.json', 'core/ultralab/skills/ul-3d-model/SKILL.md', 'core/ultralab/references/check-ui-repo/src/CheckUIComponents.luau']) assert(wild.test(p), 'the pattern covers ' + p);
  for (const entry of manifest.content_scripts) {
    if (!entry.js.includes('core/config.js')) continue;
    assert(entry.js.includes('core/ultracode.js') && entry.js.indexOf('core/ultracode.js') < entry.js.indexOf('core/config.js'));
    assert(!entry.js.some((s) => /ultracode-deepseek/.test(s)), 'no DeepSeek-only Ultra');
  }
  for (const f of manifest.content_scripts.flatMap((e) => e.js)) assert(fs.existsSync(path.join(root, f)), 'manifest script exists: ' + f);
  for (const f of ['core/ultracode.js', 'core/ultralab-pack.json', 'core/ultralab/INDEX.json', 'core/ultralab/skills/ul-check-suite/SKILL.md', 'manifest.json'])
    assert.equal(fs.readFileSync(path.join(root, 'PlazCode-Extension', f)).equals(fs.readFileSync(path.join(root, f))), true, 'the extension copy matches: ' + f);
  assert.equal(fs.existsSync(path.join(root, 'PlazCode-Extension/core/ultracode-deepseek.js')), false);
  assert(fs.statSync(core('ultralab-pack.json')).size < 1_500_000, 'the pack json stays small enough to load on every AI tab');

  console.log('PASS Ultra pack: ' + skillDirs.length + ' skills, ' + agentFiles.length + ' agents, ' + index.length + ' files verified; routing, budgets, ultralab_read, roblox_docs allowlist, safety, licences, manifest.');
})().catch((e) => { console.error(e); process.exit(1); });
