// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.24.36/ts/providers/aistudio.ts (TypeScript): edit that file, then run node development/1.24.36/ts/build.cjs.
// providers/aistudio.js — Google AI Studio (aistudio.google.com) provider.
// Exports the same RSProvider interface as providers/gemini.js.
//
// Google AI Studio prompt UI notes:
//  - Angular + Angular Material app (`prompts/new_chat`, `prompts/<id>`).
//  - Trusted Types CSP: never assign innerHTML; use native textarea value setter / execCommand.
//  - Submit semantics: Run button (`ms-run-button`, `button.run-button`, `aria-label*="Run"`)
//    OR Ctrl+Enter (Cmd+Enter on macOS). Plain Enter inserts a newline!
//
// Selectors flagged for live Chrome DevConsole verification on aistudio.google.com:
//  - S.turn / S.userTurn / S.modelTurn (`ms-chat-turn`, `[data-turn-role]`, `.user-prompt-container`, `.model-prompt-container`)
//  - S.reply / S.thinking (`ms-cmark-node`, `ms-text-chunk`, `ms-thought-chunk`)
//  - S.editor (`ms-prompt-input-wrapper textarea`, `ms-autosize-textarea textarea`)
//  - S.runBtn / S.stopBtn (`ms-run-button button`, `button[aria-label*="Run" i]`, `button[aria-label*="Stop" i]`)
//  - S.addMediaBtn / S.fileInput (`ms-add-chunk-menu`, `input[type="file"]`, `ms-image-chunk`, `ms-media-chunk`)
// eslint-disable-next-line no-unused-vars
const RSProvider = (() => {
  "use strict";
  ;
  let domReadErrors = 0;
  function safeRead(read, fallback) {
    try { return read(); } catch { domReadErrors++; return fallback; }
  }
  function safeQuery(root, selector) {
    return safeRead(() => (root).querySelector(selector), null);
  }
  function safeQueryAll(root, selector) {
    return safeRead(() => Array.from((root).querySelectorAll(selector)), []);
  }
  function safeClosest(node, selector) {
    return safeRead(() => (node).closest(selector), null);
  }
  function safeRect(node) {
    return safeRead(() => (node).getBoundingClientRect(), { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, readFailed: true });
  }
  function safeStyle(node) {
    return safeRead(() => getComputedStyle(node), { display: "none", visibility: "hidden", opacity: "0", overflow: "hidden", overflowY: "hidden" });
  }
  function safePredicate(predicate) {
    const before = domReadErrors;
    const result = safeRead(predicate, false);
    return before === domReadErrors ? result : false;
  }
  function waitBudget(timeout, interval) {
    const ms = Number.isFinite(timeout) ? Math.min(600000, Math.max(0, timeout)) : 30000;
    return { ms, polls: Math.ceil(ms / interval) };
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let diag = () => {};

  const S = {
    turn: 'ms-chat-turn, .chat-turn-container, [data-turn-role]',
    userTurn: '[data-turn-role="User"], [data-turn-role="user"], .user-prompt-container, [class*="turn-role-user"]',
    modelTurn: '[data-turn-role="Model"], [data-turn-role="model"], [data-turn-role="assistant"], .model-prompt-container, [class*="turn-role-model"]',
    reply: 'ms-cmark-node, ms-text-chunk, .markdown-content, .turn-content',
    thinking: 'ms-thought-chunk, .thought-container, [class*="thought-chunk"], [class*="thinking-process"]',
    inputWrap: 'ms-prompt-input-wrapper, .prompt-input-wrapper, ms-chunk-editor, .bottom-container',
    editor: [
      'ms-prompt-input-wrapper textarea',
      'ms-autosize-textarea textarea',
      'ms-chunk-editor textarea',
      'ms-prompt-input-wrapper [contenteditable]',
      'textarea[aria-label*="Type something" i]',
      'textarea[placeholder*="Start typing" i]',
      'textarea[placeholder*="Enter a prompt" i]',
      'textarea:not([disabled])',
      '[data-rs-locked="1"]',
      '[contenteditable="true"][role="textbox"]',
    ].join(", "),
    runBtn: 'ms-run-button button, button.run-button, button[aria-label*="Run" i], button[mattooltip*="Run" i]',
    stopBtn: 'ms-run-button button.stoppable, button[aria-label*="Stop" i], button[mattooltip*="Stop" i]',
    addMenuBtn: 'ms-add-chunk-menu button, button[aria-label*="Add" i], button[aria-label*="Insert" i], button[aria-label*="Upload" i]',
    mediaPreview: 'ms-image-chunk, ms-media-chunk, ms-video-chunk, [class*="media-preview" i], [class*="attachment-preview" i]',
    codeWrap: 'ms-code-block, pre',
    errorSurfaces: 'mat-snack-bar-container, [role="alert"], [class*="error-banner"], [class*="toast"], .error-message',
  };

  const RE = {
    contextLimit: /context.{0,20}(limit|exceeded|length)|token.{0,15}limit|maximum.{0,20}(tokens|context)|exceeds the maximum/i,
    tooLong: /prompt.{0,20}too long|too many tokens|exceeds.{0,20}token limit/i,
    busy: /rate limit|quota exceeded|too many requests|try again later|temporarily unavailable|resource exhausted|internal error/i,
    runLabel: /\brun\b/i,
    stopLabel: /\bstop\b|\bcancel\b/i,
    sideField: /system instructions|temperature|top-?p|safety|search|model|filter|title|name/i,
  };

  const timings = {
    GEN_IDLE_MS: 1600,
    REASON_IDLE_MS: 14000,
    WARMUP_MS: 45000,
    REASON_NOREPLY_MS: 90000,
    STABLE_MS: 9000,
    RESPONSE_TIMEOUT_MS: 300000,
  };

  function visible(el) {
    if (!el || safeClosest(el, "#rs-root")) return false;
    const r = safeRect(el);
    if (r.width < 8 || r.height < 6) return false;
    const s = safeStyle(el);
    return !(s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) === 0);
  }

  // ── Editor & Composer ─────────────────────────────────────────────────────
  let lockedEditor = null;
  function getEditor() {
    if (lockedEditor && safeRead(() => lockedEditor.isConnected, false) && visible(lockedEditor)) return lockedEditor;
    const seen = new Set();
    const candidates = [];
    for (const el of safeQueryAll(document, S.editor)) {
      if (seen.has(el)) continue;
      seen.add(el);
      if (!visible(el)) continue;
      // Ignore PlazCode UI, turn-edit boxes, navigation, dialogs, and right-hand run settings panel.
      if (safeClosest(el, "#rs-root, ms-chat-turn, .chat-turn-container, nav, aside, [role='dialog'], ms-run-settings, ms-system-instructions")) continue;
      const hint = [
        safeRead(() => el.getAttribute("aria-label"), ""),
        safeRead(() => el.getAttribute("placeholder"), ""),
        safeRead(() => el.getAttribute("name"), ""),
      ].filter(Boolean).join(" ");
      if (RE.sideField.test(hint) && !/prompt|type|message|chat/i.test(hint)) continue;
      candidates.push(el);
    }
    if (!candidates.length) return null;
    const inWrapper = candidates.find((el) => !!safeClosest(el, S.inputWrap));
    if (inWrapper) return inWrapper;
    candidates.sort((a, b) => safeRect(a).bottom - safeRect(b).bottom);
    return candidates[candidates.length - 1] || candidates[0];
  }

  function editorText(el) {
    const e = el || getEditor();
    if (!e) return "";
    const tag = safeRead(() => e.tagName, "");
    if (tag === "TEXTAREA" || tag === "INPUT") return safeRead(() => (e).value, "") || "";
    return (safeRead(() => (e).innerText, "") || safeRead(() => e.textContent, "") || "").replace(/\u00a0/g, " ");
  }

  function composerFrame() {
    const ed = getEditor();
    if (!ed) return null;
    return safeClosest(ed, S.inputWrap) || safeClosest(ed, "form") || safeRead(() => ed.parentElement, null);
  }
  const barAnchor = composerFrame;

  // ── Turns & Text Extraction ───────────────────────────────────────────────
  function allItems() {
    const seen = new Set();
    const out = [];
    for (const el of safeQueryAll(document, S.turn)) {
      if (seen.has(el) || safeClosest(el, "#rs-root")) continue;
      seen.add(el);
      if (out.some((p) => safeRead(() => p.contains(el), false))) continue;
      out.push(el);
    }
    return out;
  }

  function isUserItem(item) {
    if (!item) return false;
    if (safeRead(() => item.matches(S.userTurn), false) || safeQuery(item, S.userTurn)) return true;
    if (safeRead(() => item.matches(S.modelTurn), false) || safeQuery(item, S.modelTurn)) return false;
    const role = (safeRead(() => item.getAttribute("data-turn-role"), null) || "").toLowerCase();
    if (role === "user" || role === "human") return true;
    if (role === "model" || role === "assistant") return false;
    const author = safeQuery(item, ".author-label, [class*='author']");
    if (author) {
      const txt = (safeRead(() => author.textContent, "") || "").trim().toLowerCase();
      if (txt === "user" || txt === "you") return true;
      if (txt === "model" || txt === "gemini" || txt === "assistant") return false;
    }
    return false;
  }

  function isAssistantItem(item) {
    if (!item) return false;
    if (isUserItem(item)) return false;
    if (safeRead(() => item.matches(S.modelTurn), false) || safeQuery(item, S.modelTurn)) return true;
    if (safeQuery(item, S.reply) || safeQuery(item, S.thinking)) return true;
    return !!(safeRead(() => item.textContent, "") || "").trim();
  }

  const CHROME_SKIP = ".rs-chip, .cdk-visually-hidden, [class*='screen-reader'], button, [role='button'], mat-icon, .code-block-header, [class*='header-actions']";
  function textWithout(root, excludeSel) {
    if (!root) return "";
    const skip = CHROME_SKIP + (excludeSel ? ", " + excludeSel : "");
    let t = "";
    const walk = (n) => {
      const type = safeRead(() => n.nodeType, 0);
      if (type === 3) { t += safeRead(() => n.nodeValue, ""); return; }
      if (type !== 1) return;
      if (safeRead(() => (n).matches, null) && safeRead(() => (n).matches(skip), false)) return;
      const tag = safeRead(() => (n).tagName, "");
      if (tag === "BR") { t += "\n"; return; }
      const isCode = tag === "PRE" || tag === "MS-CODE-BLOCK" || (safeRead(() => (n).matches, null) && safeRead(() => (n).matches(S.codeWrap), false));
      const isBlock = isCode || /^(P|DIV|LI|UL|OL|BLOCKQUOTE|H[1-6]|TABLE|TR|MS-CMARK-NODE|MS-TEXT-CHUNK)$/.test(tag);
      if (isBlock && t && !t.endsWith("\n")) t += "\n";
      for (const c of safeRead(() => n.childNodes, [])) walk(c);
      if (isBlock && !t.endsWith("\n")) t += "\n";
    };
    walk(root);
    return t;
  }

  function replyRoots(item) {
    if (!item) return [];
    const nodes = safeQueryAll(item, S.reply).filter((m) => !safeClosest(m, S.thinking) && !safeClosest(m, ".rs-chip"));
    if (!nodes.length) return safeQuery(item, S.thinking) ? [] : [item];
    const set = new Set(nodes);
    return nodes.filter((n) => {
      for (let p = safeRead(() => n.parentElement, null); p && p !== item; p = safeRead(() => p.parentElement, null)) {
        if (set.has(p)) return false;
      }
      return true;
    });
  }

  function itemText(item) {
    if (!item) return "";
    if (isAssistantItem(item)) {
      return replyRoots(item).map((m) => textWithout(m, S.thinking)).join("\n");
    }
    return textWithout(item);
  }

  function classifyText(item, excludeSel) {
    if (!item) return "";
    const skip = excludeSel ? `${S.thinking}, ${excludeSel}` : S.thinking;
    if (isAssistantItem(item)) {
      return replyRoots(item).map((m) => textWithout(m, skip)).join("\n");
    }
    return textWithout(item, excludeSel);
  }

  const assistantItems = () => allItems().filter(isAssistantItem);
  const assistantCount = () => assistantItems().length;
  const userCount = () => allItems().filter(isUserItem).length;
  const lastAssistant = () => {
    const it = assistantItems();
    return it.length ? it[it.length - 1] : null;
  };

  const _turnIds = new WeakMap();
  let _turnSeq = 0;
  function itemKey(item) {
    if (!item) return null;
    const own = safeRead(() => item.getAttribute("id"), null) || safeRead(() => item.getAttribute("data-turn-id"), null);
    if (own) return own;
    let id = _turnIds.get(item);
    if (!id) { id = "ai" + (++_turnSeq); _turnIds.set(item, id); }
    return id;
  }
  const lastAssistantId = () => itemKey(lastAssistant());

  const chatIsEmpty = () => allItems().length === 0;
  const isFreshChat = () => chatIsEmpty() && !!getEditor() && /\/prompts\/new_chat\/?$/.test(location.pathname || "");
  const conversationKey = () => {
    const p = location.pathname || "/";
    if (chatIsEmpty() || /\/prompts\/new_chat\/?$/.test(p) || /^\/?$/.test(p)) return "";
    const m = p.match(/\/prompts\/([A-Za-z0-9_-]+)/);
    return m ? m[1] : p;
  };

  // ── Run / Stop Buttons ────────────────────────────────────────────────────
  const iconName = (btn) => {
    const ic = btn && safeQuery(btn, "mat-icon");
    return ic ? (safeRead(() => ic.getAttribute("fonticon"), null) || safeRead(() => ic.getAttribute("data-mat-icon-name"), null) || (safeRead(() => ic.textContent, "") || "").trim()) : "";
  };
  const btnLabel = (btn) => [
    safeRead(() => btn.getAttribute("aria-label"), ""),
    safeRead(() => btn.getAttribute("mattooltip"), ""),
    safeRead(() => (btn).innerText, "") || safeRead(() => btn.textContent, ""),
  ].filter(Boolean).join(" ").trim();

  function isStopBtn(btn) {
    if (!btn) return false;
    if (safeRead(() => btn.classList.contains("stoppable"), false)) return true;
    const ic = iconName(btn);
    if (ic === "stop" || ic === "stop_circle") return true;
    const lbl = btnLabel(btn);
    if (RE.stopLabel.test(lbl) && !RE.runLabel.test(lbl)) return true;
    return !!(safeQuery(btn, "mat-progress-spinner, mat-spinner") && safeClosest(btn, "ms-run-button"));
  }

  function runButton() {
    for (const b of safeQueryAll(document, S.runBtn)) {
      if (!safeClosest(b, "#rs-root") && visible(b) && !isStopBtn(b)) return b;
    }
    const frame = composerFrame();
    if (frame) {
      for (const b of safeQueryAll(frame, "button")) {
        if (!safeClosest(b, "#rs-root") && visible(b) && !isStopBtn(b) && (RE.runLabel.test(btnLabel(b)) || iconName(b) === "arrow_upward")) return b;
      }
    }
    return null;
  }

  function stopButton() {
    for (const b of safeQueryAll(document, S.stopBtn)) {
      if (!safeClosest(b, "#rs-root") && visible(b)) return b;
    }
    for (const b of safeQueryAll(document, S.runBtn)) {
      if (!safeClosest(b, "#rs-root") && visible(b) && isStopBtn(b)) return b;
    }
    return null;
  }

  // ── Streaming & Completion ────────────────────────────────────────────────
  function streamText(item) {
    if (!item) return "";
    const think = safeQuery(item, S.thinking);
    const thinkTxt = think ? (safeRead(() => think.textContent, "") || "") : "";
    const replyTxt = replyRoots(item).map((m) => textWithout(m, ".rs-chip, " + S.thinking)).join("\n");
    return (thinkTxt + "\n" + replyTxt).trim();
  }
  const streamLen = (item) => streamText(item === undefined ? lastAssistant() : item).length;

  let _streamMax = -1, _streamAt = 0, _streamItem = null;
  function sampleStream() {
    const item = lastAssistant();
    const len = streamText(item).length;
    const now = Date.now();
    if (item !== _streamItem || len < _streamMax - 400) {
      _streamItem = item; _streamMax = len; _streamAt = now; return;
    }
    if (len > _streamMax) { _streamMax = len; _streamAt = now; }
  }
  const grewWithin = (ms) => _streamMax > 1 && Date.now() - _streamAt < ms;

  const WEDGE_MS = 10000;
  let _stopSince = 0;
  function genActive() {
    sampleStream();
    const now = Date.now();
    const stop = !!stopButton();
    const last = lastAssistant();
    const streamingCls = !!(last && safeQuery(last, ".generating, [class*='streaming']"));
    if (stop || streamingCls) {
      if (!_stopSince) _stopSince = now;
      return (now - _streamAt < WEDGE_MS) || (now - _stopSince < 2000);
    }
    _stopSince = 0;
    return grewWithin(timings.GEN_IDLE_MS);
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
      const think = safeQuery(it, S.thinking);
      return {
        th: think ? (safeRead(() => think.textContent, "") || "").trim().length : 0,
        rp: replyRoots(it).map((m) => textWithout(m, ".rs-chip")).join("\n").length,
      };
    } catch { return {}; }
  }

  function readAssistant() {
    const item = lastAssistant();
    if (!item) return { present: false, reply: "", thinking: "", item: null };
    const think = safeQuery(item, S.thinking);
    const reply = replyRoots(item).map((m) => textWithout(m, S.thinking)).join("\n").trim();
    return {
      present: true,
      reply,
      thinking: think ? (safeRead(() => think.textContent, "") || "").trim() : "",
      item,
    };
  }

  async function waitFor(pred, timeout) {
    const budget = waitBudget(timeout, 120), t0 = Date.now();
    for (let poll = 0; poll < budget.polls && Date.now() - t0 < budget.ms; poll++) {
      if (safePredicate(pred)) return true;
      await sleep(120);
    }
    return false;
  }

  // ── Input Lock, Draft & Sending (Run button / Ctrl+Enter) ─────────────────
  let _locked = false;
  function setInputLock(on) {
    _locked = !!on;
    const ed = getEditor();
    if (!ed) return;
    if (on) lockedEditor = ed; else if (lockedEditor === ed) lockedEditor = null;
    const tag = safeRead(() => ed.tagName, "");
    if (tag === "TEXTAREA" || tag === "INPUT") {
      if (on) {
        if (ed.dataset.rsPlaceholder == null) ed.dataset.rsPlaceholder = safeRead(() => ed.getAttribute("placeholder"), "") || "";
        ed.setAttribute("readonly", "");
        ed.setAttribute("placeholder", "⏳ Agent working… please wait");
      } else {
        ed.removeAttribute("readonly");
        if (ed.dataset.rsPlaceholder != null) ed.setAttribute("placeholder", ed.dataset.rsPlaceholder);
      }
      return;
    }
    ed.setAttribute("contenteditable", on ? "false" : "true");
    if (on) ed.setAttribute("data-rs-locked", "1"); else ed.removeAttribute("data-rs-locked");
  }

  const SEND_MAX = 120000;
  function truncateForSend(text) {
    if (typeof window.__rsLimitOutgoing === "function") return window.__rsLimitOutgoing(text);
    if (!text || text.length <= SEND_MAX) return text;
    const omitted = text.length - SEND_MAX;
    const marker = `\n\n[…PlazCode: result truncated for Google AI Studio - ${omitted} of ${text.length} characters omitted…]\n\n`;
    const budget = SEND_MAX - marker.length;
    const head = Math.floor(budget * 0.85);
    return text.slice(0, head) + marker + text.slice(text.length - (budget - head));
  }

  function setTextareaValue(el, v) {
    const proto = window.HTMLTextAreaElement && window.HTMLTextAreaElement.prototype;
    const setter = proto && Object.getOwnPropertyDescriptor(proto, "value");
    if (setter && setter.set) setter.set.call(el, v);
    else el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setRichText(el, text) {
    const tag = safeRead(() => el.tagName, "");
    if (tag === "TEXTAREA" || tag === "INPUT") {
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
      try { el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text })); }
      catch { el.dispatchEvent(new Event("input", { bubbles: true })); }
    }
  }

  async function writeDraft(value, expectedCurrent) {
    const ed = getEditor();
    if (!ed || editorText(ed).trim() !== String(expectedCurrent).trim()) return { ok: false, reason: "draft-changed" };
    const text = String(value);
    const relock = _locked || safeRead(() => ed.getAttribute("contenteditable"), null) === "false" || safeRead(() => ed.hasAttribute("readonly"), false);
    try {
      setInputLock(false);
      setRichText(ed, text);
      await sleep(30);
      return { ok: text === "" ? editorText(ed).trim() === "" : editorText(ed).trim() === text.trim() };
    } finally {
      if (relock) setInputLock(true);
    }
  }

  // ── Media Attachments (Images & Video) ────────────────────────────────────
  function fileFromImage(img, i) {
    if (typeof PlazCodeMedia !== "undefined") return PlazCodeMedia.fileFrom(img, i);
    const mime = img.mimeType || "image/png";
    const bin = atob(img.data);
    const arr = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j);
    const ext = mime.includes("mp4") ? "mp4" : mime.includes("webm") ? "webm" : mime.includes("png") ? "png" : "jpg";
    return new File([arr], `plazcode_${Date.now()}_${i}.${ext}`, { type: mime });
  }

  function hasPendingAttachment() {
    const scope = composerFrame() || document;
    for (const el of safeQueryAll(scope, S.mediaPreview)) {
      if (!safeClosest(el, S.turn) && !safeClosest(el, "#rs-root") && visible(el)) return true;
    }
    return false;
  }

  async function attachImages(images) {
    if (!images || !images.length) return false;
    const dt = new DataTransfer();
    images.forEach((img, i) => { try { dt.items.add(fileFromImage(img, i)); } catch {} });
    if (!dt.items.length) return false;

    const findInput = () =>
      safeQueryAll(document, 'input[type="file"]').find((i) => !safeClosest(i, "#rs-root") && /image|video|\*\/\*/i.test(safeRead(() => i.accept, "") || "*/*")) ||
      safeQueryAll(document, 'input[type="file"]').find((i) => !safeClosest(i, "#rs-root")) ||
      null;

    let fi = findInput();
    let opened = null;
    if (!fi) {
      opened = safeQuery(document, S.addMenuBtn);
      if (opened) {
        try { opened.click(); } catch {}
        await waitFor(() => !!findInput(), 1500);
        fi = findInput();
      }
    }
    if (fi) {
      try {
        fi.files = dt.files;
        fi.dispatchEvent(new Event("change", { bubbles: true }));
      } catch {}
      if (opened) { try { opened.click(); } catch {} }
    } else {
      const ed = getEditor();
      if (!ed) return false;
      try {
        ed.focus();
        ed.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      } catch { return false; }
    }

    const previewOk = await waitFor(hasPendingAttachment, 10000);
    if (!previewOk) return !!fi;
    const spinnerSel = 'mat-spinner, mat-progress-spinner, progress, [role="progressbar"]';
    const hasSpinner = () => {
      const box = composerFrame();
      return !!(box && safeQuery(box, spinnerSel));
    };
    await waitFor(hasSpinner, 1200);
    await waitFor(() => !hasSpinner(), 20000);
    return true;
  }

  function clearAttachments() {
    try {
      const scope = composerFrame() || document;
      safeQueryAll(scope, "[aria-label*='remove' i], [aria-label*='delete' i], [class*='remove']")
        .filter((b) => !safeClosest(b, "#rs-root") && !safeClosest(b, S.turn))
        .forEach((b) => { try { b.click(); } catch {} });
    } catch {}
  }

  async function typeAndSend(text, images) {
    const ed = getEditor();
    if (!ed) throw new Error("Google AI Studio prompt box not found — open aistudio.google.com/prompts/new_chat");
    const relock = _locked || safeRead(() => ed.getAttribute("contenteditable"), null) === "false" || safeRead(() => ed.hasAttribute("readonly"), false);
    text = truncateForSend(text);
    try {
      if (relock) setInputLock(false);
      ed.focus();
      if (editorText(ed).trim() !== String(text).trim()) setRichText(ed, text);
      if (images && images.length && !hasPendingAttachment()) {
        try { await attachImages(images); } catch {}
      }
      const runReady = () => {
        const b = runButton();
        return !!b && !safeRead(() => b.disabled, false) && safeRead(() => b.getAttribute("aria-disabled"), null) !== "true";
      };
      await waitFor(runReady, 3000);
      let sent = false;
      for (let i = 0; i < 6 && !sent; i++) {
        const b = runButton();
        if (b && !safeRead(() => b.disabled, false) && safeRead(() => b.getAttribute("aria-disabled"), null) !== "true") {
          try { b.click(); } catch {}
        } else if (!isHardGenerating()) {
          const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || "");
          const o = { key: "Enter", code: "Enter", keyCode: 13, which: 13, ctrlKey: !isMac, metaKey: isMac, bubbles: true, cancelable: true };
          try { ed.dispatchEvent(new KeyboardEvent("keydown", o)); } catch {}
        }
        sent = await waitFor(() => editorText().trim() === "" || isHardGenerating(), 900);
      }
      diag("aistudio.send", { sent, editorLen: editorText().length });
    } finally {
      if (relock) setInputLock(true);
    }
  }

  function stopGeneration() {
    const b = stopButton();
    if (b) { try { b.click(); } catch {} }
  }

  function modeWarning() {
    if (!getEditor()) return "Open a prompt at <b>aistudio.google.com/prompts/new_chat</b>, then press Start.";
    return "";
  }

  function scanError() {
    try {
      for (const el of safeQueryAll(document, S.errorSurfaces)) {
        if (!visible(el) || safeClosest(el, S.turn)) continue;
        const t = (safeRead(() => el.innerText, "") || "").trim();
        if (t.length > 8 && t.length < 600 && RE.contextLimit.test(t)) return t.slice(0, 240);
      }
    } catch {}
    if (!getEditor()) return "The prompt input box disappeared (session ended?).";
    return null;
  }

  // ── Send Hooks (Ctrl+Enter / Cmd+Enter + Run/Stop Button) ─────────────────
  function installSendHooks(handlers) {
    document.addEventListener("keydown", (e) => {
      // AI Studio submits on Ctrl+Enter / Cmd+Enter; plain Enter only inserts a newline.
      if (e.key !== "Enter" || (!e.ctrlKey && !e.metaKey) || e.shiftKey || e.isComposing) return;
      const ed = getEditor();
      if (!ed || !safeRead(() => ed.contains(e.target), false) || editorText(ed).trim() === "") return;
      if ((handlers).onCoworkSend && (handlers).onCoworkSend(e)) return;
      if (handlers.isBlocked()) return;
      if (!handlers.isStarted()) {
        if (chatIsEmpty()) handlers.onBlockedAttempt();
        return;
      }
      handlers.onUserMessage(assistantCount());
    }, true);

    document.addEventListener("click", (e) => {
      if (!getEditor() || safeClosest(e.target, "#rs-root")) return;
      const btn = safeRead(() => (e.target).closest, null) && (safeClosest(e.target, "button"));
      if (!btn) return;
      if (isStopBtn(btn)) {
        if (e.isTrusted !== false) handlers.onNativeStop();
        return;
      }
      const isRun = btn === runButton() || (safeClosest(btn, "ms-run-button") != null && !isStopBtn(btn));
      if (!isRun || safeRead(() => btn.disabled, false) || safeRead(() => btn.getAttribute("aria-disabled"), null) === "true") return;
      if ((handlers).onCoworkSend && (handlers).onCoworkSend(e)) return;
      if (handlers.isBlocked()) return;
      if (!handlers.isStarted()) {
        if (chatIsEmpty()) handlers.onBlockedAttempt();
        return;
      }
      handlers.onUserMessage(assistantCount());
    }, true);
  }

  const CMD_SHAPE = /"(?:command|tool)"\s*:\s*"|###\s*lua|###mcp_tool###/i;
  function findToolBlockSpot(item) {
    if (!item) return null;
    let spot = null;
    for (const cb of safeQueryAll(item, S.codeWrap)) {
      if (safeClosest(cb, ".rs-chip") || safeClosest(cb, S.thinking)) continue;
      if (!CMD_SHAPE.test(safeRead(() => cb.textContent, "") || "")) continue;
      cb.classList.add("rs-tool-hide");
      item.classList.add("rs-cmd-mask");
      if (!spot && safeRead(() => cb.parentElement, null)) {
        spot = { parent: safeRead(() => cb.parentElement, null), ref: cb };
      }
    }
    return spot;
  }

  return {
    id: "aistudio",
    displayName: "Google AI Studio",
    supportsVision: true,
    timings,
    thinkingSel: S.thinking,
    chipAtItemLevel: true,
    chipAnchor: (item) => item,
    reliableCounts: true,
    init({ diag: d } = {}) {
      if (d) diag = d;
      diag("aistudio.init", { editor: !!getEditor(), path: location.pathname });
    },
    allItems, isUserItem, isAssistantItem, itemText, classifyText,
    assistantCount, userCount, lastAssistant, lastAssistantId, itemKey, readAssistant, streamLen, snapshot,
    getEditor, editorText, chatIsEmpty, isFreshChat, composerFrame, barAnchor,
    setInputLock, writeDraft, typeAndSend, stopGeneration,
    isGenerating, isBusyNow, isHardGenerating,
    enforceComposer() { return { ready: !!getEditor() }; },
    async ensureComposerReady(reason) {
      diag("aistudio.mode_ready", { reason, editor: !!getEditor() });
      return { ready: !!getEditor() };
    },
    modeWarning,
    turnHalted, findContinueBtn, clickContinueBtn,
    scanError, isTooLongMsg: (t) => RE.tooLong.test(t), isBusyMsg: (t) => RE.busy.test(t),
    attachImages, clearAttachments, hasPendingAttachment, conversationKey,
    installSendHooks, findToolBlockSpot,
  };
})();
