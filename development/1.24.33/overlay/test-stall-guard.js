// Repeated identical reads/failures are blocked with a clear instruction; real progress resets it.
const assert = require('node:assert/strict');
const SG = require('./core/stall-guard.js');
let t = 0; const g = SG.create({ now: () => t });
const read = { tool: 'script_read', arguments: { path: 'A', opts: { b: 1, a: 2 } } };
assert.equal(g.before(read), null); g.after(read, true);
const again = { tool: 'script_read', arguments: { opts: { a: 2, b: 1 }, path: 'A' } };
assert.match(g.before(again), /already made this exact read/, 'key order does not hide a repeat');
// A write in between makes the read legitimate again.
g.after({ tool: 'multi_edit', arguments: { x: 1 } }, true);
assert.equal(g.before(again), null);
// Live-state reads are never blocked, and an old read may be repeated after the window.
for (const live of ['get_console_output', 'get_studio_state', 'screen_capture', 'wait_job_finished']) { const c = { tool: live, arguments: {} }; g.after(c, true); assert.equal(g.before(c), null, live); }
g.after(read, true); t += 91000; assert.equal(g.before(read), null, 'window expired');
// The same failing call is not resent unchanged; a changed call is fine.
const bad = { tool: 'execute_luau', arguments: { code: 'x(' } };
assert.equal(g.before(bad), null); g.after(bad, false);
assert.match(g.before(bad), /already failed/);
g.after(bad, false); assert.match(g.before(bad), /already failed/, 'still blocked while it keeps failing');
assert.equal(g.before({ tool: 'execute_luau', arguments: { code: 'x()' } }), null);
// Three stalls in a row tell the model to stop; any success resets the count.
g.reset(); g.after(bad, false);
g.before(bad); g.after(bad, false); g.before(bad); g.after(bad, false);
assert.match(g.before(bad), /Stop calling tools now/);
g.after({ tool: 'execute_luau', arguments: { code: 'ok()' } }, true); assert.equal(g.stalls(), 0);
assert.equal(g.before(null), null);
// Ultra pack and Roblox docs never change in a run, so a slow chat (Notion) cannot slip a repeat past the 90 s window.
{ let t = 0; const slow = SG.create({ now: () => t });
  const skill = { tool: 'ultralab_read', arguments: { action: 'read', path: 'skills/ul-check-suite/SKILL.md' } };
  assert.equal(slow.before(skill), null); slow.after(skill, true);
  t = 200000; assert.match(slow.before(skill), /already made this exact read/, 'repeat 200 s later is still stopped');
  t = 700000; assert.equal(slow.before(skill), null, 'after 10 minutes it may be read again');
  const other = { tool: 'get_something', arguments: {} }; slow.after(other, true); t = 700000 + 200000; assert.equal(slow.before(other), null, 'ordinary reads keep the 90 s window'); }
// After 1.24.32 (owner: "workspace_info ... looped infinitely"): inspection tools are reads too, so an identical
// repeat is stopped, and a repeat no longer wipes the memory of other reads.
{
  let clock = 0; const h = SG.create({ now: () => clock });
  for (const n of ['workspace_info', 'file_info', 'env_info', 'tree', 'file_exists', 'count_lines']) assert.equal(SG.isRead(n), true, n + ' is a read');
  for (const n of ['write_file', 'edit_file', 'delete_path', 'run_command']) assert.equal(SG.isRead(n), false, n + ' is not a read');
  const info = { tool: 'workspace_info', arguments: {} }, list = { tool: 'list_directory', arguments: { path: '.' } };
  assert.equal(h.before(info), null); h.after(info, true); clock += 1000;
  assert.equal(h.before(list), null); h.after(list, true); clock += 1000;
  assert.match(h.before(info) || '', /already made this exact read/, 'a repeated workspace_info is stopped');
  assert.match(h.before(list) || '', /already made this exact read/, 'and it did not wipe the earlier list_directory');
  h.after({ tool: 'edit_file', arguments: { path: 'a' } }, true);
  assert.equal(h.before(info), null, 'after an edit the folder may have changed, so it may run again');
}
console.log('Stall guard blocks unchanged repeats, spares live-state reads, and escalates after three.');
