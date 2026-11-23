// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.24.36/ts/core/ask-reply.ts (TypeScript): edit that file, then run node development/1.24.36/ts/build.cjs.
// Getting an Ask PlazCode answer from the AI chat to the panel (split out of core/main.js, split as you go). Owner (2026-11-18):
// "the messages that the AI responds with are delayed to show up in the actual Ask PlazCode chat" and "sometimes AI responses
// aren't detected by the Ask PlazCode chat at all".
// - While the AI writes, the reply as it grows goes to the panel every 0.4 s (a draft), never while it is writing a command.
// - When the run ends, the answer is reported once PlazCode is idle and two readings a quarter second apart agree. It used to wait a
//   fixed 2 s and give up for good when PlazCode was still busy at that moment, so the answer never reached the panel.
const PlazCodeAskReply = (() => {













  function create(d) {
    const live = (job) => d.current() === job && !job.reported;
    function watch(job) {
      let last = "";
      clearInterval(job.watch);
      job.watch = setInterval(() => {
        if (!live(job)) { clearInterval(job.watch); return; }
        const text = d.read(job);
        if (!text || text === last || d.command(text)) return;
        last = text; d.partial(text);
      }, 400);
    }
    function afterRun(job) {
      if (!job || job.reported || job.finishing) return;
      job.finishing = true;
      const until = Date.now() + (d.wait || 120000);
      let last = null, same = 0;
      const check = () => {
        if (!live(job)) return;
        // A new run (the AI answered with a command) is still this question; the next end of a run checks again.
        if (d.running()) { job.finishing = false; return; }
        const late = Date.now() >= until, stop = d.stopped(job);
        if (d.busy() && !late) { setTimeout(check, 250); return; }
        const text = (d.read(job) || "").trim();
        same = text === last ? same + 1 : 0; last = text;
        if (same < 1 && !late && !stop) { setTimeout(check, 250); return; }
        clearInterval(job.watch);
        if (stop) d.report(job, "stopped", text && !d.command(text) ? text : d.words.stopped);
        else if (!text || d.command(text)) d.report(job, "failed", d.words.failed);
        else d.report(job, "done", text);
      };
      setTimeout(check, 150);
    }
    return { watch, afterRun };
  }
  return { create };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodeAskReply;
