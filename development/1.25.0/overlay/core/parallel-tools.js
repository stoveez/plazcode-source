// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.25.0/ts/core/parallel-tools.ts (TypeScript): edit that file, then run node development/1.25.0/ts/build.cjs.
// Safer parallel read-only tool scheduler: reuses PlazCodeSafety.isChange(name, engine),
// runs up to 4 non-coordination read-only calls concurrently, deduplicates identical
// read signatures within a wave, honors stop/sessionGen via isLive(), enforces strict
// write-barriers around any mutating call, and records overlap timing telemetry.
const PlazCodeParallelTools = (() => {
  "use strict";

  const MAX_PARALLEL_READS = 4;
  const PARALLEL_UNSAFE_RE = /^(?:plazcode_|tab_|browser_)|screen|record|base64|wait|^look$/;

  ;



  ;







  ;





  ;









  ;




  function bareToolName(name) {
    const s = String(name || "");
    return s.includes("/") ? (s.split("/").pop() || "") : s;
  }

  function isParallelRead(toolName, engine, safety) {
    const bare = bareToolName(toolName);
    if (!bare || PARALLEL_UNSAFE_RE.test(bare)) return false;
    if (!safety || typeof safety.isChange !== "function") return false;
    try {
      return !safety.isChange(bare, engine);
    } catch {
      return false;
    }
  }

  function stableValue(value, depth = 0) {
    if (depth > 8 || value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map((item) => stableValue(item, depth + 1));
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = stableValue((value)[key], depth + 1);
    }
    return out;
  }

  function callSignature(call) {
    const name = bareToolName(call?.tool || call?.command);
    const args = call?.arguments ?? call?.params ?? {};
    return name + ":" + JSON.stringify(stableValue(args));
  }

  function planWaves(
    calls,
    opts
  ) {
    const maxConc = Math.max(1, Math.min(MAX_PARALLEL_READS, Number(opts.maxConcurrent) || MAX_PARALLEL_READS));
    const parallelOn = opts.parallelReadsEnabled !== false;
    const waves = [];
    let i = 0;

    while (i < calls.length) {
      const canParallel = parallelOn && isParallelRead(calls[i]?.tool || calls[i]?.command, opts.engine, opts.safety);
      if (!canParallel) {
        waves.push({ kind: "serial", indices: [i], dedupeOf: {} });
        i++;
        continue;
      }

      const indices = [];
      const seenSig = new Map();
      const dedupeOf = {};
      let distinctCount = 0;

      while (i < calls.length && isParallelRead(calls[i]?.tool || calls[i]?.command, opts.engine, opts.safety)) {
        const sig = callSignature(calls[i]);
        const existing = seenSig.get(sig);
        if (existing !== undefined) {
          dedupeOf[i] = existing;
          indices.push(i);
          i++;
          continue;
        }
        if (distinctCount >= maxConc) break;
        seenSig.set(sig, i);
        indices.push(i);
        distinctCount++;
        i++;
      }

      waves.push({ kind: "read_wave", indices, dedupeOf });
    }
    return waves;
  }

  async function executeBatch(params









  ) {
    const calls = params.calls || [];
    const waves = planWaves(calls, {
      engine: params.engine,
      safety: params.safety,
      maxConcurrent: params.maxConcurrent,
      parallelReadsEnabled: params.parallelReadsEnabled,
    });
    const results = new Array(calls.length);
    const t0 = Date.now();
    let held = false;
    let ended = false;
    let parallelWaves = 0;
    let maxInFlight = 0;
    let dedupedCalls = 0;
    let sumChildMs = 0;

    for (const wave of waves) {
      if (ended) break;
      if (!params.isLive()) {
        const firstIdx = wave.indices[0];
        if (firstIdx !== undefined) {
          results[firstIdx] = {
            index: firstIdx + 1,
            not_run: true,
            error: "Stopped or chat/session changed; remaining commands did not run.",
          };
        }
        break;
      }

      if (wave.kind === "serial") {
        const idx = wave.indices[0];
        const call = calls[idx];
        const name = String(call.tool || call.command || "");
        if (held) {
          results[idx] = {
            index: idx + 1,
            command: name,
            not_run: true,
            error: "Not run: an earlier command in this reply failed, and this change may depend on it.",
          };
          continue;
        }
        const reason = params.budgetStop ? params.budgetStop(idx) : "";
        if (reason) {
          results[idx] = { index: idx + 1, not_run: true, error: reason };
          ended = true;
          break;
        }
        maxInFlight = Math.max(maxInFlight, 1);
        const childStarted = Date.now();
        const res = await params.runChild(idx);
        sumChildMs += res.ms != null ? res.ms : Math.max(0, Date.now() - childStarted);
        results[idx] = res.row;
        if (!res.ok) held = true;
        continue;
      }

      const runnable = [];
      const deduped = [];
      for (const idx of wave.indices) {
        const reason = params.budgetStop ? params.budgetStop(idx) : "";
        if (reason) {
          results[idx] = { index: idx + 1, not_run: true, error: reason };
          ended = true;
          break;
        }
        if (wave.dedupeOf[idx] !== undefined) deduped.push(idx);
        else runnable.push(idx);
      }

      if (runnable.length > 1) parallelWaves++;
      maxInFlight = Math.max(maxInFlight, runnable.length);

      const outcomes = await Promise.all(
        runnable.map(async (idx) => {
          const childStarted = Date.now();
          const res = await params.runChild(idx);
          const ms = res.ms != null ? res.ms : Math.max(0, Date.now() - childStarted);
          return { idx, ok: res.ok, row: res.row, ms };
        })
      );

      for (const item of outcomes) {
        sumChildMs += item.ms;
        results[item.idx] = item.row;
        if (!item.ok) held = true;
      }

      for (const dupIdx of deduped) {
        dedupedCalls++;
        const srcIdx = wave.dedupeOf[dupIdx];
        const srcRow = results[srcIdx];
        if (srcRow) {
          results[dupIdx] = params.onDeduped
            ? params.onDeduped(dupIdx, srcRow)
            : { ...srcRow, index: dupIdx + 1, deduped: true };
        }
      }
    }

    const wallMs = Math.max(0, Date.now() - t0);
    return {
      results: results.filter(Boolean),
      metrics: {
        waves: waves.length,
        parallelWaves,
        maxInFlight,
        dedupedCalls,
        wallMs,
        sumChildMs,
        savedMs: Math.max(0, sumChildMs - wallMs),
      },
    };
  }

  return {
    MAX_PARALLEL_READS,
    isParallelRead,
    callSignature,
    planWaves,
    executeBatch,
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodeParallelTools;
