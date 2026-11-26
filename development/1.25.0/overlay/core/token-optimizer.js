// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.25.0/ts/core/token-optimizer.ts (TypeScript): edit that file, then run node development/1.25.0/ts/build.cjs.
// Lossless-structure compaction for noisy Studio, search, MCP, and shell tool results
// plus telemetry. Never alters exact source text returned by read_file / script_read.
const PlazCodeTokenOptimizer = (() => {
  "use strict";

  const DEFAULT_SOFT_RESULT_CHARS = 8000;
  const PASSTHROUGH_TOOLS = new Set([
    "read_file",
    "read_files",
    "script_read",
    "read_scripts",
    "read_file_base64",
    "plazcode_result_read",
    "plazcode_clarify",
    "plazcode_help",
  ]);
  const BULK_READ_TOOLS = new Set(["read_scripts", "read_files"]);
  const JSON_COMPACT_TOOLS = new Set([
    "search_game_tree",
    "inspect_instance",
    "get_studio_state",
    "get_console_output",
    "grep_files",
    "script_search",
    "script_grep",
    "script_analysis",
    "list_files",
    "list_directory",
    "tree",
    "search_files",
    "search_creator_store",
    "process_list",
    "file_info",
    "env_info",
  ]);

  ;









  ;



  ;






  const telemetry = {
    calls: 0,
    compactedCalls: 0,
    skippedCalls: 0,
    originalChars: 0,
    compactedChars: 0,
  };

  function bareName(toolName) {
    const s = String(toolName || "").trim();
    if (!s) return "";
    const slash = s.includes("/") ? (s.split("/").pop() || s) : s;
    return slash.includes(".") ? (slash.split(".").pop() || slash) : slash;
  }

  function isPassthroughTool(toolName) {
    return PASSTHROUGH_TOOLS.has(bareName(toolName));
  }

  function isBulkReadTool(toolName) {
    return BULK_READ_TOOLS.has(bareName(toolName));
  }

  function isCriticalTextLine(line) {
    const t = line.trim();
    if (!t) return false;
    return /^(?:error\b|err!|fail(?:ed)?\b|failures:|traceback|exception|assertionerror|fatal:|-->\s|test result:|===|---- )/i.test(t)
      || /\b(?:error\[|npm ERR!|panicked at|exit code\s+[1-9]\d*)/i.test(t);
  }

  function stripNoiseFields(value, depth = 0) {
    if (depth > 16) return value;
    if (value === null || value === undefined || value === "") return undefined;
    if (typeof value !== "object") return value;
    if (Array.isArray(value)) {
      const next = [];
      for (const item of value) {
        const cleaned = stripNoiseFields(item, depth + 1);
        if (cleaned !== undefined) next.push(cleaned);
      }
      return next.length || depth === 0 ? next : undefined;
    }
    const obj = value;
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === "resolved_paths") {
        out[k] = v;
        continue;
      }
      const cleaned = stripNoiseFields(v, depth + 1);
      if (cleaned === undefined) continue;
      if (Array.isArray(cleaned) && cleaned.length === 0) continue;
      if (typeof cleaned === "object" && cleaned !== null && !Array.isArray(cleaned) && Object.keys(cleaned).length === 0) continue;
      out[k] = cleaned;
    }
    if (depth > 0 && Object.keys(out).length === 0) return undefined;
    return out;
  }

  function foldNoisyText(body) {
    const noAnsi = body.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "");
    const lines = noAnsi.replace(/\r\n/g, "\n").split("\n").map((line) => {
      if (!line.includes("\r")) return line.replace(/[ \t]+$/, "");
      const parts = line.split("\r");
      for (let i = parts.length - 1; i >= 0; i--) {
        if (parts[i].trim()) return parts[i].replace(/[ \t]+$/, "");
      }
      return "";
    });
    const out = [];
    let prev = "";
    let run = 0;
    let blanks = 0;
    const flush = () => {
      if (!run) return;
      if (run > 1 && !isCriticalTextLine(prev)) out.push(`${prev} (x${run})`);
      else for (let i = 0; i < run; i++) out.push(prev);
      run = 0;
      prev = "";
    };
    for (const line of lines) {
      if (!line.trim()) {
        flush();
        blanks++;
        if (blanks === 1) out.push("");
        continue;
      }
      blanks = 0;
      if (run > 0 && line === prev && !isCriticalTextLine(line)) {
        run++;
        continue;
      }
      flush();
      prev = line;
      run = 1;
    }
    flush();
    return out.join("\n").trim();
  }

  function compactToolResult(toolName, rawText, opts = {}) {
    const raw = String(rawText ?? "");
    const originalChars = raw.length;
    telemetry.calls++;
    telemetry.originalChars += originalChars;

    if (opts.enabled === false || !raw || isPassthroughTool(toolName) || /^ERROR\b/.test(raw)) {
      telemetry.skippedCalls++;
      telemetry.compactedChars += originalChars;
      return { text: raw, compacted: false, originalChars, compactedChars: originalChars };
    }

    const bare = bareName(toolName);
    const prefixMatch = raw.match(/^(Output of '[^']*':\n?)([\s\S]*)$/);
    const prefix = prefixMatch ? prefixMatch[1] : "";
    const body = prefixMatch ? prefixMatch[2] : raw;
    let nextBody = body;

    const trimmed = body.trim();
    if (/^[\[{]/.test(trimmed)) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object" && parsed.preview === true && parsed.kind === "diff") {
          telemetry.skippedCalls++;
          telemetry.compactedChars += originalChars;
          return { text: raw, compacted: false, originalChars, compactedChars: originalChars };
        }
        const cleaned = JSON_COMPACT_TOOLS.has(bare) || trimmed.length >= 240
          ? stripNoiseFields(parsed, 0)
          : parsed;
        const serialized = JSON.stringify(cleaned === undefined ? (Array.isArray(parsed) ? [] : {}) : cleaned);
        if (serialized.length < body.length) nextBody = serialized;
      } catch {
        // Non-JSON body falls through to text folding when noisy/large.
      }
    }

    if (nextBody === body && (JSON_COMPACT_TOOLS.has(bare) || bare === "run_command" || body.length >= 600 || /\x1b\[|\r|\n{3,}/.test(body))) {
      const folded = foldNoisyText(body);
      if (folded.length < body.length) nextBody = folded;
    }

    const candidate = prefix + nextBody;
    const useCandidate = candidate.length < raw.length;
    const finalText = useCandidate ? candidate : raw;
    const compactedChars = finalText.length;

    if (useCandidate) telemetry.compactedCalls++;
    else telemetry.skippedCalls++;
    telemetry.compactedChars += compactedChars;

    return {
      text: finalText,
      compacted: useCandidate,
      originalChars,
      compactedChars,
    };
  }

  function stats() {
    const savedChars = Math.max(0, telemetry.originalChars - telemetry.compactedChars);
    const savedPct = telemetry.originalChars > 0
      ? Math.round((savedChars / telemetry.originalChars) * 1000) / 10
      : 0;
    return {
      calls: telemetry.calls,
      compactedCalls: telemetry.compactedCalls,
      skippedCalls: telemetry.skippedCalls,
      originalChars: telemetry.originalChars,
      compactedChars: telemetry.compactedChars,
      savedChars,
      savedPct,
    };
  }

  function resetStats() {
    telemetry.calls = 0;
    telemetry.compactedCalls = 0;
    telemetry.skippedCalls = 0;
    telemetry.originalChars = 0;
    telemetry.compactedChars = 0;
  }

  return {
    DEFAULT_SOFT_RESULT_CHARS,
    isPassthroughTool,
    isBulkReadTool,
    stripNoiseFields,
    foldNoisyText,
    compactToolResult,
    stats,
    resetStats,
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodeTokenOptimizer;
