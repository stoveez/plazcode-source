"use strict";
// Owner (2026-11-18): Ask PlazCode answers showed up late, and sometimes never. Run: node test-ask-reply.js
const assert = require("node:assert/strict");
const R = require("./core/ask-reply.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function rig() {
  const s = { job: { sent: true }, busy: false, running: false, stop: false, text: null, partials: [], reports: [] };
  const api = R.create({
    current: () => s.job, busy: () => s.busy, running: () => s.running, stopped: () => s.stop, read: () => s.text,
    command: (t) => /"command"\s*:/.test(t), partial: (t) => s.partials.push(t), report: (job, status, text) => { job.reported = true; s.reports.push([status, text]); },
    words: { stopped: "Stopped.", failed: "PlazCode stopped before writing an answer." }, wait: 5000,
  });
  return { s, api };
}
(async () => {
  // 1. Still busy when the run ends (a result settling): the old code gave up after 2 s and the answer never arrived.
  let { s, api } = rig();
  s.text = "Paris is the capital."; s.busy = true;
  api.afterRun(s.job);
  await sleep(2600);
  assert.deepEqual(s.reports, [], "not reported while PlazCode is busy");
  s.busy = false; await sleep(800);
  assert.deepEqual(s.reports, [["done", "Paris is the capital."]], "reported once PlazCode is idle");
  // 2. Fast when nothing is busy: well under the old fixed 2 s, and only after the text stops changing.
  ({ s, api } = rig());
  s.text = "Hello"; const t0 = Date.now();
  api.afterRun(s.job);
  await sleep(200); s.text = "Hello there"; await sleep(900);
  assert.deepEqual(s.reports, [["done", "Hello there"]], "the finished text, not a half-drawn one");
  assert(Date.now() - t0 < 1500);
  // 3. Drafts while the AI writes, never a command.
  ({ s, api } = rig());
  api.watch(s.job);
  s.text = null; await sleep(450); assert.deepEqual(s.partials, [], "nothing before the AI starts a new reply");
  s.text = "The"; await sleep(450); s.text = "The answer is 4."; await sleep(450); s.text = '```json\n{"command":"tab_read"}'; await sleep(450);
  assert.deepEqual(s.partials, ["The", "The answer is 4."]);
  s.job.reported = true; await sleep(450); s.text = "later"; await sleep(450);
  assert.equal(s.partials.length, 2, "drafts stop once the answer is reported");
  // 4. Stop, an answer that is only a command, and a run that continues.
  ({ s, api } = rig()); s.stop = true; s.text = '{"command":"x"}'; api.afterRun(s.job); await sleep(300);
  assert.deepEqual(s.reports, [["stopped", "Stopped."]]);
  ({ s, api } = rig()); s.text = '```json\n{"command":"x"}'; api.afterRun(s.job); await sleep(800);
  assert.deepEqual(s.reports, [["failed", "PlazCode stopped before writing an answer."]]);
  ({ s, api } = rig()); s.running = true; s.text = "x"; api.afterRun(s.job); await sleep(300);
  assert.deepEqual(s.reports, [], "a new run is still this question");
  s.running = false; api.afterRun(s.job); await sleep(800);
  assert.deepEqual(s.reports, [["done", "x"]], "the next end of a run reports it");
  console.log("PASS Ask PlazCode replies: drafts while the AI writes, the answer as soon as PlazCode is idle and the text is stable, never lost when busy.");
})().catch((e) => { console.error(e); process.exit(1); });
