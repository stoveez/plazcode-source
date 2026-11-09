// AgentScript Full access: the person must be told WHY the PC refused, the
// run_command wait must match what the AI asked for, and the extension must
// never flip the desktop app's Full switch against the user's choice.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Safety = require('./core/safety.js');

// ---- accessHint (pure) -------------------------------------------------------
const off = "ERROR running 'run_command': 'C:/x' is an absolute path, but Full PC access is OFF, so PlazCode only allows paths inside the workspace. Ask the user to switch Permissions to Full";
let hint = Safety.accessHint('run_command', off, { permMode: 'sandbox', agentFull: false });
assert.equal(hint.kind, 'full-off');
assert.match(hint.text, /Permissions to Full/);

// The menu says Full but the app says OFF: point at the desktop app, not the menu.
hint = Safety.accessHint('launch_app', "ERROR running 'launch_app': launch_app requires FULL PC ACCESS. It is OFF now", { permMode: 'full', agentFull: false });
assert.equal(hint.kind, 'full-mismatch');
assert.match(hint.text, /desktop app/);
// Unknown app state is not blamed on the app.
assert.equal(Safety.accessHint('launch_app', "ERROR: launch_app requires FULL PC ACCESS", { permMode: 'full', agentFull: null }).kind, 'full-off');

hint = Safety.accessHint('read_file', "ERROR running 'read_file': 'D:/a' is outside the folders PlazCode may use. Add its folder under Safety", {});
assert.equal(hint.kind, 'folders');

hint = Safety.accessHint('run_command', "ERROR running 'run_command': could not start powershell: program not found. PowerShell is not installed", {});
assert.equal(hint.kind, 'spawn');
assert.match(hint.text, /could not start powershell/);

// Ordinary results and unrelated errors stay quiet; empty input never throws.
assert.equal(Safety.accessHint('run_command', 'Command finished (exit code 0)\nhi', {}), null);
assert.equal(Safety.accessHint('read_file', "ERROR running 'read_file': 'a.txt' does not exist in the workspace", {}), null);
assert.equal(Safety.accessHint('read_file', 'file text mentioning Full PC access is OFF', {}), null, 'file contents are not errors');
assert.equal(Safety.accessHint('x', '', {}), null);
assert.equal(Safety.accessHint(undefined, undefined, undefined), null);

// ---- run_command wait time (extracted from core/main.js) ----------------------
const main = fs.readFileSync('core/main.js', 'utf8');
const start = main.indexOf('function toolCallTimeoutMs');
const end = main.indexOf('async function runImportedRobloxTool');
assert.ok(start > 0 && end > start, 'toolCallTimeoutMs not found');
const timeoutMs = new Function(main.slice(start, end) + '; return toolCallTimeoutMs;')();
assert.equal(timeoutMs('run_command', { command: 'dir' }), 120000, 'default wait is unchanged');
assert.equal(timeoutMs('run_command', { command: 'x', timeout_seconds: 300 }), 315000, 'a long build is waited for');
assert.equal(timeoutMs('run_command', { command: 'x', timeout_seconds: 5 }), 120000, 'never shorter than before');
assert.equal(timeoutMs('run_command', { command: 'x', timeout_seconds: 9999 }), 640000, 'capped');
assert.equal(timeoutMs('read_file', {}), 120000);
assert.equal(timeoutMs('execute_luau', {}), 20000);
assert.equal(timeoutMs('srv__playtest', { timeout_seconds: 10 }), 340000, 'add-on rule unchanged');

// ---- process_kill honours the app's own Full flag -----------------------------
assert.match(main, /permMode !== "full" && !\(typeof window\.__rsFullAccess === "function" && window\.__rsFullAccess\(\)\) && \/\^\(process_kill\)\$\/\.test\(bareName\)/);
// ---- the user is told when a refusal happens or the Full switch did not apply --
assert.match(main, /accessBanner\(call&&call\.tool,out\)/);
assert.match(main, /Full access did not change/);

// ---- background.js: no stale resync, never revokes Full -----------------------
const bg = fs.readFileSync('background.js', 'utf8');
assert.ok(!/get\("rs-local-full"/.test(bg), 'the stale rs-local-full resync is gone');
assert.match(bg, /get\("rsPermMode"/);
const sync = bg.slice(bg.indexOf('Full access re-sync'), bg.indexOf('procStatusReading = false; }') + 30);
assert.match(sync, /wantFull && !localFull/);
assert.ok(!/enabled: false/.test(sync), 'the extension must never switch Full off from the resync');
assert.ok(bg.indexOf('await pullDesktopPreferences();') < bg.indexOf('Full access re-sync'), 'resync runs after the desktop choice was pulled');

// ---- AI-facing text mentions the new options ----------------------------------
const config = fs.readFileSync('core/config.js', 'utf8');
for (const word of ['shell \\"powershell\\"', 'cwd', 'ms-settings:']) assert.ok(config.includes(word), 'config hint missing ' + word);
assert.ok(config.includes('FULL PC ACCESS IS ON') && config.includes('YOU CAN ACT DIRECTLY ON THE USER'), 'lean-startup cut markers intact');

console.log('full-access tests passed');
