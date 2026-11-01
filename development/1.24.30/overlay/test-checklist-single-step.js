// A one-sentence request used to leave the Task checklist on "Waiting for the AI to describe the project goal"
// for the whole run. It now shows the request as one step, completes it when the run ends, and the AI's own plan
// still replaces it.
const assert = require('node:assert/strict');
const Activity = require('./core/activity.js');

const a = Activity.create();
a.sync(true, 'chat'); a.task('Run 15 read-only tool tests', 'k1');
let plan = a.active().plan;
assert.equal(plan.items.length, 1, 'one-sentence request becomes one step');
assert.equal(plan.items[0].status, 'in_progress');
a.sync(false, 'chat', Date.now(), {collapse: true});
const done = a.groups ? a.groups() : null;
// The AI's own plan wins over the request step.
const b = Activity.create();
b.sync(true, 'chat2'); b.task('Run 15 read-only tool tests', 'k2');
b.checklist([{label: 'Read the folder tree', status: 'in_progress'}, {label: 'Read the first file', status: 'pending'}]);
assert.deepEqual(b.active().plan.items.map(i => i.label), ['Read the folder tree', 'Read the first file']);
// A command name alone is not a step.
const c = Activity.create();
c.sync(true, 'chat3'); c.task('tree', 'k3');
assert.equal(c.active().plan, null, 'no step for a bare command');
// Owner, 2026-11-01: "use 15 tool calls 1 per turn as a test. Just read tools" listed "Just read tools" as a second
// task. Short "just/only ..." and "don't/never ..." sentences are rules for the work, not steps.
for (const [request, expect] of [
  ['use 15 tool calls 1 per turn as a test. Just read tools', 1],
  ['Build a shop UI. Only use ModuleScripts. Do not touch the DataStore.', 1],
  ['Build a shop UI. Then add a buy button.', 2],
  ['Make the map. Just add a spawn point too.', 2],
]) {
  const d = Activity.create(); d.sync(true, 'r' + expect + request.length); d.task(request, 'k' + request.length);
  const labels = (d.active().plan?.items || []).map(i => i.label);
  assert.equal(labels.length, expect, request + ' -> ' + JSON.stringify(labels));
  assert(!labels.some(l => /^(just|only|do not)\b/i.test(l) && l.split(' ').length <= 3), JSON.stringify(labels));
}
// The AI's "Goal:" line names the task (one line, not glued to the next paragraph).
const e = Activity.create(); e.sync(true, 'goal'); e.task('use 15 tool calls 1 per turn as a test. Just read tools', 'kg');
e.record(e.active().id, 'a1', 'assistant', 'Goal: 15 read-only tool calls\nCall 1 of 15: checking the workspace');
assert.equal(e.active().taskLabel, '15 read-only tool calls');
// Owner, 2026-11-01: the checklist "just repeats my prompt word for word". The owner chose: the AI's goal is the
// title AND the one step when the AI gives no step list; until the goal arrives, a tidied version of the request.
assert.deepEqual(e.active().plan.items.map(i => [i.label, i.status]), [['15 read-only tool calls', 'in_progress']], 'the goal replaces the copied request step');
const f = Activity.create(); f.sync(true, 'tidy'); f.task('can you use 15 tool calls 1 per turn as a test please', 'kt');
assert.deepEqual(f.active().plan.items.map(i => i.label), ['Use 15 tool calls 1 per turn'], 'filler is trimmed before the goal arrives');
f.record(f.active().id, 'a1', 'command', 'goal: run 15 read-only tool calls\n```json\n{"command":"workspace_info"}\n```');
assert.equal(f.active().taskLabel, 'Run 15 read-only tool calls', 'goal is capitalised');
assert.deepEqual(f.active().plan.items.map(i => i.label), ['Run 15 read-only tool calls']);
f.sync(false, 'tidy', Date.now(), {collapse: true});
// A list the user numbered stays as written; the goal only names it.
const g = Activity.create(); g.sync(true, 'list'); g.task('Please do these:\n1. Build the shop frame\n2. Add a buy button\n3. Test the purchase', 'kl');
g.record(g.active().id, 'a1', 'assistant', 'Goal: Build a working shop UI');
assert.equal(g.active().taskLabel, 'Build a working shop UI');
assert.deepEqual(g.active().plan.items.map(i => i.label), ['Build the shop frame', 'Add a buy button', 'Test the purchase']);
// The AI's own step list still wins over the goal step.
const h = Activity.create(); h.sync(true, 'plan'); h.task('make me a cool obby with checkpoints as a test', 'kp');
h.record(h.active().id, 'a1', 'assistant', 'Goal: Build a checkpoint obby');
h.record(h.active().id, 'a2', 'assistant', 'Plan:\n1. Lay out the stages\n2. Add checkpoints\n3. Playtest the run');
assert.deepEqual(h.active().plan.items.map(i => i.label), ['Lay out the stages', 'Add checkpoints', 'Playtest the run']);
assert.equal(h.active().taskLabel, 'Build a checkpoint obby');
console.log('Checklist: rule sentences ("Just read tools") are not steps; the Goal line names the task; a one-sentence request shows as one step; the AI plan replaces it; bare commands add nothing.');
