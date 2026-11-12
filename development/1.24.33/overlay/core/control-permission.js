// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// 1.24.34 control rework: the person allows the optional "debugger" permission (real mouse and keyboard in tabs).
// The browser only shows its permission question after a click on a PlazCode page, so this small page asks.
(() => {
  const done = document.getElementById("done"), allow = document.getElementById("allow");
  const say = (text) => { done.textContent = text; done.style.display = "block"; };
  allow.addEventListener("click", async () => {
    allow.disabled = true;
    let granted = false;
    try { granted = await chrome.permissions.request({ permissions: ["debugger"] }); } catch (error) { say("Your browser did not allow it: " + String(error && error.message || error)); allow.disabled = false; return; }
    if (granted) { say("Done. Ask the AI again; it can now use the real mouse and keyboard."); setTimeout(() => window.close(), 1800); }
    else { say("Not allowed. PlazCode keeps using its in-page clicks, which some sites ignore."); allow.disabled = false; }
  });
  document.getElementById("later").addEventListener("click", () => window.close());
})();
