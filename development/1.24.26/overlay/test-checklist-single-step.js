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
console.log('Checklist: a one-sentence request shows as one step; the AI plan replaces it; bare commands add nothing.');
