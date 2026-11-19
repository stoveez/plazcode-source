// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.24.34/ts/core/run-recovery.ts (TypeScript): edit that file, then run node development/1.24.34/ts/build.cjs.
// Persists active-run state across accidental tab reloads or crashes so PlazCode can show a clean
// "Resume / Start fresh" prompt without silently re-running tools or losing finished step outputs.
const PlazCodeRunRecovery = (() => {
  const STORAGE_KEY = "rsRunRecoveryMap";
  const SESSION_KEY = "rsRunRecovery";
  const MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const MAX_RECORDS = 24;
  const MAX_TURNS = 60;
  const MAX_FEEDBACK_CHARS = 12000;

  interface CompletedTurn {
    turnKey: string;
    prefix: string;
  }

  interface PendingFeedback {
    text: string;
    at: number;
    afterAssistantId: string;
  }

  interface RecoveryRecord {
    key: string;
    provider: string;
    chat: string;
    engine: string;
    active: boolean;
    phase: string;
    lastGoal: string;
    lastStep: string;
    stepsDone: number;
    completedTurns: CompletedTurn[];
    completedToolIds: string[];
    pendingFeedback: PendingFeedback | null;
    lastAssistantId: string;
    startedAt: number;
    updatedAt: number;
  }

  interface RecoveryDomState {
    lastAssistantId?: string;
    hasFeedbackAfterLastAssistant?: boolean;
    hasUnrunToolOnLastAssistant?: boolean;
    lastAssistantTurnKey?: string;
    lastAssistantText?: string;
  }

  const cleanStr = (v: any, max = 240): string => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);

  function makeKey(provider: string, chat: string): string {
    const p = String(provider || "").trim();
    const c = String(chat || "").trim();
    return p && c ? `${p}|${c}` : "";
  }

  function pruneMap(map: Record<string, RecoveryRecord> | null | undefined, now = Date.now()): Record<string, RecoveryRecord> {
    const out: Record<string, RecoveryRecord> = {};
    if (!map || typeof map !== "object") return out;
    const entries = Object.entries(map)
      .filter(([k, rec]) => !!k && !!rec && typeof rec === "object" && rec.active === true &&
        Number.isFinite(rec.updatedAt) && now - rec.updatedAt < MAX_AGE_MS && !!rec.provider && !!rec.chat)
      .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
      .slice(0, MAX_RECORDS);
    for (const [k, rec] of entries) out[k] = rec;
    return out;
  }

  function beginRun(
    prev: RecoveryRecord | null | undefined,
    opts: { provider: string; chat: string; engine?: string; lastGoal?: string; lastAssistantId?: string; now?: number }
  ): RecoveryRecord | null {
    const key = makeKey(opts.provider, opts.chat);
    if (!key) return null;
    const now = opts.now ?? Date.now();
    const samePrev = prev && prev.key === key ? prev : null;
    return {
      key,
      provider: String(opts.provider),
      chat: String(opts.chat),
      engine: String(opts.engine || samePrev?.engine || ""),
      active: true,
      phase: "thinking",
      lastGoal: cleanStr(opts.lastGoal || samePrev?.lastGoal || "", 200),
      lastStep: cleanStr(samePrev?.lastStep || "", 160),
      stepsDone: Number.isFinite(samePrev?.stepsDone) ? (samePrev as RecoveryRecord).stepsDone : 0,
      completedTurns: Array.isArray(samePrev?.completedTurns) ? samePrev.completedTurns.slice(-MAX_TURNS) : [],
      completedToolIds: Array.isArray(samePrev?.completedToolIds) ? samePrev.completedToolIds.slice(-MAX_TURNS) : [],
      pendingFeedback: samePrev?.pendingFeedback || null,
      lastAssistantId: String(opts.lastAssistantId || samePrev?.lastAssistantId || ""),
      startedAt: samePrev?.startedAt || now,
      updatedAt: now,
    };
  }

  function recordToolStart(
    rec: RecoveryRecord | null | undefined,
    opts: { tool: string; arg?: string; turnKey?: string; turnPrefix?: string; lastAssistantId?: string; now?: number }
  ): RecoveryRecord | null {
    if (!rec) return null;
    const now = opts.now ?? Date.now();
    const turns = Array.isArray(rec.completedTurns) ? rec.completedTurns.slice(-MAX_TURNS) : [];
    const tk = String(opts.turnKey || "").trim();
    const pref = String(opts.turnPrefix || "").slice(0, 60);
    if (tk && pref.trim().length >= 12 && !turns.some(t => t.turnKey === tk && t.prefix === pref)) {
      turns.push({ turnKey: tk, prefix: pref });
    }
    const toolIds = Array.isArray(rec.completedToolIds) ? rec.completedToolIds.slice(-MAX_TURNS) : [];
    const fp = `${String(opts.tool || "")}|${tk}|${pref.slice(0, 32)}`;
    if (opts.tool && !toolIds.includes(fp)) toolIds.push(fp);
    const label = opts.arg ? `${opts.tool} (${cleanStr(opts.arg, 80)})` : String(opts.tool || "");
    return {
      ...rec,
      active: true,
      phase: "running_tool",
      lastStep: cleanStr(label, 160) || rec.lastStep,
      completedTurns: turns.slice(-MAX_TURNS),
      completedToolIds: toolIds.slice(-MAX_TURNS),
      pendingFeedback: null,
      lastAssistantId: String(opts.lastAssistantId || rec.lastAssistantId || ""),
      updatedAt: now,
    };
  }

  function recordToolDone(
    rec: RecoveryRecord | null | undefined,
    opts: { tool: string; ok?: boolean; summary?: string; pendingFeedbackText?: string; afterAssistantId?: string; now?: number }
  ): RecoveryRecord | null {
    if (!rec) return null;
    const now = opts.now ?? Date.now();
    const feedbackText = typeof opts.pendingFeedbackText === "string" && opts.pendingFeedbackText.trim()
      ? opts.pendingFeedbackText.slice(0, MAX_FEEDBACK_CHARS) : "";
    const detail = opts.summary ? `${opts.tool}: ${cleanStr(opts.summary, 90)}` : String(opts.tool || "");
    return {
      ...rec,
      active: true,
      phase: feedbackText ? "sending_result" : "waiting_reply",
      lastStep: cleanStr(detail, 160) || rec.lastStep,
      stepsDone: (rec.stepsDone || 0) + 1,
      pendingFeedback: feedbackText ? { text: feedbackText, at: now, afterAssistantId: String(opts.afterAssistantId || rec.lastAssistantId || "") } : null,
      lastAssistantId: String(opts.afterAssistantId || rec.lastAssistantId || ""),
      updatedAt: now,
    };
  }

  function recordFeedbackSent(
    rec: RecoveryRecord | null | undefined,
    opts: { lastAssistantId?: string; now?: number } = {}
  ): RecoveryRecord | null {
    if (!rec) return null;
    return {
      ...rec,
      active: true,
      phase: "waiting_reply",
      pendingFeedback: null,
      lastAssistantId: String(opts.lastAssistantId || rec.lastAssistantId || ""),
      updatedAt: opts.now ?? Date.now(),
    };
  }

  function canOfferRecovery(
    rec: RecoveryRecord | null | undefined,
    opts: { provider: string; chat: string; now?: number; running?: boolean; starting?: boolean }
  ): boolean {
    if (!rec || rec.active !== true || opts.running || opts.starting) return false;
    const key = makeKey(opts.provider, opts.chat);
    if (!key || rec.key !== key) return false;
    const now = opts.now ?? Date.now();
    return Number.isFinite(rec.updatedAt) && now - rec.updatedAt < MAX_AGE_MS;
  }

  function turnAlreadyCompleted(rec: RecoveryRecord | null | undefined, turnKey: string, text: string): boolean {
    if (!rec || !Array.isArray(rec.completedTurns) || !turnKey) return false;
    const body = String(text || "");
    return rec.completedTurns.some(t => t.turnKey === turnKey && !!t.prefix && body.startsWith(t.prefix));
  }

  function buildContinuePrompt(rec: RecoveryRecord): string {
    const bits: string[] = [];
    if (rec.stepsDone > 0) bits.push(`${rec.stepsDone} step${rec.stepsDone === 1 ? "" : "s"} already finished`);
    if (rec.lastStep) bits.push(`last step: ${rec.lastStep}`);
    const context = bits.length ? ` (${bits.join("; ")})` : "";
    const midTool = rec.phase === "running_tool"
      ? " A command was in progress when the tab reloaded, so inspect current state before repeating any change."
      : "";
    return `(System note: The chat tab reloaded while this run was active${context}.${midTool} Continue the remaining work from here. Do not repeat already-completed commands. If the requested work is already finished, summarize what was done.)`;
  }

  function decideResume(rec: RecoveryRecord, dom: RecoveryDomState = {}) {
    const restoreTurns = Array.isArray(rec.completedTurns) ? rec.completedTurns.slice() : [];
    const pending = rec.pendingFeedback && typeof rec.pendingFeedback.text === "string" && rec.pendingFeedback.text.trim()
      ? rec.pendingFeedback : null;
    // Case 1: a tool already finished locally before the crash/reload, and its result never landed in the chat.
    if (pending && !dom.hasFeedbackAfterLastAssistant) {
      return {
        mode: "deliver_pending_feedback" as const,
        text: pending.text,
        restoreTurns,
      };
    }
    // Case 2: the latest assistant turn has a valid command that was NEVER dispatched before the reload.
    if (dom.hasUnrunToolOnLastAssistant && !dom.hasFeedbackAfterLastAssistant &&
        !turnAlreadyCompleted(rec, String(dom.lastAssistantTurnKey || ""), String(dom.lastAssistantText || ""))) {
      return {
        mode: "run_unexecuted_turn" as const,
        text: "",
        restoreTurns,
      };
    }
    // Case 3: default safe resume — never re-run an already-dispatched tool; tell the AI to continue from here.
    return {
      mode: "nudge_continue" as const,
      text: buildContinuePrompt(rec),
      restoreTurns,
    };
  }

  function createStore(adapter?: {
    getLocal?: () => Promise<Record<string, RecoveryRecord>>;
    setLocal?: (map: Record<string, RecoveryRecord>) => Promise<void>;
    getSession?: () => Record<string, RecoveryRecord> | null;
    setSession?: (map: Record<string, RecoveryRecord>) => void;
  }) {
    const hasChrome = typeof chrome !== "undefined" && !!chrome?.storage?.local;
    const getLocal = adapter?.getLocal || (async () => {
      if (!hasChrome) return {};
      try {
        const res = await new Promise<any>(resolve => chrome.storage.local.get(STORAGE_KEY, resolve));
        return (res && res[STORAGE_KEY]) || {};
      } catch { return {}; }
    });
    const setLocal = adapter?.setLocal || (async (map: Record<string, RecoveryRecord>) => {
      if (!hasChrome) return;
      try { await new Promise<void>(resolve => chrome.storage.local.set({ [STORAGE_KEY]: map }, () => resolve())); } catch {}
    });
    const getSession = adapter?.getSession || (() => {
      try {
        if (typeof sessionStorage === "undefined") return null;
        const raw = sessionStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    });
    const setSession = adapter?.setSession || ((map: Record<string, RecoveryRecord>) => {
      try { if (typeof sessionStorage !== "undefined") sessionStorage.setItem(SESSION_KEY, JSON.stringify(map)); } catch {}
    });

    let cache: Record<string, RecoveryRecord> = pruneMap(getSession());
    let loaded = false;

    async function load(now = Date.now()): Promise<Record<string, RecoveryRecord>> {
      const fromLocal = pruneMap(await getLocal(), now);
      const fromSess = pruneMap(getSession(), now);
      const merged: Record<string, RecoveryRecord> = { ...fromLocal };
      for (const [k, rec] of Object.entries(fromSess)) {
        if (!merged[k] || (rec.updatedAt || 0) >= (merged[k].updatedAt || 0)) merged[k] = rec;
      }
      cache = pruneMap(merged, now);
      loaded = true;
      setSession(cache);
      return cache;
    }

    function getSync(provider: string, chat: string, now = Date.now()): RecoveryRecord | null {
      const key = makeKey(provider, chat);
      if (!key) return null;
      cache = pruneMap(cache, now);
      return cache[key] || null;
    }

    async function get(provider: string, chat: string, now = Date.now()): Promise<RecoveryRecord | null> {
      if (!loaded) await load(now);
      return getSync(provider, chat, now);
    }

    async function save(rec: RecoveryRecord | null, now = Date.now()): Promise<void> {
      if (!rec || !rec.key) return;
      cache = pruneMap({ ...cache, [rec.key]: rec }, now);
      setSession(cache);
      await setLocal(cache);
    }

    async function clear(provider: string, chat: string, now = Date.now()): Promise<void> {
      const key = makeKey(provider, chat);
      if (!key) return;
      if (!loaded) await load(now);
      if (!cache[key]) return;
      const next = { ...cache };
      delete next[key];
      cache = pruneMap(next, now);
      setSession(cache);
      await setLocal(cache);
    }

    return { load, getSync, get, save, clear };
  }

  return {
    STORAGE_KEY,
    SESSION_KEY,
    MAX_AGE_MS,
    makeKey,
    pruneMap,
    beginRun,
    recordToolStart,
    recordToolDone,
    recordFeedbackSent,
    canOfferRecovery,
    turnAlreadyCompleted,
    buildContinuePrompt,
    decideResume,
    createStore,
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodeRunRecovery;
