// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.24.36/ts/core/plan-mode.ts (TypeScript): edit that file, then run node development/1.24.36/ts/build.cjs.
// Interactive Plan Mode (1.24.36+): strict read-only research gate, multi-pass phase tracker, and structured plan parsing.
const PlazCodePlanMode = (() => {


















  const PHASE_LABELS = {
    off: "",
    researching: "Researching",
    refining: "Refining plan",
    ready: "Ready for review",
    approved: "Approved",
  };

  const state = {
    enabled: false,
    approved: false,
    phase: "off",
    revision: 1,
    refined: false,
    researchReads: 0,
    feedback: "",
    lastPlanText: "",
  };

  const bare = (name) => String(name || "").split("__").pop() || "";
  const cleanLine = (line) =>
    String(line || "")
      .replace(/[*_`#]+/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 220);

  function phaseLabel(phase) {
    const key = phase || state.phase;
    return PHASE_LABELS[key] || "";
  }

  function snapshot() {
    return {
      enabled: state.enabled,
      approved: state.approved,
      phase: state.phase,
      phaseLabel: phaseLabel(state.phase),
      revision: state.revision,
      refined: state.refined,
      researchReads: state.researchReads,
      feedback: state.feedback,
      lastPlanText: state.lastPlanText,
    };
  }

  function setEnabled(enabled) {
    state.enabled = !!enabled;
    if (!state.enabled) {
      state.approved = false;
      state.refined = false;
      state.phase = "off";
      state.revision = 1;
      state.researchReads = 0;
      state.feedback = "";
    } else if (!state.approved && state.phase === "off") {
      state.phase = "researching";
    }
    return snapshot();
  }

  function beginRun() {
    state.approved = false;
    state.refined = false;
    state.revision = 1;
    state.researchReads = 0;
    state.feedback = "";
    state.lastPlanText = "";
    state.phase = state.enabled ? "researching" : "off";
    return snapshot();
  }

  function recordRead(tool) {
    if (state.enabled && !state.approved) {
      if (state.phase === "off") state.phase = "researching";
      if (bare(tool)) state.researchReads += 1;
    }
    return snapshot();
  }

  function isResearchGateActive(planOn, runState) {
    return !!(planOn && !(runState && runState.planApproved));
  }

  function isToolMutating(tool, engine, safety, args) {
    const b = bare(tool);
    if (!b) return true;
    try {
      if (safety && typeof safety.filePreview === "function" && safety.filePreview(b, engine, args)) {
        return false;
      }
    } catch {
      return true;
    }
    if (b === "plazcode_batch" && args && typeof args === "object" && Array.isArray((args).calls)) {
      const calls = (args).calls;
      return calls.some((c) => isToolMutating(c && (c.tool || c.command), engine, safety, c && (c.params || c.arguments)));
    }
    try {
      return !!(safety && typeof safety.isChange === "function" ? safety.isChange(b, engine) : true);
    } catch {
      return true;
    }
  }

  function gateTool(tool, engine, safety, args) {
    const b = bare(tool);
    if (!isToolMutating(b, engine, safety, args)) {
      return { allowed: true, bare: b, reason: "read_only", error: "" };
    }
    return {
      allowed: false,
      bare: b,
      reason: "research_only",
      error: `ERROR in ${b}: Plan Mode is on and the user did not approve this change. Research-only mode is active: read, search, and inspect tools are allowed to investigate Studio and files, while mutating commands are blocked until your structured plan is reviewed and approved.`,
    };
  }

  function needsRefinement(planText) {
    if (!state.enabled || state.approved || state.refined) return false;
    return String(planText || "").trim().length >= 80;
  }

  function startRefinement() {
    state.refined = true;
    state.phase = state.enabled ? "refining" : "off";
    return snapshot();
  }

  function markReady(planText) {
    state.lastPlanText = String(planText || "");
    state.phase = state.enabled ? "ready" : "off";
    return snapshot();
  }

  function requestChanges(feedback) {
    const clean = String(feedback || "").trim();
    state.revision += 1;
    state.refined = false;
    state.approved = false;
    state.feedback = clean;
    state.phase = state.enabled ? "researching" : "off";
    const feedbackLine = clean
      ? `User requested changes:\n${clean}\n\n`
      : "The user asked to revise the proposed plan.\n\n";
    return (
      `(PlazCode Plan Mode — Revision v${state.revision}: ${feedbackLine}` +
      "Do NOT run any mutating commands yet (read/search/inspect tools are allowed to verify files or Studio instances). " +
      "Re-check edge cases and emit an updated structured plan using:\n" +
      "## Plan\n**Goal:** <one sentence>\n**Research findings:**\n- <verified file/instance/service findings>\n" +
      "1. <crisp step>\n2. <crisp step>\n...\n**Verification:**\n- <how you will verify after approval>\n" +
      "Do not ask 'shall I proceed?'; PlazCode presents the revised plan for approval.)"
    );
  }

  function approve() {
    state.approved = true;
    state.phase = "approved";
    return snapshot();
  }

  function reject() {
    state.approved = false;
    state.refined = false;
    state.phase = state.enabled ? "researching" : "off";
    return snapshot();
  }

  function resetRun() {
    state.approved = false;
    state.refined = false;
    state.revision = 1;
    state.researchReads = 0;
    state.feedback = "";
    state.lastPlanText = "";
    state.phase = state.enabled ? "researching" : "off";
    return snapshot();
  }

  function parseStructuredPlan(planText)





   {
    const text = String(planText || "");
    const lines = text.split(/\r?\n/);
    let goal = "";
    const findings = [];
    const steps = [];
    const verification = [];
    let section = "none";

    for (const raw of lines) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const goalMatch = /^(?:[-*#\s]*)(?:\*\*)?goal(?:\*\*)?\s*[:\-–—]\s*(.+)$/i.exec(trimmed);
      if (goalMatch && !goal) {
        goal = cleanLine(goalMatch[1]);
        section = "none";
        continue;
      }
      if (/^(?:#{1,4}\s*)?(?:\*\*)?research findings(?:\*\*)?\s*[:\-–—]?\s*$/i.test(trimmed)) {
        section = "findings";
        continue;
      }
      const inlineFinding = /^(?:\*\*)?research findings(?:\*\*)?\s*[:\-–—]\s*(.+)$/i.exec(trimmed);
      if (inlineFinding) {
        section = "findings";
        const c = cleanLine(inlineFinding[1]);
        if (c) findings.push(c);
        continue;
      }
      if (/^(?:#{1,4}\s*)?(?:\*\*)?(?:verification|verify)(?:\*\*)?\s*[:\-–—]?\s*$/i.test(trimmed)) {
        section = "verification";
        continue;
      }
      const inlineVerify = /^(?:\*\*)?(?:verification|verify)(?:\*\*)?\s*[:\-–—]\s*(.+)$/i.exec(trimmed);
      if (inlineVerify) {
        section = "verification";
        const c = cleanLine(inlineVerify[1]);
        if (c) verification.push(c);
        continue;
      }
      if (/^(?:#{1,4}\s*)?(?:\*\*)?(?:steps|implementation steps|plan steps)(?:\*\*)?\s*[:\-–—]?\s*$/i.test(trimmed)) {
        section = "steps";
        continue;
      }
      const numMatch = /^(\d+)[.)]\s+(.+)$/.exec(trimmed);
      if (numMatch) {
        const c = cleanLine(numMatch[2]);
        if (c) {
          if (section === "verification") verification.push(c);
          else steps.push(c);
        }
        continue;
      }
      const bulMatch = /^[-*+•]\s+(?!\[[ xX]\])(.+)$/.exec(trimmed);
      if (bulMatch) {
        const c = cleanLine(bulMatch[1]);
        if (!c) continue;
        if (section === "findings") findings.push(c);
        else if (section === "verification") verification.push(c);
        else if (section === "steps") steps.push(c);
      }
    }

    const hasStructure = !!(goal && steps.length >= 2 && (findings.length > 0 || verification.length > 0));
    return { goal, findings: findings.slice(0, 8), steps: steps.slice(0, 12), verification: verification.slice(0, 6), hasStructure };
  }

  function promptExtra(opts) {
    const target = opts && opts.engine === "local" ? "workspace files and project structure" : "Roblox Studio instances, scripts, and project structure";
    return (
      `\n\n━━━ INTERACTIVE PLAN MODE (READ-ONLY RESEARCH PHASE) ━━━\n` +
      `PlazCode enforces a strict read-only research gate while Plan Mode is unapproved:\n` +
      `1. PASS 1 — RESEARCH: Read, search, and inspect ${target} using read-only commands first. Mutating/write commands are blocked until the user approves your plan.\n` +
      `2. PASS 2 — SELF-CRITIQUE: PlazCode will ask you for a quick self-critique refinement pass to check edge cases (respawn, mobile/Play vs Edit, missing dependencies, error handling).\n` +
      `3. PASS 3 — STRUCTURED PLAN: Present the plan using:\n` +
      `## Plan\n**Goal:** <one sentence>\n**Research findings:**\n- <key files, instances, or constraints verified>\n1. <crisp step>\n2. <crisp step>\n**Verification:**\n- <checks to run after approval>`
    );
  }

  function buildRefinementPrompt(revision, _draftPlan, feedback) {
    const rev = Math.max(1, Number(revision) || 1);
    const fb = String(feedback || "").trim();
    return (
      `(PlazCode Plan Mode — Self-Critique & Refinement Pass v${rev}: ` +
      (fb ? `incorporate user feedback ("${fb.slice(0, 400)}") and ` : "") +
      `verify your draft plan against your read-only research findings. ` +
      `Check edge cases, missing systems, respawn/Play-vs-Edit safety, and exact file/instance names. ` +
      `Do NOT call mutating commands yet. Output the final structured plan with exact sections:\n` +
      `## Plan\n**Goal:** <one sentence>\n**Research findings:**\n- <verified findings>\n1. <crisp step>\n2. <crisp step>\n**Verification:**\n- <post-edit checks>)`
    );
  }

  return {
    PHASE_LABELS,
    snapshot,
    phaseLabel,
    setEnabled,
    beginRun,
    recordRead,
    isResearchGateActive,
    gateTool,
    needsRefinement,
    startRefinement,
    markReady,
    requestChanges,
    approve,
    reject,
    resetRun,
    parseStructuredPlan,
    promptExtra,
    buildRefinementPrompt,
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodePlanMode;
