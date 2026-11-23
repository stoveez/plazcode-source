// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.24.36/ts/core/ask.ts (TypeScript): edit that file, then run node development/1.24.36/ts/build.cjs.
// AgentScript control rework (1.24.36), step 4: the "Ask PlazCode" side chat (Chrome's side panel, or a window docked to the right).
// Questions go to the extension worker, which asks a background chat on the person's AI site and sends the answer
// back. The shared tab follows the tab the person is looking at; a live picture of it sits at the top.
(async () => {
  type I18nApi = { t(text: string, values?: Record<string, unknown>): string; setLanguage(lang: string): void; mountStatic(root: Element): void; getLanguage(): string };
  // Step 7: PlazCode's language (the same files and setting as the toolbar menu). t() fills {slots} either way.
  const L = (globalThis as { PlazCodeI18n?: I18nApi }).PlazCodeI18n;
  const t = (text: unknown, values?: Record<string, unknown>) => L ? L.t(String(text), values) : (values ? String(text).replace(/\{([A-Za-z0-9_]+)\}/g, (m, k) => k in values ? String(values[k]) : m) : String(text));
  try { const saved = await chrome.storage.local.get("rsLanguage"); if (L) { L.setLanguage((saved && saved.rsLanguage) || "en"); L.mountStatic(document.body); } } catch {}
  try {
    chrome.storage?.onChanged?.addListener((changes: Record<string, { newValue?: string }>, area: string) => {
      if (area === "local" && changes && changes.rsLanguage && L) {
        L.setLanguage(changes.rsLanguage.newValue || "en");
      }
    });
  } catch {}
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const log = $("log"), q = $<HTMLTextAreaElement>("q"), go = $<HTMLButtonElement>("go"), stop = $<HTMLButtonElement>("stop"), step = $("step"), sharing = $<HTMLInputElement>("sharing"), control = $<HTMLInputElement>("control");
  const menu = $<HTMLButtonElement>("menu"), history = $("history"), chats = $("chats"), noChats = $("noChats"), newChat = $<HTMLButtonElement>("newChat");
  const peek = $<HTMLCanvasElement>("peek"), shareTitle = $("shareTitle"), shareSite = $("shareSite"), banner = $("banner"), bannerText = $("bannerText");
  const fixedWindow = Number(new URLSearchParams(location.search).get("window")) || null;
  let shared: number | null = null, wholeScreen = true, busy = false, viewPort: any = null, viewTab: number | null = null, workTab: number | null = null, historyOpen = false, lastChats: any = null;
  // The "Shared with PlazCode" mark in the shared tab, in the person's language.
  const words = { working: t("PlazCode is working here"), paused: t("Paused, you're in control"), resume: t("Resume"), stop: t("Stop"), shared: t("Shared with PlazCode"), stopSharing: t("Stop sharing") };
  document.title = t(document.title);
  const port = chrome.runtime.connect({ name: "plazcode-ask" });
  const add = (cls: string, text: string) => { const p = document.createElement("p"); p.className = "msg " + cls; p.textContent = text; log.append(p); log.scrollTop = log.scrollHeight; return p; };
  // Owner (2026-11-18): "there should be some kind of indicator that the AI is thinking/replying whenever you say something to it", and
  // replies came late. A "thinking" bubble shows from sending until the first words arrive; the reply then appears as the AI writes it
  // (a draft bubble) and is replaced by the finished answer.
  let typing: HTMLParagraphElement | null = null, draft: HTMLParagraphElement | null = null;
  const showTyping = (on: boolean) => {
    if (on && !typing && !draft) { typing = document.createElement("p"); typing.className = "msg ai typing"; typing.setAttribute("role", "status"); typing.setAttribute("aria-label", t("PlazCode is thinking…")); typing.innerHTML = "<span></span><span></span><span></span>"; log.append(typing); log.scrollTop = log.scrollHeight; }
    else if (!on && typing) { typing.remove(); typing = null; }
  };
  const showDraft = (text: string) => {
    if (!text) return; showTyping(false);
    if (!draft) { draft = add("ai", text); draft.classList.add("draft"); draft.setAttribute("aria-busy", "true"); }
    else { const end = log.scrollHeight - log.scrollTop - log.clientHeight < 40; draft.textContent = text; if (end) log.scrollTop = log.scrollHeight; }
  };
  const endDraft = () => { showTyping(false); if (draft) { draft.remove(); draft = null; } };
  const setBusy = (value: boolean) => { busy = value; go.disabled = value; stop.hidden = !value; showTyping(value); if (!value) { step.textContent = ""; workTab = null; endDraft(); } if (lastChats) drawChats(lastChats); };
  // History (owner, 2026-11-14): the three-line button opens the list of every Ask PlazCode chat; picking one shows it again and the next
  // question goes into that same AI chat. While PlazCode is answering, the list can be read but the chat cannot be switched.
  const intro = () => { const p = document.createElement("p"); p.className = "note"; p.textContent = t("Ask anything about the page you're on. PlazCode sees a picture of it with each question."); log.append(p); };
  function showHistory(on: boolean) {
    historyOpen = on; document.body.classList.toggle("history", on); history.hidden = !on; menu.setAttribute("aria-expanded", on ? "true" : "false");
    if (on) port.postMessage({ chats: "list" }); else q.focus();
  }
  function when(ms: number) {
    try { return new Date(ms).toLocaleString(L ? L.getLanguage() : undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return ""; }
  }
  function drawChats(m: { current?: string; items?: Array<{ id: string; title?: string; updated: number }> }) {
    lastChats = m;
    const items = Array.isArray(m.items) ? m.items : [];
    chats.textContent = ""; noChats.hidden = items.length > 0; newChat.disabled = busy;
    for (const c of items) {
      const current = c.id === m.current;
      const li = document.createElement("li"); li.className = "chat"; if (current) li.setAttribute("aria-current", "true");
      const open = document.createElement("button"); open.type = "button"; open.className = "open"; open.setAttribute("data-i18n-user-content", "");
      const name = document.createElement("b"); name.textContent = c.title || "…";
      const date = document.createElement("small"); date.textContent = when(c.updated);
      open.append(name, date); open.disabled = busy && !current;
      open.addEventListener("click", () => { if (!current) port.postMessage({ openChat: c.id }); showHistory(false); });
      const del = document.createElement("button"); del.type = "button"; del.className = "del"; del.textContent = "×";
      del.setAttribute("aria-label", t("Delete this chat")); del.title = t("Delete this chat"); del.disabled = busy && current;
      del.addEventListener("click", () => port.postMessage({ deleteChat: c.id }));
      li.append(open, del); chats.append(li);
    }
  }
  // The tab the person is looking at. From a side panel or a docked window the "current window" can be the panel's own window,
  // whose only tab is this page (shown as "This tab can't be shared" for every site, owner report 2026-11-14), so a page that is
  // not a website falls back to the active tab of the last focused browser window, then of any normal browser window.
  const isSite = (tab: { url?: string } | null | undefined) => !!tab && /^(?:https?|file):/i.test(String(tab.url || ""));
  async function activeIn(query: Record<string, unknown>) { try { const [tab] = await chrome.tabs.query(query); return tab || null; } catch { return null; } }
  async function currentTab() {
    const first = await activeIn(fixedWindow ? { active: true, windowId: fixedWindow } : { active: true, currentWindow: true });
    if (isSite(first) || fixedWindow) return first;
    const last = await activeIn({ active: true, lastFocusedWindow: true });
    if (isSite(last)) return last;
    try {
      const wins = await chrome.windows.getAll({ windowTypes: ["normal"] });
      wins.sort((a: { focused?: boolean }, b: { focused?: boolean }) => (b.focused ? 1 : 0) - (a.focused ? 1 : 0));
      for (const win of wins) { const tab = await activeIn({ active: true, windowId: win.id }); if (isSite(tab)) return tab; }
    } catch {}
    return first || last || null;
  }
  // Where this panel is on screen, so the app leaves it out of the AI's pictures of the whole screen (owner, 2026-11-19; ask-panel.js).
  async function panelPlace() {
    if (typeof PlazCodeAskPanel === "undefined") return null;
    try {
      const win = await chrome.windows.getCurrent();
      return PlazCodeAskPanel.place({ win, innerWidth: window.innerWidth, innerHeight: window.innerHeight, screenX: window.screenX, screenWidth: window.screen.width, title: document.title });
    } catch { return null; }
  }
  // The panel can be resized or the browser moved while the screen is shared: tell the app the new place (checked every 3 s).
  let panelSent = "";
  setInterval(async () => {
    if (shared !== -1) { panelSent = ""; return; }
    const place = await panelPlace(), text = JSON.stringify(place);
    if (text !== panelSent) { panelSent = text; port.postMessage({ panel: place }); }
  }, 3000);
  async function follow() {
    // The whole screen (tab id -1) is the default. Only when the PlazCode app cannot show it does PlazCode look at the tab the person is
    // looking at instead (owner, 2026-11-14: no separate "tab only" choice).
    if (sharing.checked && wholeScreen) { port.postMessage({ sharing: true, shareTabId: -1, words, panel: await panelPlace() }); return; }
    const tab = sharing.checked ? await currentTab() : null;
    port.postMessage({ sharing: !!tab, shareTabId: tab ? tab.id : null, words });
  }
  function watch(tabId: number | null) {
    if (viewPort) { try { viewPort.disconnect(); } catch {} viewPort = null; }
    (peek.getContext("2d") as CanvasRenderingContext2D).clearRect(0, 0, peek.width, peek.height);
    viewTab = Number.isInteger(tabId) ? tabId : null;
    if (!Number.isInteger(tabId)) return;
    viewPort = chrome.runtime.connect({ name: "plazcode-control-view" });
    viewPort.postMessage({ watch: tabId });
    viewPort.onMessage.addListener((m: any) => {
      if (!m || m.type !== "rs-control-frame" || !m.data || m.tabId !== viewTab) return;
      if (/^#[0-9a-f]{6}$/i.test(m.accent || "")) document.documentElement.style.setProperty("--a", m.accent);
      const bin = atob(m.data), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      createImageBitmap(new Blob([bytes], { type: "image/jpeg" })).then((b) => { const g = peek.getContext("2d") as CanvasRenderingContext2D, s = Math.max(peek.width / b.width, peek.height / b.height); g.drawImage(b, (peek.width - b.width * s) / 2, 0, b.width * s, b.height * s); b.close(); }, () => {});
    });
  }
  port.onMessage.addListener((m: any) => {
    if (!m) return;
    if (m.type === "ask-busy") { if (m.enabled === false) { add("error", t("Ask PlazCode is not switched on in this version.")); go.disabled = true; return; } setBusy(!!m.busy); }
    else if (m.type === "ask-history") {
      // A panel that was closed and opened again: show the same conversation.
      log.textContent = "";
      if (!Array.isArray(m.items) || !m.items.length) intro();
      for (const item of Array.isArray(m.items) ? m.items : []) {
        if (!item) continue;
        if (item.t === "me") add("me", String(item.text || ""));
        else if (item.t === "ai") add("ai", String(item.text || ""));
        else add(item.t === "error" ? "error" : "note", typeof item.key === "string" ? t(item.key, item.values || {}) : t(String(item.text || "")));
      }
    }
    else if (m.type === "ask-chats") drawChats(m);
    else if (m.type === "ask-note") add(m.kind === "error" ? "error" : "note", typeof m.key === "string" ? t(m.key, m.values || {}) : t(m.text));
    else if (m.type === "ask-work") { if (Number.isInteger(m.tabId)) { workTab = m.tabId; watch(m.tabId); add("note", t("PlazCode opened a copy of your tab to work in. Your own tab stays untouched.")); } }
    else if (m.type === "ask-step") step.textContent = t(m.text);
    else if (m.type === "ask-partial") { if (busy) showDraft(String(m.text || "")); }
    else if (m.type === "ask-reply") { endDraft(); add(m.status === "done" ? "ai" : m.status === "stopped" ? "note" : "error", m.status === "done" ? m.text : t(m.text)); setBusy(false); }
    else if (m.type === "ask-permission") { bannerText.textContent = t("PlazCode could not take a picture of the tab.") + " " + t(m.text); banner.hidden = false; }
    else if (m.type === "ask-share") {
      shared = Number.isInteger(m.tabId) ? m.tabId : null;
      document.body.classList.toggle("sharing", !!shared);
      if (m.stoppedInTab) sharing.checked = false;
      shareTitle.textContent = shared === -1 ? t("Your whole screen") : shared ? (m.title || t("This tab")) : t(m.refused ? "This tab can't be shared" : "Not sharing");
      let host = ""; try { host = m.url ? new URL(m.url).host : ""; } catch {}
      shareSite.textContent = shared === -1 ? t("Everything on your screen · shared with PlazCode") : shared ? t("{site} · shared with PlazCode", { site: host }) : t(m.refused ? "Browser pages, extension pages and AI chats are never shared." : "Turn on sharing so PlazCode can see your screen.");
      if (m.screenRefused) { wholeScreen = false; add("error", t(m.screenRefused)); follow(); }
      control.disabled = !shared; if (!shared) control.checked = false; else if (!controlTouched && shared !== -1) control.checked = true;
      $("controlText").textContent = t(shared === -1 ? "Let PlazCode control my computer" : "Let PlazCode do things for me");
      watch(busy && workTab ? workTab : shared);
    } else if (m.type === "ask-approve") {
      const card = document.createElement("div"); card.className = "approve"; card.setAttribute("role", "group");
      const kicker = document.createElement("small"); kicker.textContent = m.kicker ? t(m.kicker) : t("Needs your approval");
      const title = document.createElement("div"); title.textContent = t(m.title);
      const detail = document.createElement("code"); detail.textContent = m.detail || ""; detail.hidden = !m.detail;
      const row = document.createElement("div"); row.className = "row";
      const yes = document.createElement("button"); yes.className = "main"; yes.textContent = t("Allow");
      const no = document.createElement("button"); no.textContent = t("Deny");
      const answer = (allowed: boolean) => { port.postMessage({ approve: m.id, allowed }); yes.disabled = no.disabled = true; kicker.textContent = t(allowed ? "Allowed" : "Denied"); };
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
  menu.addEventListener("click", () => showHistory(!historyOpen));
  newChat.addEventListener("click", () => { if (busy) return; port.postMessage({ newChat: true }); showHistory(false); });
  document.addEventListener("keydown", (event: KeyboardEvent) => { if (event.key === "Escape" && historyOpen) showHistory(false); });
  go.addEventListener("click", send);
  q.addEventListener("keydown", (event: KeyboardEvent) => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); } });
  stop.addEventListener("click", () => { port.postMessage({ stop: true }); step.textContent = t("Stopping…"); });
  let controlTouched = false;
  control.addEventListener("change", () => { controlTouched = true; });
  sharing.addEventListener("change", () => { wholeScreen = true; follow(); });
  // Sharing follows the tab the person is looking at.
  chrome.tabs.onActivated.addListener((info: { windowId?: number }) => { if (wholeScreen) return; if (!fixedWindow || info.windowId === fixedWindow) follow(); });
  chrome.tabs.onUpdated.addListener((tabId: number, change: { url?: string; title?: string }) => { if (tabId === shared && (change.url || change.title)) follow(); });
  follow();
  q.focus();
})();
