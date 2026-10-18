// Godot is a pinned connector that finds its own editor; Blender's server is pinned with telemetry off,
// old unpinned installs are moved over, its data-sharing tools are hidden from the AI, and Safety
// treats both connectors' tools correctly (looking is allowed read-only, changing is not).
const fs = require('node:fs'), assert = require('node:assert/strict');
const Safety = require('./core/safety.js'), Log = require('./core/action-log.js');
const rust = fs.existsSync('agent/src/mcp_addons.rs') ? fs.readFileSync('agent/src/mcp_addons.rs', 'utf8') : fs.readFileSync(process.argv[2], 'utf8');
assert(rust.includes('id: "godot"') && rust.includes('"@coding-solo/godot-mcp@0.1.1"'), 'Godot server pinned');
assert(rust.includes('pub fn find_godot()') && rust.includes('GODOT_PATH'), 'Godot editor found automatically');
assert(rust.includes('"--from", "mcp-for-blender==2.1.9", "mcp-for-blender"'), 'Blender server pinned');
assert(!/args: &\["blender-mcp"\]/.test(rust), 'no unpinned Blender server left in the catalog');
assert(rust.includes('fn upgrade_blender_spec(') && rust.includes('upgrade_blender_spec(&mut cfg);'), 'old Blender installs are upgraded when the config is read');
assert(rust.includes('"DISABLE_TELEMETRY"'), 'Blender telemetry is turned off');

const main = fs.readFileSync('core/main.js', 'utf8');
const m = /\/\(\?:\^\|__\)\(\?:record_trajectory_feedback\|disable_telemetry\)\$\//.exec(main);
assert(m, 'data-sharing Blender tools are blocked in the extension');
const blocked = new RegExp(m[0].slice(1, -1));
for (const name of ['blender__record_trajectory_feedback', 'blender__disable_telemetry']) assert(blocked.test(name), name);
for (const name of ['blender__look', 'blender__execute_blender_code', 'godot__run_project']) assert(!blocked.test(name), name);

for (const name of ['blender__look', 'blender__get_scene_info', 'godot__get_debug_output', 'godot__list_projects', 'godot__get_project_info', 'godot__get_godot_version']) assert.equal(Safety.isChange(name, 'roblox'), false, name + ' only looks');
for (const name of ['blender__execute_blender_code', 'blender__import_asset', 'godot__run_project', 'godot__stop_project', 'godot__create_scene', 'godot__add_node', 'godot__save_scene', 'godot__launch_editor']) assert.equal(Safety.isChange(name, 'roblox'), true, name + ' changes things');
assert.equal(Log.describe({ tool: 'blender__look' }).look, true, 'a Blender screenshot is a look in the log');
assert.equal(Safety.isChange('screen_record', 'local'), false, 'recording the screen only looks');
assert.equal(Log.describe({ tool: 'screen_record' }).look, true);
console.log('PASS Godot and Blender connectors: pinned, telemetry off, old installs upgraded, data-sharing tools hidden, Safety classifies both.');
