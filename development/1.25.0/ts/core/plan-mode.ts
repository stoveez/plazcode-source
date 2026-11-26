// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.25.0/ts/core/plan-mode.ts (TypeScript): edit that file, then run node development/1.25.0/ts/build.cjs.
// Interactive Plan Mode (1.25.0+): strict read-only research gate, multi-pass phase tracker, and structured plan parsing.
const PlazCodePlanMode = (() => {
  type PlanPhase = "off" | "researching" | "refining" | "ready" | "approved";
  type SafetyLike = {
    isChange(tool: string, engine: string): unknown;
    filePreview?(tool: string, engine: string, args: unknown): unknown;
  };
  type PlanState = {
    enabled: boolean;
    approved: boolean;
    phase: PlanPhase;
    revision: number;
    refined: boolean;
    researchReads: number;
    feedback: string;
    lastPlanText: string;
  };
  type PlanSnapshot = PlanState & { phaseLabel: string };
  type GateResult = { allowed: boolean; bare: string; reason: string; error: string };

  const PHASE_LABELS: Record<PlanPhase, string> = {
    off: "",
    researching: "Researching",
    refining: "Refining plan",
    ready: "Ready for review",
    approved: "Approved",
  };

  const state: PlanState = {
    enabled: false,
    approved: false,
    phase: "off",
    revision: 1,
    refined: false,
    researchReads: 0,
    feedback: "",
    lastPlanText: "",
  };

  const bare = (name: unknown): string => String(name || "").split("__").pop() || "";
  const cleanLine = (line: unknown): string =>
    String(line || "")
      .replace(/[*_`#]+/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 220);

  function phaseLabel(phase?: PlanPhase): string {
    const key = phase || state.phase;
    return PHASE_LABELS[key] || "";
  }

  function snapshot(): PlanSnapshot {
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

  function setEnabled(enabled: boolean): PlanSnapshot {
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

  function beginRun(): PlanSnapshot {
    state.approved = false;
    state.refined = false;
    state.revision = 1;
    state.researchReads = 0;
    state.feedback = "";
    state.lastPlanText = "";
    state.phase = state.enabled ? "researching" : "off";
    return snapshot();
  }

  function recordRead(tool: unknown): PlanSnapshot {
    if (state.enabled && !state.approved) {
      if (state.phase === "off") state.phase = "researching";
      if (bare(tool)) state.researchReads += 1;
    }
    return snapshot();
  }

  function isResearchGateActive(planOn: unknown, runState?: { planApproved?: unknown } | null): boolean {
    return !!(planOn && !(runState && runState.planApproved));
  }

  function isToolMutating(tool: unknown, engine: string, safety: SafetyLike | null | undefined, args?: unknown): boolean {
    const b = bare(tool);
    if (!b) return true;
    try {
      if (safety && typeof safety.filePreview === "function" && safety.filePreview(b, engine, args)) {
        return false;
      }
    } catch {
      return true;
    }
    if (b === "plazcode_batch" && args && typeof args === "object" && Array.isArray((args as { calls?: unknown[] }).calls)) {
      const calls = (args as { calls: Array<{ tool?: unknown; command?: unknown; params?: unknown; arguments?: unknown }> }).calls;
      return calls.some((c) => isToolMutating(c && (c.tool || c.command), engine, safety, c && (c.params || c.arguments)));
    }
    try {
      return !!(safety && typeof safety.isChange === "function" ? safety.isChange(b, engine) : true);
    } catch {
      return true;
    }
  }

  function gateTool(tool: unknown, engine: string, safety: SafetyLike | null | undefined, args?: unknown): GateResult {
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

  function needsRefinement(planText: unknown): boolean {
    if (!state.enabled || state.approved || state.refined) return false;
    return String(planText || "").trim().length >= 80;
  }

  function startRefinement(): PlanSnapshot {
    state.refined = true;
    state.phase = state.enabled ? "refining" : "off";
    return snapshot();
  }

  function markReady(planText: unknown): PlanSnapshot {
    state.lastPlanText = String(planText || "");
    state.phase = state.enabled ? "ready" : "off";
    return snapshot();
  }

  function requestChanges(feedback: unknown): string {
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

  function approve(): PlanSnapshot {
    state.approved = true;
    state.phase = "approved";
    return snapshot();
  }

  function reject(): PlanSnapshot {
    state.approved = false;
    state.refined = false;
    state.phase = state.enabled ? "researching" : "off";
    return snapshot();
  }

  function resetRun(): PlanSnapshot {
    state.approved = false;
    state.refined = false;
    state.revision = 1;
    state.researchReads = 0;
    state.feedback = "";
    state.lastPlanText = "";
    state.phase = state.enabled ? "researching" : "off";
    return snapshot();
  }

  function parseStructuredPlan(planText: unknown): {
    goal: string;
    findings: string[];
    steps: string[];
    verification: string[];
    hasStructure: boolean;
  } {
    const text = String(planText || "");
    const lines = text.split(/\r?\n/);
    let goal = "";
    const findings: string[] = [];
    const steps: string[] = [];
    const verification: string[] = [];
    let section: "none" | "findings" | "steps" | "verification" = "none";

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

  function promptExtra(opts?: { engine?: string }): string {
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

  function buildRefinementPrompt(revision: number, _draftPlan: unknown, feedback?: string): string {
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

  function isUserApprovalReply(text: unknown): boolean {
    const cleaned = String(text || "")
      .trim()
      .replace(/[‘’]/g, "'")
      .replace(/[`*"']/g, "")
      .replace(/[\s.!👍✅👌]+$/g, "")
      .trim();
    if (!cleaned || cleaned.length > 220 || /\?\s*$/.test(cleaned)) return false;
    if (
      /\b(?:no(?!\s+(?:changes|edits|issues|problems|objections|further|more\s+changes)\b)|nope|nah|don't|do not|dont|cancel|stop|reject|wait|hold on|not yet|change|revise|modify|update the plan|edit the plan|instead|actually(?!\s+(?:yes|yeah|yep|go ahead|approve|proceed))|but|however|except|before you|first\s+(?:explain|check|show|tell))\b/i.test(
        cleaned
      )
    ) {
      return false;
    }
    const shortAffirmative =
      /^(?:y|yes|yeah|yep|yup|yea|ya|ok|okay|k|kk|sure|bet|alright|all right|agreed|agree|confirm|confirmed|approve|approved|lgtm|proceed|continue|go|go ahead|go for it|do it|let'?s go|lets go|let'?s do it|lets do it|sounds good|looks good|good to go|makes sense|perfect|great|awesome|ship it|send it|start|begin|execute|implement|build it|run it|do that|make it|carry on|yes please|ok please|please proceed|please do|please go ahead|i approve|plan approved|approved plan|si|sí|oui|ja|sim|да|はい|네|是|好的)(?:\s+(?:please|plz|thanks|thank you|now|then|buddy|bro|man|mate))?$/i;
    const compoundApproval =
      /^(?:(?:yes|yeah|yep|yup|yea|ok|okay|sure|alright|all right|great|perfect|awesome|lgtm|sounds good|looks good|good to go|agreed|confirmed|approved?)\s*[,!:;\-–—]?\s*(?:no\s+(?:changes|edits|issues|problems|objections)(?:\s+needed)?\s*[,!:;\-–—]?\s*)?)?(?:i\s+approve(?:\s+(?:(?:the|this|that)(?:\s+plan)?|it|plan))?|approve(?:\s+(?:(?:the|this|that)(?:\s+plan)?|it|plan))?|approved|confirm(?:\s+(?:(?:the|this|that)(?:\s+plan)?|it|plan))?|go ahead(?:\s+(?:and|with)\s+.+)?|proceed(?:\s+(?:with|and|to)\s+.+)?|implement(?:\s+(?:(?:the|this|that)(?:\s+plan)?|it|plan)(?:\s+now)?)?|build(?:\s+(?:(?:the|this|that)(?:\s+plan)?|it|plan)(?:\s+now)?)?|execute(?:\s+(?:(?:the|this|that)(?:\s+plan)?|it|plan)(?:\s+now)?)?|start(?:\s+(?:building|implementing|coding|making|working|step\s*1|the\s+plan|it|now).*)?|do it(?:\s+now)?|let'?s\s+(?:do it|go|build it|proceed|start)|make\s+(?:it|the changes|those changes)|no\s+(?:changes|edits|issues|problems|objections)(?:\s+needed)?)$/i;
    return shortAffirmative.test(cleaned) || compoundApproval.test(cleaned);
  }

  function assistantHasPendingPlan(text: unknown, opts?: { hadPendingPlan?: boolean }): boolean {
    if (opts && opts.hadPendingPlan) return true;
    const t = String(text || "").trim();
    if (t.length < 24) return false;
    const parsed = parseStructuredPlan(t);
    const hasHeading =
      /(?:^|\n)\s*(?:#+\s*|\*\*)?(?:(?:implementation |build |action |proposed |my |the )?plan\b|goal\b|approach\b|overview\b|steps?\b|roadmap\b|here(?:'s| is) (?:the |my )?(?:plan|approach)|i(?:'ll| will) (?:do|build|create|implement|make))/i.test(
        t
      );
    if (parsed.steps.length >= 2 && hasHeading) return true;
    const tail = t.slice(-500);
    return /\b(?:approve|confirm)\b.{0,45}\b(?:plan|changes|proceed|steps?)\b|\b(?:shall|should|would you like me to|want me to|ready for me to|can i|may i)\b.{0,45}\b(?:proceed|start|begin|implement|build|apply|execute|go ahead|make (?:these|the) changes|continue)\b|\b(?:let me know|reply|say|type)\b.{0,45}\b(?:yes|approve|proceed|go ahead|start|ready|if you(?:'d| would) like me to proceed)\b|\bplan mode\b.{0,90}\b(?:approv|proceed|confirm|read-only|review)\b|\bsound good\??\s*$|\bready to (?:proceed|start|begin|implement|build)\??\s*$|\bproceed\?\s*$/i.test(
      tail
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
    isToolMutating,
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
    isUserApprovalReply,
    assistantHasPendingPlan,
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodePlanMode;
