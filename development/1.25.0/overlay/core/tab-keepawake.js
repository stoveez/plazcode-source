// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.25.0/ts/core/tab-keepawake.ts (TypeScript): edit that file, then run node development/1.25.0/ts/build.cjs.
// Isolated-world controller for Active-Run Background-Tab Keep-Awake.
// Signals the MAIN-world helper via document.documentElement.dataset.plazcodeKeepawake = "1"
// and a CustomEvent ONLY while an active PlazCode session/streaming turn is running AND
// rsTabKeepAwake is enabled. Immediately deactivates when idle/stopped or disabled.
const PlazCodeTabKeepAwake = (() => {
  "use strict";
  const EVENT_NAME = "plazcode:tab-keepawake";
  const DATASET_KEY = "plazcodeKeepawake";

  ;





  ;





  function create(options = {}) {
    const doc = options.doc !== undefined
      ? options.doc
      : (typeof document !== "undefined" ? document : null);
    let enabled = options.enabled !== false;
    let running = !!options.active;
    let lastApplied = null;

    function dispatchSignal(effective) {
      if (!doc || typeof doc.dispatchEvent !== "function") return;
      try {
        const view = doc.defaultView;
        const CE = (view && view.CustomEvent) || (typeof CustomEvent !== "undefined" ? CustomEvent : null);
        if (!CE) return;
        doc.dispatchEvent(new CE(EVENT_NAME, {
          detail: { active: effective, enabled, running },
        }));
      } catch {}
    }

    function apply(force = false) {
      const effective = enabled && running;
      const changed = lastApplied === null ? (effective || force) : effective !== lastApplied;
      lastApplied = effective;
      try {
        const root = doc && doc.documentElement;
        if (root && root.dataset) {
          if (effective) {
            if (root.dataset[DATASET_KEY] !== "1") root.dataset[DATASET_KEY] = "1";
          } else if (DATASET_KEY in root.dataset) {
            delete root.dataset[DATASET_KEY];
          }
        }
      } catch {}
      if (changed || force) dispatchSignal(effective);
      return effective;
    }

    // Ensure clean initial DOM state without emitting an unnecessary startup event if inactive.
    if (running && enabled) apply(true);
    else {
      try {
        const root = doc && doc.documentElement;
        if (root && root.dataset && DATASET_KEY in root.dataset) {
          delete root.dataset[DATASET_KEY];
        }
      } catch {}
      lastApplied = false;
    }

    return {
      setEnabled(next) {
        enabled = next !== false;
        return apply();
      },
      setActive(next) {
        running = !!next;
        return apply();
      },
      update(patch) {
        if (patch && typeof patch.enabled === "boolean") enabled = patch.enabled;
        if (patch && typeof patch.active === "boolean") running = patch.active;
        return apply();
      },
      isEnabled() {
        return enabled;
      },
      isRunning() {
        return running;
      },
      isActive() {
        return enabled && running;
      },
      state() {
        return { enabled, running, active: enabled && running };
      },
      destroy() {
        running = false;
        apply();
      },
    };
  }

  const shared = create();
  return {
    EVENT_NAME,
    DATASET_KEY,
    create,
    setEnabled: (next) => shared.setEnabled(next),
    setActive: (next) => shared.setActive(next),
    update: (patch) => shared.update(patch),
    isEnabled: () => shared.isEnabled(),
    isRunning: () => shared.isRunning(),
    isActive: () => shared.isActive(),
    state: () => shared.state(),
    destroy: () => shared.destroy(),
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodeTabKeepAwake;
