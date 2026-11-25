// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.25.0/ts/core/dom-cache.ts (TypeScript): edit that file, then run node development/1.25.0/ts/build.cjs.
// Mutation-Aware Live-DOM Epoch Cache for PlazCode's polling loop.
// Combines a scoped MutationObserver epoch counter, URL-change detection,
// disconnected-element checks, and bounded safety TTLs (1500ms structural,
// 100ms busy/streaming) so repeated polls within a tick or idle DOM reuse
// prior reads without missing live DOM or state transitions.
const PlazCodeDomCache = (() => {
  "use strict";
  const STRUCTURAL_TTL_MS = 1500;
  const BUSY_TTL_MS = 100;

  ;
  ;

  ;






  ;











  ;





  const STRUCTURAL_METHODS = new Set([
    "getEditor",
    "getEditorRaw",
    "composerFrame",
    "barAnchor",
    "allItems",
    "lastAssistant",
    "lastAssistantId",
    "assistantCount",
    "userCount",
    "chatIsEmpty",
    "isFreshChat",
  ]);

  const BUSY_METHODS = new Set([
    "readAssistant",
    "isGenerating",
    "isBusyNow",
    "isHardGenerating",
    "scanError",
    "findContinueBtn",
    "streamLen",
  ]);

  const INVALIDATING_METHODS = new Set([
    "typeAndSend",
    "stopGeneration",
    "clickContinueBtn",
    "attachImages",
    "clearAttachments",
    "clearEditor",
    "writeDraft",
    "prepareSessionStart",
    "openNewChat",
    "invalidateItems",
  ]);

  const OWN_IDS = new Set([
    "rs-root",
    "rs-diag-log",
    "rs-input-cover",
    "rs-setup-tutorial",
    "rs-tutorial",
  ]);

  const OWN_SELECTOR = "#rs-root, #rs-diag-log, #rs-input-cover, #rs-setup-tutorial, #rs-tutorial, .rs-chip, .rs-chat-activity, .rs-continuation-offer, .rs-shot-overlay";

  function isOwnNode(node) {
    if (!node) return false;
    const el = (node.nodeType === 1 ? node : node.parentElement);
    if (!el) return false;
    if (el.id && OWN_IDS.has(el.id)) return true;
    if (el.classList && (el.classList.contains("rs-chip") || el.classList.contains("rs-chat-activity"))) return true;
    try {
      if (typeof el.closest === "function" && el.closest(OWN_SELECTOR)) return true;
    } catch {}
    return false;
  }

  function isOwnAttribute(attrName) {
    if (!attrName) return false;
    return attrName.startsWith("data-plazcode") || attrName.startsWith("data-rs-") || attrName.startsWith("data-z");
  }

  function defaultIgnoreRecord(record) {
    if (isOwnNode(record.target)) return true;
    if (record.type === "attributes" && isOwnAttribute(record.attributeName)) return true;
    if (record.type === "childList") {
      const added = record.addedNodes ? Array.from(record.addedNodes) : [];
      const removed = record.removedNodes ? Array.from(record.removedNodes) : [];
      const changed = added.concat(removed);
      if (changed.length > 0 && changed.every(isOwnNode)) return true;
    }
    return false;
  }

  function isNodeLike(v) {
    return !!v && typeof v === "object" && typeof (v).isConnected === "boolean";
  }

  function isValueConnected(value) {
    if (value == null || typeof value !== "object") return true;
    if (isNodeLike(value)) return value.isConnected;
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (isNodeLike(item) && !item.isConnected) return false;
      }
      return true;
    }
    const rec = value;
    for (const key of ["item", "node", "element", "parent", "ref"]) {
      const candidate = rec[key];
      if (isNodeLike(candidate) && !candidate.isConnected) return false;
    }
    return true;
  }

  function create(options = {}) {
    const doc = options.doc !== undefined
      ? options.doc
      : (typeof document !== "undefined" ? document : null);
    const win = options.win !== undefined
      ? options.win
      : (typeof window !== "undefined" ? window : (doc && doc.defaultView ? doc.defaultView : null));
    const now = options.now || (() => Date.now());
    const structuralTtlMs = typeof options.structuralTtlMs === "number" && options.structuralTtlMs >= 0
      ? options.structuralTtlMs
      : STRUCTURAL_TTL_MS;
    const busyTtlMs = typeof options.busyTtlMs === "number" && options.busyTtlMs >= 0
      ? options.busyTtlMs
      : BUSY_TTL_MS;

    const readUrl = options.getUrl || (() => {
      try {
        if (doc && doc.location && typeof doc.location.href === "string") return doc.location.href;
        if (win && win.location && typeof win.location.href === "string") return win.location.href;
        if (typeof location !== "undefined" && typeof location.href === "string") return location.href;
      } catch {}
      return "";
    });

    let epoch = 1;
    let lastUrl = readUrl();
    let hits = 0;
    let misses = 0;
    let invalidations = 0;
    const reasons = {
      mutation: 0,
      url: 0,
      disconnected: 0,
      ttl: 0,
      action: 0,
      manual: 0,
    };
    const entries = new Map();

    function invalidate(reason = "manual") {
      epoch += 1;
      invalidations += 1;
      if (reason in reasons) reasons[reason] += 1;
      entries.clear();
      return epoch;
    }

    function syncUrl() {
      const currentUrl = readUrl();
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        invalidate("url");
        return true;
      }
      return false;
    }

    function resolveTtl(opts) {
      if (opts && typeof opts.ttlMs === "number" && opts.ttlMs >= 0) return opts.ttlMs;
      return opts && opts.kind === "busy" ? busyTtlMs : structuralTtlMs;
    }

    function cached(key, compute, opts) {
      syncUrl();
      const t = now();
      const ttlMs = resolveTtl(opts);
      const entry = entries.get(key);
      if (entry) {
        if (entry.epoch !== epoch) {
          entries.delete(key);
        } else if (t - entry.at >= Math.min(ttlMs, entry.ttlMs)) {
          entries.delete(key);
          reasons.ttl += 1;
        } else if (opts?.checkConnected !== false && !isValueConnected(entry.value)) {
          invalidate("disconnected");
        } else {
          hits += 1;
          const val = entry.value;
          return Array.isArray(val) ? (val.slice()) : val;
        }
      }
      misses += 1;
      const computed = compute();
      const stored = Array.isArray(computed) ? computed.slice() : computed;
      entries.set(key, { value: stored, at: t, epoch, ttlMs });
      return Array.isArray(stored) ? (stored.slice()) : computed;
    }

    let observer = null;
    let observedRoot = null;

    function observe(target) {
      const root = target || options.root || (doc && (doc.documentElement || doc.body)) || null;
      if (!root) return false;
      if (observer && observedRoot === root) return true;
      if (observer) {
        try { observer.disconnect(); } catch {}
        observer = null;
        observedRoot = null;
      }
      const MOCtor = options.MutationObserverCtor ||
        (win && (win).MutationObserver) ||
        (typeof MutationObserver !== "undefined" ? MutationObserver : null);
      if (!MOCtor) return false;
      try {
        observer = new MOCtor((records) => {
          if (!records || !records.length) return;
          if (records.every(defaultIgnoreRecord)) return;
          if (options.ignoreRecords && options.ignoreRecords(records)) return;
          invalidate("mutation");
        });
        observer.observe(root, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
        });
        observedRoot = root;
        return true;
      } catch {
        observer = null;
        observedRoot = null;
        return false;
      }
    }

    observe();

    const onUrlEvent = () => {
      const next = readUrl();
      if (next !== lastUrl) {
        lastUrl = next;
        invalidate("url");
      } else {
        invalidate("url");
      }
    };
    if (win && typeof win.addEventListener === "function") {
      try { win.addEventListener("popstate", onUrlEvent); } catch {}
      try { win.addEventListener("hashchange", onUrlEvent); } catch {}
    }

    function wrapProvider(provider) {
      if (!provider || typeof provider !== "object") return provider;
      const methodCache = new Map();
      return new Proxy(provider, {
        get(target, prop) {
          const value = Reflect.get(target, prop, target);
          const existing = methodCache.get(prop);
          if (existing && existing.raw === value) return existing.wrapped;
          if (existing) {
            methodCache.delete(prop);
            if (typeof prop === "string") entries.delete("p:" + prop);
          }
          if (typeof value !== "function") return value;
          const fn = value;
          const name = typeof prop === "string" ? prop : "";
          if (STRUCTURAL_METHODS.has(name) || BUSY_METHODS.has(name)) {
            const kind = BUSY_METHODS.has(name) ? "busy" : "structural";
            const key = "p:" + name;
            const wrapped = (...args) => {
              if (args.length > 0) return Reflect.apply(fn, target, args);
              return cached(key, () => Reflect.apply(fn, target, args), { kind });
            };
            methodCache.set(prop, { raw: value, wrapped });
            return wrapped;
          }
          if (INVALIDATING_METHODS.has(name)) {
            const wrapped = (...args) => {
              invalidate("action");
              const res = Reflect.apply(fn, target, args);
              if (res && typeof (res).then === "function") {
                return (res).finally(() => { invalidate("action"); });
              }
              invalidate("action");
              return res;
            };
            methodCache.set(prop, { raw: value, wrapped });
            return wrapped;
          }
          const bound = (...args) => Reflect.apply(fn, target, args);
          methodCache.set(prop, { raw: value, wrapped: bound });
          return bound;
        },
        set(target, prop, newValue) {
          methodCache.delete(prop);
          if (typeof prop === "string") entries.delete("p:" + prop);
          return Reflect.set(target, prop, newValue, target);
        },
      });
    }

    function stats() {
      return {
        epoch,
        size: entries.size,
        hits,
        misses,
        invalidations,
        reasons: { ...reasons },
      };
    }

    function resetStats() {
      hits = 0;
      misses = 0;
      invalidations = 0;
      reasons.mutation = 0;
      reasons.url = 0;
      reasons.disconnected = 0;
      reasons.ttl = 0;
      reasons.action = 0;
      reasons.manual = 0;
    }

    function destroy() {
      if (observer) {
        try { observer.disconnect(); } catch {}
        observer = null;
        observedRoot = null;
      }
      if (win && typeof win.removeEventListener === "function") {
        try { win.removeEventListener("popstate", onUrlEvent); } catch {}
        try { win.removeEventListener("hashchange", onUrlEvent); } catch {}
      }
      entries.clear();
    }

    return {
      STRUCTURAL_TTL_MS: structuralTtlMs,
      BUSY_TTL_MS: busyTtlMs,
      epoch: () => epoch,
      cached,
      invalidate,
      observe,
      wrapProvider,
      stats,
      resetStats,
      destroy,
    };
  }

  return {
    STRUCTURAL_TTL_MS,
    BUSY_TTL_MS,
    STRUCTURAL_METHODS: Array.from(STRUCTURAL_METHODS),
    BUSY_METHODS: Array.from(BUSY_METHODS),
    create,
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodeDomCache;
