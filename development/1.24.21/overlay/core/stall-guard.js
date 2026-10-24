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

  // ── Hang recovery (item 9) ───────────────────────────────────────────────────────────────────────────────
  // One pure decision function for every provider: given what the page and the app look like right now, it says
  // which single recovery (if any) to run. It never touches the page itself, so every row is unit-testable.
  // At most one recovery per call; per-reply counters (state.tries) make sure nothing can loop forever; nothing
  // fires while the user is typing or a Confirm prompt is open. Thresholds are settings with safe defaults.
  const HANG_DEFAULTS = {
    quietMs: 90000,        // reply text stopped growing while the site's Stop button is still up
    deliverMs: 8000,       // our message is still in the composer / no new user turn
    toolSilentMs: 120000,  // a tool call has had no result at all
    maxTries: { stopContinue: 1, resendBlock: 1, delivery: 2, studioPing: 1, modeHint: 1 },
    backoffStartMs: 1000, backoffMaxMs: 30000,
  };
  const hangConfig = over => ({ ...HANG_DEFAULTS, ...(over || {}), maxTries: { ...HANG_DEFAULTS.maxTries, ...((over || {}).maxTries || {}) } });
  const CONTINUE_TEXT = 'Continue exactly from where you stopped. Do not repeat finished steps.';
  const RESEND_BLOCK_TEXT = 'Your last reply ended in the middle of a command block. Resend only that command block, complete, and nothing else.';
  // A reply that ends inside a tool block: an odd number of ``` fences, or an opened {"command" object whose braces never closed.
  function endsInsideToolBlock(text) {
    const t = String(text || '');
    if (!t.trim()) return false;
    const fences = (t.match(/```/g) || []).length;
    if (fences % 2 === 1) return true;
    const at = t.lastIndexOf('"command"');
    if (at < 0) return false;
    let depth = 0, inStr = false, esc = false, started = false;
    for (let i = t.lastIndexOf('{', at); i >= 0 && i < t.length; i++) {
      const c = t[i];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '{') { depth++; started = true; }
      else if (c === '}') { depth--; if (started && depth === 0) return false; }
    }
    return started && depth > 0;
  }
  // "Edit datamodel is not available in Play mode" and similar: say which datamodel to retry in. Never switches by itself.
  function studioModeHint(errText) {
    const t = String(errText || '');
    if (!/\b(?:not available|unavailable|cannot|can't|isn't|is not)\b[^.\n]{0,60}\b(?:edit|play|run|server|client)\b[^.\n]{0,20}\b(?:mode|datamodel)\b|\b(?:edit|server|client)\s+datamodel\b[^.\n]{0,40}\b(?:not available|unavailable)\b/i.test(t)) return null;
    const inPlay = /\bplay(?:ing)?\s+mode\b|\bis running\b|\bplaytest\b/i.test(t);
    const inEdit = /\bedit\s+mode\b|\bnot (?:in|running) play\b/i.test(t);
    if (inPlay && !inEdit) return { state: 'play', retryIn: 'server', text: 'Studio is in Play mode, so the edit datamodel is not available. Retry the call in the "server" datamodel (or "client" for client-side objects); do not retry it unchanged.' };
    if (inEdit && !inPlay) return { state: 'edit', retryIn: 'edit', text: 'Studio is in Edit mode, so the play datamodels are not running. Retry the call in the "edit" datamodel, or ask the user to press Play first.' };
    return { state: 'unknown', retryIn: null, text: 'Studio says this datamodel is not available right now. Read the Studio state first, then retry in the datamodel that matches it (edit, server or client).' };
  }
  // Reconnect delay after the app goes offline: 1 s, 2 s, 4 s ... capped at 30 s.
  const backoffMs = (attempt, cfg) => { const c = hangConfig(cfg); return Math.min(c.backoffMaxMs, c.backoffStartMs * Math.pow(2, Math.max(0, attempt | 0))); };
  // state: { now, stopVisible, replyText, thinkingText, lastGrowthAt, toolCalls: [{id, startedAt, hasResult}], studioError,
  //   userTyping, confirmOpen, appOffline, offlineAttempt, hasToolCall, replyDone, delivery: { sentAt, composerHoldsText,
  //   newUserTurn, provablyNotTaken }, repeats, tries: { stopContinue, resendBlock, delivery, studioPing, modeHint } }
  function hangDecision(state, over) {
    const s = state || {}, cfg = hangConfig(over), now = s.now || Date.now(), tries = s.tries || {};
    const none = { action: 'none' };
    // Reconnecting and repeated-call stops are about the app / the run, not the user's composer, so they come first
    // and are never blocked by typing.
    if (s.appOffline) return { action: 'reconnect', afterMs: backoffMs(s.offlineAttempt, cfg), line: 'The PlazCode app is not answering. Reconnecting automatically.' };
    if ((s.repeats | 0) >= 3) return { action: 'stop_repeat', line: 'The same command was repeated 3 times in a row. Automatic running stopped; check what is blocking the AI.' };
    if (s.userTyping || s.confirmOpen) return none;
    // The AI is asking the user something with no command: tell the user, never answer for them.
    if (s.replyDone && !s.hasToolCall && s.askingUser) return { action: 'notify_question', line: 'The AI is asking you a question. Nothing was sent for you.' };
    // Studio mode errors: one hint per call.
    if (s.studioError && (tries.modeHint | 0) < cfg.maxTries.modeHint) {
      const hint = studioModeHint(s.studioError);
      if (hint) return { action: 'studio_mode_hint', hint, line: `Studio mode problem. Told the AI to retry in the ${hint.retryIn || 'matching'} datamodel.` };
    }
    // A tool call with no result for too long: ping Studio, mark the call failed, tell the AI.
    const silent = (s.toolCalls || []).find(c => !c.hasResult && now - c.startedAt >= cfg.toolSilentMs);
    if (silent && (tries.studioPing | 0) < cfg.maxTries.studioPing) return { action: 'ping_studio', callId: silent.id, line: 'Studio did not answer a command for 2 minutes. Checking Studio and marking the command failed.' };
    // Reply ended in the middle of a tool block: ask for only that block.
    if (s.replyDone && !s.stopVisible && endsInsideToolBlock(s.replyText) && (tries.resendBlock | 0) < cfg.maxTries.resendBlock) return { action: 'resend_block', text: RESEND_BLOCK_TEXT, line: 'The reply was cut off inside a command. Asked the AI to resend only that command.' };
    // Message not delivered: composer still holds our text, or no new user turn.
    const d = s.delivery;
    if (d && d.sentAt && !d.newUserTurn && now - d.sentAt >= cfg.deliverMs) {
      if ((tries.delivery | 0) >= cfg.maxTries.delivery) return { action: 'tell_user_delivery', line: 'The message could not be delivered after 2 retries. Check the chat.' };
      return { action: 'retry_delivery', refocus: true, clickSend: !!d.provablyNotTaken, line: 'The message did not arrive. Trying again.' };
    }
    // Model never finishes: Stop is up and the reply stopped growing. A reply with NO text yet is a thinking phase and
    // is left alone (ChatGPT Thinking / Claude extended thinking can be quiet for minutes).
    const hasReply = String(s.replyText || '').trim().length > 0;
    if (s.stopVisible && hasReply && s.lastGrowthAt && now - s.lastGrowthAt >= cfg.quietMs && (tries.stopContinue | 0) < cfg.maxTries.stopContinue) return { action: 'stop_and_continue', text: CONTINUE_TEXT, line: 'The AI stopped writing mid-reply. Pressed Stop and asked it to continue.' };
    return none;
  }
  function stop(reason, stalls, limit) {
    return `ERROR: command was not executed. ${reason}` + (stalls >= limit ? ` You have repeated yourself ${stalls} times in a row. Stop calling tools now and tell the user, in one or two sentences, what is blocking you.` : '');
  }
  return { create, isRead, claimsUnsentCommand, hangDecision, hangConfig, endsInsideToolBlock, studioModeHint, backoffMs, HANG_DEFAULTS };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PlazCodeStallGuard;
