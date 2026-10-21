// SPDX-License-Identifier: GPL-3.0-or-later
// providers/freebuff.js — Freebuff (freebuff.ai / freebuff.com) provider.
// Same RSProvider interface as providers/deepseek.js. Chat lives at /chat
// (login-gated). /web and /cloud also host a composer ("Ask Freebuff…").
//
// DOM is adaptive: Cloudflare + Next.js, login at /login, then a typical
// agent chat (textarea or contenteditable + send). Selectors fail open so a
// reskin still finds the composer.
// eslint-disable-next-line no-unused-vars
const RSProvider = (() => {
  "use strict";
  // Reads can fail while a framework remounts a surface. Do not hide write failures.
  let domReadErrors = 0;
  function safeRead(read, fallback) {
    try { return read(); } catch { domReadErrors++; return fallback; }
  }
  function safeQuery(root, selector) {
    return safeRead(() => root.querySelector(selector), null);
  }
  function safeQueryAll(root, selector) {
    return safeRead(() => Array.from(root.querySelectorAll(selector)), []);
  }
  function safeClosest(node, selector) {
    return safeRead(() => node.closest(selector), null);
  }
  function safeRect(node) {
    return safeRead(() => node.getBoundingClientRect(), {x:0,y:0,left:0,top:0,right:0,bottom:0,width:0,height:0,readFailed:true});
  }
  function safeStyle(node) {
    return safeRead(() => getComputedStyle(node), {display:'none',visibility:'hidden',opacity:'0',overflow:'hidden',overflowY:'hidden'});
  }
  function safePredicate(predicate) {
    const before = domReadErrors;
    const result = safeRead(predicate, false);
    return before === domReadErrors ? result : false;
  }
  // A poll-count limit also bounds waits if the wall clock moves backwards.
  function waitBudget(timeout, interval) {
    const ms = Number.isFinite(timeout) ? Math.min(600000, Math.max(0, timeout)) : 30000;
    return {ms, polls: Math.ceil(ms / interval)};
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let diag = () => {};

  const S = {
    editor:
      'textarea, [contenteditable="true"][role="textbox"], [contenteditable="true"], .ProseMirror, .tiptap, [role="textbox"]',
    sendAria: /^(send|submit|ask)$|send message|submit prompt/i,
    stopAria: /stop|cancel generation|abort|interrupt|stop generating/i,
    auth: 'a[href*="login"], button, [class*="login"]',
    errorSurfaces: '[role="alert"],[class*="toast"],[class*="error"],[data-sonner-toast]',
  };

  const RE = {
    contextLimit: /context.{0,20}(limit|exceeded)|conversation.{0,20}too long|(token|context).{0,10}limit/i,
    tooLong: /conversation .{0,20}(too long|getting too long)/i,
    busy: /rate limit|too many requests|try again later|temporarily unavailable|server is busy/i,
    continueBtn: /^(continue|continuer)$/i,
  };

  const timings = {
    // Freebuff streams slowly — 1.6s idle used to look "dead" mid-reply.
    GEN_IDLE_MS: 14000,
    REASON_IDLE_MS: 45000,
    WARMUP_MS: 120000,
    REASON_NOREPLY_MS: 180000,
    STABLE_MS: 28000,
    RESPONSE_TIMEOUT_MS: 720000,
    PRESTART_MS: 180000,
    GEN_STOP_GRACE_MS: 12000,
  };

  function visible(el) {
    if (!el || safeClosest(el, "#rs-root")) return false;
    try {
      const r = safeRect(el);
      if (r.width < 16 || r.height < 10) return false;
      const s = safeStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) === 0) return false;
    } catch { return false; }
    return true;
  }

  function textWithout(root, excludeSel) {
    if (!root) return "";
    const skip = excludeSel ? `.rs-chip, ${excludeSel}` : ".rs-chip";
    let t = "";
    const walk = (n) => {
      if (safeRead(() => n.nodeType, 0) === 3) { t += safeRead(() => n.nodeValue, ""); return; }
      if (safeRead(() => n.nodeType, 0) !== 1) return;
      if (safeRead(() => n.matches, null) && safeRead(() => n.matches(skip), false)) return;
      if (safeRead(() => n.tagName, "") === "BR") { t += "\n"; return; }
      const isBlock = /^(P|DIV|PRE|LI|UL|OL|BLOCKQUOTE|H[1-6]|ARTICLE|SECTION)$/.test(safeRead(() => n.tagName, ""));
      if (isBlock && t && !t.endsWith("\n")) t += "\n";
      for (const c of safeRead(() => n.childNodes, [])) walk(c);
      if (isBlock && !t.endsWith("\n")) t += "\n";
    };
    walk(root);
    return t;
  }

  // PlazCode locks the box while it works (see setInputLock). A locked box must
  // still be found, and must never be mistaken for the site being busy.
  let lockedEditor = null;
  const isOurLock = (ed) => !!ed && ed === lockedEditor;
  const getEditor = () => {
    if (lockedEditor && safeRead(() => lockedEditor.isConnected, false) && visible(lockedEditor)) return lockedEditor;
    const sels = S.editor.split(",").map((s) => s.trim());
    for (const sel of sels) {
      for (const el of safeQueryAll(document, sel)) {
        if (!visible(el)) continue;
        if (safeClosest(el, "nav, header, [role='navigation']")) continue;
        return el;
      }
    }
    return null;
  };

  const editorText = () => {
    const e = getEditor();
    if (!e) return "";
    if (safeRead(() => e.tagName, "") === "TEXTAREA" || safeRead(() => e.tagName, "") === "INPUT") return safeRead(() => e.value, "") || "";
    return (safeRead(() => e.innerText, "") || safeRead(() => e.textContent, "") || "").replace(/\u00a0/g, " ");
  };

  function roleOf(item) {
    if (!item) return "";
    const a = (safeRead(() => item.getAttribute("data-message-role"), null) || safeRead(() => item.getAttribute("data-role"), null) || safeRead(() => item.getAttribute("data-author"), null) || "").toLowerCase();
    if (a) return a;
    const cls = String(safeRead(() => item.className, "") || "").toLowerCase();
    if (/\buser\b|human|from-user|msg-user/.test(cls)) return "user";
    if (/\bassistant\b|\bagent\b|\bai\b|from-assistant|msg-assistant/.test(cls)) return "assistant";
    const inner = safeQuery(item, "[data-message-role],[data-role]");
    if (inner) return (safeRead(() => inner.getAttribute("data-message-role"), null) || safeRead(() => inner.getAttribute("data-role"), null) || "").toLowerCase();
    return "";
  }

  // Page furniture is never a chat turn: menus and sidebars, dialogs, or any
  // wrapper that holds the chat box itself.
  const FURNITURE = "nav, [role='navigation'], [role='menu'], [role='listbox'], [role='dialog'], [role='tooltip']";
  function notATurn(el, ed) {
    return !!safeClosest(el, FURNITURE) || (!!ed && safeRead(() => el.contains(ed), false));
  }
  // What PlazCode itself puts into a chat: proof that a chat is no longer new.
  const ARTEFACT = /⟦RS-SYS⟧|(^|\n)\s*Output of '[^'\n]+':|\(System note:/;
  const isArtefact = (el) => ARTEFACT.test(safeRead(() => el.textContent, "") || "");
  function rawItems() {
    const ed = getEditor();
    const sels = [
      "[data-message-role]",
      "[data-role='user']",
      "[data-role='assistant']",
      ".msg, .message, [class*='ChatMessage'], [class*='chat-message']",
      "article",
    ];
    const seen = new Set();
    const out = [];
    for (const s of sels) {
      for (const el of safeQueryAll(document, s)) {
        if (seen.has(el) || !visible(el) || notATurn(el, ed)) continue;
        seen.add(el);
        out.push(el);
      }
      if (out.length) break;
    }
    if (!out.length) {
      const log = safeQuery(document, "[role='log'], [role='feed'], main [class*='thread'], main [class*='messages']");
      if (log) {
        for (const el of safeRead(() => log.children, [])) {
          if (safeRead(() => el.nodeType, 0) === 1 && visible(el) && !notATurn(el, ed)) out.push(el);
        }
      }
    }
    return out;
  }
  function allItems() {
    const out = rawItems();
    // A new chat has no address yet. The generic selectors above can then match
    // page text that is not a conversation (a welcome card, a tip). Unless
    // something on the page is a turn with a real role, or PlazCode's own
    // message, there is no conversation here.
    if (!out.length || conversationKey()) return out;
    return out.some((el) => roleOf(el) !== "" || isArtefact(el)) ? out : [];
  }

  function isUserItem(item) {
    const r = roleOf(item);
    if (/user|human/.test(r)) return true;
    if (/assistant|agent|ai|model|system/.test(r)) return false;
    return /\bml-auto\b|justify-end|items-end/.test(String(item && safeRead(() => item.className, "") || ""));
  }
  function isAssistantItem(item) {
    const r = roleOf(item);
    if (/assistant|agent|ai|model/.test(r)) return true;
    if (/user|human/.test(r)) return false;
    return !isUserItem(item) && !!(item && (safeRead(() => item.innerText, "") || "").trim());
  }

  function itemText(item) {
    if (!item) return "";
    const body = safeQuery(item, ".prose, .markdown, .bubble, [class*='message-content'], [class*='md']") || item;
    return textWithout(body);
  }
  function classifyText(item, excludeSel) {
    if (!item) return "";
    const body = safeQuery(item, ".prose, .markdown, .bubble, [class*='message-content']") || item;
    if (excludeSel && safeRead(() => body.closest, null) && safeClosest(body, excludeSel)) return "";
    return textWithout(body, excludeSel);
  }

  const assistantItems = () => allItems().filter(isAssistantItem);
  const assistantCount = () => assistantItems().length;
  const userCount = () => allItems().filter(isUserItem).length;
  const lastAssistant = () => { const it = assistantItems(); return it.length ? it[it.length - 1] : null; };

  const _idMap = new WeakMap();
  let _idSeq = 0;
  function itemKey(item) {
    if (!item) return null;
    let id = _idMap.get(item);
    if (!id) { id = ++_idSeq; _idMap.set(item, id); }
    return id;
  }
  const lastAssistantId = () => itemKey(lastAssistant());

  // A chat with an address (/chat/<id>) is a saved chat. Without one it only
  // counts as started once a user turn exists, so a greeting from the site
  // does not turn a brand-new chat into an existing one.
  function chatIsEmpty() {
    const items = allItems();
    if (!items.length) return true;
    if (conversationKey()) return false;
    return !items.some((el) => /user|human/.test(roleOf(el)) || isArtefact(el));
  }
  const isFreshChat = () => chatIsEmpty() && !!getEditor();

  function composerFrame() {
    const ed = getEditor();
    if (!ed) return null;
    return safeClosest(ed, "form")
      || safeClosest(ed, "[class*='composer']")
      || safeClosest(ed, "footer")
      || safeRead(() => ed.parentElement, null);
  }
  function barAnchor() {
    const ed = getEditor();
    if (!ed) return null;
    let n = ed;
    for (let i = 0; i < 10 && n; i++) {
      const cls = String(safeRead(() => n.className, "") || "");
      if (/rounded|composer|input-bar|chat-input/i.test(cls)) return n;
      n = safeRead(() => n.parentElement, null);
    }
    return composerFrame();
  }

  function setInputLock(on) {
    const ed = getEditor();
    if (!ed) return;
    // A box we locked reads contenteditable="false" (and isContentEditable false),
    // so unlocking must recognise that value too or the box stays dead for good.
    const editable = safeRead(() => ed.getAttribute("contenteditable"), null);
    if (ed.isContentEditable || editable === "true" || editable === "false" || editable === "plaintext-only") {
      if (on && editable !== "false") ed.dataset.rsEditable = editable || "true";
      ed.setAttribute("contenteditable", on ? "false" : (ed.dataset.rsEditable || "true"));
      lockedEditor = on ? ed : null;
      return;
    }
    if (on) {
      lockedEditor = ed;
      if (!ed.dataset.rsPlaceholder) ed.dataset.rsPlaceholder = safeRead(() => ed.getAttribute("placeholder"), null) || "";
      ed.setAttribute("readonly", "");
      ed.setAttribute("placeholder", "⏳ Agent working… please wait");
    } else {
      lockedEditor = null;
      ed.removeAttribute("readonly");
      if (ed.dataset.rsPlaceholder != null) ed.setAttribute("placeholder", ed.dataset.rsPlaceholder);
    }
  }

  function loginGatePresent() {
    const p = (location.pathname || "").toLowerCase();
    if (/^\/login(\/|$)/.test(p) || /callbackurl=/i.test(location.search || "")) return true;
    try {
      for (const el of safeQueryAll(document, "button, a, h1, h2, p")) {
        if (!visible(el)) continue;
        const t = (safeRead(() => el.textContent, "") || "").trim();
        if (/continue with (github|google)/i.test(t)) return true;
      }
    } catch {}
    return false;
  }

  function isProductPage() {
    return /^\/(web|cloud|desktop)(\/|$)/i.test(location.pathname || "");
  }
  function modeWarning() {
    if (loginGatePresent()) {
      return "<b>Freebuff</b> — log in (GitHub or Google) first, then open Chat and come back here";
    }
    if (isProductPage() && !getEditor()) {
      return "<b>Freebuff</b> — this is a product page. Open <b>Chat</b> (freebuff.ai/chat) to drive the agent.";
    }
    if (!getEditor()) {
      return "<b>Freebuff</b> — chat box not found. Open <b>Chat</b> (freebuff.ai/chat), then reload.";
    }
    return "";
  }

  const ariaOf = (b) => (safeRead(() => b.getAttribute("aria-label"), null) || safeRead(() => b.title, "") || "").trim();
  const allButtons = () => [...safeQueryAll(document, "button")].filter((b) => !safeClosest(b, "#rs-root"));
  const sendButton = () =>
    allButtons().find((b) => S.sendAria.test(ariaOf(b)) && visible(b) && b.type !== "reset") ||
    allButtons().find((b) => safeRead(() => b.type, "") === "submit" && visible(b)) ||
    null;
  const stopButton = () =>
    allButtons().find((b) => S.stopAria.test(ariaOf(b)) && visible(b)) || null;

  function streamText(item) {
    if (!item) return "";
    return classifyText(item, ".rs-chip").trim();
  }
  const streamLen = (item) => streamText(item === undefined ? lastAssistant() : item).length;

  let _streamMax = -1, _streamAt = 0, _streamItem = null, _streamSeen = false;
  function sampleStream() {
    const item = lastAssistant();
    const len = streamText(item).length;
    const now = Date.now();
    if (!_streamSeen) {
      // The first look is only a baseline. Text that is already on the page
      // (a welcome card, a restored chat) has not "just grown", and counting it
      // as growth made a brand-new empty chat look like it was generating.
      _streamSeen = true; _streamItem = item; _streamMax = len; _streamAt = 0; return;
    }
    if (item !== _streamItem || len < _streamMax - 400) {
      _streamItem = item; _streamMax = len; _streamAt = now; return;
    }
    if (len > _streamMax) { _streamMax = len; _streamAt = now; }
  }
  const grewWithin = (ms) => _streamMax > 1 && Date.now() - _streamAt < ms;

  const WEDGE_MS = 30000;
  let _stopSince = 0;
  // Says WHY the page looks busy ("" = not busy). The reason goes into the
  // diagnostic log, so a wrong "generating" can be traced to its signal.
  function busyChrome() {
    const ui = safeRead(() => document.getElementById("rs-root"), null);
    const ours = (el) => ui && el && safeRead(() => ui.contains(el), false);
    for (const el of safeQueryAll(document, '[aria-busy="true"]')) {
      if (!ours(el) && visible(el)) return "aria-busy";
    }
    const ed = getEditor();
    // A greyed-out Send button is how EVERY empty chat box looks, so it only
    // means "busy" when there is a draft that Send refuses to take.
    if (ed && editorText().trim() !== "") {
      const send = sendButton();
      if (send && (safeRead(() => send.disabled, true) || safeRead(() => send.getAttribute("aria-disabled"), null) === "true")) return "send-disabled";
    }
    // The box PlazCode itself locked (contenteditable=false) is not the site being busy.
    if (ed && (safeRead(() => ed.disabled, true) || (!isOurLock(ed) && safeRead(() => ed.getAttribute("contenteditable"), null) === "false") || safeRead(() => ed.getAttribute("aria-disabled"), null) === "true")) return "composer-disabled";
    for (const b of allButtons()) {
      if (!visible(b)) continue;
      const t = (ariaOf(b) + " " + (safeRead(() => b.textContent, "") || "")).toLowerCase();
      if (/\b(stop generating|stop response|cancel generation|abort|interrupt)\b/.test(t) || /^stop$/.test(t.trim())) return "stop-text";
    }
    for (const sel of ['[data-streaming="true"]', '[data-status="generating"]', '[class*="is-generating"]', '[class*="streaming"]']) {
      for (const el of safeQueryAll(document, sel)) {
        if (!ours(el) && visible(el)) return "streaming-marker";
      }
    }
    return "";
  }
  function genWhy() {
    sampleStream();
    const busy = busyChrome();
    if (busy) return busy;
    const stop = !!stopButton();
    const now = Date.now();
    if (stop) {
      if (!_stopSince) _stopSince = now;
      // Stop still up = still generating. Slow Freebuff pauses many seconds between tokens.
      return "stop-button";
    }
    _stopSince = 0;
    return grewWithin(timings.GEN_IDLE_MS) ? "growing" : "";
  }
  function genActive() {
    return genWhy() !== "";
  }
  const isGenerating = genActive;
  const isBusyNow = genActive;
  const isHardGenerating = () => !!stopButton();

  const turnHalted = () => false;
  const findContinueBtn = () => null;
  const clickContinueBtn = () => false;

  function snapshot() {
    try {
      const it = lastAssistant();
      if (!it) return { th: 0, rp: 0 };
      return { th: 0, rp: streamLen(it) };
    } catch { return {}; }
  }
  function readAssistant() {
    const item = lastAssistant();
    if (!item) return { present: false, reply: "", thinking: "", item: null };
    return { present: true, reply: streamText(item).trim(), thinking: "", item };
  }

  async function waitFor(pred, timeout) {
    const budget = waitBudget(timeout, 120), t0 = Date.now();
    for (let poll = 0; poll < budget.polls && Date.now() - t0 < budget.ms; poll++) {
      const result = safePredicate(pred);
      if (result) return true;
      await sleep(120);
    }
    return false;
  }

  const SEND_MAX = 120000;
  function truncateForSend(text) {
    if(typeof window.__rsLimitOutgoing==="function")return window.__rsLimitOutgoing(text);
    if (!text || text.length <= SEND_MAX) return text;
    const omitted = text.length - SEND_MAX;
    const marker = `\n\n[…PlazCode: result truncated to fit Freebuff's input limit - ${omitted} of ${text.length} characters omitted…]\n\n`;
    const budget = SEND_MAX - marker.length;
    const headLen = Math.floor(budget * 0.85);
    const tailLen = budget - headLen;
    return text.slice(0, headLen) + marker + text.slice(text.length - tailLen);
  }

  function setTextareaValue(el, v) {
    const proto = window.HTMLTextAreaElement && window.HTMLTextAreaElement.prototype;
    const setter = proto && Object.getOwnPropertyDescriptor(proto, "value");
    if (setter && setter.set) setter.set.call(el, v);
    else el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function setRichText(el, text) {
    if (safeRead(() => el.tagName, "") === "TEXTAREA" || safeRead(() => el.tagName, "") === "INPUT") {
      setTextareaValue(el, text);
      return;
    }
    el.focus();
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {}
    let ok = false;
    try { ok = document.execCommand("insertText", false, text); } catch {}
    if (!ok) {
      el.textContent = text;
      try {
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      } catch {
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
  }

  function pressEnter(editor) {
    const o = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
    editor.dispatchEvent(new KeyboardEvent("keydown", o));
    editor.dispatchEvent(new KeyboardEvent("keyup", o));
  }

  // ── Sending ────────────────────────────────────────────────────────────
  // Type the text, CHECK it really is in the box, submit, then CHECK it went.
  // The result is true only when the message is confirmed sent, so PlazCode
  // stops with a clear message instead of waiting for a reply that cannot come.
  const squash = (s) => String(s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  let _sendDetail = "", _sendAmbiguous = false, _sendRetryable = false, _lastHas = null;

  // The SITE refuses input (not PlazCode's own lock).
  const boxRefusesInput = (ed) => !!ed && (safeRead(() => ed.disabled, false) === true || safeRead(() => ed.getAttribute("aria-disabled"), null) === "true");
  function pasteText(el, text) {
    el.focus();
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {}
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }
  function directText(el, text) {
    if (safeRead(() => el.tagName, "") === "TEXTAREA" || safeRead(() => el.tagName, "") === "INPUT") { setTextareaValue(el, text); return; }
    el.focus();
    el.textContent = text;
    try { el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text })); }
    catch { el.dispatchEvent(new Event("input", { bubbles: true })); }
  }
  // Remove PlazCode's own unsent text from the box (never anything else).
  function clearOwnDraft(has) {
    const ed = getEditor();
    if (!ed || typeof has !== "function" || !has()) return false;
    try {
      if (safeRead(() => ed.tagName, "") === "TEXTAREA" || safeRead(() => ed.tagName, "") === "INPUT") setTextareaValue(ed, "");
      else {
        ed.focus();
        try {
          const range = document.createRange();
          range.selectNodeContents(ed);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          document.execCommand("delete", false);
        } catch {}
        if (editorText().trim() !== "") {
          ed.textContent = "";
          try { ed.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" })); } catch { ed.dispatchEvent(new Event("input", { bubbles: true })); }
        }
      }
    } catch {}
    return editorText().trim() === "";
  }
  const clearEditor = () => clearOwnDraft(_lastHas);
  const sendReadyNow = () => {
    const b = sendButton();
    return !!b && !safeRead(() => b.disabled, true) && safeRead(() => b.getAttribute("aria-disabled"), null) !== "true";
  };

  async function typeAndSend(text, images) {
    _sendDetail = ""; _sendAmbiguous = false; _sendRetryable = false;
    // The box can still be loading, or swapping between the home view and a chat.
    await waitFor(() => { const e = getEditor(); return !!e && !boxRefusesInput(e); }, 15000);
    // Never type over a reply that is still streaming.
    if (isHardGenerating()) await waitFor(() => !isHardGenerating(), 10000);
    const editor = getEditor();
    if (!editor) throw new Error("Freebuff chat box not found — log in and open Chat first");
    markExistingNotices();
    text = truncateForSend(text);
    const full = squash(text), want = full.slice(-48);
    // "Our text is in the box": its ending is there, or - if the box reformats text
    // (markdown, list markers) - most of it is.
    const has = () => {
      const now = squash(editorText());
      return now.includes(want) || (now.length >= 20 && now.length >= full.length * 0.6);
    };
    _lastHas = has;
    // PlazCode's own lock would make the box refuse the text. Open it for the
    // write and close it again afterwards.
    const relock = isOurLock(editor);
    if (relock) setInputLock(false);
    try {
      const before = { users: userCount(), replies: assistantCount(), key: conversationKey(), stop: isHardGenerating() };
      // 1) Put the text in the box. Try the usual way first, then a paste, then a direct write.
      const writers = [
        (el) => { el.focus(); setRichText(el, text); },
        (el) => pasteText(el, text),
        (el) => directText(el, text),
      ];
      let typed = false, writer = -1;
      for (let i = 0; i < writers.length && !typed; i++) {
        const el = getEditor() || editor;
        if (i === 0) { el.focus(); await sleep(40); }
        try { writers[i](el); } catch {}
        await sleep(80);
        typed = has() || await waitFor(has, 400);
        if (typed) writer = i;
      }
      if (images && images.length) {
        try { await attachImages(images); } catch {}
      }
      await waitFor(sendReadyNow, 2500);
      // Some boxes fold a very long paste into a chip and show nothing: an empty
      // box with a ready Send button is then accepted.
      const folded = !typed && editorText().trim() === "" && sendReadyNow();
      diag("freebuff.send", { editorLen: editorText().length, textLen: text.length, typed, writer, folded, unlocked: relock });
      if (!typed && !folded) {
        _sendRetryable = true;
        _sendDetail = "Freebuff's chat box did not take the text, so nothing was sent. Click once inside the Freebuff chat box, then press Start again.";
        diag("freebuff.send.failed", { why: "text-not-in-box" });
        return false;
      }
      // 2) Submit, and look for proof that Freebuff took the message.
      const evidence = () => {
        if (userCount() > before.users) return "user-turn";
        if (assistantCount() > before.replies) return "reply-turn";
        if (conversationKey() !== before.key) return "new-address";
        if (!before.stop && isHardGenerating()) return "generating";
        if (typed && getEditor() && !has()) return "box-cleared";
        return "";
      };
      const submitters = [
        () => { const b = sendButton(); if (!b || safeRead(() => b.disabled, true)) return false; b.click(); return true; },
        () => { const form = safeClosest(getEditor() || editor, "form"); if (!form || typeof form.requestSubmit !== "function") return false; form.requestSubmit(); return true; },
        () => { pressEnter(getEditor() || editor); return true; },
      ];
      let last = -1, proof = "", attempts = 0;
      for (let attempt = 0; attempt < 4 && !proof; attempt++) {
        // Resend only while our text is verifiably still in the box; if it left, judge by the evidence.
        if (attempt > 0 && typed && !has()) break;
        let used = -1;
        for (let step = 1; step <= submitters.length && used < 0; step++) {
          const idx = (last + step + submitters.length) % submitters.length;
          let ok = false;
          try { ok = submitters[idx](); } catch {}
          if (ok) used = idx;
        }
        if (used >= 0) last = used;
        attempts++;
        await waitFor(() => (proof = evidence()) !== "", attempt === 0 ? 5000 : 3500);
      }
      diag("freebuff.send.result", { ok: !!proof, proof, attempts, via: last });
      if (proof) { await sleep(60); return true; }
      if (typed && has()) {
        clearOwnDraft(has);
        _sendRetryable = true;
        _sendDetail = "Freebuff did not accept the message: it stayed in the chat box. PlazCode removed its own text and stopped.";
      } else {
        _sendAmbiguous = true;
        _sendDetail = "PlazCode could not tell whether Freebuff took the message (no new message appeared in the chat). Check the chat before trying again.";
      }
      return false;
    } finally {
      if (relock) setInputLock(true);
    }
  }

  function stopGeneration() {
    const b = stopButton();
    if (b) { try { b.click(); } catch {} }
  }

  // A limit message counts only if it is a real, visible notice of the site:
  // not chat text (ours or the model's), not the chat box, and not something
  // that was already on the page before PlazCode sent its message.
  const _oldNotices = new WeakMap();
  function limitNotices() {
    const out = [];
    const ed = getEditor(), items = allItems();
    for (const el of safeQueryAll(document, S.errorSurfaces)) {
      if (!visible(el)) continue;
      if (ed && (el === ed || safeRead(() => el.contains(ed) || ed.contains(el), false))) continue;
      if (items.some((it) => it === el || safeRead(() => it.contains(el) || el.contains(it), false))) continue;
      const t = (safeRead(() => el.innerText, "") || "").trim();
      if (t.length > 8 && t.length < 600 && RE.contextLimit.test(t)) out.push([el, t]);
    }
    return out;
  }
  function markExistingNotices() {
    try { for (const [el, t] of limitNotices()) _oldNotices.set(el, t); } catch {}
  }
  let _noEditorSince = 0;
  function scanError() {
    try {
      for (const [el, t] of limitNotices()) {
        if (_oldNotices.get(el) === t) continue;
        return t.slice(0, 240);
      }
    } catch {}
    // The box can be missing for a moment while the page swaps between the home
    // view and a chat. Only report it when it stays gone.
    if (!getEditor() && !loginGatePresent()) {
      if (!_noEditorSince) _noEditorSince = Date.now();
      if (Date.now() - _noEditorSince > 10000) return "The input box disappeared (session ended?).";
    } else _noEditorSince = 0;
    return null;
  }
  const isTooLongMsg = (text) => RE.tooLong.test(text);
  const isBusyMsg = (text) => RE.busy.test(text);

  function fileFromImage(img, i) {
    if (typeof PlazCodeMedia !== "undefined") return PlazCodeMedia.fileFrom(img, i);
    const mime = img.mimeType || "image/jpeg";
    const bin = atob(img.data);
    const arr = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j);
    const ext = mime.includes("png") ? "png" : "jpg";
    return new File([arr], `or_${Date.now()}_${i}.${ext}`, { type: mime });
  }
  function clearAttachments() {}
  async function attachImages(images) {
    const editor = getEditor();
    if (!editor || !images || !images.length) return false;
    const dt = new DataTransfer();
    images.forEach((img, i) => { try { dt.items.add(fileFromImage(img, i)); } catch {} });
    if (!dt.items.length) return false;
    const fileInput = safeQuery(document, 'input[type="file"]');
    if (fileInput) {
      try {
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      } catch {}
    }
    try {
      editor.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    } catch {}
    return false;
  }

  // "" = a new chat that has no address yet (the home page, or the bare chat
  // page). The core treats that differently from "a different chat", so a chat
  // that gains its address after the first message is still the same chat.
  function conversationKey() {
    const path = location.pathname || "";
    const m = path.match(/\/(?:chat|c|conversation|thread)\/([A-Za-z0-9_-]+)/);
    if (m) return /^(?:new|index)$/i.test(m[1]) ? "" : m[1];
    if (/^\/(?:chat|c|web|cloud|desktop|new|home)?\/?$/i.test(path)) return "";
    return path;
  }

  function installSendHooks(handlers) {
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
      const ed = getEditor();
      if (!ed || !safeRead(() => ed.contains(e.target), false)) return;
      if (editorText().trim() === "") return;
      if (handlers.isBlocked()) return;
      if (!handlers.isStarted()) {
        if (!chatIsEmpty()) return;
        handlers.onBlockedAttempt();
        return;
      }
      handlers.onUserMessage(assistantCount());
    }, true);
    document.addEventListener("click", (e) => {
      if (!getEditor()) return;
      const t = e.target;
      // PlazCode's own bar buttons (Fix connection, Enhance, ...) are never the site's Send button.
      if (safeClosest(t, "#rs-root")) return;
      const stop = safeRead(() => t.closest, null) && safeClosest(t, "button");
      if (stop && S.stopAria.test(ariaOf(stop))) { handlers.onNativeStop(); return; }
      const btn = safeRead(() => t.closest, null) && safeClosest(t, "button");
      if (!btn) return;
      const isSend = S.sendAria.test(ariaOf(btn)) || safeRead(() => btn.type, "") === "submit";
      if (!isSend) return;
      if (safeRead(() => btn.disabled, true)) return;
      if (handlers.isBlocked()) return;
      if (!handlers.isStarted()) {
        if (!chatIsEmpty()) return;
        handlers.onBlockedAttempt();
        return;
      }
      handlers.onUserMessage(assistantCount());
    }, true);
  }

  const CMD_SHAPE = /"(?:command|tool)"\s*:\s*"|###\s*lua|###mcp_tool###/i;
  function findToolBlockSpot(item) {
    if (!item) return null;
    let parent = null, ref = null;
    for (const pre of safeQueryAll(item, "pre")) {
      if (safeRead(() => pre.closest, null) && safeClosest(pre, ".rs-chip")) continue;
      if (!CMD_SHAPE.test(safeRead(() => pre.textContent, "") || "")) continue;
      pre.classList.add("rs-tool-hide");
      item.classList.add("rs-cmd-mask");
      if (!ref && safeRead(() => pre.parentElement, null)) { parent = safeRead(() => pre.parentElement, null); ref = pre; }
    }
    return ref ? { parent, ref } : null;
  }

  return {
    id: "freebuff",
    displayName: "Freebuff",
    supportsVision: true,
    timings,
    thinkingSel: ".reasoning, [class*='thinking'], [class*='reason']",
    init({ diag: d } = {}) {
      if (d) diag = d;
      try { document.documentElement.setAttribute("data-rs-freebuff-ver", "2026-09"); } catch {}
      diag("freebuff.init", { hasEditor: !!getEditor(), login: loginGatePresent(), path: location.pathname, fresh: chatIsEmpty(), items: allItems().length, why: genWhy() });
    },
    allItems, isUserItem, isAssistantItem, itemText, classifyText,
    assistantCount, userCount, lastAssistant, lastAssistantId, itemKey, readAssistant,
    streamLen, snapshot,
    getEditor, editorText, chatIsEmpty, isFreshChat, composerFrame, barAnchor,
    setInputLock, typeAndSend, clearEditor, stopGeneration,
    // typeAndSend answers true only when Freebuff is confirmed to have taken the message.
    authoritativeSendResult: true,
    sendRetryable: () => _sendRetryable && !_sendAmbiguous,
    sendFailureAmbiguous: () => _sendAmbiguous,
    sendFailureDetail: () => _sendDetail,
    isGenerating, isBusyNow, isHardGenerating,
    genDebug: genWhy,
    enforceComposer() { return { ready: true }; },
    async ensureComposerReady(reason) {
      // The page may still be loading, or swapping between the home view and a chat.
      if (!loginGatePresent()) await waitFor(() => !!getEditor() && !boxRefusesInput(getEditor()), 8000);
      markExistingNotices();
      const login = loginGatePresent(), hasEditor = !!getEditor();
      diag("freebuff.mode_ready", { reason, hasEditor, login, fresh: chatIsEmpty(), items: allItems().length, why: genWhy() });
      if (login) return { ready: false, detail: "Log in to Freebuff first (GitHub or Google), open a chat, then press Start." };
      if (!hasEditor) return { ready: false, detail: "Couldn't find Freebuff's chat box. Open a new Freebuff chat, wait for it to load, then press Start." };
      return { ready: true };
    },
    turnHalted, findContinueBtn, clickContinueBtn,
    scanError, isTooLongMsg, isBusyMsg,
    modeWarning, loginGatePresent,
    attachImages, clearAttachments, conversationKey,
    installSendHooks, findToolBlockSpot,
  };
})();
