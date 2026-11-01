// SPDX-License-Identifier: GPL-3.0-or-later
// providers/mimo.js — Xiaomi MiMo Studio (aistudio.xiaomimimo.com) provider. 1.24.30 (owner request).
// MiMo Chat (#/c, conversations #/chat/<id>) and UltraSpeed (#/ultra, conversations #/ultra/<id>) share one page
// layout, validated live 2026-11-01 while signed in:
//  - Hash routing. Each turn is `div.relative.flex.w-full.mx-auto` in the scroller; a user turn holds
//    `.flex-row-reverse` (bubble `.bg-mimo-bg-message`), an assistant turn holds `.markdown-blocks`.
//  - Reply text = `.markdown-blocks` only (the model name and the "Took 1s" / "Finished thinking" header sit
//    outside it; the reasoning is in `[class*="collapsibleContent"]`).
//  - CRITICAL: every fenced code block is drawn TWICE (an `overlayPlaceholder` copy under the visible
//    `overlayContent` copy), each with a `languageLabel` span ("json") inside the <pre>. Reading the whole turn
//    would see every command twice, so both the placeholder copy and the labels are skipped.
//  - Composer: a plain <textarea> (no form; maxlength 50000) and a `button[aria-label="Send message"]`, replaced
//    by `button[aria-label="Stop"]` while a reply streams; `.markdown-prose[data-is-typing="true"]` while typing.
//  - Signed out, the box says "Sign in to continue chatting" and nothing can be sent.
//  - MiMo Claw (the agent product) is a different surface and is not driven.
// eslint-disable-next-line no-unused-vars
const RSProvider = (() => {
  "use strict";
  let domReadErrors = 0;
  function safeRead(read, fallback) { try { return read(); } catch { domReadErrors++; return fallback; } }
  const safeQuery = (root, sel) => safeRead(() => root.querySelector(sel), null);
  const safeQueryAll = (root, sel) => safeRead(() => Array.from(root.querySelectorAll(sel)), []);
  const safeClosest = (node, sel) => safeRead(() => node.closest(sel), null);
  const safeRect = (node) => safeRead(() => node.getBoundingClientRect(), {x:0,y:0,left:0,top:0,right:0,bottom:0,width:0,height:0,readFailed:true});
  const safeStyle = (node) => safeRead(() => getComputedStyle(node), {display:'none',visibility:'hidden',opacity:'0'});
  function safePredicate(predicate) { const before = domReadErrors; const result = safeRead(predicate, false); return before === domReadErrors ? result : false; }
  function waitBudget(timeout, interval) {
    const ms = Number.isFinite(timeout) ? Math.min(600000, Math.max(0, timeout)) : 30000;
    return {ms, polls: Math.ceil(ms / interval)};
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let diag = () => {};

  const S = {
    turn: "div.relative.flex.w-full.mx-auto",
    userMark: ".flex-row-reverse",
    body: ".markdown-blocks",
    typing: '.markdown-prose[data-is-typing="true"]',
    thinking: '[class*="collapsibleContent"]',
    // Never part of the reply text: the hidden duplicate code copy, code-block language labels and header
    // buttons, PlazCode's own chips.
    skip: '.rs-chip, [class*="overlayPlaceholder"], [class*="languageLabel"], header, button',
    sendAria: /^send message$/i,
    stopAria: /^stop$/i,
    errorSurfaces: '[role="alert"],[class*="toast"],[class*="message-error"],[class*="Toast"]',
  };
  const RE = {
    contextLimit: /context.{0,20}(limit|exceeded|too long)|conversation.{0,20}too long|(token|context).{0,10}limit|maximum context/i,
    tooLong: /conversation .{0,20}(too long|getting too long)/i,
    busy: /rate limit|too many requests|try again later|server is busy|system is busy|usage limit|quota|daily limit|sign in to continue/i,
  };
  const timings = { GEN_IDLE_MS: 1600, REASON_IDLE_MS: 15000, WARMUP_MS: 45000, REASON_NOREPLY_MS: 120000, STABLE_MS: 9000, RESPONSE_TIMEOUT_MS: 300000 };

  const route = () => String(location.hash || "").replace(/^#/, "");
  const isClaw = () => /^\/claw(\/|$)/i.test(route());

  function visible(el) {
    if (!el || safeClosest(el, "#rs-root")) return false;
    const r = safeRect(el);
    if (r.width < 8 || r.height < 4) return false;
    const s = safeStyle(el);
    return !(s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) === 0);
  }
  function textWithout(root, excludeSel) {
    if (!root) return "";
    const skip = excludeSel ? `${S.skip}, ${excludeSel}` : S.skip;
    let t = "";
    const walk = (n) => {
      const type = safeRead(() => n.nodeType, 0);
      if (type === 3) { t += safeRead(() => n.nodeValue, ""); return; }
      if (type !== 1) return;
      if (safeRead(() => n.matches(skip), false)) return;
      const tag = safeRead(() => n.tagName, "");
      if (tag === "BR") { t += "\n"; return; }
      const block = /^(P|DIV|PRE|LI|UL|OL|BLOCKQUOTE|H[1-6]|TABLE|TR)$/.test(tag);
      if (block && t && !t.endsWith("\n")) t += "\n";
      for (const c of safeRead(() => n.childNodes, [])) walk(c);
      if (block && !t.endsWith("\n")) t += "\n";
    };
    walk(root);
    return t;
  }

  // ── Composer ────────────────────────────────────────────────────────────────
  const getEditor = () => safeQueryAll(document, "textarea").find((t) => visible(t) && !safeClosest(t, "nav, aside, [role='dialog']")) || null;
  const editorText = () => { const e = getEditor(); return e ? (safeRead(() => e.value, "") || "") : ""; };
  function signedOut() {
    const e = getEditor();
    return !!e && /sign in to continue/i.test(safeRead(() => e.getAttribute("placeholder"), "") || "");
  }
  function composerFrame() {
    const ed = getEditor();
    if (!ed) return null;
    let n = ed;
    for (let i = 0; i < 8 && n; i++) {
      if (safeQuery(n, 'button[aria-label="Send message"], button[aria-label="Stop"]') && /rounded|border/.test(String(safeRead(() => n.className, "")))) return n;
      n = safeRead(() => n.parentElement, null);
    }
    return safeRead(() => ed.parentElement, null);
  }
  const barAnchor = composerFrame;
  function setInputLock(on) {
    const ed = getEditor();
    if (!ed) return;
    if (on) {
      if (ed.dataset.rsPlaceholder == null) ed.dataset.rsPlaceholder = safeRead(() => ed.getAttribute("placeholder"), "") || "";
      ed.setAttribute("readonly", "");
      ed.setAttribute("placeholder", "⏳ Agent working… please wait");
    } else {
      ed.removeAttribute("readonly");
      if (ed.dataset.rsPlaceholder != null) ed.setAttribute("placeholder", ed.dataset.rsPlaceholder);
    }
  }
  const ariaOf = (b) => (safeRead(() => b.getAttribute("aria-label"), null) || "").trim();
  const allButtons = () => safeQueryAll(document, "button").filter((b) => !safeClosest(b, "#rs-root"));
  const sendButton = () => allButtons().find((b) => S.sendAria.test(ariaOf(b)) && visible(b)) || null;
  const stopButton = () => allButtons().find((b) => S.stopAria.test(ariaOf(b)) && visible(b)) || null;

  // ── Turns ───────────────────────────────────────────────────────────────────
  const allItems = () => safeQueryAll(document, S.turn).filter((t) => !safeClosest(t, "#rs-root") && (safeQuery(t, S.userMark) || safeQuery(t, S.body)));
  const isUserItem = (item) => !!item && !!safeQuery(item, S.userMark) && !safeQuery(item, S.body);
  const isAssistantItem = (item) => !!item && !!safeQuery(item, S.body);
  const bodyOf = (item) => (item ? safeQuery(item, S.body) : null);
  function itemText(item) {
    if (!item) return "";
    if (isUserItem(item)) { const bubble = safeQuery(item, '[class*="bg-mimo-bg-message"]') || item; return safeRead(() => bubble.textContent, "") || ""; }
    return textWithout(bodyOf(item));
  }
  function classifyText(item, excludeSel) {
    if (!item) return "";
    const body = bodyOf(item);
    if (!body) return isUserItem(item) ? itemText(item) : "";
    if (excludeSel && safeClosest(body, excludeSel)) return "";
    return textWithout(body, excludeSel);
  }
  const assistantItems = () => allItems().filter(isAssistantItem);
  const assistantCount = () => assistantItems().length;
  const userCount = () => allItems().filter(isUserItem).length;
  const lastAssistant = () => { const it = assistantItems(); return it.length ? it[it.length - 1] : null; };
  const _ids = new WeakMap(); let _seq = 0;
  function lastAssistantId() { const it = lastAssistant(); if (!it) return null; let id = _ids.get(it); if (!id) { id = ++_seq; _ids.set(it, id); } return id; }
  const chatIsEmpty = () => allItems().length === 0;
  const isFreshChat = () => chatIsEmpty() && !!getEditor() && /^\/(c|ultra)?\/?$/.test(route());
  // Fresh pages (#/c, #/ultra) have no conversation yet; a conversation is #/chat/<id> or #/ultra/<id>.
  const conversationKey = () => { const m = route().match(/^\/(chat|ultra)\/([A-Za-z0-9_-]+)/); return m ? m[1] + "/" + m[2] : ""; };

  // ── Generation ──────────────────────────────────────────────────────────────
  const streamText = (item) => (item ? textWithout(bodyOf(item), ".rs-chip").trim() : "");
  const streamLen = (item) => streamText(item === undefined ? lastAssistant() : item).length;
  let _max = -1, _at = 0, _item = null;
  function sampleStream() {
    const item = lastAssistant(), len = streamText(item).length, now = Date.now();
    if (item !== _item || len < _max - 400) { _item = item; _max = len; _at = now; return; }
    if (len > _max) { _max = len; _at = now; }
  }
  const typing = () => { const it = lastAssistant(); return !!it && !!safeQuery(it, S.typing); };
  let _stopSince = 0;
  function genActive() {
    sampleStream();
    const now = Date.now();
    if (stopButton() || typing()) {
      if (!_stopSince) _stopSince = now;
      return now - _at < 15000 || now - _stopSince < 2000;
    }
    _stopSince = 0;
    return _max > 1 && now - _at < timings.GEN_IDLE_MS;
  }
  const isGenerating = genActive, isBusyNow = genActive;
  const isHardGenerating = () => !!stopButton();
  const turnHalted = () => false, findContinueBtn = () => null, clickContinueBtn = () => false;
  function snapshot() { try { const it = lastAssistant(); return it ? { th: 0, rp: streamLen(it) } : { th: 0, rp: 0 }; } catch { return {}; } }
  function readAssistant() {
    const item = lastAssistant();
    if (!item) return { present: false, reply: "", thinking: "", item: null };
    const think = safeQuery(item, S.thinking);
    return { present: true, reply: streamText(item), thinking: think ? (safeRead(() => think.textContent, "") || "").trim() : "", item };
  }
  async function waitFor(pred, timeout) {
    const budget = waitBudget(timeout, 120), t0 = Date.now();
    for (let poll = 0; poll < budget.polls && Date.now() - t0 < budget.ms; poll++) { if (safePredicate(pred)) return true; await sleep(120); }
    return false;
  }

  // ── Sending ─────────────────────────────────────────────────────────────────
  // MiMo's box accepts at most 50,000 characters (maxlength); longer text is cut by the page itself.
  const SEND_MAX = 49000;
  function truncateForSend(text) {
    if (!text || text.length <= SEND_MAX) return typeof window.__rsLimitOutgoing === "function" ? window.__rsLimitOutgoing(text) : text;
    const omitted = text.length - SEND_MAX;
    const marker = `\n\n[…PlazCode: result shortened to fit MiMo's 50,000 character limit - ${omitted} of ${text.length} characters omitted…]\n\n`;
    const budget = SEND_MAX - marker.length, head = Math.floor(budget * 0.85);
    return text.slice(0, head) + marker + text.slice(text.length - (budget - head));
  }
  function setTextareaValue(el, v) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
    if (setter && setter.set) setter.set.call(el, v); else el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  async function typeAndSend(text, images) {
    const editor = getEditor();
    if (!editor) throw new Error("MiMo chat box not found - open aistudio.xiaomimimo.com/#/c");
    if (signedOut()) throw new Error("Sign in to MiMo first (the box says 'Sign in to continue chatting').");
    editor.focus();
    setTextareaValue(editor, truncateForSend(text));
    if (images && images.length) { try { await attachImages(images); } catch {} }
    const sendReady = () => { const b = sendButton(); return !!b && !safeRead(() => b.disabled, true); };
    await waitFor(sendReady, 15000);
    let sent = false;
    for (let i = 0; i < 6 && !sent; i++) {
      const b = sendButton();
      if (b && !safeRead(() => b.disabled, true)) { try { b.click(); } catch {} }
      else if (!isHardGenerating()) {
        const o = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
        try { editor.dispatchEvent(new KeyboardEvent("keydown", o)); } catch {}
      }
      sent = await waitFor(() => editorText().trim() === "" || isHardGenerating(), 900);
    }
    diag("mimo.send", { sent, editorLen: editorText().length });
  }
  function stopGeneration() { const b = stopButton(); if (b) { try { b.click(); } catch {} } }

  // ── Images (the composer's hidden file input accepts png/jpeg/webp) ─────────────
  function fileFromImage(img, i) {
    if (typeof PlazCodeMedia !== "undefined") return PlazCodeMedia.fileFrom(img, i);
    const mime = img.mimeType || "image/png", bin = atob(img.data), arr = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j);
    return new File([arr], `plazcode_${Date.now()}_${i}.${mime.includes("png") ? "png" : "jpg"}`, { type: mime });
  }
  async function attachImages(images) {
    const input = safeQueryAll(document, 'input[type="file"]').find((i) => /image\//.test(safeRead(() => i.accept, "") || "")) || null;
    if (!input || !images || !images.length) return false;
    const dt = new DataTransfer();
    images.forEach((img, i) => { try { dt.items.add(fileFromImage(img, i)); } catch {} });
    if (!dt.items.length) return false;
    try { input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true })); } catch { return false; }
    await sleep(800);
    return true;
  }
  function clearAttachments() {}

  // ── Mode guard ──────────────────────────────────────────────────────────────
  function modeWarning() {
    if (isClaw()) return `<b>MiMo Claw</b> is MiMo's own agent, so PlazCode can't use it. <a href="https://aistudio.xiaomimimo.com/#/c" style="color:inherit;text-decoration:underline">Open MiMo Chat</a> or UltraSpeed, then press Start.`;
    if (signedOut()) return `<b>Sign in to MiMo</b> first (the Sign in button at the top right), then press Start.`;
    if (!getEditor()) return `Open <a href="https://aistudio.xiaomimimo.com/#/c" style="color:inherit;text-decoration:underline">MiMo Chat</a> or UltraSpeed, then press Start.`;
    return "";
  }
  const sendBlocker = () => (signedOut() ? "Sign in to MiMo first (the Sign in button at the top right), then press Start again." : "");
  function scanError() {
    try {
      for (const el of safeQueryAll(document, S.errorSurfaces)) {
        if (!visible(el) || safeClosest(el, S.turn)) continue;
        const t = (safeRead(() => el.innerText, "") || "").trim();
        if (t.length > 8 && t.length < 600 && RE.contextLimit.test(t)) return t.slice(0, 240);
      }
    } catch {}
    if (!getEditor()) return "The input box disappeared (session ended?).";
    return null;
  }

  // ── User sends while PlazCode runs ─────────────────────────────────────────────
  function installSendHooks(handlers) {
    const gate = () => {
      if (handlers.isBlocked()) return;
      if (!handlers.isStarted()) { if (chatIsEmpty()) handlers.onBlockedAttempt(); return; }
      handlers.onUserMessage(assistantCount());
    };
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
      const ed = getEditor();
      if (!ed || !safeRead(() => ed.contains(e.target), false) || editorText().trim() === "") return;
      if (handlers.onCoworkSend && handlers.onCoworkSend(e)) return;
      gate();
    }, true);
    document.addEventListener("click", (e) => {
      if (!getEditor() || safeClosest(e.target, "#rs-root")) return;
      const btn = safeClosest(e.target, "button");
      if (!btn) return;
      if (S.stopAria.test(ariaOf(btn))) { handlers.onNativeStop(); return; }
      if (!S.sendAria.test(ariaOf(btn)) || safeRead(() => btn.disabled, true)) return;
      if (handlers.onCoworkSend && handlers.onCoworkSend(e)) return;
      gate();
    }, true);
  }
  async function writeDraft(value, expectedCurrent) {
    const ed = getEditor();
    if (!ed || editorText().trim() !== String(expectedCurrent).trim()) return { ok: false, reason: "draft-changed" };
    const relock = safeRead(() => ed.hasAttribute("readonly"), false);
    try { setInputLock(false); setTextareaValue(ed, String(value)); await sleep(30); return { ok: editorText().trim() === String(value).trim() }; }
    finally { if (relock) setInputLock(true); }
  }

  // Hide the code blocks that carry a command (both copies), keep the turn marked so a redraw stays hidden.
  const CMD_SHAPE = /"(?:command|tool)"\s*:\s*"|###\s*lua|###mcp_tool###/i;
  function findToolBlockSpot(item) {
    const body = bodyOf(item);
    if (!body) return null;
    let spot = null;
    for (const prose of safeQueryAll(body, ".markdown-prose")) {
      const block = safeQuery(prose, "pre") && safeRead(() => prose.firstElementChild, null);
      if (!block || !CMD_SHAPE.test(textWithout(block))) continue;
      block.classList.add("rs-tool-hide");
      item.classList.add("rs-cmd-mask");
      spot = spot || { parent: safeRead(() => block.parentElement, null), ref: block };
    }
    return spot;
  }

  return {
    id: "mimo",
    displayName: "MiMo",
    supportsVision: true,
    // 50,000-character box: the long rules arrive after the handshake (staged startup).
    compactStartup: true,
    timings,
    thinkingSel: S.thinking,
    chipAtItemLevel: true,
    chipAnchor: (item) => bodyOf(item) || item,
    chipAppend: true,
    reliableCounts: true,
    init({ diag: d } = {}) { if (d) diag = d; diag("mimo.init", { route: route().slice(0, 20), editor: !!getEditor(), signedOut: signedOut() }); },
    allItems, isUserItem, isAssistantItem, itemText, classifyText,
    assistantCount, userCount, lastAssistant, lastAssistantId, readAssistant, streamLen, snapshot,
    getEditor, editorText, chatIsEmpty, isFreshChat, composerFrame, barAnchor,
    setInputLock, writeDraft, typeAndSend, stopGeneration,
    isGenerating, isBusyNow, isHardGenerating,
    enforceComposer() { return { ready: !isClaw() && !signedOut() }; },
    async ensureComposerReady(reason) {
      diag("mimo.mode_ready", { reason, editor: !!getEditor(), signedOut: signedOut(), claw: isClaw() });
      return { ready: !!getEditor() && !signedOut() && !isClaw() };
    },
    modeWarning, sendBlocker,
    turnHalted, findContinueBtn, clickContinueBtn,
    scanError, isTooLongMsg: (t) => RE.tooLong.test(t), isBusyMsg: (t) => RE.busy.test(t),
    attachImages, clearAttachments, conversationKey,
    installSendHooks, findToolBlockSpot,
  };
})();
