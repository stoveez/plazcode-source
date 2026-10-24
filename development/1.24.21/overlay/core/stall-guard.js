// SPDX-License-Identifier: GPL-3.0-or-later
// Stops the agent from going in circles: the same read repeated with nothing
// changed in between, or the same failing call retried unchanged. The model is
// told what to do instead; after several stalls in a row it is told to stop.
const PlazCodeStallGuard = (() => {
  const LIVE = /(?:console|output|log|state|status|wait|capture|screenshot|poll|progress|job|play|checklist|clarify|memory|skill|engram|template)/i;
  const READ = /^(?:get|list|read|search|find|inspect|grep|describe|query|fetch|check|view|show|lookup)(?:_|$)|(?:_read|_get|_list|_search|_inspect|_grep)$/i;
  const isRead = name => READ.test(name) && !LIVE.test(name);
  // Reference text that never changes during a run (the Ultra pack, the Roblox docs): a repeat is never
  // useful, and a slow chat like Notion takes longer than the normal window between turns.
  const STATIC = /^(?:ultralab_read|roblox_docs)$/;
  const STATIC_WINDOW_MS = 600000;
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
        if (isRead(n) && reads.has(key) && now() - reads.get(key) < (STATIC.test(n) ? Math.max(windowMs, STATIC_WINDOW_MS) : windowMs)) { stalls++; return stop(`You already made this exact read and nothing has changed since. Use the earlier result, read something different, or make a change first.`, stalls, limit); }
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
  // A reply that SAYS a command was sent (or is about to be) but holds no command block, so nothing ran and
  // the run would sit still ("I've sent the PlazCode command to read the file. When its output returns I'll
  // update..."). The agent loop calls this only for a reply it already found to contain NO tool call. Pure and
  // conservative: long replies are real answers, a question to the user is never a stalled command, and the
  // plain "I'll now ..." wording only counts at the very end of a short reply.
  // Only wording that promises a command still to come or a result still to arrive counts. Past-tense "I ran the
  // command and it works" is a normal final summary and is deliberately NOT matched.
  const CLAIM_SENT = /\b(?:i(?:'ve| have)?|i just|just|i then)\s+(?:now\s+|already\s+)?(?:sent|issued|submitted|dispatched|fired off|queued)\b[^.\n]{0,80}\b(?:commands?|tool calls?|tools?|requests?|instructions?)\b/i;
  const CLAIM_PASSIVE = /\b(?:commands?|tool calls?|requests?)\b[^.\n]{0,40}\b(?:has been|was|is being|is now|is already)\s+(?:sent|issued|submitted|dispatched|queued)\b/i;
  const CLAIM_WAIT = /\b(?:(?:when|once|after|as soon as|until)\b[^.\n]{0,60}\b(?:output|results?|responses?|replies|reply)\b[^.\n]{0,30}\b(?:returns?|comes? back|arrives?|is back|are back|is ready|appears?)|(?:waiting|wait)\s+(?:for|on)\s+(?:the |its |that |this )?(?:command(?:'s)? )?(?:output|results?|responses?))\b/i;
  const CLAIM_INTENT = /(?:\bi(?:'ll|\s+will)\s+(?:now|next|first|then)\b|\bi'm going to\s+(?:now|next|first)\b|\b(?:now|next|first|then),?\s+i(?:'ll|\s+will)\b)\s*(?:send|issue|run|execute|call|read|check|inspect|open|fetch|search|list|look|grep|write|edit|update|create|apply|test|verify)\b/i;
  const ASKS_USER = /\?\s*$|\b(?:let me know|tell me|which (?:one|option)|do you (?:want|prefer)|would you (?:like|prefer)|shall i|should i)\b/i;
  function claimsUnsentCommand(text) {
    const t = String(text || '').replace(/[’]/g, "'").trim();
    if (t.length < 20 || t.length > 2500) return false;
    // Anything that really carries a command shape is the parser's business, not ours.
    if (/"command"\s*:|###\s*lua|###mcp_tool###|```json/i.test(t)) return false;
    const tail = t.slice(-300);
    if (ASKS_USER.test(tail)) return false;
    if (CLAIM_SENT.test(t) || CLAIM_PASSIVE.test(t) || CLAIM_WAIT.test(t)) return true;
    return t.length <= 1200 && CLAIM_INTENT.test(t.slice(-240));
  }
  function stop(reason, stalls, limit) {
    return `ERROR: command was not executed. ${reason}` + (stalls >= limit ? ` You have repeated yourself ${stalls} times in a row. Stop calling tools now and tell the user, in one or two sentences, what is blocking you.` : '');
  }
  return { create, isRead, claimsUnsentCommand };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PlazCodeStallGuard;
