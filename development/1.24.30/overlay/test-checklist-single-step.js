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
console.log('Checklist: rule sentences ("Just read tools") are not steps; the Goal line names the task; a one-sentence request shows as one step; the AI plan replaces it; bare commands add nothing.');
