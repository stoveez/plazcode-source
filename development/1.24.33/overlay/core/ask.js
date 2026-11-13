// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// AgentScript control rework (1.24.33), step 4: the "Ask PlazCode" side chat (Chrome's side panel, or a window docked to the right).
// Questions go to the extension worker, which asks a background chat on the person's AI site and sends the answer
// back. The shared tab follows the tab the person is looking at; a live picture of it sits at the top.
(async () => {
  // Step 7: PlazCode's language (the same files and setting as the toolbar menu). t() fills {slots} either way.
  const L = globalThis.PlazCodeI18n;
  const t = (text, values) => L ? L.t(text, values) : (values ? String(text).replace(/\{([A-Za-z0-9_]+)\}/g, (m, k) => k in values ? String(values[k]) : m) : String(text));
  try { const saved = await chrome.storage.local.get("rsLanguage"); if (L) { L.setLanguage((saved && saved.rsLanguage) || "en"); L.mountStatic(document.body); } } catch {}
  const $ = (id) => document.getElementById(id);
  const log = $("log"), q = $("q"), go = $("go"), stop = $("stop"), step = $("step"), sharing = $("sharing"), control = $("control"), screen = $("screen");
  const peek = $("peek"), shareTitle = $("shareTitle"), shareSite = $("shareSite"), banner = $("banner"), bannerText = $("bannerText");
  const fixedWindow = Number(new URLSearchParams(location.search).get("window")) || null;
  let shared = null, busy = false, viewPort = null;
  // The "Shared with PlazCode" mark in the shared tab, in the person's language.
  const words = { working: t("PlazCode is working here"), paused: t("Paused, you're in control"), resume: t("Resume"), stop: t("Stop"), shared: t("Shared with PlazCode"), stopSharing: t("Stop sharing") };
  document.title = t(document.title);
  const port = chrome.runtime.connect({ name: "plazcode-ask" });
  const add = (cls, text) => { const p = document.createElement("p"); p.className = "msg " + cls; p.textContent = text; log.append(p); log.scrollTop = log.scrollHeight; return p; };
  const setBusy = (value) => { busy = value; go.disabled = value; stop.hidden = !value; if (!value) step.textContent = ""; };
  async function currentTab() {
    try {
      const query = fixedWindow ? { active: true, windowId: fixedWindow } : { active: true, currentWindow: true };
      const [tab] = await chrome.tabs.query(query);
      return tab || null;
    } catch { return null; }
  }
  async function follow() {
    // Step 6: the whole screen (tab id -1) instead of the tab the person is looking at.
    if (sharing.checked && screen.checked) { port.postMessage({ sharing: true, shareTabId: -1, words }); return; }
    const tab = sharing.checked ? await currentTab() : null;
    port.postMessage({ sharing: !!tab, shareTabId: tab ? tab.id : null, words });
  }
  function watch(tabId) {
    if (viewPort) { try { viewPort.disconnect(); } catch {} viewPort = null; }
    peek.getContext("2d").clearRect(0, 0, peek.width, peek.height);
    if (!Number.isInteger(tabId)) return;
    viewPort = chrome.runtime.connect({ name: "plazcode-control-view" });
    viewPort.postMessage({ watch: tabId });
    viewPort.onMessage.addListener((m) => {
      if (!m || m.type !== "rs-control-frame" || !m.data || m.tabId !== shared) return;
      if (/^#[0-9a-f]{6}$/i.test(m.accent || "")) document.documentElement.style.setProperty("--a", m.accent);
      const bin = atob(m.data), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      createImageBitmap(new Blob([bytes], { type: "image/jpeg" })).then((b) => { const g = peek.getContext("2d"), s = Math.max(peek.width / b.width, peek.height / b.height); g.drawImage(b, (peek.width - b.width * s) / 2, 0, b.width * s, b.height * s); b.close(); }, () => {});
    });
  }
  port.onMessage.addListener((m) => {
    if (!m) return;
    if (m.type === "ask-busy") { if (m.enabled === false) { add("error", t("Ask PlazCode is not switched on in this version.")); go.disabled = true; return; } setBusy(!!m.busy); }
    else if (m.type === "ask-note") add(m.kind === "error" ? "error" : "note", typeof m.key === "string" ? t(m.key, m.values || {}) : t(m.text));
    else if (m.type === "ask-step") step.textContent = t(m.text);
    else if (m.type === "ask-reply") { add(m.status === "done" ? "ai" : m.status === "stopped" ? "note" : "error", m.status === "done" ? m.text : t(m.text)); setBusy(false); }
    else if (m.type === "ask-permission") { bannerText.textContent = t("PlazCode could not take a picture of the tab.") + " " + t(m.text); banner.hidden = false; }
    else if (m.type === "ask-share") {
      shared = Number.isInteger(m.tabId) ? m.tabId : null;
      document.body.classList.toggle("sharing", !!shared);
      if (m.stoppedInTab) sharing.checked = false;
      shareTitle.textContent = shared === -1 ? t("Your whole screen") : shared ? (m.title || t("This tab")) : t(m.refused ? "This tab can't be shared" : "Not sharing");
      let host = ""; try { host = m.url ? new URL(m.url).host : ""; } catch {}
      shareSite.textContent = shared === -1 ? t("Everything on your screen · shared with PlazCode") : shared ? t("{site} · shared with PlazCode", { site: host }) : t(m.refused ? "Browser pages, extension pages and AI chats are never shared." : "Turn on sharing so PlazCode can see this tab.");
      if (m.screenRefused) { screen.checked = false; add("error", t(m.screenRefused)); }
      control.disabled = !shared; if (!shared) control.checked = false;
      $("controlText").textContent = t(shared === -1 ? "Let PlazCode control my computer" : "Let PlazCode control this tab");
      watch(shared);
    } else if (m.type === "ask-approve") {
      const card = document.createElement("div"); card.className = "approve"; card.setAttribute("role", "group");
      const kicker = document.createElement("small"); kicker.textContent = m.kicker ? t(m.kicker) : t("Needs your approval");
      const title = document.createElement("div"); title.textContent = t(m.title);
      const detail = document.createElement("code"); detail.textContent = m.detail || ""; detail.hidden = !m.detail;
      const row = document.createElement("div"); row.className = "row";
      const yes = document.createElement("button"); yes.className = "main"; yes.textContent = t("Allow");
      const no = document.createElement("button"); no.textContent = t("Deny");
      const answer = (allowed) => { port.postMessage({ approve: m.id, allowed }); yes.disabled = no.disabled = true; kicker.textContent = t(allowed ? "Allowed" : "Denied"); };
      yes.addEventListener("click", () => answer(true)); no.addEventListener("click", () => answer(false));
      row.append(yes, no); card.append(kicker, title, detail, row); log.append(card); log.scrollTop = log.scrollHeight; yes.focus();
    }
  });
  function send() {
    const text = q.value.trim();
    if (!text || busy) return;
    add("me", text); q.value = ""; setBusy(true); step.textContent = t("Sending…");
    port.postMessage({ say: text, share: shared !== null, shareTabId: shared, control: control.checked });
  }
  go.addEventListener("click", send);
  q.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); } });
  stop.addEventListener("click", () => { port.postMessage({ stop: true }); step.textContent = t("Stopping…"); });
  sharing.addEventListener("change", follow);
  screen.addEventListener("change", follow);
  // Sharing follows the tab the person is looking at.
  chrome.tabs.onActivated.addListener((info) => { if (screen.checked) return; if (!fixedWindow || info.windowId === fixedWindow) follow(); });
  chrome.tabs.onUpdated.addListener((tabId, change) => { if (tabId === shared && (change.url || change.title)) follow(); });
  follow();
  q.focus();
})();
