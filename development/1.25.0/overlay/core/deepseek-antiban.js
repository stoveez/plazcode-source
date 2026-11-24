// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.25.0/ts/core/deepseek-antiban.ts (TypeScript): edit that file, then run node development/1.25.0/ts/build.cjs.
// PlazCode DeepSeek Anti-Ban Shield v5:
// - Auto-turn Safe Checkpoint (MAX_AUTO_TURNS = 3) & strict unattended retry limits (MAX_EMPTY = 0, MAX_TRUNC = 1, MAX_PARSE_ERR = 1)
// - Exact 5.0s post-tool slow send + bell-curve jitter (3-sample variance) + hidden-tab grace
// - 4-tool / 20s heat-reset cycle + 0-100 risk heat meter (Safe < 20%, Heated >= 20%, > 80% forces 15s cooldown)
// - Dual-Tier Shield: Tier 1 (15s/20s/25s auto-resuming breathers) vs Tier 2 (5-minute Risk Lock, heat=100, manual Reset Shield)
// - Rolling 2m/10m/1h/24h cross-tab quotas (chrome.storage.local + onChanged) & Rust provider-pacing sync
// - Natural interior pointer clicks (humanClick), humanized burst composer fill (humanFillText), & early WAF/Captcha detector (Turnstile/GeeTest/Yidun)
const PlazCodeDeepSeekAntiBan = (() => {





































































































  const STORAGE_KEY = "plazcodeDeepSeekGuardV5";
  const LEGACY_STORAGE_KEY = "plazcodeDeepSeekGuardV2";
  const DEFAULT_POST_TOOL_WAIT_MS = 5000;
  const DEFAULT_TOOLS_PER_CYCLE = 4;
  const DEFAULT_MAX_AUTO_TURNS = 3;
  const DEFAULT_MAX_EMPTY_RETRIES = 0;
  const DEFAULT_MAX_TRUNC_RETRIES = 1;
  const DEFAULT_MAX_PARSE_ERR_RETRIES = 1;
  const DEFAULT_CYCLE_COOLDOWN_MS = 20000;
  const DEFAULT_HIGH_HEAT_THRESHOLD = 80;
  const DEFAULT_HIGH_HEAT_COOLDOWN_MS = 15000;
  const DEFAULT_BREATHER_COOLDOWN_MS = 25000;
  const DEFAULT_SAFE_THRESHOLD = 20;
  const DEFAULT_RISK_LOCK_MS = 300000;
  const DEFAULT_HEAT_DECAY_MS = 15000;
  const DEFAULT_HIDDEN_GRACE_MS = 1500;
  const OUTPUT_COMPRESS_LIMIT = 22000;
  const WINDOW_2M_MS = 120000;
  const WINDOW_10M_MS = 600000;
  const WINDOW_1H_MS = 3600000;
  const WINDOW_24H_MS = 86400000;
  const LIMITS = {
    runTools: DEFAULT_TOOLS_PER_CYCLE,
    maxAutoTurns: DEFAULT_MAX_AUTO_TURNS,
    sends2m: 3,
    sends10m: 9,
    tools10m: 8,
    sends1h: 24,
    tools1h: 20,
    sends24h: 90,
  };

  const SITE_WARNING_RE = /(?:\b429\b|too many requests|rate[\s-]?limit|turnstile|geetest|yidun|captcha|verify you are human|human verification|security verification|unusual activity|account.{0,20}suspend|server is busy|messages too frequent|请求过于频繁|系统繁忙|异常|安全验证|人机验证)/i;
  const TOOL_OUTPUT_RE = /^(?:Output of '([^']+)':|ERROR running '([^']+)':|ERROR:)/;
  const ERROR_OUTPUT_RE = /^(?:ERROR running|ERROR:|Output of '[^']+':\s*(?:\r?\n)?ERROR\b)/i;
  const EMPTY_RETRY_RE = /(?:no reply received|didn't receive a reply|empty reply|empty response|blank reply|did not respond)/i;
  const TRUNC_RETRY_RE = /(?:truncated|cut off|finish your reply|continue from where you left off|incomplete reply)/i;
  const PARSE_ERR_RETRY_RE = /(?:ERROR:\s*no command was executed|valid JSON|unclosed command|malformed command)/i;

  const WAF_SELECTORS = [
    'iframe[src*="challenges.cloudflare.com"]',
    ".cf-turnstile",
    '[data-sitekey][class*="turnstile"]',
    '[name="cf-turnstile-response"]',
    ".geetest_holder",
    ".geetest_panel",
    ".geetest_popup_box",
    '[class*="geetest"]',
    'iframe[src*="geetest"]',
    ".yidun",
    ".yidun_popup",
    ".yidun_modal",
    'iframe[src*="dun.163"]',
    'iframe[src*="captcha"]',
    '[data-captcha]',
    '[class*="captcha-modal"]',
  ];

  function T(text) {
    try {
      if (typeof PlazCodeI18n !== "undefined" && PlazCodeI18n && typeof PlazCodeI18n.t === "function") {
        return PlazCodeI18n.t(text);
      }
    } catch {}
    return text;
  }

  function makeEmptyState(now) {
    return {
      heat: 0,
      heatUpdatedAt: now,
      runTools: 0,
      autoTurns: 0,
      checkpointEnabled: true,
      checkpointPaused: false,
      emptyRetries: 0,
      truncRetries: 0,
      parseErrRetries: 0,
      sendTimestamps: [],
      toolTimestamps: [],
      cooldownUntil: 0,
      cooldownReason: "",
      cooldownDurationMs: 0,
      cooldownTriggerHeat: 0,
      pendingResetMode: "",
      riskLockUntil: 0,
      riskLockReason: "",
      lastToolSig: "",
      consecutiveDuplicates: 0,
      consecutiveErrors: 0,
      compressedCount: 0,
      duplicateCount: 0,
    };
  }

  function clampHeat(n) {
    const v = Math.round(Number(n) || 0);
    return v < 0 ? 0 : v > 100 ? 100 : v;
  }

  function bellJitterMs(minMs, maxMs, randFn = Math.random) {
    const lo = Math.min(minMs, maxMs);
    const hi = Math.max(minMs, maxMs);
    const avg = (randFn() + randFn() + randFn()) / 3;
    return Math.round(lo + avg * (hi - lo));
  }

  function calcReviewDwellMs(charLen) {
    const n = Math.max(0, Number(charLen) || 0);
    return Math.min(5000, Math.max(1150, 1150 + Math.round(n * 0.45)));
  }

  function setNativeEditorValue(el, value) {
    const tag = (el.tagName || "").toUpperCase();
    if (tag === "TEXTAREA" || tag === "INPUT") {
      const proto = tag === "INPUT" && typeof HTMLInputElement !== "undefined"
        ? HTMLInputElement.prototype
        : typeof HTMLTextAreaElement !== "undefined"
          ? HTMLTextAreaElement.prototype
          : null;
      const desc = proto ? Object.getOwnPropertyDescriptor(proto, "value") : null;
      if (desc && desc.set) desc.set.call(el, value);
      else (el).value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    el.textContent = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function dispatchSyntheticPointer(
    el,
    kind,
    x,
    y
  ) {
    const init = {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      button: 0,
      buttons: kind === "pointerdown" || kind === "mousedown" ? 1 : 0,
    };
    try {
      if (kind.startsWith("pointer") && typeof PointerEvent === "function") {
        el.dispatchEvent(new PointerEvent(kind, { ...init, pointerId: 1, pointerType: "mouse", isPrimary: true }));
        return;
      }
      if (typeof MouseEvent === "function") {
        el.dispatchEvent(new MouseEvent(kind, init));
        return;
      }
    } catch {}
    el.dispatchEvent(new Event(kind, { bubbles: true, cancelable: true }));
  }

  function interiorPoint(el, randFn = Math.random) {
    try {
      const rect = el.getBoundingClientRect();
      if (rect && rect.width > 4 && rect.height > 4) {
        const fx = 0.22 + randFn() * 0.56;
        const fy = 0.22 + randFn() * 0.56;
        return {
          x: Math.round((rect.left + rect.width * fx) * 10) / 10,
          y: Math.round((rect.top + rect.height * fy) * 10) / 10,
        };
      }
    } catch {}
    return { x: Math.round(12 + randFn() * 18), y: Math.round(10 + randFn() * 12) };
  }

  async function humanClick(
    el,
    opts = {}
  ) {
    if (!el) return null;
    const randFn = opts.rand || Math.random;
    const sleepFn = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const pt = interiorPoint(el, randFn);
    dispatchSyntheticPointer(el, "pointerover", pt.x, pt.y);
    dispatchSyntheticPointer(el, "mouseover", pt.x, pt.y);
    dispatchSyntheticPointer(el, "pointermove", pt.x, pt.y);
    dispatchSyntheticPointer(el, "pointerdown", pt.x, pt.y);
    dispatchSyntheticPointer(el, "mousedown", pt.x, pt.y);
    await sleepFn(bellJitterMs(35, 95, randFn));
    dispatchSyntheticPointer(el, "mouseup", pt.x, pt.y);
    dispatchSyntheticPointer(el, "pointerup", pt.x, pt.y);
    if (!opts.skipClickEvent) {
      dispatchSyntheticPointer(el, "click", pt.x, pt.y);
    }
    return pt;
  }

  async function humanFillText(
    editor,
    text,
    opts = {}
  ) {
    const raw = String(text || "").replace(/\r\n?/g, "\n");
    const randFn = opts.rand || Math.random;
    const sleepFn = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    if (!editor) {
      return { streamed: false, chunks: 0, reviewDwellMs: calcReviewDwellMs(raw.length) };
    }
    try { editor.focus(); } catch {}
    if (raw.length <= 140) {
      let pos = 0;
      let chunks = 0;
      const [lo, hi] = opts.burstMs || [25, 75];
      setNativeEditorValue(editor, "");
      while (pos < raw.length) {
        const step = Math.min(raw.length - pos, 4 + Math.floor(randFn() * 7));
        pos += step;
        chunks += 1;
        setNativeEditorValue(editor, raw.slice(0, pos));
        if (pos < raw.length) {
          await sleepFn(bellJitterMs(lo, hi, randFn));
        }
      }
      return { streamed: true, chunks, reviewDwellMs: calcReviewDwellMs(raw.length) };
    }
    setNativeEditorValue(editor, raw);
    const dwell = calcReviewDwellMs(raw.length);
    return { streamed: false, chunks: 1, reviewDwellMs: dwell };
  }

  function scanWafAndCaptcha(doc = typeof document !== "undefined" ? document : null) {
    if (!doc || typeof doc.querySelectorAll !== "function") return null;
    try {
      for (const sel of WAF_SELECTORS) {
        const nodes = doc.querySelectorAll(sel);
        for (let i = 0; i < nodes.length; i++) {
          const el = nodes[i];
          if (!el) continue;
          if (typeof el.closest === "function" && el.closest(".ds-message, [data-message-id], [data-ds-message], #rs-root")) continue;
          let visible = true;
          try {
            const st = typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
            if (st && (st.display === "none" || st.visibility === "hidden" || st.opacity === "0")) visible = false;
            else if (typeof el.getBoundingClientRect === "function") {
              const r = el.getBoundingClientRect();
              if (r && r.width === 0 && r.height === 0 && el.offsetParent === null && (!el.style || el.style.display === "none")) visible = false;
            }
          } catch {}
          if (visible) {
            const label = sel.includes("cloudflare") || sel.includes("turnstile")
              ? "Cloudflare Turnstile challenge detected"
              : sel.includes("geetest")
                ? "GeeTest captcha challenge detected"
                : sel.includes("yidun") || sel.includes("163")
                  ? "Yidun captcha challenge detected"
                  : "Captcha challenge detected";
            return label;
          }
        }
      }
      const alerts = doc.querySelectorAll('[role="alert"], [class*="ds-toast"], [class*="warning"], [class*="modal"], [class*="error"]');
      for (let i = 0; i < alerts.length; i++) {
        const el = alerts[i];
        if (!el) continue;
        if (typeof el.closest === "function" && el.closest(".ds-message, [data-message-id], [data-ds-message], #rs-root")) continue;
        const txt = String(el.innerText || el.textContent || "").trim();
        if (txt.length >= 6 && txt.length <= 600 && SITE_WARNING_RE.test(txt)) {
          return txt.slice(0, 180);
        }
      }
    } catch {}
    return null;
  }

  function pruneTimestamps(arr, now) {
    if (!Array.isArray(arr)) return [];
    const cutoff = now - WINDOW_24H_MS;
    const out = [];
    for (const raw of arr) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= cutoff && n <= now + 60000) out.push(n);
    }
    return out.length > 300 ? out.slice(out.length - 300) : out;
  }

  function countSince(arr, cutoff) {
    let n = 0;
    for (let i = 0; i < arr.length; i++) if (arr[i] >= cutoff) n++;
    return n;
  }

  function mergeTimestampLists(a, b, now) {
    const seen = new Set();
    const combined = [];
    const cutoff = now - WINDOW_24H_MS;
    for (const x of [...a, ...b]) {
      if (x >= cutoff && x <= now + 60000 && !seen.has(x)) {
        seen.add(x);
        combined.push(x);
      }
    }
    combined.sort((x, y) => x - y);
    return combined.length > 300 ? combined.slice(combined.length - 300) : combined;
  }

  function shapeOutput(text) {
    const raw = String(text || "");
    const origLen = raw.length;
    if (origLen <= OUTPUT_COMPRESS_LIMIT) {
      return { text: raw, compressed: false, originalChars: origLen };
    }
    let compact = raw.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (compact.length <= OUTPUT_COMPRESS_LIMIT) {
      return { text: compact, compressed: true, originalChars: origLen };
    }
    const probe = `\n\n[…PlazCode Anti-Ban: compacted ${origLen} verbose characters to stay safe on DeepSeek while preserving head & tail output…]\n\n`;
    const budget = Math.max(2000, OUTPUT_COMPRESS_LIMIT - probe.length);
    const headLen = Math.floor(budget * 0.65);
    const tailLen = budget - headLen;
    const head = compact.slice(0, headLen);
    const tail = compact.slice(compact.length - tailLen);
    const omitted = Math.max(1, origLen - head.length - tail.length);
    const marker = `\n\n[…PlazCode Anti-Ban: compacted ${omitted} verbose characters from ${origLen}-char tool output while preserving head & tail output…]\n\n`;
    let finalText = head + marker + tail;
    if (finalText.length > OUTPUT_COMPRESS_LIMIT) {
      const over = finalText.length - OUTPUT_COMPRESS_LIMIT;
      finalText = head.slice(0, Math.max(500, head.length - over)) + marker + tail;
    }
    return { text: finalText, compressed: true, originalChars: origLen };
  }

  function parseToolFeedback(text) {
    const raw = String(text || "").trimStart();
    if (EMPTY_RETRY_RE.test(raw)) return { isTool: false, name: "", isError: false, signature: "", retryKind: "empty" };
    if (TRUNC_RETRY_RE.test(raw)) return { isTool: false, name: "", isError: false, signature: "", retryKind: "trunc" };
    if (PARSE_ERR_RETRY_RE.test(raw)) return { isTool: false, name: "", isError: true, signature: "", retryKind: "parse_err" };
    const match = raw.match(TOOL_OUTPUT_RE);
    if (!match) {
      return { isTool: false, name: "", isError: false, signature: "", retryKind: "" };
    }
    const name = (match[1] || match[2] || "error").trim();
    const isError = ERROR_OUTPUT_RE.test(raw);
    const body = raw.slice(match[0].length).replace(/\s+/g, " ").trim().slice(0, 180);
    return { isTool: true, name, isError, signature: `${name}|${isError ? "err" : "ok"}|${body}`, retryKind: "" };
  }

  function createEngine(deps = {}) {
    const nowFn = deps.now || (() => Date.now());
    const sleepFn = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const randFn = deps.random || Math.random;
    const postToolWaitMs = typeof deps.postToolWaitMs === "number" ? Math.max(0, deps.postToolWaitMs) : DEFAULT_POST_TOOL_WAIT_MS;
    const cycleCooldownMs = typeof deps.cycleCooldownMs === "number" ? Math.max(100, deps.cycleCooldownMs) : DEFAULT_CYCLE_COOLDOWN_MS;
    const highHeatCooldownMs = typeof deps.highHeatCooldownMs === "number" ? Math.max(100, deps.highHeatCooldownMs) : DEFAULT_HIGH_HEAT_COOLDOWN_MS;
    const breatherCooldownMs = typeof deps.breatherCooldownMs === "number" ? Math.max(100, deps.breatherCooldownMs) : DEFAULT_BREATHER_COOLDOWN_MS;
    const riskLockMs = typeof deps.riskLockMs === "number" ? Math.max(100, deps.riskLockMs) : DEFAULT_RISK_LOCK_MS;
    const heatDecayMs = typeof deps.heatDecayMs === "number" ? Math.max(1000, deps.heatDecayMs) : DEFAULT_HEAT_DECAY_MS;
    const hiddenGraceMs = typeof deps.hiddenGraceMs === "number" ? Math.max(0, deps.hiddenGraceMs) : DEFAULT_HIDDEN_GRACE_MS;
    const bellMaxExtraMs = typeof deps.bellMaxExtraMs === "number" ? Math.max(0, deps.bellMaxExtraMs) : 0;

    let state = makeEmptyState(nowFn());
    let slowSendRemainingMs = 0;
    let slowSendRunNum = 0;
    let cancelEpoch = 0;
    let returnedFromHiddenAt = 0;
    let pacingFn = deps.pacingRequest || null;
    let sendContextFn = deps.sendContext || (() => ({}));
    let chatKeyFn = deps.conversationKey || (() => "");
    let scanWarningFn = deps.scanPageWarning || (() => null);
    let diagFn = deps.diag || (() => {});
    const listeners = new Set();
    const modalListeners = new Set();
    if (deps.onUpdate) listeners.add(deps.onUpdate);
    if (deps.onCooldownModal) modalListeners.add(deps.onCooldownModal);

    function logDiag(event, data) {
      try { diagFn(event, data); } catch {}
    }

    function applyDecayAndExpiry(s, now) {
      let changed = false;
      const nextSends = pruneTimestamps(s.sendTimestamps, now);
      const nextTools = pruneTimestamps(s.toolTimestamps, now);
      if (nextSends.length !== s.sendTimestamps.length) { s.sendTimestamps = nextSends; changed = true; }
      if (nextTools.length !== s.toolTimestamps.length) { s.toolTimestamps = nextTools; changed = true; }

      if (s.riskLockUntil > 0 && now >= s.riskLockUntil) {
        s.riskLockUntil = 0;
        s.riskLockReason = "";
        s.heat = Math.min(s.heat, 12);
        s.heatUpdatedAt = now;
        changed = true;
      }
      if (s.cooldownUntil > 0 && now >= s.cooldownUntil) {
        if (s.pendingResetMode === "full_zero") {
          s.heat = 0;
          s.runTools = 0;
        } else if (s.pendingResetMode === "cool_safe") {
          s.heat = Math.min(s.heat, 12);
        } else if (s.pendingResetMode === "cool_warning") {
          s.heat = Math.min(s.heat, 15);
        }
        s.cooldownUntil = 0;
        s.cooldownReason = "";
        s.cooldownDurationMs = 0;
        s.cooldownTriggerHeat = 0;
        s.pendingResetMode = "";
        s.heatUpdatedAt = now;
        changed = true;
      } else if (s.riskLockUntil === 0 && s.cooldownUntil === 0 && s.heat > 0 && s.heatUpdatedAt > 0 && now > s.heatUpdatedAt) {
        const steps = Math.floor((now - s.heatUpdatedAt) / heatDecayMs);
        if (steps > 0) {
          s.heat = Math.max(0, s.heat - steps);
          s.heatUpdatedAt += steps * heatDecayMs;
          changed = true;
        }
      }
      return changed;
    }

    function getSnapshot() {
      const now = nowFn();
      if (applyDecayAndExpiry(state, now)) {
        void saveStorage();
      }
      const riskLockRemainingMs = Math.max(0, state.riskLockUntil - now);
      const cooldownRemainingMs = Math.max(0, state.cooldownUntil - now);
      const tier = riskLockRemainingMs > 0 ? 2 : cooldownRemainingMs > 0 ? 1 : 0;
      const label = riskLockRemainingMs > 0
        ? "Risk Lock"
        : cooldownRemainingMs > 0
          ? "Cooldown"
          : state.checkpointPaused
            ? "Checkpoint"
            : state.heat < DEFAULT_SAFE_THRESHOLD
              ? "Safe"
              : "Heated";
      return {
        tier,
        heat: state.heat,
        label,
        runTools: state.runTools,
        runLimit: LIMITS.runTools,
        autoTurns: state.autoTurns,
        maxAutoTurns: LIMITS.maxAutoTurns,
        checkpointEnabled: state.checkpointEnabled,
        checkpointPaused: state.checkpointPaused,
        sends2m: countSince(state.sendTimestamps, now - WINDOW_2M_MS),
        sends10m: countSince(state.sendTimestamps, now - WINDOW_10M_MS),
        tools10m: countSince(state.toolTimestamps, now - WINDOW_10M_MS),
        sends1h: countSince(state.sendTimestamps, now - WINDOW_1H_MS),
        tools1h: countSince(state.toolTimestamps, now - WINDOW_1H_MS),
        sends24h: countSince(state.sendTimestamps, now - WINDOW_24H_MS),
        limits: { ...LIMITS },
        cooldownUntil: state.cooldownUntil,
        cooldownRemainingMs,
        cooldownReason: state.cooldownReason,
        cooldownDurationMs: state.cooldownDurationMs,
        cooldownTriggerHeat: state.cooldownTriggerHeat,
        riskLockUntil: state.riskLockUntil,
        riskLockRemainingMs,
        riskLockReason: state.riskLockReason,
        consecutiveErrors: state.consecutiveErrors,
        compressedCount: state.compressedCount,
        duplicateCount: state.duplicateCount,
        slowSendRemainingMs,
        slowSendRunNum,
      };
    }

    function emitUpdate() {
      const snap = getSnapshot();
      for (const fn of listeners) {
        try { fn(snap); } catch {}
      }
      return snap;
    }

    function emitModal(info) {
      for (const fn of modalListeners) {
        try { fn(info); } catch {}
      }
    }

    async function saveStorage() {
      if (!deps.storage) return;
      try {
        await deps.storage.set({ [STORAGE_KEY]: { ...state } });
      } catch {}
    }

    function mergeExternalState(raw) {
      if (!raw || typeof raw !== "object") return;
      const now = nowFn();
      const incoming = { ...makeEmptyState(now), ...raw };
      applyDecayAndExpiry(incoming, now);
      applyDecayAndExpiry(state, now);

      state.sendTimestamps = mergeTimestampLists(state.sendTimestamps, incoming.sendTimestamps || [], now);
      state.toolTimestamps = mergeTimestampLists(state.toolTimestamps, incoming.toolTimestamps || [], now);

      if (incoming.riskLockUntil > state.riskLockUntil) {
        state.riskLockUntil = incoming.riskLockUntil;
        state.riskLockReason = incoming.riskLockReason || state.riskLockReason;
        state.heat = 100;
      }
      if (incoming.cooldownUntil > state.cooldownUntil) {
        state.cooldownUntil = incoming.cooldownUntil;
        state.cooldownReason = incoming.cooldownReason || state.cooldownReason;
        state.cooldownDurationMs = incoming.cooldownDurationMs || state.cooldownDurationMs;
        state.cooldownTriggerHeat = Math.max(state.cooldownTriggerHeat, clampHeat(incoming.cooldownTriggerHeat));
        state.pendingResetMode = incoming.pendingResetMode || state.pendingResetMode;
        state.heat = Math.max(state.heat, clampHeat(incoming.heat));
      } else if (incoming.cooldownUntil === 0 && state.cooldownUntil === 0 && state.riskLockUntil === 0) {
        if ((incoming.heatUpdatedAt || 0) > state.heatUpdatedAt) {
          state.heat = clampHeat(incoming.heat);
          state.runTools = Math.max(0, Math.min(LIMITS.runTools, Number(incoming.runTools) || 0));
          state.heatUpdatedAt = incoming.heatUpdatedAt;
        }
      }
      if (typeof incoming.checkpointEnabled === "boolean") {
        state.checkpointEnabled = incoming.checkpointEnabled;
      }
      state.compressedCount = Math.max(state.compressedCount, Number(incoming.compressedCount) || 0);
      state.duplicateCount = Math.max(state.duplicateCount, Number(incoming.duplicateCount) || 0);
    }

    async function loadStorage() {
      if (!deps.storage) return;
      try {
        const res = await deps.storage.get([STORAGE_KEY, LEGACY_STORAGE_KEY]);
        if (res && res[LEGACY_STORAGE_KEY] && !res[STORAGE_KEY]) {
          mergeExternalState(res[LEGACY_STORAGE_KEY]);
        }
        if (res && res[STORAGE_KEY]) {
          mergeExternalState(res[STORAGE_KEY]);
        }
        emitUpdate();
      } catch {}
    }

    if (deps.storageOnChanged && typeof deps.storageOnChanged.addListener === "function") {
      try {
        deps.storageOnChanged.addListener((changes, area) => {
          if (area !== "local" || !changes || !changes[STORAGE_KEY]) return;
          mergeExternalState(changes[STORAGE_KEY].newValue);
          emitUpdate();
        });
      } catch {}
    }

    function mergeBackendSnapshot(res) {
      if (!res || !res.ok || typeof res.heat !== "number") return;
      const now = nowFn();
      const lockRem = Math.max(0, Number(res.risk_lock_remaining_ms) || 0);
      if (lockRem > 0) {
        const lockUntil = now + lockRem;
        if (lockUntil > state.riskLockUntil) {
          state.riskLockUntil = lockUntil;
          state.riskLockReason = String(res.risk_lock_reason || state.riskLockReason || "WAF / rate-limit detected");
          state.heat = 100;
        }
      }
      const rem = Math.max(0, Number(res.cooldown_remaining_ms) || 0);
      if (rem > 0) {
        const until = now + rem;
        if (until > state.cooldownUntil) {
          state.cooldownUntil = until;
          state.cooldownReason = String(res.cooldown_reason || state.cooldownReason || "cooldown");
          state.cooldownDurationMs = Number(res.cooldown_duration_ms) || rem;
          state.cooldownTriggerHeat = clampHeat(res.cooldown_trigger_heat || res.heat);
          state.pendingResetMode = state.cooldownReason === "batch_4_tools" || state.cooldownReason === "manual_cool"
            ? "full_zero"
            : "cool_safe";
        }
      }
      if (Number(res.heat) > state.heat || (lockRem === 0 && rem === 0 && state.cooldownUntil === 0 && state.riskLockUntil === 0 && Number(res.heat_updated_at || 0) > state.heatUpdatedAt)) {
        state.heat = clampHeat(res.heat);
        state.runTools = Math.max(0, Math.min(LIMITS.runTools, Number(res.run_tools) || 0));
      }
      state.compressedCount = Math.max(state.compressedCount, Number(res.compressed_count) || 0);
      state.duplicateCount = Math.max(state.duplicateCount, Number(res.duplicate_count) || 0);
    }

    async function syncBackendStatus() {
      if (!pacingFn) return;
      try {
        const res = await pacingFn({ action: "antiban_status" });
        mergeBackendSnapshot(res);
        await saveStorage();
        emitUpdate();
      } catch {}
    }

    function startTier1Cooldown(now, durationMs, reason, resetMode) {
      const until = now + durationMs;
      if (until >= state.cooldownUntil) {
        state.cooldownUntil = until;
        state.cooldownReason = reason;
        state.cooldownDurationMs = durationMs;
        state.cooldownTriggerHeat = state.heat;
        state.pendingResetMode = resetMode;
      }
    }

    function activateRiskLock(now, reason) {
      state.heat = 100;
      state.heatUpdatedAt = now;
      state.riskLockUntil = Math.max(state.riskLockUntil, now + riskLockMs);
      state.riskLockReason = String(reason || "WAF / rate-limit / CAPTCHA detected").slice(0, 180);
    }

    async function resetShield() {
      const now = nowFn();
      state.riskLockUntil = 0;
      state.riskLockReason = "";
      state.cooldownUntil = 0;
      state.cooldownReason = "";
      state.cooldownDurationMs = 0;
      state.cooldownTriggerHeat = 0;
      state.pendingResetMode = "";
      state.checkpointPaused = false;
      state.consecutiveErrors = 0;
      state.emptyRetries = 0;
      state.truncRetries = 0;
      state.parseErrRetries = 0;
      state.heat = Math.min(state.heat, 12);
      state.heatUpdatedAt = now;
      if (pacingFn) {
        try { await pacingFn({ action: "antiban_reset_shield" }); } catch {}
      }
      await saveStorage();
      logDiag("deepseek.antiban.reset_shield", { heat: state.heat });
      return emitUpdate();
    }

    function resumeCheckpoint() {
      state.checkpointPaused = false;
      state.autoTurns = 0;
      state.emptyRetries = 0;
      state.truncRetries = 0;
      state.parseErrRetries = 0;
      logDiag("deepseek.antiban.resume_checkpoint", { heat: state.heat });
      return emitUpdate();
    }

    function setCheckpointEnabled(enabled) {
      state.checkpointEnabled = !!enabled;
      if (!state.checkpointEnabled) state.checkpointPaused = false;
      void saveStorage();
      return emitUpdate();
    }

    async function recordEvent(
      kind,
      opts = {}
    ) {
      const now = nowFn();
      applyDecayAndExpiry(state, now);
      const prevCooldown = state.cooldownUntil;
      const prevRiskLock = state.riskLockUntil;
      if (opts.compressed) state.compressedCount += 1;

      if (kind === "tool_send") {
        state.sendTimestamps.push(now);
        state.toolTimestamps.push(now);
        state.runTools += 1;
        state.autoTurns += 1;
        if (!opts.isError) state.consecutiveErrors = 0;
        const s2 = countSince(state.sendTimestamps, now - WINDOW_2M_MS);
        const s10 = countSince(state.sendTimestamps, now - WINDOW_10M_MS);
        const s1h = countSince(state.sendTimestamps, now - WINDOW_1H_MS);
        let delta = 12;
        if ((opts.chars || 0) > 12000) delta += 6;
        if (s2 >= 3) delta += 10;
        if (s10 >= 7) delta += 8;
        if (s1h >= 18) delta += 8;
        state.heat = clampHeat(state.heat + delta);
        state.heatUpdatedAt = now;
      } else if (kind === "auto_send") {
        state.sendTimestamps.push(now);
        state.autoTurns += 1;
        state.heat = clampHeat(state.heat + 8);
        state.heatUpdatedAt = now;
      } else if (kind === "manual_send") {
        state.sendTimestamps.push(now);
        state.consecutiveErrors = 0;
        state.autoTurns = 0;
        state.checkpointPaused = false;
        state.emptyRetries = 0;
        state.truncRetries = 0;
        state.parseErrRetries = 0;
        state.heat = clampHeat(state.heat + 6);
        state.heatUpdatedAt = now;
      } else if (kind === "duplicate") {
        state.duplicateCount += 1;
        state.consecutiveDuplicates += 1;
        state.heat = clampHeat(state.heat + 15);
        state.heatUpdatedAt = now;
      } else if (kind === "tool_error") {
        state.consecutiveErrors += 1;
        state.heat = clampHeat(state.heat + 12);
        state.heatUpdatedAt = now;
      } else if (kind === "site_warning") {
        activateRiskLock(now, opts.reason || "DeepSeek rate-limit / WAF / CAPTCHA detected");
      } else if (kind === "manual_cool") {
        state.heatUpdatedAt = now;
        startTier1Cooldown(now, cycleCooldownMs, "manual_cool", "full_zero");
      }

      if (kind !== "site_warning" && kind !== "manual_cool") {
        const s2 = countSince(state.sendTimestamps, now - WINDOW_2M_MS);
        const s10 = countSince(state.sendTimestamps, now - WINDOW_10M_MS);
        const t10 = countSince(state.toolTimestamps, now - WINDOW_10M_MS);
        const s1h = countSince(state.sendTimestamps, now - WINDOW_1H_MS);
        const t1h = countSince(state.toolTimestamps, now - WINDOW_1H_MS);
        const s24 = countSince(state.sendTimestamps, now - WINDOW_24H_MS);
        const isSendKind = kind === "tool_send" || kind === "auto_send" || kind === "manual_send";
        if (kind === "tool_send" && state.runTools >= LIMITS.runTools) {
          startTier1Cooldown(now, cycleCooldownMs, "batch_4_tools", "full_zero");
        } else if (state.heat > DEFAULT_HIGH_HEAT_THRESHOLD) {
          startTier1Cooldown(now, highHeatCooldownMs, "high_heat", "cool_safe");
        } else if (isSendKind && ((state.heat >= 75 && s2 >= LIMITS.sends2m) || s2 > LIMITS.sends2m || s10 > LIMITS.sends10m || t10 > LIMITS.tools10m || s1h > LIMITS.sends1h || t1h > LIMITS.tools1h || s24 > LIMITS.sends24h)) {
          startTier1Cooldown(now, breatherCooldownMs, "velocity_breather", "cool_safe");
        }
      }

      const newRiskLock = state.riskLockUntil > prevRiskLock && state.riskLockUntil > now;
      const newCooldown = !newRiskLock && state.cooldownUntil > prevCooldown && state.cooldownUntil > now;

      if (pacingFn) {
        try {
          const res = await pacingFn({
            action: "antiban_record",
            kind: kind === "auto_send" ? "manual_send" : kind,
            chars: opts.chars || 0,
            compressed: opts.compressed === true,
            is_error: opts.isError === true,
            reason: opts.reason,
          });
          mergeBackendSnapshot(res);
        } catch {}
      }

      await saveStorage();
      const snap = emitUpdate();
      if (opts.notify !== false) {
        if (newRiskLock) {
          const mins = Math.max(1, Math.ceil(snap.riskLockRemainingMs / 60000));
          logDiag("deepseek.antiban.risk_lock", { reason: snap.riskLockReason, heat: 100 });
          emitModal({
            mode: "risk_lock",
            title: T("DeepSeek Anti-Ban Shield Paused"),
            seconds: Math.ceil(snap.riskLockRemainingMs / 1000),
            heat: 100,
            reason: "site_warning",
            message: `Risk Lock active for ${mins}m (${snap.riskLockReason || "WAF / rate-limit / CAPTCHA"}). Sending stopped cleanly — resolve any notice on DeepSeek or click Reset Shield.`,
          });
        } else if (newCooldown) {
          const secs = Math.max(1, Math.ceil(snap.cooldownRemainingMs / 1000));
          logDiag("deepseek.antiban.cooldown", { reason: snap.cooldownReason, seconds: secs, heat: snap.heat });
          emitModal({
            mode: "cooldown",
            title: T("DeepSeek Anti-Ban Limit"),
            seconds: secs,
            heat: snap.heat,
            reason: snap.cooldownReason,
            message: `DeepSeek Anti-Ban triggered a ${secs}s cooldown (account heat ${snap.heat}/100) to avoid suspension.`,
          });
        }
      }
      return snap;
    }

    function sendError(message, code, expectedCancellation = false) {
      const err = new Error(message);
      err.code = code;
      if (expectedCancellation) err.expectedCancellation = true;
      return err;
    }

    async function sleepCancellable(ms, guard, onTick) {
      const deadline = nowFn() + ms;
      while (true) {
        guard();
        const rem = deadline - nowFn();
        if (onTick) onTick(Math.max(0, rem));
        if (rem <= 0) break;
        await sleepFn(Math.min(100, rem));
      }
      guard();
    }

    async function waitTier1CooldownIfNeeded(guard) {
      let snap = getSnapshot();
      if (snap.riskLockRemainingMs > 0) {
        emitModal({
          mode: "risk_lock",
          title: T("DeepSeek Anti-Ban Shield Paused"),
          seconds: Math.ceil(snap.riskLockRemainingMs / 1000),
          heat: 100,
          reason: "site_warning",
          message: `Risk Lock is active (${Math.ceil(snap.riskLockRemainingMs / 1000)}s left). Never retrying into an active warning — click Reset Shield once DeepSeek is clear.`,
        });
        throw sendError(`DeepSeek Anti-Ban Risk Lock active (${Math.ceil(snap.riskLockRemainingMs / 1000)}s left).`, "DEEPSEEK_PAUSED");
      }
      if (snap.cooldownRemainingMs <= 0 && snap.heat > DEFAULT_HIGH_HEAT_THRESHOLD) {
        startTier1Cooldown(nowFn(), highHeatCooldownMs, "high_heat", "cool_safe");
        await saveStorage();
        snap = emitUpdate();
        const secs = Math.max(1, Math.ceil(snap.cooldownRemainingMs / 1000));
        emitModal({
          mode: "cooldown",
          title: T("DeepSeek Anti-Ban Limit"),
          seconds: secs,
          heat: snap.heat,
          reason: "high_heat",
          message: `DeepSeek Anti-Ban triggered a ${secs}s cooldown (account heat ${snap.heat}/100) to avoid suspension.`,
        });
      }
      if (snap.cooldownRemainingMs <= 0) return;

      logDiag("deepseek.antiban.wait_cooldown", { ms: snap.cooldownRemainingMs, reason: snap.cooldownReason, heat: snap.heat });
      while (true) {
        guard();
        const cur = getSnapshot();
        if (cur.riskLockRemainingMs > 0) throw sendError("DeepSeek Anti-Ban Risk Lock active.", "DEEPSEEK_PAUSED");
        emitUpdate();
        if (cur.cooldownRemainingMs <= 0) break;
        await sleepFn(Math.min(100, cur.cooldownRemainingMs));
      }
      emitUpdate();
    }

    function markVisibleTransition(hidden) {
      if (!hidden) returnedFromHiddenAt = nowFn();
    }

    async function gateSend(
      text,
      images,
      opts,
      rawSend
    ) {
      if (opts && opts.userPrompt === true) {
        void recordEvent("manual_send", { notify: false });
        const res = await rawSend(text, images, opts);
        return res !== false;
      }

      const startEpoch = cancelEpoch;
      const startCtx = { ...sendContextFn() };
      const startChat = chatKeyFn();
      const assertActive = () => {
        const curCtx = sendContextFn();
        const curChat = chatKeyFn();
        if (
          cancelEpoch !== startEpoch ||
          curCtx.session !== startCtx.session ||
          curCtx.stop !== startCtx.stop ||
          (startChat && curChat && curChat !== startChat)
        ) {
          slowSendRemainingMs = 0;
          slowSendRunNum = 0;
          emitUpdate();
          throw sendError("DeepSeek Anti-Ban send cancelled cleanly.", "DEEPSEEK_CANCELLED", true);
        }
      };

      // 1. Early WAF/Captcha & Risk Lock check — NEVER retry into an active warning
      const domWaf = typeof document !== "undefined" ? scanWafAndCaptcha(document) : null;
      const pageWarn = domWaf || scanWarningFn();
      if (pageWarn && (domWaf || SITE_WARNING_RE.test(pageWarn))) {
        const warnSnap = await recordEvent("site_warning", { notify: true, reason: pageWarn });
        throw sendError(`DeepSeek Anti-Ban Shield Paused: ${pageWarn} (${Math.ceil(warnSnap.riskLockRemainingMs / 1000)}s Risk Lock).`, "DEEPSEEK_PAUSED");
      }

      // 2. Inspect feedback for unattended retry limits, duplicate breaker, and 3-error breaker
      const parsed = parseToolFeedback(text);
      if (parsed.retryKind === "empty") {
        state.emptyRetries += 1;
        if (state.emptyRetries > DEFAULT_MAX_EMPTY_RETRIES) {
          const msg = "DeepSeek Anti-Ban Shield Paused: unattended empty-reply retries are disabled (MAX_EMPTY = 0).";
          emitModal({ mode: "checkpoint", title: T("DeepSeek Anti-Ban Shield Paused"), seconds: 0, heat: state.heat, reason: "max_empty", message: msg });
          throw sendError(msg, "DEEPSEEK_PAUSED");
        }
      } else if (parsed.retryKind === "trunc") {
        state.truncRetries += 1;
        if (state.truncRetries > DEFAULT_MAX_TRUNC_RETRIES) {
          const msg = "DeepSeek Anti-Ban Shield Paused: max unattended truncation retry (1/1) reached.";
          emitModal({ mode: "checkpoint", title: T("DeepSeek Anti-Ban Shield Paused"), seconds: 0, heat: state.heat, reason: "max_trunc", message: msg });
          throw sendError(msg, "DEEPSEEK_PAUSED");
        }
      } else if (parsed.retryKind === "parse_err") {
        state.parseErrRetries += 1;
        if (state.parseErrRetries > DEFAULT_MAX_PARSE_ERR_RETRIES) {
          const msg = "DeepSeek Anti-Ban Shield Paused: max unattended parse retry (1/1) reached.";
          emitModal({ mode: "checkpoint", title: T("DeepSeek Anti-Ban Shield Paused"), seconds: 0, heat: state.heat, reason: "max_parse_err", message: msg });
          throw sendError(msg, "DEEPSEEK_PAUSED");
        }
      }

      // 3. Auto-Turn Safe Checkpoint after MAX_AUTO_TURNS (3) unattended turns per prompt
      if (state.checkpointEnabled && state.autoTurns >= LIMITS.maxAutoTurns) {
        state.checkpointPaused = true;
        void saveStorage();
        emitUpdate();
        const msg = `Safe Checkpoint reached after ${LIMITS.maxAutoTurns} unattended automated turns. Review the chat and click Resume to continue safely.`;
        logDiag("deepseek.antiban.checkpoint", { autoTurns: state.autoTurns, heat: state.heat });
        emitModal({ mode: "checkpoint", title: T("DeepSeek Anti-Ban Shield Paused"), seconds: 0, heat: state.heat, reason: "auto_turns", message: msg });
        throw sendError(msg, "DEEPSEEK_PAUSED");
      }

      let outText = text;
      if (parsed.isTool) {
        if (parsed.signature === state.lastToolSig) {
          await recordEvent("duplicate", { notify: false });
          if (state.consecutiveDuplicates >= 2) {
            outText += "\n\n[PlazCode Anti-Ban: single-repeat duplicate tool call detected. Stop repeating the identical command and change approach.]";
          }
        } else {
          state.lastToolSig = parsed.signature;
          state.consecutiveDuplicates = 1;
        }

        if (parsed.isError) {
          await recordEvent("tool_error", { notify: false });
          if (state.consecutiveErrors >= 3) {
            const msg = "DeepSeek Anti-Ban Shield Paused after 3 consecutive failing tool outputs to prevent an automated retry loop.";
            logDiag("deepseek.antiban.error_breaker", { errors: state.consecutiveErrors, heat: state.heat });
            emitModal({ mode: "checkpoint", title: T("DeepSeek Anti-Ban Shield Paused"), seconds: 0, heat: state.heat, reason: "error_breaker", message: msg });
            throw sendError(msg, "DEEPSEEK_PAUSED");
          }
        } else {
          state.consecutiveErrors = 0;
        }
      }

      const shaped = shapeOutput(outText);
      if (shaped.compressed) {
        logDiag("deepseek.antiban.compressed", { from: shaped.originalChars, to: shaped.text.length });
      }

      await waitTier1CooldownIfNeeded(assertActive);

      // 4. Exact 5.0s post-tool wait + optional bell-curve extra / hidden-tab grace
      const hiddenGrace = (nowFn() - returnedFromHiddenAt) < 4000 ? hiddenGraceMs : 0;
      const bellExtra = bellMaxExtraMs > 0 ? bellJitterMs(0, bellMaxExtraMs, randFn) : 0;
      const dwellWaitMs = parsed.isTool ? postToolWaitMs + hiddenGrace + bellExtra : 0;
      if (dwellWaitMs > 0) {
        const curSnap = getSnapshot();
        slowSendRunNum = Math.min(LIMITS.runTools, curSnap.runTools + 1);
        logDiag("deepseek.antiban.slow_send_start", { ms: dwellWaitMs, run: slowSendRunNum, sends2m: curSnap.sends2m });
        try {
          await sleepCancellable(dwellWaitMs, assertActive, (rem) => {
            slowSendRemainingMs = rem;
            emitUpdate();
          });
        } finally {
          slowSendRemainingMs = 0;
          slowSendRunNum = 0;
        }
        emitUpdate();
      }

      const sent = await rawSend(shaped.text, images, opts);
      if (sent !== false) {
        await recordEvent(parsed.isTool ? "tool_send" : "auto_send", {
          chars: shaped.text.length,
          compressed: shaped.compressed,
          isError: parsed.isError,
          notify: true,
        });
      }
      return sent !== false;
    }

    function resetRunContext() {
      state.consecutiveErrors = 0;
      state.consecutiveDuplicates = 0;
      state.lastToolSig = "";
      state.autoTurns = 0;
      state.checkpointPaused = false;
      state.emptyRetries = 0;
      state.truncRetries = 0;
      state.parseErrRetries = 0;
      slowSendRemainingMs = 0;
      slowSendRunNum = 0;
      emitUpdate();
    }

    function cancelPending() {
      cancelEpoch += 1;
      slowSendRemainingMs = 0;
      slowSendRunNum = 0;
      emitUpdate();
    }

    function updateDeps(next) {
      if (typeof next.pacingRequest === "function") pacingFn = next.pacingRequest;
      if (typeof next.sendContext === "function") sendContextFn = next.sendContext;
      if (typeof next.conversationKey === "function") chatKeyFn = next.conversationKey;
      if (typeof next.scanPageWarning === "function") scanWarningFn = next.scanPageWarning;
      if (typeof next.diag === "function") diagFn = next.diag;
    }

    return {
      LIMITS,
      POST_TOOL_WAIT_MS: postToolWaitMs,
      OUTPUT_COMPRESS_LIMIT,
      shapeOutput,
      parseToolFeedback,
      bellJitterMs,
      calcReviewDwellMs,
      getSnapshot,
      loadStorage,
      syncBackendStatus,
      recordEvent,
      gateSend,
      resetShield,
      resumeCheckpoint,
      setCheckpointEnabled,
      markVisibleTransition,
      cancelPending,
      resetRunContext,
      updateDeps,
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      subscribeModal(fn) {
        modalListeners.add(fn);
        return () => modalListeners.delete(fn);
      },
      isSiteWarningText: (text) => SITE_WARNING_RE.test(String(text || "")),
    };
  }

  function svgIcon(kind) {
    if (typeof document === "undefined") return null;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "14");
    svg.setAttribute("height", "14");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    const addPath = (d) => {
      const p = document.createElementNS(ns, "path");
      p.setAttribute("d", d);
      svg.appendChild(p);
    };
    if (kind === "safe") {
      addPath("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z");
      addPath("m9 12 2 2 4-4");
    } else if (kind === "heated") {
      addPath("M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z");
      addPath("M12 9v4");
      addPath("M12 17h.01");
    } else if (kind === "hourglass") {
      addPath("M5 22h14");
      addPath("M5 2h14");
      addPath("M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22");
      addPath("M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2");
    } else {
      addPath("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z");
    }
    return svg;
  }

  function findPrimarySendButton() {
    if (typeof document === "undefined") return null;
    const sels = [".ds-button--primary", 'button[type="submit"]', '[aria-label*="Send" i]', '[aria-label*="发送"]'];
    for (const sel of sels) {
      try {
        const list = document.querySelectorAll(sel);
        for (let i = list.length - 1; i >= 0; i--) {
          const el = list[i];
          if (el && !el.closest("#rs-root")) return el;
        }
      } catch {}
    }
    return null;
  }

  function installHumanSendWrapper(
    text,
    rawSend,
    imgs,
    opts
  ) {
    const enabled = typeof window === "undefined" || (window).__PLAZCODE_DS_ANTIBAN_TEST_OPTS__?.humanizeSend !== false;
    if (!enabled || typeof document === "undefined") {
      return Promise.resolve(rawSend(text, imgs, opts));
    }
    const ed = typeof RSProvider !== "undefined" && RSProvider && typeof RSProvider.getEditor === "function" ? RSProvider.getEditor() : null;
    const btn = findPrimarySendButton();
    const origClick = btn && typeof btn.click === "function" ? btn.click : null;

    if (btn && origClick) {
      btn.click = function () {
        const pt = interiorPoint(this);
        dispatchSyntheticPointer(this, "pointerover", pt.x, pt.y);
        dispatchSyntheticPointer(this, "mouseover", pt.x, pt.y);
        dispatchSyntheticPointer(this, "pointermove", pt.x, pt.y);
        dispatchSyntheticPointer(this, "pointerdown", pt.x, pt.y);
        dispatchSyntheticPointer(this, "mousedown", pt.x, pt.y);
        dispatchSyntheticPointer(this, "mouseup", pt.x, pt.y);
        dispatchSyntheticPointer(this, "pointerup", pt.x, pt.y);
        return origClick.call(this);
      };
    }

    const cleanup = () => {
      if (btn && origClick && btn.click !== origClick) {
        btn.click = origClick;
      }
    };

    const run = async () => {
      try {
        // Animate short burst keystrokes only on empty composer before deepseek.ts writes canonical draft
        const current = typeof RSProvider !== "undefined" && RSProvider && typeof RSProvider.editorText === "function" ? RSProvider.editorText() : "";
        if (ed && !String(current || "").trim() && String(text || "").length <= 140) {
          await humanFillText(ed, text, { burstMs: [12, 32] });
          setNativeEditorValue(ed, "");
        }
        return await rawSend(text, imgs, opts);
      } finally {
        cleanup();
      }
    };
    return run();
  }

  function mountRuntimeUI() {
    if (typeof window === "undefined" || typeof document === "undefined") return null;
    if (typeof RSProvider === "undefined" || !RSProvider || RSProvider.id !== "deepseek") return null;

    const storageArea = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local ? chrome.storage.local : null;
    const storageChanges = typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged ? chrome.storage.onChanged : null;
    const overrides = (window).__PLAZCODE_DS_ANTIBAN_TEST_OPTS__ || {};

    const engine = createEngine({
      storage: storageArea,
      storageOnChanged: storageChanges,
      conversationKey: () => (typeof RSProvider.conversationKey === "function" ? RSProvider.conversationKey() : ""),
      scanPageWarning: () => {
        try {
          const waf = scanWafAndCaptcha(document);
          if (waf) return waf;
          const err = typeof RSProvider.scanError === "function" ? RSProvider.scanError() : null;
          if (err) return String(err);
          const busy = typeof RSProvider.scanBusy === "function" ? RSProvider.scanBusy() : null;
          if (busy) return String(busy);
        } catch {}
        return null;
      },
      ...overrides,
    });

    const rawInit = typeof RSProvider.init === "function" ? RSProvider.init.bind(RSProvider) : () => {};
    const rawSend = typeof RSProvider.typeAndSend === "function" ? RSProvider.typeAndSend.bind(RSProvider) : async () => false;
    const rawCancel = typeof RSProvider.cancelPendingSends === "function" ? RSProvider.cancelPendingSends.bind(RSProvider) : () => {};
    const rawScanError = typeof RSProvider.scanError === "function" ? RSProvider.scanError.bind(RSProvider) : () => null;
    const rawNoteRateLimit = typeof RSProvider.noteRateLimit === "function" ? RSProvider.noteRateLimit.bind(RSProvider) : async () => ({ ok: true });
    const rawNoteHealthy = typeof RSProvider.noteHealthyReply === "function" ? RSProvider.noteHealthyReply.bind(RSProvider) : async () => {};

    let lastChatKey = "";
    RSProvider.init = (cfg) => {
      const res = rawInit(cfg);
      engine.updateDeps({
        diag: cfg && typeof cfg.diag === "function" ? cfg.diag : undefined,
        sendContext: cfg && typeof cfg.sendContext === "function" ? cfg.sendContext : undefined,
        pacingRequest: cfg && typeof cfg.pacingRequest === "function" ? cfg.pacingRequest : undefined,
      });
      void engine.loadStorage().then(() => engine.syncBackendStatus());
      return res;
    };
    RSProvider.typeAndSend = (text, images, opts) => {
      const curChat = typeof RSProvider.conversationKey === "function" ? RSProvider.conversationKey() : "";
      if (curChat !== lastChatKey) {
        lastChatKey = curChat;
        engine.resetRunContext();
      }
      return engine.gateSend(text, images, opts, (t, imgs, o) =>
        installHumanSendWrapper(t, (txt, im, op) => rawSend(txt, im, op), imgs, o)
      );
    };
    RSProvider.cancelPendingSends = () => {
      engine.cancelPending();
      return rawCancel();
    };
    RSProvider.scanError = () => {
      const waf = scanWafAndCaptcha(document);
      if (waf) return waf;
      return rawScanError();
    };
    RSProvider.noteRateLimit = async (text, existing) => {
      await engine.recordEvent("site_warning", { notify: true, reason: String(text || "DeepSeek rate limit").slice(0, 180) });
      return rawNoteRateLimit(text, existing);
    };
    RSProvider.noteHealthyReply = async () => {
      engine.resetRunContext();
      return rawNoteHealthy();
    };

    document.addEventListener("visibilitychange", () => {
      engine.markVisibleTransition(document.hidden);
    });

    let pillEl = null;
    let popoverEl = null;
    let modalEl = null;
    let popoverOpen = false;
    let savedStateText = null;
    let lastIconKind = "";

    function ensureUiMounted() {
      const root = document.getElementById("rs-root");
      const bar = document.getElementById("rs-bar");
      const stateEl = document.getElementById("rs-state");
      if (!root || !bar || !stateEl) return;

      if (!pillEl || !pillEl.isConnected) {
        const existing = document.getElementById("rs-ds-antiban-pill");
        if (existing) {
          pillEl = existing;
        } else {
          pillEl = document.createElement("button");
          pillEl.type = "button";
          pillEl.id = "rs-ds-antiban-pill";
          pillEl.className = "rs-ds-ab-pill";
          pillEl.setAttribute("data-state", "safe");
          pillEl.setAttribute("aria-expanded", "false");
          pillEl.onclick = (e) => {
            e.stopPropagation();
            popoverOpen = !popoverOpen;
            if (popoverEl) popoverEl.hidden = !popoverOpen;
            if (pillEl) pillEl.setAttribute("aria-expanded", String(popoverOpen));
            renderUi(engine.getSnapshot());
          };
          const iconSpan = document.createElement("span");
          iconSpan.className = "rs-ds-ab-ico";
          const txtSpan = document.createElement("span");
          txtSpan.className = "rs-ds-ab-txt";
          pillEl.appendChild(iconSpan);
          pillEl.appendChild(txtSpan);
          stateEl.insertAdjacentElement("afterend", pillEl);
        }
      }

      if (!popoverEl || !popoverEl.isConnected) {
        const existing = document.getElementById("rs-ds-antiban-popover");
        if (existing) {
          popoverEl = existing;
        } else {
          popoverEl = document.createElement("div");
          popoverEl.id = "rs-ds-antiban-popover";
          popoverEl.className = "rs-ds-ab-popover";
          popoverEl.setAttribute("role", "dialog");
          popoverEl.setAttribute("aria-label", T("DeepSeek Anti-Ban"));
          popoverEl.hidden = true;
          root.appendChild(popoverEl);
        }
      }

      if (!modalEl || !modalEl.isConnected) {
        const existing = document.getElementById("rs-ds-antiban-modal");
        if (existing) {
          modalEl = existing;
        } else {
          modalEl = document.createElement("div");
          modalEl.id = "rs-ds-antiban-modal";
          modalEl.className = "rs-ds-ab-modal";
          modalEl.setAttribute("role", "alertdialog");
          modalEl.hidden = true;
          const title = document.createElement("div");
          title.className = "rs-ds-ab-modal-title";
          title.textContent = T("DeepSeek Anti-Ban Limit");
          const body = document.createElement("div");
          body.className = "rs-ds-ab-modal-body";
          const acts = document.createElement("div");
          acts.className = "rs-ds-ab-modal-acts";
          const primaryBtn = document.createElement("button");
          primaryBtn.type = "button";
          primaryBtn.className = "rs-ds-ab-modal-primary";
          primaryBtn.hidden = true;
          const closeBtn = document.createElement("button");
          closeBtn.type = "button";
          closeBtn.className = "rs-ds-ab-modal-close";
          closeBtn.textContent = T("Close");
          closeBtn.onclick = () => {
            if (modalEl) modalEl.hidden = true;
          };
          acts.appendChild(primaryBtn);
          acts.appendChild(closeBtn);
          modalEl.appendChild(title);
          modalEl.appendChild(body);
          modalEl.appendChild(acts);
          root.appendChild(modalEl);
        }
      }
    }

    function renderPopover(snap) {
      if (!popoverEl || popoverEl.hidden) return;
      popoverEl.replaceChildren();

      const head = document.createElement("div");
      head.className = "rs-ds-ab-pop-head";
      const hTitle = document.createElement("strong");
      hTitle.textContent = T("DeepSeek Anti-Ban");
      const hBadge = document.createElement("span");
      hBadge.className = "rs-ds-ab-pop-badge";
      hBadge.setAttribute("data-state", snap.riskLockRemainingMs > 0 ? "risk_lock" : snap.cooldownRemainingMs > 0 ? "cooldown" : snap.heat < 20 ? "safe" : "heated");
      hBadge.textContent = `${T(snap.label)} · ${snap.heat}%`;
      head.appendChild(hTitle);
      head.appendChild(hBadge);
      popoverEl.appendChild(head);

      const meterWrap = document.createElement("div");
      meterWrap.className = "rs-ds-ab-meter-wrap";
      const meterRow = document.createElement("div");
      meterRow.className = "rs-ds-ab-meter-row";
      const mLabel = document.createElement("span");
      mLabel.textContent = T("Heat meter");
      const mVal = document.createElement("span");
      mVal.textContent = `${snap.heat}% (${snap.heat < 20 ? T("Safe") : snap.heat > 80 ? ">80% Cooldown" : T("Heated")})`;
      meterRow.appendChild(mLabel);
      meterRow.appendChild(mVal);
      const track = document.createElement("div");
      track.className = "rs-ds-ab-meter-track";
      const fill = document.createElement("div");
      fill.className = "rs-ds-ab-meter-fill";
      fill.style.width = `${snap.heat}%`;
      track.appendChild(fill);
      meterWrap.appendChild(meterRow);
      meterWrap.appendChild(track);
      popoverEl.appendChild(meterWrap);

      const pipsRow = document.createElement("div");
      pipsRow.className = "rs-ds-ab-pips-row";
      const pipsLabel = document.createElement("span");
      pipsLabel.textContent = `${T("Run cycle")} (${snap.runTools}/${snap.runLimit} → 20s reset)`;
      const pips = document.createElement("div");
      pips.className = "rs-ds-ab-pips";
      for (let i = 1; i <= snap.runLimit; i++) {
        const pip = document.createElement("span");
        pip.className = i <= snap.runTools ? "rs-ds-ab-pip on" : "rs-ds-ab-pip";
        pips.appendChild(pip);
      }
      pipsRow.appendChild(pipsLabel);
      pipsRow.appendChild(pips);
      popoverEl.appendChild(pipsRow);

      const chkRow = document.createElement("label");
      chkRow.className = "rs-ds-ab-pips-row";
      const chkTxt = document.createElement("span");
      chkTxt.textContent = `${T("Auto-turn checkpoint")} (${snap.autoTurns}/${snap.maxAutoTurns})`;
      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.checked = snap.checkpointEnabled;
      chk.onchange = () => {
        engine.setCheckpointEnabled(chk.checked);
      };
      chkRow.appendChild(chkTxt);
      chkRow.appendChild(chk);
      popoverEl.appendChild(chkRow);

      const grid = document.createElement("div");
      grid.className = "rs-ds-ab-grid";
      const rows = [
        ["2m burst", `${snap.sends2m}/${snap.limits.sends2m} sends`],
        ["10m window", `${snap.sends10m}/${snap.limits.sends10m} sends · ${snap.tools10m}/${snap.limits.tools10m} tools`],
        ["1h window", `${snap.sends1h}/${snap.limits.sends1h} sends · ${snap.tools1h}/${snap.limits.tools1h} tools`],
        ["24h ceiling", `${snap.sends24h}/${snap.limits.sends24h} sends`],
      ];
      for (const [k, v] of rows) {
        const item = document.createElement("div");
        item.className = "rs-ds-ab-stat";
        const ks = document.createElement("span");
        ks.textContent = k;
        const vs = document.createElement("strong");
        vs.textContent = v;
        item.appendChild(ks);
        item.appendChild(vs);
        grid.appendChild(item);
      }
      popoverEl.appendChild(grid);

      const foot = document.createElement("div");
      foot.className = "rs-ds-ab-pop-foot";
      if (snap.riskLockRemainingMs > 0) {
        const resetBtn = document.createElement("button");
        resetBtn.type = "button";
        resetBtn.className = "rs-ds-ab-pop-btn";
        resetBtn.textContent = T("Reset Shield");
        resetBtn.onclick = () => { void engine.resetShield(); };
        foot.appendChild(resetBtn);
      } else if (snap.checkpointPaused) {
        const resumeBtn = document.createElement("button");
        resumeBtn.type = "button";
        resumeBtn.className = "rs-ds-ab-pop-btn";
        resumeBtn.textContent = T("Resume");
        resumeBtn.onclick = () => { engine.resumeCheckpoint(); };
        foot.appendChild(resumeBtn);
      } else {
        const coolBtn = document.createElement("button");
        coolBtn.type = "button";
        coolBtn.className = "rs-ds-ab-pop-btn";
        coolBtn.textContent = T("Cool down now (20s)");
        coolBtn.disabled = snap.cooldownRemainingMs > 0 || (snap.heat === 0 && snap.runTools === 0);
        coolBtn.onclick = () => {
          void engine.recordEvent("manual_cool", { notify: false });
        };
        foot.appendChild(coolBtn);
      }
      popoverEl.appendChild(foot);
    }

    function formatMinSec(ms) {
      const total = Math.max(1, Math.ceil(ms / 1000));
      const m = Math.floor(total / 60);
      const s = total % 60;
      return m > 0 ? `${m}m ${s < 10 ? "0" : ""}${s}s` : `${s}s`;
    }

    function renderUi(snap) {
      ensureUiMounted();
      if (!pillEl) return;

      let visualState = "safe";
      let iconKind = "safe";
      let labelText = "";

      if (snap.riskLockRemainingMs > 0) {
        visualState = "risk_lock";
        iconKind = "shield";
        labelText = `${T("Risk Lock")} ${formatMinSec(snap.riskLockRemainingMs)}`;
      } else if (snap.cooldownRemainingMs > 0) {
        visualState = "cooldown";
        iconKind = "shield";
        const secs = Math.max(1, Math.ceil(snap.cooldownRemainingMs / 1000));
        labelText = `${T("Cooldown")} ${secs}s`;
      } else if (snap.checkpointPaused) {
        visualState = "checkpoint";
        iconKind = "shield";
        labelText = `${T("DeepSeek Anti-Ban Shield Paused")} (${snap.autoTurns}/${snap.maxAutoTurns})`;
      } else if (snap.slowSendRemainingMs > 0) {
        visualState = "slow_send";
        iconKind = "hourglass";
        const secs = (snap.slowSendRemainingMs / 1000).toFixed(1);
        labelText = `${T("Anti-Ban slow send")} · ${secs}s (2m ${snap.sends2m}/${snap.limits.sends2m}, run ${snap.slowSendRunNum}/${snap.runLimit})`;
      } else if (snap.heat >= DEFAULT_SAFE_THRESHOLD) {
        visualState = "heated";
        iconKind = "heated";
        labelText = `${T("Heated")} ${snap.heat}% · ${snap.sends2m}/${snap.limits.sends2m} 2m · ${snap.sends1h}/${snap.limits.sends1h} 1h`;
      } else {
        visualState = "safe";
        iconKind = "safe";
        labelText = `${T("Shield Safe")} · ${snap.sends2m}/${snap.limits.sends2m} 2m · ${snap.sends1h}/${snap.limits.sends1h} 1h`;
      }

      pillEl.setAttribute("data-state", visualState);
      pillEl.title = `DeepSeek Anti-Ban status: ${snap.label} (${snap.heat}% heat) — Run ${snap.runTools}/${snap.runLimit} (20s reset) · Auto turns ${snap.autoTurns}/${snap.maxAutoTurns} · 2m ${snap.sends2m}/${snap.limits.sends2m} · 10m ${snap.sends10m}/${snap.limits.sends10m} · 1h ${snap.sends1h}/${snap.limits.sends1h} · 24h ${snap.sends24h}/${snap.limits.sends24h}`;

      const icoHost = pillEl.querySelector(".rs-ds-ab-ico");
      if (icoHost && lastIconKind !== iconKind) {
        lastIconKind = iconKind;
        icoHost.replaceChildren();
        const svg = svgIcon(iconKind);
        if (svg) icoHost.appendChild(svg);
      }
      const txtHost = pillEl.querySelector(".rs-ds-ab-txt");
      if (txtHost && txtHost.textContent !== labelText) {
        txtHost.textContent = labelText;
      }

      const stateTxt = document.querySelector("#rs-state .rs-state-txt");
      if (stateTxt) {
        if (visualState === "slow_send" || visualState === "cooldown" || visualState === "risk_lock") {
          if (savedStateText === null) savedStateText = stateTxt.textContent || "";
          const mirrored = visualState === "slow_send"
            ? labelText
            : `Anti-Ban ${labelText} (heat ${snap.heat}%)`;
          if (stateTxt.textContent !== mirrored) stateTxt.textContent = mirrored;
        } else if (savedStateText !== null) {
          stateTxt.textContent = savedStateText;
          savedStateText = null;
        }
      }

      renderPopover(snap);
    }

    engine.subscribe(renderUi);
    engine.subscribeModal((info) => {
      ensureUiMounted();
      if (!modalEl) return;
      modalEl.setAttribute("data-mode", info.mode);
      const title = modalEl.querySelector(".rs-ds-ab-modal-title");
      const body = modalEl.querySelector(".rs-ds-ab-modal-body");
      const primaryBtn = modalEl.querySelector(".rs-ds-ab-modal-primary");
      if (title) title.textContent = info.title;
      if (body) body.textContent = info.message;
      if (primaryBtn) {
        if (info.mode === "risk_lock") {
          primaryBtn.hidden = false;
          primaryBtn.textContent = T("Reset Shield");
          primaryBtn.onclick = () => {
            void engine.resetShield();
            if (modalEl) modalEl.hidden = true;
          };
        } else if (info.mode === "checkpoint") {
          primaryBtn.hidden = false;
          primaryBtn.textContent = T("Resume");
          primaryBtn.onclick = () => {
            engine.resumeCheckpoint();
            if (modalEl) modalEl.hidden = true;
          };
        } else {
          primaryBtn.hidden = true;
        }
      }
      modalEl.hidden = false;
    });

    document.addEventListener("click", (e) => {
      if (!popoverOpen || !popoverEl || !pillEl) return;
      const t = e.target;
      if (t && !popoverEl.contains(t) && !pillEl.contains(t)) {
        popoverOpen = false;
        popoverEl.hidden = true;
        pillEl.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && popoverOpen && popoverEl && pillEl) {
        popoverOpen = false;
        popoverEl.hidden = true;
        pillEl.setAttribute("aria-expanded", "false");
      }
    });

    let remountObs = null;
    if (typeof MutationObserver === "function") {
      remountObs = new MutationObserver(() => {
        if (!pillEl || !pillEl.isConnected) {
          renderUi(engine.getSnapshot());
        }
      });
      if (document.documentElement) {
        remountObs.observe(document.documentElement, { childList: true, subtree: true });
      }
    }

    setInterval(() => {
      const snap = engine.getSnapshot();
      if (snap.cooldownRemainingMs > 0 || snap.riskLockRemainingMs > 0 || (popoverOpen && popoverEl && !popoverEl.hidden)) {
        renderUi(snap);
      }
    }, 250);

    renderUi(engine.getSnapshot());
    void engine.loadStorage();
    return { engine };
  }

  let runtime = null;
  if (typeof window !== "undefined") {
    runtime = mountRuntimeUI();
  }

  return {
    createEngine,
    shapeOutput,
    parseToolFeedback,
    bellJitterMs,
    calcReviewDwellMs,
    humanClick,
    humanFillText,
    scanWafAndCaptcha,
    LIMITS,
    getEngine: () => (runtime ? runtime.engine : null),
  };
})();
