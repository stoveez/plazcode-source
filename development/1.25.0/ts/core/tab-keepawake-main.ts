// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.25.0/ts/core/tab-keepawake-main.ts (TypeScript): edit that file, then run node development/1.25.0/ts/build.cjs.
// Active-run background-tab keep-awake (AI page MAIN world, document_start).
// Only engages when the isolated-world controller marks the tab active
// (document.documentElement.dataset.plazcodeKeepawake === "1") AND the tab is
// genuinely hidden according to the browser's real visibility descriptors.
(() => {
  "use strict";
  type KeepAwakeMainWindow = Window & {
    __plazcodeTabKeepAwakeMain?: boolean;
  };
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const win = window as KeepAwakeMainWindow;
  if (win.__plazcodeTabKeepAwakeMain) return;
  win.__plazcodeTabKeepAwakeMain = true;

  const EVENT_NAME = "plazcode:tab-keepawake";
  const RAF_FALLBACK_MS = 100;

  function findDescriptor(obj: object | null, prop: PropertyKey): PropertyDescriptor | undefined {
    let cur: object | null = obj;
    while (cur) {
      const desc = Object.getOwnPropertyDescriptor(cur, prop);
      if (desc) return desc;
      cur = Object.getPrototypeOf(cur);
    }
    return undefined;
  }

  const hiddenDesc = findDescriptor(document, "hidden");
  const visDesc = findDescriptor(document, "visibilityState");
  const nativeHasFocus = typeof document.hasFocus === "function" ? document.hasFocus.bind(document) : null;
  const nativeRAF = typeof win.requestAnimationFrame === "function" ? win.requestAnimationFrame.bind(win) : null;
  const nativeCancelRAF = typeof win.cancelAnimationFrame === "function" ? win.cancelAnimationFrame.bind(win) : null;
  const nativeSetTimeout = win.setTimeout.bind(win);
  const nativeClearTimeout = win.clearTimeout.bind(win);

  function readNativeHidden(): boolean {
    try {
      if (hiddenDesc) {
        if (typeof hiddenDesc.get === "function") return !!hiddenDesc.get.call(document);
        if ("value" in hiddenDesc) return !!hiddenDesc.value;
      }
    } catch {}
    return false;
  }

  function readNativeVisibility(): DocumentVisibilityState {
    try {
      if (visDesc) {
        const val = typeof visDesc.get === "function"
          ? visDesc.get.call(document)
          : ("value" in visDesc ? visDesc.value : undefined);
        if (typeof val === "string" && val) return val as DocumentVisibilityState;
      }
    } catch {}
    return "visible";
  }

  function reallyHidden(): boolean {
    if (readNativeHidden()) return true;
    const vis = readNativeVisibility();
    return vis !== "visible";
  }

  let eventActive = false;
  let sawDatasetFlag = false;
  function isActive(): boolean {
    try {
      const ds = document.documentElement && document.documentElement.dataset;
      if (ds) {
        const flag = ds.plazcodeKeepawake;
        if (flag === "1") {
          sawDatasetFlag = true;
          return true;
        }
        if (flag === "0" || sawDatasetFlag) {
          eventActive = false;
          return false;
        }
      }
    } catch {}
    return eventActive;
  }

  document.addEventListener(EVENT_NAME, (ev: Event) => {
    try {
      const detail = (ev as CustomEvent<{ active?: unknown }>).detail;
      if (detail && typeof detail === "object" && "active" in detail) {
        eventActive = !!detail.active;
        if (!eventActive) sawDatasetFlag = false;
      }
    } catch {}
  });

  try {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get() {
        if (isActive() && reallyHidden()) return false;
        return readNativeHidden();
      },
    });
  } catch {}

  try {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get() {
        if (isActive() && reallyHidden()) return "visible";
        return readNativeVisibility();
      },
    });
  } catch {}

  try {
    document.hasFocus = function hasFocus(): boolean {
      if (isActive() && reallyHidden()) return true;
      return nativeHasFocus ? nativeHasFocus() : true;
    };
  } catch {}

  const suppressVisibilityChange = (event: Event) => {
    if (isActive() && reallyHidden()) {
      try { event.stopImmediatePropagation(); } catch {}
    }
  };
  try { win.addEventListener("visibilitychange", suppressVisibilityChange, true); } catch {}
  try { document.addEventListener("visibilitychange", suppressVisibilityChange, true); } catch {}

  const fallbackTimers = new Map<number, ReturnType<typeof setTimeout>>();
  let nextFallbackId = 1000000000;

  try {
    win.requestAnimationFrame = function requestAnimationFrame(callback: FrameRequestCallback): number {
      if (typeof callback !== "function") {
        if (nativeRAF) return nativeRAF(callback);
        throw new TypeError("Failed to execute 'requestAnimationFrame': parameter 1 is not of type 'Function'.");
      }
      if (isActive() && reallyHidden()) {
        const id = nextFallbackId++;
        const timerId = nativeSetTimeout(() => {
          fallbackTimers.delete(id);
          const now = typeof performance !== "undefined" && typeof performance.now === "function"
            ? performance.now()
            : Date.now();
          callback(now);
        }, RAF_FALLBACK_MS);
        fallbackTimers.set(id, timerId);
        return id;
      }
      if (nativeRAF) return nativeRAF(callback);
      const id = nextFallbackId++;
      const timerId = nativeSetTimeout(() => {
        fallbackTimers.delete(id);
        callback(Date.now());
      }, 16);
      fallbackTimers.set(id, timerId);
      return id;
    };

    win.cancelAnimationFrame = function cancelAnimationFrame(handle: number): void {
      const timerId = fallbackTimers.get(handle);
      if (timerId !== undefined) {
        fallbackTimers.delete(handle);
        nativeClearTimeout(timerId);
        return;
      }
      if (nativeCancelRAF) nativeCancelRAF(handle);
    };
  } catch {}
})();
