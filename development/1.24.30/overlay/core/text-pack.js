// SPDX-License-Identifier: GPL-3.0-or-later
// core/text-pack.js - PlazCode's instruction text kept inside the desktop app (1.24.30).
//
// Owner, 2026-10-31: make PlazCode harder to copy without breaking startup or updates. When a release is
// packaged, the long prompt texts and the Studio Skills Luau library are moved out of the extension's
// JavaScript into a sealed file that only the PlazCode app opens, and only for the official, paired
// extension. The code calls PlazCodeText.t("<id>") / PlazCodeText.f("<id>", values) where the text used
// to be. In the development source nothing is moved, REQUIRED stays false and this file does nothing.
// eslint-disable-next-line no-unused-vars
globalThis.PlazCodeText = (() => {
  const REQUIRED = false; // packaging sets this to true when it moves text into the app
  const MESSAGE = "PlazCode could not load its instructions from the PlazCode app. Open the PlazCode app (update the app and the extension together), then refresh this AI tab.";
  let pack = null, pending = null, failure = "";
  function ready() {
    if (!REQUIRED || pack) return Promise.resolve(true);
    if (pending) return pending;
    pending = new Promise((resolve) => {
      const done = (ok, error) => { if (!ok) { failure = error || MESSAGE; pending = null; } resolve(ok); };
      try {
        chrome.runtime.sendMessage({ type: "textPack" }, (reply) => {
          void (chrome.runtime && chrome.runtime.lastError);
          if (reply && reply.ok && reply.pack && typeof reply.pack === "object") { pack = reply.pack; done(true); }
          else done(false, reply && reply.error ? String(reply.error) : "");
        });
      } catch (error) { done(false, ""); }
    });
    return pending;
  }
  function missing(key) {
    return new Error((failure || MESSAGE) + " (missing " + key + ")");
  }
  // A moved plain string.
  function t(key) {
    if (pack && typeof pack[key] === "string") return pack[key];
    throw missing(key);
  }
  // A moved template string: the fixed parts come from the app, the values are filled in here exactly as
  // the original `...${value}...` did.
  function f(key, values) {
    const parts = pack && pack[key];
    if (!Array.isArray(parts) || parts.length !== values.length + 1) throw missing(key);
    let out = parts[0];
    for (let i = 0; i < values.length; i++) out += `${values[i]}` + parts[i + 1];
    return out;
  }
  if (REQUIRED) ready();
  return Object.freeze({ required: REQUIRED, ready, t, f, loaded: () => !REQUIRED || !!pack, error: () => failure || MESSAGE });
})();
