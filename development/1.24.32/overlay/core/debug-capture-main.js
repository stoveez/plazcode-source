// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Debug capture (AI page world, document_start). Passive only: it listens for
// the site's own uncaught errors, failed resource loads and failed API
// responses, and relays them to core/debug-capture.js as JSON strings. 1.24.32: it also copies the site's own
// console warnings and errors (after printing them unchanged); it does not wrap fetch or any other site function.
(() => {
  "use strict";
  const EXT_RE = /(?:chrome|moz)-extension:\/\//;
  const pending = [];
  let ready = false, windowStart = Date.now(), inWindow = 0;
  const clean = (url) => { try { const u = new URL(String(url), location.href); return u.origin + u.pathname.slice(0, 120); } catch { return String(url || "").split(/[?#]/)[0].slice(0, 160); } };
  function emit(entry) {
    const now = Date.now();
    if (now - windowStart > 10000) { windowStart = now; inWindow = 0; }
    if (++inWindow > 40) return; // a looping site error must not flood anything
    let detail;
    try { detail = JSON.stringify(entry); } catch { return; }
    if (!ready) { pending.push(detail); if (pending.length > 60) pending.shift(); return; }
    try { document.dispatchEvent(new CustomEvent("plazcode:site-log", { detail })); } catch {}
  }
  document.addEventListener("plazcode:site-log-ready", () => {
    ready = true;
    for (const detail of pending.splice(0)) { try { document.dispatchEvent(new CustomEvent("plazcode:site-log", { detail })); } catch {} }
  });
  window.addEventListener("error", (event) => {
    try {
      const target = event && event.target;
      if (target && target !== window && target.tagName) {
        const src = target.currentSrc || target.src || target.href || "";
        if (!src || EXT_RE.test(src)) return;
        emit({ level: "warn", kind: "resource", text: "Failed to load " + String(target.tagName).toLowerCase() + " " + clean(src) });
        return;
      }
      const file = String(event.filename || ""), stack = String(event.error && event.error.stack || "");
      if (EXT_RE.test(file) || EXT_RE.test(stack)) return; // PlazCode's own: isolated capture
      if (/ResizeObserver loop/i.test(String(event.message || ""))) return; // benign browser notice
      emit({ level: "error", kind: "error", text: String(event.message || "Script error") + (stack ? "\n" + stack.split("\n").slice(1, 4).join("\n") : ""),
        file: file ? clean(file) + ":" + (event.lineno || 0) + ":" + (event.colno || 0) : "" });
    } catch {}
  }, true);
  window.addEventListener("unhandledrejection", (event) => {
    try {
      const reason = event && event.reason;
      const stack = String(reason && reason.stack || "");
      if (EXT_RE.test(stack)) return;
      const text = reason && (reason.message || (typeof reason === "string" ? reason : "")) || "Unhandled promise rejection";
      emit({ level: "warn", kind: "rejection", text: String(text).slice(0, 400) });
    } catch {}
  });
  // 1.24.30 (owner): the AI site's own console warnings and errors (not its routine log lines) go to the PlazCode
  // logs too. The site's console prints exactly as before (original first); copying never throws, only short
  // plain text is kept, and the 40-per-10-seconds limit above applies. PlazCode's own scripts run in an isolated
  // world with their own console, so nothing here sees or loops PlazCode's messages.
  const describe = (value) => {
    if (value instanceof Error) return value.name + ": " + value.message;
    if (value == null || typeof value !== "object") return String(value);
    try { return value.constructor && value.constructor.name ? "[" + value.constructor.name + "]" : "[object]"; } catch { return "[object]"; }
  };
  for (const method of ["warn", "error"]) {
    try {
      const original = console[method];
      if (typeof original !== "function" || original.__plazcodeCopied) continue;
      const copied = function (...args) {
        const result = original.apply(this, args);
        try {
          const text = args.slice(0, 6).map(describe).join(" ").replace(/%[csdifoO]/g, "").trim().slice(0, 400);
          if (text && !/ResizeObserver loop/i.test(text)) emit({ level: method === "error" ? "error" : "warn", kind: "console", text });
        } catch {}
        return result;
      };
      Object.defineProperty(copied, "__plazcodeCopied", { value: true });
      try { copied.toString = () => original.toString(); } catch {}
      console[method] = copied;
    } catch {}
  }
  // Failed API calls (rate limits, signed-out sessions, server errors) from the
  // browser's own resource timing; nothing is intercepted.
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const status = Number(entry.responseStatus) || 0;
        if (status < 400 || !/^(fetch|xmlhttprequest|beacon)$/.test(entry.initiatorType)) continue;
        emit({ level: status >= 500 || status === 429 ? "error" : "warn", kind: "http", status, text: "HTTP " + status + " " + clean(entry.name) });
      }
    });
    observer.observe({ type: "resource", buffered: true });
  } catch {}
})();
