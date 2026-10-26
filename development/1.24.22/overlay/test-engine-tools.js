// The engine file tools (Godot, Unity, Roblox place, Blender) must be treated the same way by the app and the extension:
// reads never count as changes, the three writers do, and every tool has a plain-language line in "What happened".
const fs = require('node:fs'), assert = require('node:assert/strict');
const Safety = require('./core/safety.js'), Log = require('./core/action-log.js');
const rust = fs.readFileSync('agent/src/engine_tools.rs', 'utf8');
const list = (name) => { const m = rust.match(new RegExp('pub const ' + name + ': &\\[&str\\] = &\\[([^\\]]*)\\]')); assert(m, name); return [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]); };
const names = list('NAMES'), writers = list('WRITERS');
assert.equal(names.length, 17, 'seventeen engine tools');
assert.deepEqual(writers, ['godot_add_node', 'godot_create_script', 'unity_create_script']);
const safetyRs = fs.readFileSync('agent/src/safety.rs', 'utf8');
for (const name of names) {
  const writer = writers.includes(name);
  assert.equal(Safety.isChange(name, 'local'), writer, name + ' extension safety');
  assert.equal(safetyRs.includes('"' + name + '"'), !writer, name + ' app safety list');
  const info = Log.describe({ tool: name, target: 'x', result: 'ok' });
  assert(!/^[A-Z][a-z]+ [a-z]+ x$/.test(info.text) || /Godot|Unity|Roblox|Blender|place|Luau|script/i.test(info.text), name + ' has its own plain wording: ' + info.text);
  assert.equal(info.look, !writer, name + ' shows under reads and searches only when it is a read');
}
// Read-only mode: the extension and the app refuse exactly the writers (is_change is what the refusal is based on).
const desc = names.filter((n) => Safety.isChange(n, 'local'));
assert.deepEqual(desc, writers, 'only the writers count as changes');
// Wiring in the app.
const workspace = fs.readFileSync('agent/src/workspace.rs', 'utf8');
assert(workspace.includes('crate::engine_tools::is_engine_tool(name)') && workspace.includes('chain(crate::engine_tools::catalog())'), 'dispatch and catalog are wired');
assert(fs.readFileSync('agent/src/main.rs', 'utf8').includes('mod engine_tools;'));
const checkpoints = fs.readFileSync('agent/src/checkpoints.rs', 'utf8');
for (const writer of writers) assert(checkpoints.includes('"' + writer + '"'), writer + ' is snapshotted for Undo');
console.log('PASS engine tools: 17 tools, 3 writers with Undo, safety and read-only rules agree in the app and the extension');
