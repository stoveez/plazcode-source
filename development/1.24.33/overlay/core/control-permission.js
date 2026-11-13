// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// AgentScript control rework (1.24.33): the person allows the optional "debugger" permission (real mouse and keyboard in tabs).
// The browser only shows its permission question after a click on a PlazCode page, so this small page asks.
(async () => {
  // Step 7: PlazCode's language (the same files and setting as the toolbar menu). t() fills {slots} either way.
  const L = globalThis.PlazCodeI18n;
  const t = (text, values) => L ? L.t(text, values) : (values ? String(text).replace(/\{([A-Za-z0-9_]+)\}/g, (m, k) => k in values ? String(values[k]) : m) : String(text));
  try { const saved = await chrome.storage.local.get("rsLanguage"); if (L) { L.setLanguage((saved && saved.rsLanguage) || "en"); L.mountStatic(document.body); } } catch {}
  document.title = t(document.title);
  const done = document.getElementById("done"), allow = document.getElementById("allow");
  const say = (text) => { done.textContent = text; done.style.display = "block"; };
  allow.addEventListener("click", async () => {
    allow.disabled = true;
    let granted = false;
    try { granted = await chrome.permissions.request({ permissions: ["debugger"] }); } catch (error) { say(t("Your browser did not allow it: {error}", { error: String(error && error.message || error) })); allow.disabled = false; return; }
    if (granted) { say(t("Done. Ask the AI again; it can now use the real mouse and keyboard.")); setTimeout(() => window.close(), 1800); }
    else { say(t("Not allowed. PlazCode keeps using its in-page clicks, which some sites ignore.")); allow.disabled = false; }
  });
  document.getElementById("later").addEventListener("click", () => window.close());
})();
