// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.25.0/ts/core/connection-doctor.ts (TypeScript): edit that file, then run node development/1.25.0/ts/build.cjs.
// PlazCode connection doctor: "Fix connection" checks, safe automatic fixes and
// plain-language next steps. Pure logic; the bar supplies a status snapshot and
// the actions it may take. It never sends anything to the AI chat by itself:
// connecting a chat (Start/Restart Agent) always needs the user's click.
const PlazCodeConnectionDoctor = (() => {
  type ServerInfo = { id?: string; alive?: boolean; tools?: number };
  type StatusSnapshot = {
    connected?: boolean;
    bridge_error?: string;
    local_connected?: boolean;
    roblox_connected?: boolean;
    studio_checking?: boolean;
    studioProc?: boolean;
    studioApp?: boolean;
    servers?: ServerInfo[];
  };
  type DoctorStep = { id: string; state: string; text: string; action?: string; detail?: string };
  type DoctorCtx = {
    stale?: boolean;
    engine?: string;
    status?: StatusSnapshot | null;
    chatConnected?: boolean;
    chatAction?: string;
    composer: () => Promise<{ ready?: boolean; detail?: string } | null | undefined>;
  };
  type DoctorAct = {
    status: () => Promise<StatusSnapshot | null | undefined>;
    reconnect: () => Promise<unknown>;
    restartMcp: () => Promise<unknown>;
  };
  type DoctorOpts = {
    bridgeWaitMs?: number;
    mcpWaitMs?: number;
    stepMs?: number;
    onStep?: (step: DoctorStep, steps: DoctorStep[]) => void;
    passive?: boolean;
  };
  type I18nApi = { t(text: string, values?: Record<string, unknown>): string };
  const tr = (text: string, values?: Record<string, unknown>): string => {
    try { const i18n = (globalThis as { PlazCodeI18n?: I18nApi }).PlazCodeI18n; if (i18n) return i18n.t(text, values); } catch {}
    return values ? String(text).replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m)) : String(text);
  };
  const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

  // Engine readiness from a bridge status object (the same fields the bar reads).
  function engineState(status: StatusSnapshot | null | undefined, engine: string) {
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

  async function waitUntil(test: (status: StatusSnapshot | null | undefined) => boolean, refresh: () => Promise<StatusSnapshot | null | undefined>, timeoutMs: number, stepMs: number) {
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
  async function run(ctx: DoctorCtx, act: DoctorAct, opts: DoctorOpts = {}) {
    const steps: DoctorStep[] = [], push = (step: DoctorStep) => { steps.push(step); try { opts.onStep && opts.onStep(step, steps); } catch {} return step; };
    const stepMs = opts.stepMs ?? 1000, done = (action?: string) => ({ steps, action: action || "" });
    const engine = ctx.engine === "local" ? "local" : "roblox";
    const tool = engine === "local" ? "AgentScript" : "Roblox Studio";

    // 1. The extension on this page must still be the live one.
    if (ctx.stale) {
      push({ id: "extension", state: "action", text: tr("This page is running an old copy of PlazCode. Refresh the page."), action: "reload" });
      return done("reload");
    }
    push({ id: "extension", state: "ok", text: tr("PlazCode is running on this page.") });

    // 2. The PlazCode desktop app must be reachable.
    let status: StatusSnapshot = ctx.status || {};
    if (!status.connected) {
      if (!opts.passive) push({ id: "app", state: "working", text: tr("Reconnecting to the PlazCode app…") });
      try { await act.reconnect(); } catch {}
      status = await waitUntil(s => !!(s && s.connected), act.status, opts.bridgeWaitMs ?? 10000, stepMs) || {};
      if (!status.connected) {
        // Distinguish: (1) unofficial/wrong unpacked folder, (2) browser blocking localhost/local network access,
        // (3) HTTP 401/403 pairing refusal, vs (4) app not running ("Failed to fetch" / timeout).
        const rawErr = String(status.bridge_error || "");
        const unofficial = /not the official one|PlazCode-Extension folder/i.test(rawErr);
        const blocked = /Site access to localhost|Local network access is blocked/i.test(rawErr);
        const pairing = /\bHTTP 40[13]\b/.test(rawErr);
        if (!opts.passive) steps.pop();
        push({ id: "app", state: "action", text: unofficial
          ? tr("This browser loaded PlazCode from another folder. Remove this copy in Extensions and load PlazCode-Extension from your PlazCode app folder.")
          : blocked
          ? tr("This browser blocked PlazCode from reaching the local app. Allow Local network access and localhost site access for PlazCode in browser settings, then click Fix connection again.")
          : pairing
          ? tr("The PlazCode app refused this browser. Close and reopen the PlazCode app, then click Fix connection again.")
          : tr("The PlazCode app isn't running. Open PlazCode on your computer, then click Fix connection again."),
          detail: rawErr.replace(/\s+/g, " ").slice(0, 240) });
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
      let text: string;
      if (engine === "local") text = tr("AgentScript isn't ready. Close and reopen the PlazCode app.");
      else if (!eng.studioOpen) text = tr("Open Roblox Studio.");
      else if (eng.mcpAnswered) text = tr("Open a place in Roblox Studio.");
      else text = tr("In Roblox Studio, open Assistant Settings > MCP Servers and turn the server on.");
      push({ id: "engine", state: "action", text: eng.other ? text + " " + tr("You can also start with your other connected tool.") : text });
      if (!eng.other) return done("");
    }

    // 4. This page must have a usable AI chat box.
    let composer: { ready?: boolean; detail?: string } = { ready: true };
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
