// SPDX-License-Identifier: GPL-3.0-or-later
// Stops the agent from going in circles: the same read repeated with nothing
// changed in between, or the same failing call retried unchanged. The model is
// told what to do instead; after several stalls in a row it is told to stop.
const PlazCodeStallGuard = (() => {
  const LIVE = /(?:console|output|log|state|status|wait|capture|screenshot|poll|progress|job|play|checklist|clarify|memory|skill|engram|template)/i;
  const READ = /^(?:get|list|read|search|find|inspect|grep|describe|query|fetch|check|view|show|lookup)(?:_|$)|(?:_read|_get|_list|_search|_inspect|_grep)$/i;
  const isRead = name => READ.test(name) && !LIVE.test(name);
  const sig = call => `${call.tool}|${stable(call.arguments)}`;
  function stable(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
    return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  }
  function create({ now = Date.now, windowMs = 90000, limit = 3 } = {}) {
    let reads = new Map(), failed = '', stalls = 0;
    const name = call => String(call?.tool || '').split('/').pop();
    return {
      // Returns an ERROR text when this call should not run, else null.
      before(call) {
        if (!call || !call.tool) return null;
        const key = sig(call), n = name(call);
        if (failed === key) { failed = ''; stalls++; return stop(`That exact call already failed. Change the arguments or try a different approach; do not resend it unchanged.`, stalls, limit); }
        if (isRead(n) && reads.has(key) && now() - reads.get(key) < windowMs) { stalls++; return stop(`You already made this exact read and nothing has changed since. Use the earlier result, read something different, or make a change first.`, stalls, limit); }
        return null;
      },
      // ok = the tool ran and did not return an error.
      after(call, ok) {
        if (!call || !call.tool) return;
        const key = sig(call), n = name(call);
        if (!ok) { failed = key; return; }
        failed = ''; stalls = 0;
        if (isRead(n)) reads.set(key, now()); else reads = new Map();
      },
      reset() { reads = new Map(); failed = ''; stalls = 0; },
      stalls: () => stalls,
    };
  }
  function stop(reason, stalls, limit) {
    return `ERROR: command was not executed. ${reason}` + (stalls >= limit ? ` You have repeated yourself ${stalls} times in a row. Stop calling tools now and tell the user, in one or two sentences, what is blocking you.` : '');
  }
  return { create, isRead };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PlazCodeStallGuard;
