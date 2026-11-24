// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.25.0/ts/core/task-ledger.ts (TypeScript): edit that file, then run node development/1.25.0/ts/build.cjs.
// Deterministic intent detection (debug > research > explain > plan > implement)
// and persistent per-chat/workspace task ledger for Checklist, Effort Picker hints,
// cross-site Continuation handoff, and compact non-empty context injection.
const PlazCodeTaskLedger = (() => {
  "use strict";

  const STORAGE_KEY = "rsTaskLedgers";
  const MAX_LEDGERS = 25;

  ;
  ;
  ;








  ;




  ;




  const INTENT_PATTERNS = [
    ["debug", /\b(?:debug|fix|bug|error|broken|fail(?:ing|ed|s)?|crash(?:es|ed|ing)?|traceback|exception|doesn't work|does not work|not working|troubleshoot|diagnose|stack\s*trace|regression)\b/i],
    ["research", /\b(?:find|search|grep|locate|where is|inspect|audit|look up|investigate|explore|list all|check how|compare|which file|which script)\b/i],
    ["explain", /\b(?:explain|what does|why does|how does|summarize|describe|walk me through|clarify|meaning of|what is)\b/i],
    ["plan", /\b(?:plan|design|architect|propose|outline|roadmap|spec|strategy|steps for|before coding|write a plan)\b/i],
  ];

  function classifyIntent(text) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return "implement";
    for (const [intent, pattern] of INTENT_PATTERNS) {
      if (pattern.test(clean)) return intent;
    }
    return "implement";
  }

  function effortHintForIntent(intent) {
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

  function scopeKey(chatKey, workspaceRoot) {
    const chat = String(chatKey || "").trim();
    const ws = String(workspaceRoot || "").trim().replace(/\\/g, "/").toLowerCase();
    return ws ? `${chat}|${ws}` : chat;
  }

  function normalizeStep(step) {
    if (!step || typeof step !== "object") return null;
    const raw = step;
    const label = String(raw.label || "").replace(/\s+/g, " ").trim().slice(0, 140);
    if (!label) return null;
    const st = String(raw.status || "pending");
    const status = (st === "in_progress" || st === "done" || st === "failed") ? st : "pending";
    return { label, status };
  }

  function normalizeRecord(scope, raw) {
    if (!scope || !raw || typeof raw !== "object") return null;
    const r = raw;
    const goal = String(r.goal || "").replace(/\s+/g, " ").trim().slice(0, 220);
    const intent = (["debug", "research", "explain", "plan", "implement"].includes(String(r.intent))
      ? String(r.intent)
      : classifyIntent(goal));
    const steps = Array.isArray(r.steps) ? r.steps.map(normalizeStep).filter(Boolean).slice(0, 12) : [];
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

  function createStore(storage, now = () => Date.now()) {
    const records = new Map();
    let loaded = false;

    function prune() {
      if (records.size <= MAX_LEDGERS) return;
      const ordered = [...records.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
      while (ordered.length > MAX_LEDGERS) {
        const oldest = ordered.shift();
        if (oldest) records.delete(oldest[0]);
      }
    }

    async function load() {
      if (loaded || !storage || typeof storage.get !== "function") {
        loaded = true;
        return;
      }
      loaded = true;
      try {
        const res = await new Promise((resolve) => {
          let done = false;
          const finish = (v) => { if (!done) { done = true; resolve(v && typeof v === "object" ? v : {}); } };
          const maybe = storage.get(STORAGE_KEY, finish);
          if (maybe && typeof (maybe).then === "function") {
            (maybe).then(finish, () => finish({}));
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

    function persist() {
      if (!storage || typeof storage.set !== "function") return;
      try {
        const out = {};
        for (const [k, v] of records.entries()) out[k] = v;
        const maybe = storage.set({ [STORAGE_KEY]: out });
        if (maybe && typeof (maybe).catch === "function") (maybe).catch(() => {});
      } catch {
        // Ignore storage write errors.
      }
    }

    function get(scope) {
      return records.get(scope) || null;
    }

    function upsert(scope, patch) {
      if (!scope) return null;
      const prev = records.get(scope) || {
        scope,
        goal: "",
        intent: "implement",
        steps: [],
        decisions: [],
        nextAction: "",
        updatedAt: now(),
      };
      const merged = {
        scope,
        goal: patch.goal !== undefined ? String(patch.goal || "").replace(/\s+/g, " ").trim().slice(0, 220) : prev.goal,
        intent: patch.intent || (patch.goal !== undefined ? classifyIntent(patch.goal) : prev.intent),
        steps: patch.steps !== undefined ? patch.steps.map(normalizeStep).filter(Boolean).slice(0, 12) : prev.steps,
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

    function setGoal(scope, goal, explicitIntent) {
      const cleanGoal = String(goal || "").replace(/\s+/g, " ").trim().slice(0, 220);
      if (!scope || !cleanGoal) return get(scope);
      const intent = explicitIntent || classifyIntent(cleanGoal);
      return upsert(scope, { goal: cleanGoal, intent });
    }

    function recordStep(scope, label, status = "in_progress") {
      const clean = String(label || "").replace(/\s+/g, " ").trim().slice(0, 140);
      if (!scope || !clean) return get(scope);
      const prev = get(scope);
      const steps = prev ? prev.steps.slice() : [];
      const existing = steps.find((s) => s.label.toLowerCase() === clean.toLowerCase());
      if (existing) existing.status = status;
      else steps.push({ label: clean, status });
      return upsert(scope, { steps: steps.slice(-12) });
    }

    function recordDecision(scope, decision) {
      const clean = String(decision || "").replace(/\s+/g, " ").trim().slice(0, 140);
      if (!scope || !clean) return get(scope);
      const prev = get(scope);
      const decisions = prev ? prev.decisions.filter((d) => d !== clean) : [];
      decisions.push(clean);
      return upsert(scope, { decisions: decisions.slice(-8) });
    }

    function setNextAction(scope, nextAction) {
      return upsert(scope, { nextAction });
    }

    function clear(scope) {
      if (!scope) return;
      records.delete(scope);
      persist();
    }

    function formatCompactContext(scope) {
      const rec = get(scope);
      if (!rec) return "";
      const parts = [];
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

    function exportHandoff(scope) {
      const rec = get(scope);
      return rec ? JSON.parse(JSON.stringify(rec)) : null;
    }

    function importHandoff(scope, raw) {
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
