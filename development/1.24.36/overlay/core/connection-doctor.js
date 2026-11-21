// PlazCode connection doctor: "Fix connection" checks, safe automatic fixes and
// plain-language next steps. Pure logic; the bar supplies a status snapshot and
// the actions it may take. It never sends anything to the AI chat by itself:
// connecting a chat (Start/Restart Agent) always needs the user's click.
const PlazCodeConnectionDoctor = (() => {
  const tr = (text, values) => {
    try { if (globalThis.PlazCodeI18n) return globalThis.PlazCodeI18n.t(text, values); } catch {}
    return values ? String(text).replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m)) : String(text);
  };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  // Engine readiness from a bridge status object (the same fields the bar reads).
  function engineState(status, engine) {
    const s = status || {};
    if (engine === "local") return { ok: s.local_connected === true || (s.servers || []).some(x => x.id === "local" && x.alive), studioOpen: true, checking: false };
    return {
      ok: s.roblox_connected === true,
      checking: s.studio_checking === true,
      studioOpen: s.studioProc === true,
      mcpAnswered: s.studioApp === true,   // MCP answered but no place is loaded
      mcpOff: s.studioApp === false,
      other: (s.servers || []).some(x => x.id !== "roblox" && x.alive && (x.tools || 0) > 0),
    };
  }

  async function waitUntil(test, refresh, timeoutMs, stepMs) {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const status = await refresh();
      if (test(status)) return status;
      if (Date.now() >= end) return status;
      await sleep(stepMs);
    }
  }

  // ctx: { stale, engine, status, chatConnected, chatAction ("start"|"restart"|""), composer() }
  // act: { status(), reconnect(), restartMcp() }
  // opts: { bridgeWaitMs, mcpWaitMs, stepMs, onStep(step), passive }  (passive = background re-check: no restarts, no progress rows)
  async function run(ctx, act, opts = {}) {
    const steps = [], push = step => { steps.push(step); try { opts.onStep && opts.onStep(step, steps); } catch {} return step; };
    const stepMs = opts.stepMs ?? 1000, done = action => ({ steps, action: action || "" });
    const engine = ctx.engine === "local" ? "local" : "roblox";
    const tool = engine === "local" ? "AgentScript" : "Roblox Studio";

    // 1. The extension on this page must still be the live one.
    if (ctx.stale) {
      push({ id: "extension", state: "action", text: tr("This page is running an old copy of PlazCode. Refresh the page."), action: "reload" });
      return done("reload");
    }
    push({ id: "extension", state: "ok", text: tr("PlazCode is running on this page.") });

    // 2. The PlazCode desktop app must be reachable.
    let status = ctx.status || {};
    if (!status.connected) {
      if (!opts.passive) push({ id: "app", state: "working", text: tr("Reconnecting to the PlazCode app…") });
      try { await act.reconnect(); } catch {}
      status = await waitUntil(s => !!(s && s.connected), act.status, opts.bridgeWaitMs ?? 10000, stepMs) || {};
      if (!status.connected) {
        // Only an explicit HTTP 401/403 from the app is a refusal. "Failed to fetch",
        // timeouts and aborted requests just mean the app is not running.
        const pairing = /\bHTTP 40[13]\b/.test(String(status.bridge_error || ""));
        if (!opts.passive) steps.pop();
        push({ id: "app", state: "action", text: pairing
          ? tr("The PlazCode app refused this browser. Close and reopen the PlazCode app, then click Fix connection again.")
          : tr("The PlazCode app isn't running. Open PlazCode on your computer, then click Fix connection again."),
          detail: String(status.bridge_error || "").replace(/\s+/g, " ").slice(0, 240) });
        return done("");
      }
      if (!opts.passive) steps.pop();
      push({ id: "app", state: "fixed", text: tr("Reconnected to the PlazCode app.") });
    } else {
      push({ id: "app", state: "ok", text: tr("The PlazCode app is connected.") });
    }

    // 3. The tool app (Roblox Studio or AgentScript) must be connected.
    let eng = engineState(status, engine);
    if (!eng.ok && eng.checking) {
      status = await waitUntil(s => { const e = engineState(s, engine); return e.ok || !e.checking; }, act.status, opts.mcpWaitMs ?? 15000, stepMs) || status;
      eng = engineState(status, engine);
    }
    if (!eng.ok && engine === "roblox" && eng.studioOpen && eng.mcpOff && !opts.passive) {
      // Studio is open but its connection died: restart it once.
      push({ id: "engine", state: "working", text: tr("Restarting the connection to {tool}…", { tool }) });
      try { await act.restartMcp(); } catch {}
      status = await waitUntil(s => engineState(s, engine).ok, act.status, opts.mcpWaitMs ?? 15000, stepMs) || status;
      eng = engineState(status, engine);
      steps.pop();
      if (eng.ok) push({ id: "engine", state: "fixed", text: tr("Reconnected to {tool}.", { tool }) });
    }
    if (eng.ok) {
      if (!steps.some(x => x.id === "engine")) push({ id: "engine", state: "ok", text: tr("{tool} is connected.", { tool }) });
    } else {
      let text;
      if (engine === "local") text = tr("AgentScript isn't ready. Close and reopen the PlazCode app.");
      else if (!eng.studioOpen) text = tr("Open Roblox Studio.");
      else if (eng.mcpAnswered) text = tr("Open a place in Roblox Studio.");
      else text = tr("In Roblox Studio, open Assistant Settings > MCP Servers and turn the server on.");
      push({ id: "engine", state: "action", text: eng.other ? text + " " + tr("You can also start with your other connected tool.") : text });
      if (!eng.other) return done("");
    }

    // 4. This page must have a usable AI chat box.
    let composer = { ready: true };
    try { composer = (await ctx.composer()) || { ready: false }; } catch { composer = { ready: false }; }
    if (!composer.ready) {
      push({ id: "chat-box", state: "action", text: composer.detail ? String(composer.detail) : tr("PlazCode can't find the chat box on this page. Open an AI chat on this site.") });
      return done("");
    }
    push({ id: "chat-box", state: "ok", text: tr("The chat box on this page is ready.") });

    // 5. PlazCode must be connected to THIS chat. Never done automatically.
    if (ctx.chatConnected) {
      push({ id: "chat", state: "ok", text: tr("PlazCode is connected to this chat.") });
      return done("");
    }
    const action = ctx.chatAction === "start" ? "start" : "restart";
    push({ id: "chat", state: "action", text: tr("PlazCode isn't connected to this chat yet. Click Connect this chat."), action });
    return done(action);
  }

  return { run, engineState };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodeConnectionDoctor;
