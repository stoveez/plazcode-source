// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.24.36/ts/core/task-ledger.ts (TypeScript): edit that file, then run node development/1.24.36/ts/build.cjs.
// Deterministic intent detection (debug > research > explain > plan > implement)
// and persistent per-chat/workspace task ledger for Checklist, Effort Picker hints,
// cross-site Continuation handoff, and compact non-empty context injection.
const PlazCodeTaskLedger = (() => {
  "use strict";

  const STORAGE_KEY = "rsTaskLedgers";
  const MAX_LEDGERS = 25;

  type IntentKind = "debug" | "research" | "explain" | "plan" | "implement";
  type StepEntry = { label: string; status: "pending" | "in_progress" | "done" | "failed" };
  type LedgerRecord = {
    scope: string;
    goal: string;
    intent: IntentKind;
    steps: StepEntry[];
    decisions: string[];
    nextAction: string;
    updatedAt: number;
  };
  type EffortHint = {
    intent: IntentKind;
    suggestedLevel: string;
    label: string;
  };
  type StorageLike = {
    get?: (keys: string | string[], cb?: (res: Record<string, any>) => void) => Promise<Record<string, any>> | void;
    set?: (items: Record<string, any>, cb?: () => void) => Promise<void> | void;
  };

  const INTENT_PATTERNS: Array<[IntentKind, RegExp]> = [
    ["debug", /\b(?:debug|fix|bug|error|broken|fail(?:ing|ed|s)?|crash(?:es|ed|ing)?|traceback|exception|doesn't work|does not work|not working|troubleshoot|diagnose|stack\s*trace|regression)\b/i],
    ["research", /\b(?:find|search|grep|locate|where is|inspect|audit|look up|investigate|explore|list all|check how|compare|which file|which script)\b/i],
    ["explain", /\b(?:explain|what does|why does|how does|summarize|describe|walk me through|clarify|meaning of|what is)\b/i],
    ["plan", /\b(?:plan|design|architect|propose|outline|roadmap|spec|strategy|steps for|before coding|write a plan)\b/i],
  ];

  function classifyIntent(text: unknown): IntentKind {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return "implement";
    for (const [intent, pattern] of INTENT_PATTERNS) {
      if (pattern.test(clean)) return intent;
    }
    return "implement";
  }

  function effortHintForIntent(intent: IntentKind): EffortHint {
    switch (intent) {
      case "debug":
        return { intent, suggestedLevel: "high", label: "Debug (High effort suggested)" };
      case "plan":
        return { intent, suggestedLevel: "high", label: "Plan (High effort suggested)" };
      case "research":
        return { intent, suggestedLevel: "low", label: "Research (Low effort suggested)" };
      case "explain":
        return { intent, suggestedLevel: "low", label: "Explain (Low effort suggested)" };
      default:
        return { intent: "implement", suggestedLevel: "mid", label: "Implement (Mid effort suggested)" };
    }
  }

  function scopeKey(chatKey: unknown, workspaceRoot?: unknown): string {
    const chat = String(chatKey || "").trim();
    const ws = String(workspaceRoot || "").trim().replace(/\\/g, "/").toLowerCase();
    return ws ? `${chat}|${ws}` : chat;
  }

  function normalizeStep(step: unknown): StepEntry | null {
    if (!step || typeof step !== "object") return null;
    const raw = step as Record<string, unknown>;
    const label = String(raw.label || "").replace(/\s+/g, " ").trim().slice(0, 140);
    if (!label) return null;
    const st = String(raw.status || "pending");
    const status = (st === "in_progress" || st === "done" || st === "failed") ? st : "pending";
    return { label, status };
  }

  function normalizeRecord(scope: string, raw: unknown): LedgerRecord | null {
    if (!scope || !raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const goal = String(r.goal || "").replace(/\s+/g, " ").trim().slice(0, 220);
    const intent = (["debug", "research", "explain", "plan", "implement"].includes(String(r.intent))
      ? String(r.intent)
      : classifyIntent(goal)) as IntentKind;
    const steps = Array.isArray(r.steps) ? r.steps.map(normalizeStep).filter(Boolean).slice(0, 12) as StepEntry[] : [];
    const decisions = Array.isArray(r.decisions)
      ? r.decisions.map((d) => String(d || "").replace(/\s+/g, " ").trim().slice(0, 140)).filter(Boolean).slice(-8)
      : [];
    const nextAction = String(r.nextAction || "").replace(/\s+/g, " ").trim().slice(0, 160);
    if (!goal && !steps.length && !decisions.length && !nextAction) return null;
    return {
      scope,
      goal,
      intent,
      steps,
      decisions,
      nextAction,
      updatedAt: Number(r.updatedAt) || Date.now(),
    };
  }

  function createStore(storage?: StorageLike | null, now = () => Date.now()) {
    const records = new Map<string, LedgerRecord>();
    let loaded = false;

    function prune(): void {
      if (records.size <= MAX_LEDGERS) return;
      const ordered = [...records.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
      while (ordered.length > MAX_LEDGERS) {
        const oldest = ordered.shift();
        if (oldest) records.delete(oldest[0]);
      }
    }

    async function load(): Promise<void> {
      if (loaded || !storage || typeof storage.get !== "function") {
        loaded = true;
        return;
      }
      loaded = true;
      try {
        const res = await new Promise<Record<string, any>>((resolve) => {
          let done = false;
          const finish = (v: any) => { if (!done) { done = true; resolve(v && typeof v === "object" ? v : {}); } };
          const maybe = storage.get!(STORAGE_KEY, finish);
          if (maybe && typeof (maybe as Promise<any>).then === "function") {
            (maybe as Promise<any>).then(finish, () => finish({}));
          }
        });
        const saved = res && res[STORAGE_KEY];
        if (saved && typeof saved === "object") {
          for (const [key, val] of Object.entries(saved)) {
            const norm = normalizeRecord(key, val);
            if (norm) records.set(key, norm);
          }
          prune();
        }
      } catch {
        // Ignore storage read errors in restricted contexts.
      }
    }

    function persist(): void {
      if (!storage || typeof storage.set !== "function") return;
      try {
        const out: Record<string, LedgerRecord> = {};
        for (const [k, v] of records.entries()) out[k] = v;
        const maybe = storage.set({ [STORAGE_KEY]: out });
        if (maybe && typeof (maybe as Promise<any>).catch === "function") (maybe as Promise<any>).catch(() => {});
      } catch {
        // Ignore storage write errors.
      }
    }

    function get(scope: string): LedgerRecord | null {
      return records.get(scope) || null;
    }

    function upsert(scope: string, patch: Partial<LedgerRecord>): LedgerRecord | null {
      if (!scope) return null;
      const prev = records.get(scope) || {
        scope,
        goal: "",
        intent: "implement" as IntentKind,
        steps: [],
        decisions: [],
        nextAction: "",
        updatedAt: now(),
      };
      const merged: LedgerRecord = {
        scope,
        goal: patch.goal !== undefined ? String(patch.goal || "").replace(/\s+/g, " ").trim().slice(0, 220) : prev.goal,
        intent: patch.intent || (patch.goal !== undefined ? classifyIntent(patch.goal) : prev.intent),
        steps: patch.steps !== undefined ? patch.steps.map(normalizeStep).filter(Boolean).slice(0, 12) as StepEntry[] : prev.steps,
        decisions: patch.decisions !== undefined
          ? patch.decisions.map((d) => String(d || "").replace(/\s+/g, " ").trim().slice(0, 140)).filter(Boolean).slice(-8)
          : prev.decisions,
        nextAction: patch.nextAction !== undefined ? String(patch.nextAction || "").replace(/\s+/g, " ").trim().slice(0, 160) : prev.nextAction,
        updatedAt: now(),
      };
      const clean = normalizeRecord(scope, merged);
      if (!clean) {
        records.delete(scope);
        persist();
        return null;
      }
      records.set(scope, clean);
      prune();
      persist();
      return clean;
    }

    function setGoal(scope: string, goal: string, explicitIntent?: IntentKind): LedgerRecord | null {
      const cleanGoal = String(goal || "").replace(/\s+/g, " ").trim().slice(0, 220);
      if (!scope || !cleanGoal) return get(scope);
      const intent = explicitIntent || classifyIntent(cleanGoal);
      return upsert(scope, { goal: cleanGoal, intent });
    }

    function recordStep(scope: string, label: string, status: StepEntry["status"] = "in_progress"): LedgerRecord | null {
      const clean = String(label || "").replace(/\s+/g, " ").trim().slice(0, 140);
      if (!scope || !clean) return get(scope);
      const prev = get(scope);
      const steps = prev ? prev.steps.slice() : [];
      const existing = steps.find((s) => s.label.toLowerCase() === clean.toLowerCase());
      if (existing) existing.status = status;
      else steps.push({ label: clean, status });
      return upsert(scope, { steps: steps.slice(-12) });
    }

    function recordDecision(scope: string, decision: string): LedgerRecord | null {
      const clean = String(decision || "").replace(/\s+/g, " ").trim().slice(0, 140);
      if (!scope || !clean) return get(scope);
      const prev = get(scope);
      const decisions = prev ? prev.decisions.filter((d) => d !== clean) : [];
      decisions.push(clean);
      return upsert(scope, { decisions: decisions.slice(-8) });
    }

    function setNextAction(scope: string, nextAction: string): LedgerRecord | null {
      return upsert(scope, { nextAction });
    }

    function clear(scope: string): void {
      if (!scope) return;
      records.delete(scope);
      persist();
    }

    function formatCompactContext(scope: string): string {
      const rec = get(scope);
      if (!rec) return "";
      const parts: string[] = [];
      parts.push(`intent=${rec.intent}`);
      if (rec.goal) parts.push(`goal=${rec.goal.slice(0, 110)}`);
      if (rec.steps.length) {
        const done = rec.steps.filter((s) => s.status === "done").length;
        const active = rec.steps.find((s) => s.status === "in_progress") || rec.steps[rec.steps.length - 1];
        parts.push(`steps=${done}/${rec.steps.length}${active ? ` (${active.label.slice(0, 50)})` : ""}`);
      }
      if (rec.decisions.length) {
        parts.push(`decisions=${rec.decisions.slice(-2).join("; ").slice(0, 110)}`);
      }
      if (rec.nextAction) parts.push(`next=${rec.nextAction.slice(0, 90)}`);
      return `[TASK_LEDGER: ${parts.join(" | ")}]`;
    }

    function exportHandoff(scope: string): LedgerRecord | null {
      const rec = get(scope);
      return rec ? JSON.parse(JSON.stringify(rec)) : null;
    }

    function importHandoff(scope: string, raw: unknown): LedgerRecord | null {
      const norm = normalizeRecord(scope, raw);
      if (!norm) return null;
      records.set(scope, { ...norm, updatedAt: now() });
      prune();
      persist();
      return records.get(scope) || null;
    }

    return {
      load,
      get,
      upsert,
      setGoal,
      recordStep,
      recordDecision,
      setNextAction,
      clear,
      formatCompactContext,
      exportHandoff,
      importHandoff,
    };
  }

  return {
    STORAGE_KEY,
    classifyIntent,
    effortHintForIntent,
    scopeKey,
    createStore,
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodeTaskLedger;
