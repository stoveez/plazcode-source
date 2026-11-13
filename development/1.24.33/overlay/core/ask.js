// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// 1.24.34 control rework, step 4: the "Ask PlazCode" side chat (Chrome's side panel, or a window docked to the right).
// Questions go to the extension worker, which asks a background chat on the person's AI site and sends the answer
// back. The shared tab follows the tab the person is looking at; a live picture of it sits at the top.
(() => {
  const $ = (id) => document.getElementById(id);
  const log = $("log"), q = $("q"), go = $("go"), stop = $("stop"), step = $("step"), sharing = $("sharing"), control = $("control"), screen = $("screen");
  const peek = $("peek"), shareTitle = $("shareTitle"), shareSite = $("shareSite"), banner = $("banner"), bannerText = $("bannerText");
  const fixedWindow = Number(new URLSearchParams(location.search).get("window")) || null;
  let shared = null, busy = false, viewPort = null;
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
    if (sharing.checked && screen.checked) { port.postMessage({ sharing: true, shareTabId: -1 }); return; }
    const tab = sharing.checked ? await currentTab() : null;
    port.postMessage({ sharing: !!tab, shareTabId: tab ? tab.id : null });
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
    if (m.type === "ask-busy") { if (m.enabled === false) { add("error", "Ask PlazCode is not switched on in this version."); go.disabled = true; return; } setBusy(!!m.busy); }
    else if (m.type === "ask-note") add(m.kind === "error" ? "error" : "note", m.text);
    else if (m.type === "ask-step") step.textContent = m.text;
    else if (m.type === "ask-reply") { add(m.status === "done" ? "ai" : m.status === "stopped" ? "note" : "error", m.text); setBusy(false); }
    else if (m.type === "ask-permission") { bannerText.textContent = "PlazCode could not take a picture of the tab. " + m.text; banner.hidden = false; }
    else if (m.type === "ask-share") {
      shared = Number.isInteger(m.tabId) ? m.tabId : null;
      document.body.classList.toggle("sharing", !!shared);
      if (m.stoppedInTab) sharing.checked = false;
      shareTitle.textContent = shared === -1 ? "Your whole screen" : shared ? (m.title || "This tab") : m.refused ? "This tab can't be shared" : "Not sharing";
      let host = ""; try { host = m.url ? new URL(m.url).host : ""; } catch {}
      shareSite.textContent = shared === -1 ? "Everything on your screen · shared with PlazCode" : shared ? host + " · shared with PlazCode" : m.refused ? "Browser pages, extension pages and AI chats are never shared." : "Turn on sharing so PlazCode can see this tab.";
      if (m.screenRefused) { screen.checked = false; add("error", m.screenRefused); }
      control.disabled = !shared; if (!shared) control.checked = false;
      $("controlText").textContent = shared === -1 ? "Let PlazCode control my computer" : "Let PlazCode control this tab";
      watch(shared);
    } else if (m.type === "ask-approve") {
      const card = document.createElement("div"); card.className = "approve"; card.setAttribute("role", "group");
      const kicker = document.createElement("small"); kicker.textContent = m.kicker || "Needs your approval";
      const title = document.createElement("div"); title.textContent = m.title;
      const detail = document.createElement("code"); detail.textContent = m.detail || ""; detail.hidden = !m.detail;
      const row = document.createElement("div"); row.className = "row";
      const yes = document.createElement("button"); yes.className = "main"; yes.textContent = "Allow";
      const no = document.createElement("button"); no.textContent = "Deny";
      const answer = (allowed) => { port.postMessage({ approve: m.id, allowed }); yes.disabled = no.disabled = true; kicker.textContent = allowed ? "Allowed" : "Denied"; };
      yes.addEventListener("click", () => answer(true)); no.addEventListener("click", () => answer(false));
      row.append(yes, no); card.append(kicker, title, detail, row); log.append(card); log.scrollTop = log.scrollHeight; yes.focus();
    }
  });
  function send() {
    const text = q.value.trim();
    if (!text || busy) return;
    add("me", text); q.value = ""; setBusy(true); step.textContent = "Sending…";
    port.postMessage({ say: text, share: shared !== null, shareTabId: shared, control: control.checked });
  }
  go.addEventListener("click", send);
  q.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); } });
  stop.addEventListener("click", () => { port.postMessage({ stop: true }); step.textContent = "Stopping…"; });
  sharing.addEventListener("change", follow);
  screen.addEventListener("change", follow);
  $("allowPerm").addEventListener("click", async () => {
    try { if (await chrome.permissions.request({ permissions: ["debugger"] })) { banner.hidden = true; add("note", "Allowed. PlazCode can now see and control tabs."); follow(); } } catch (error) { bannerText.textContent = String(error && error.message || error); }
  });
  // Sharing follows the tab the person is looking at.
  chrome.tabs.onActivated.addListener((info) => { if (screen.checked) return; if (!fixedWindow || info.windowId === fixedWindow) follow(); });
  chrome.tabs.onUpdated.addListener((tabId, change) => { if (tabId === shared && (change.url || change.title)) follow(); });
  follow();
  q.focus();
})();
