// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.25.0/ts/providers/mistral.ts (TypeScript): edit that file, then run node development/1.25.0/ts/build.cjs.
// providers/mistral.js — Mistral Le Chat (chat.mistral.ai) provider.
// Supports Mistral Work (/work) and standard chat routes cleanly (Code / Vibe Code tab is not supported).
//
// Selectors flagged for live Chrome DevConsole verification on chat.mistral.ai:
//  - S.turn / S.userTurn / S.assistantTurn (`[data-message-author-role]`, `[data-message-id]`, `[data-testid*="message"]`)
//  - S.reply / S.thinking (`.prose`, `[class*="markdown"]`, `[class*="thinking" i]`, `[class*="reasoning" i]`)
//  - S.editor (`div.ProseMirror`, `textarea`, excluding preview/sandbox `.cm-editor` / `.monaco-editor`)
//  - S.modeControl (Work vs unsupported Code / Vibe Code route & tab/pill detection)
//  - S.sendBtn / S.stopBtn / S.attachBtn / S.fileInput
// eslint-disable-next-line no-unused-vars
const RSProvider = (() => {
  "use strict";
  ;
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
    return safeRead(() => node.getBoundingClientRect(), { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, readFailed: true });
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
    turn: '[data-message-author-role], [data-message-id], [data-testid*="user-message"], [data-testid*="assistant-message"], [class*="message-row"], article',
    userTurn: '[data-message-author-role="user"], [data-role="user"], [data-author="user"], [data-testid*="user-message"]',
    assistantTurn: '[data-message-author-role="assistant"], [data-role="assistant"], [data-author="assistant"], [data-testid*="assistant-message"]',
    reply: '.prose, [class*="markdown"], [data-testid*="markdown"], [class*="message-content"]',
    thinking: '[data-testid*="thinking" i], [class*="thinking" i], [class*="reasoning" i], [class*="thought" i]',
    editor: [
      'textarea[placeholder*="Ask" i]',
      'textarea[placeholder*="Message" i]',
      'textarea[placeholder*="Type" i]',
      'div.ProseMirror[contenteditable]',
      'div.tiptap[contenteditable]',
      '[data-rs-locked="1"]',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="plaintext-only"][role="textbox"]',
      '[role="textbox"][contenteditable]:not([contenteditable="false"])',
      'textarea:not([disabled])',
      'div[contenteditable="true"]',
      'div[contenteditable="plaintext-only"]',
    ].join(", "),
    // Exclude artifact code editor / terminal / preview panes so we never type into a preview file.
    nonComposerScope: '#rs-root, nav, aside, [role="dialog"], .monaco-editor, .cm-editor, .xterm, [class*="code-editor"], [class*="preview-pane"], [data-panel="preview"], [class*="sandbox"]',
    composerWrap: 'form, [data-testid*="composer"], [class*="composer"], [class*="chat-input"]',
    modeControl: '[role="tab"], [role="radio"], a[href*="/work"], a[href*="/code"], a[href*="/vibe"], button[data-mode], [data-testid*="mode" i]',
    attachBtn: 'button[aria-label*="Attach" i], button[aria-label*="Joindre" i], button[aria-label*="Upload" i], button[aria-label*="Add" i], button[data-testid*="attach" i]',
    fileInput: 'input[type="file"]',
    attachPreview: '[data-testid*="attachment" i], [class*="attachment" i], [class*="file-preview" i], [class*="thumbnail" i]',
    sendAria: /^(?:send|submit|ask|envoyer)(?:\s+(?:message|prompt|chat|button))?$|^send[-_]?(?:btn|button)$/i,
    stopAria: /^(?:stop|cancel|abort|arr[êe]ter)(?:\s+(?:generating|generation|response|streaming))?$/i,
    codeWrap: 'pre, [class*="code-block" i], [class*="codeblock" i]',
    errorSurfaces: '[role="alert"], [data-sonner-toast], [class*="toast"], [class*="error-banner"], [class*="error-message"]',
  };

  const RE = {
    contextLimit: /context.{0,20}(limit|exceeded|too long)|conversation.{0,20}too long|(token|context).{0,10}limit|maximum.{0,20}context/i,
    tooLong: /message.{0,20}too long|conversation.{0,20}too long|trop long|character limit/i,
    busy: /rate limit|too many requests|try again later|temporarily unavailable|server is busy|usage limit|quota|réessayer plus tard/i,
    codeMode: /\b(?:vibe\s*code|vibecode|code)\b/i,
    workMode: /\bwork\b/i,
    codeLabel: /^(?:switch\s+to\s+)?(?:vibe\s*code|vibecode|code)(?:\s+mode)?$/i,
    workLabel: /^(?:switch\s+to\s+)?work(?:\s+mode)?$/i,
    sideBox: /rename|title|search|filter|feedback|report|comment/i,
    mainBox: /ask|message|prompt|chat|mistral|le chat|work|quick access|type \//i,
  };

  const timings = {
    GEN_IDLE_MS: 1500,
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

  const ariaOf = (b) => (
    safeRead(() => b.getAttribute("aria-label"), null) ||
    safeRead(() => b.getAttribute("title"), null) ||
    safeRead(() => b.getAttribute("data-testid"), null) ||
    ""
  ).trim();

  // ── Work Mode Detection & Unsupported Code Mode Guard ─────────────────────
  function isControlActive(el) {
    if (!el) return false;
    const ariaSel = safeRead(() => el.getAttribute("aria-selected"), null);
    const ariaPre = safeRead(() => el.getAttribute("aria-pressed"), null);
    const ariaChk = safeRead(() => el.getAttribute("aria-checked"), null);
    const ariaCur = safeRead(() => el.getAttribute("aria-current"), null);
    const dataState = safeRead(() => el.getAttribute("data-state"), null);
    const dataAct = safeRead(() => el.getAttribute("data-active"), null);
    const dataSel = safeRead(() => el.getAttribute("data-selected"), null);

    if (
      ariaSel === "true" ||
      ariaPre === "true" ||
      ariaChk === "true" ||
      ariaCur === "page" ||
      ariaCur === "true" ||
      dataState === "active" ||
      dataState === "on" ||
      dataState === "checked" ||
      dataAct === "true" ||
      dataSel === "true"
    ) return true;

    if (
      ariaSel === "false" ||
      ariaPre === "false" ||
      ariaChk === "false" ||
      ariaCur === "false" ||
      dataState === "inactive" ||
      dataState === "off" ||
      dataState === "unchecked" ||
      dataAct === "false" ||
      dataSel === "false"
    ) return false;

    const cls = String(safeRead(() => el.className, "") || "");
    return cls.trim().split(/\s+/).some((tok) => tok && !tok.includes(":") && !tok.includes("[") && /^(?:is-)?(?:active|selected)$/i.test(tok));
  }

  function controlText(el) {
    return String(safeRead(() => el.textContent, "") || "").replace(/\s+/g, " ").trim();
  }

  function controlHrefPath(el) {
    const raw = String(safeRead(() => el.getAttribute("href"), "") || "").trim();
    if (!raw) return { raw: "", path: "", query: "" };
    return safeRead(() => {
      const u = new URL(raw, location.origin);
      return { raw, path: (u.pathname || "").toLowerCase(), query: ((u.search || "") + " " + (u.hash || "")).toLowerCase() };
    }, { raw, path: raw.toLowerCase(), query: "" });
  }

  function isWorkModeControl(el) {
    const dataMode = String(safeRead(() => el.getAttribute("data-mode"), "") || "").trim();
    const aria = String(safeRead(() => el.getAttribute("aria-label"), "") || "").trim();
    const text = controlText(el);
    const hrefInfo = controlHrefPath(el);
    if (hrefInfo.raw && !/^\/(?:vibe\/)?work\/?$/i.test(hrefInfo.path) && !/[?&](?:mode|view|tab)=work(?:&|$|#|\s)/i.test(hrefInfo.query)) {
      return false;
    }
    if (RE.workLabel.test(dataMode) || RE.workLabel.test(text) || RE.workLabel.test(aria)) return true;
    return /^\/(?:vibe\/)?work\/?$/i.test(hrefInfo.path);
  }

  function isCodeModeControl(el) {
    if (isWorkModeControl(el)) return false;
    const hrefInfo = controlHrefPath(el);
    if (hrefInfo.raw) {
      if (/\/work(?:\/|$)/.test(hrefInfo.path)) return false;
      const isCodeHref =
        /^\/(?:vibe-?code|code|vibe|vibe\/code)\/?$/i.test(hrefInfo.path) ||
        /[?&](?:mode|view|tab)=(?:vibe-?code|code)(?:&|$|#|\s)/i.test(hrefInfo.query);
      if (!isCodeHref) return false;
    }
    const dataMode = String(safeRead(() => el.getAttribute("data-mode"), "") || "").trim();
    const aria = String(safeRead(() => el.getAttribute("aria-label"), "") || "").trim();
    const text = controlText(el);
    return RE.codeLabel.test(dataMode) || RE.codeLabel.test(text) || RE.codeLabel.test(aria) || !!hrefInfo.raw;
  }

  function modeControls() {
    const seen = new Set();
    const out = [];
    for (const el of safeQueryAll(document, S.modeControl)) {
      if (seen.has(el) || safeClosest(el, "#rs-root") || !visible(el)) continue;
      seen.add(el);
      out.push(el);
    }
    for (const btn of safeQueryAll(document, "nav button, aside button, header button")) {
      if (seen.has(btn) || safeClosest(btn, "#rs-root") || !visible(btn)) continue;
      const t = controlText(btn);
      if (!t || (!RE.workLabel.test(t) && !RE.codeLabel.test(t))) continue;
      seen.add(btn);
      out.push(btn);
    }
    return out;
  }

  function isCodeMode() {
    const path = (location.pathname || "").toLowerCase();
    const queryAndHash = ((location.search || "") + " " + (location.hash || "")).toLowerCase();
    const isWorkRoute = /\/work(?:\/|$|\?)/.test(path);
    const isCodeRoute = /\/(?:vibe-?code|code)(?:\/|$|\?)/.test(path) || (/\/vibe(?:\/|$|\?)/.test(path) && !isWorkRoute);
    const isCodeQuery = /[?&](?:mode|view|tab)=(?:vibe-?code|vibe|code)(?:&|$|#|\s)/i.test(queryAndHash);
    if (isCodeRoute || isCodeQuery) return true;

    let sawActiveWork = false;
    let sawActiveCode = false;
    for (const el of modeControls()) {
      if (!isControlActive(el)) continue;
      if (isWorkModeControl(el)) sawActiveWork = true;
      else if (isCodeModeControl(el)) sawActiveCode = true;
    }
    if (sawActiveWork) return false;
    return sawActiveCode;
  }

  function detectMode() {
    const path = (location.pathname || "").toLowerCase();
    const queryAndHash = ((location.search || "") + " " + (location.hash || "")).toLowerCase();
    if (/\/work(?:\/|$|\?)/.test(path) || /[?&](?:mode|view|tab)=work(?:&|$|#|\s)/i.test(queryAndHash)) return "work";

    for (const el of modeControls()) {
      if (!isControlActive(el)) continue;
      if (isWorkModeControl(el)) return "work";
    }
    return "chat";
  }

  function findWorkControl() {
    return modeControls().find((el) => isWorkModeControl(el)) || null;
  }

  async function switchMode(target) {
    if (target !== "work") return false;
    if (!isCodeMode() && detectMode() === "work") return true;
    const ctrl = findWorkControl();
    if (!ctrl) return false;
    try { ctrl.click(); } catch { return false; }
    return waitFor(() => !isCodeMode() && detectMode() === "work" && !!getEditor(), 3000);
  }

  // ── Editor & Composer ─────────────────────────────────────────────────────
  let lockedEditor = null;
  function getEditor() {
    if (isCodeMode()) return null;
    if (lockedEditor && safeRead(() => lockedEditor?.isConnected ?? false, false) && visible(lockedEditor)) return lockedEditor;
    const seen = new Set();
    const candidates = [];
    for (const el of safeQueryAll(document, S.editor)) {
      if (seen.has(el)) continue;
      seen.add(el);
      if (!visible(el)) continue;
      if (safeClosest(el, S.nonComposerScope)) continue;
      if (safeClosest(el, S.turn)) continue;
      const hint = [
        safeRead(() => el.getAttribute("placeholder"), ""),
        safeRead(() => el.getAttribute("aria-label"), ""),
        safeRead(() => el.getAttribute("data-placeholder"), ""),
      ].filter(Boolean).join(" ");
      if (RE.sideBox.test(hint) && !RE.mainBox.test(hint)) continue;
      if (candidates.some((c) => safeRead(() => c.contains(el), false))) continue;
      candidates.push(el);
    }
    if (!candidates.length) return null;
    if (candidates.length === 1) return candidates[0];
    const inWrap = candidates.find((el) => !!safeClosest(el, S.composerWrap));
    if (inWrap) return inWrap;
    candidates.sort((a, b) => safeRect(a).bottom - safeRect(b).bottom);
    return candidates[candidates.length - 1] || candidates[0];
  }

  function editorText(el) {
    const e = el || getEditor();
    if (!e) return "";
    const tag = safeRead(() => e.tagName, "");
    if (tag === "TEXTAREA" || tag === "INPUT") return safeRead(() => (e).value, "") || "";
    return (safeRead(() => e.innerText, "") || safeRead(() => e.textContent, "") || "").replace(/\u00a0/g, " ");
  }

  function composerFrame() {
    const ed = getEditor();
    if (!ed) return null;
    return safeClosest(ed, S.composerWrap) || safeRead(() => ed.parentElement, null);
  }

  function barAnchor() {
    const ed = getEditor();
    if (!ed) return null;
    let n = safeRead(() => ed.parentElement, null);
    for (let i = 0; i < 10 && n && n !== document.body; i++) {
      const cur = n;
      const cls = String(safeRead(() => cur.className, "") || "");
      const r = parseFloat(safeStyle(cur).borderTopLeftRadius) || 0;
      if (/rounded|composer|chat-input/i.test(cls) || r >= 12) return cur;
      n = safeRead(() => cur.parentElement, null);
    }
    return composerFrame();
  }

  // ── Turns & Text Extraction ───────────────────────────────────────────────
  function allItems() {
    const seen = new Set();
    const out = [];
    for (const el of safeQueryAll(document, S.turn)) {
      if (seen.has(el) || safeClosest(el, S.nonComposerScope)) continue;
      seen.add(el);
      if (out.some((p) => safeRead(() => p.contains(el), false))) continue;
      out.push(el);
    }
    return out;
  }

  function isUserItem(item) {
    if (!item) return false;
    if (safeRead(() => item.matches(S.userTurn), false) || safeQuery(item, S.userTurn)) return true;
    if (safeRead(() => item.matches(S.assistantTurn), false)) return false;
    const role = (
      safeRead(() => item.getAttribute("data-message-author-role"), null) ||
      safeRead(() => item.getAttribute("data-role"), null) ||
      safeRead(() => item.getAttribute("data-author"), null) ||
      ""
    ).toLowerCase();
    if (role === "user" || role === "human") return true;
    if (role === "assistant" || role === "model") return false;
    const cls = String(safeRead(() => item.className, "") || "");
    if (/\b(user|items-end|justify-end|ml-auto)\b/i.test(cls) && !safeQuery(item, S.reply)) return true;
    return false;
  }

  const isAssistantItem = (item) => !!item && !isUserItem(item);

  const CODE_CHROME = "button, [role='button'], .sr-only, [class*='copy' i], [class*='code-header' i]";
  function textWithout(root, excludeSel) {
    if (!root) return "";
    const skip = ".rs-chip, " + CODE_CHROME + (excludeSel ? ", " + excludeSel : "");
    let t = "";
    const walk = (n) => {
      const type = safeRead(() => n.nodeType, 0);
      if (type === 3) { t += safeRead(() => n.nodeValue, ""); return; }
      if (type !== 1) return;
      const el = n;
      if (safeRead(() => el.matches, null) && safeRead(() => el.matches(skip), false)) return;
      const tag = safeRead(() => el.tagName, "");
      if (tag === "BR") { t += "\n"; return; }
      const isCode = tag === "PRE" || (safeRead(() => el.matches, null) && safeRead(() => el.matches(S.codeWrap), false));
      const isBlock = isCode || /^(P|DIV|LI|UL|OL|BLOCKQUOTE|H[1-6]|TABLE|TR|SECTION|ARTICLE)$/.test(tag);
      if (isBlock && t && !t.endsWith("\n")) t += "\n";
      for (const c of safeRead(() => n.childNodes, [])) walk(c);
      if (isBlock && !t.endsWith("\n")) t += "\n";
    };
    walk(root);
    return t;
  }

  function replyRoots(item) {
    if (!item) return [];
    const mds = safeQueryAll(item, S.reply).filter((m) => !safeClosest(m, S.thinking) && !safeClosest(m, ".rs-chip"));
    if (!mds.length) return [item];
    const set = new Set(mds);
    return mds.filter((m) => {
      for (let p = safeRead(() => m.parentElement, null); p && p !== item; p = safeRead(() => p.parentElement, null)) {
        if (set.has(p)) return false;
      }
      return true;
    });
  }

  function itemText(item) {
    if (!item) return "";
    if (isAssistantItem(item)) return replyRoots(item).map((m) => textWithout(m, S.thinking)).join("\n");
    return textWithout(item);
  }

  function classifyText(item, excludeSel) {
    if (!item) return "";
    const skip = excludeSel ? `${S.thinking}, ${excludeSel}` : S.thinking;
    if (isAssistantItem(item)) return replyRoots(item).map((m) => textWithout(m, skip)).join("\n");
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
    const own = safeRead(() => item.getAttribute("data-message-id"), null) || safeRead(() => item.getAttribute("data-turn-id"), null);
    if (own) return own;
    let id = _turnIds.get(item);
    if (!id) { id = "m" + (++_turnSeq); _turnIds.set(item, id); }
    return id;
  }
  const lastAssistantId = () => itemKey(lastAssistant());

  const chatIsEmpty = () => allItems().length === 0;
  const FRESH_PATH = /^\/(?:work|chat)?\/?$/i;
  const isFreshChat = () => !isCodeMode() && chatIsEmpty() && !!getEditor() && FRESH_PATH.test(location.pathname || "/");
  const conversationKey = () => {
    if (isCodeMode()) return "";
    const p = location.pathname || "/";
    if (chatIsEmpty() || FRESH_PATH.test(p)) return "";
    const m = p.match(/\/(?:chat|work)\/([A-Za-z0-9_-]+)/i);
    return m ? detectMode() + ":" + m[1] : p;
  };

  // ── Send & Stop Buttons ───────────────────────────────────────────────────
  function composerButtons() {
    const scope = composerFrame() || document;
    return safeQueryAll(scope, "button").filter((b) => !safeClosest(b, "#rs-root") && visible(b));
  }

  function isStopBtn(b) {
    if (!b) return false;
    const a = ariaOf(b);
    if (S.stopAria.test(a) || /stop/i.test(safeRead(() => b.getAttribute("data-testid"), "") || "")) return true;
    if (S.sendAria.test(a)) return false;
    return !!(safeQuery(b, "rect") && safeClosest(b, S.composerWrap) && !safeQuery(b, "path[d*='M5 12']"));
  }

  function sendButton() {
    const btns = composerButtons();
    return (
      btns.find((b) => S.sendAria.test(ariaOf(b))) ||
      btns.find((b) => safeRead(() => b.type, "") === "submit" && !isStopBtn(b)) ||
      null
    );
  }

  function stopButton() {
    return composerButtons().find(isStopBtn) || null;
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
    const busyAttr = !!(last && safeRead(() => last.getAttribute("data-streaming"), null) === "true");
    if (stop || busyAttr) {
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

  // ── Input Lock, Draft & Sending ───────────────────────────────────────────
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

  const SEND_MAX = 100000;
  function truncateForSend(text) {
    if (typeof window.__rsLimitOutgoing === "function") return window.__rsLimitOutgoing(text);
    if (!text || text.length <= SEND_MAX) return text;
    const omitted = text.length - SEND_MAX;
    const marker = `\n\n[…PlazCode: result truncated for Mistral - ${omitted} of ${text.length} characters omitted…]\n\n`;
    const budget = SEND_MAX - marker.length;
    const head = Math.floor(budget * 0.85);
    return text.slice(0, head) + marker + text.slice(text.length - (budget - head));
  }

  function setTextareaValue(el, v) {
    const proto = window.HTMLTextAreaElement && window.HTMLTextAreaElement.prototype;
    const setter = proto && Object.getOwnPropertyDescriptor(proto, "value");
    if (setter && setter.set) setter.set.call(el, v);
    else (el).value = v;
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
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
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
      if (text === "" && safeRead(() => ed.tagName, "") !== "TEXTAREA") {
        ed.focus();
        try { document.execCommand("selectAll", false); document.execCommand("delete", false); } catch {}
        if (editorText(ed).trim() !== "") {
          ed.textContent = "";
          try { ed.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" })); } catch { ed.dispatchEvent(new Event("input", { bubbles: true })); }
        }
      } else {
        setRichText(ed, text);
      }
      await sleep(30);
      return { ok: text === "" ? editorText(ed).trim() === "" : editorText(ed).trim() === text.trim() };
    } finally {
      if (relock) setInputLock(true);
    }
  }

  // ── Attachments ───────────────────────────────────────────────────────────
  function fileFromImage(img, i) {
    if (typeof PlazCodeMedia !== "undefined") return PlazCodeMedia.fileFrom(img, i);
    const mime = img.mimeType || "image/png";
    const bin = atob(img.data);
    const arr = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j);
    return new File([arr], `plazcode_${Date.now()}_${i}.${mime.includes("png") ? "png" : "jpg"}`, { type: mime });
  }

  function hasPendingAttachment() {
    const scope = composerFrame() || document;
    for (const el of safeQueryAll(scope, S.attachPreview)) {
      if (!safeClosest(el, S.turn) && !safeClosest(el, "#rs-root") && visible(el)) return true;
    }
    return false;
  }

  async function attachImages(images) {
    if (!images || !images.length) return false;
    const dt = new DataTransfer();
    images.forEach((img, i) => { try { dt.items.add(fileFromImage(img, i)); } catch {} });
    if (!dt.items.length) return false;

    let fi = safeQueryAll(document, S.fileInput).find((i) => !safeClosest(i, "#rs-root")) || null;
    let opened = null;
    if (!fi) {
      opened = safeQuery(document, S.attachBtn);
      if (opened) {
        try { opened.click(); } catch {}
        await waitFor(() => !!safeQuery(document, S.fileInput), 1500);
        fi = safeQueryAll(document, S.fileInput).find((i) => !safeClosest(i, "#rs-root")) || null;
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
    const spinnerSel = '[role="progressbar"], [class*="spinner" i], [class*="loading" i]';
    const hasSpinner = () => {
      const box = composerFrame();
      return !!(box && safeQuery(box, spinnerSel));
    };
    await waitFor(hasSpinner, 1000);
    await waitFor(() => !hasSpinner(), 20000);
    return true;
  }

  function clearAttachments() {
    try {
      const scope = composerFrame() || document;
      safeQueryAll(scope, "[aria-label*='remove' i], [aria-label*='delete' i], [aria-label*='supprimer' i], [class*='remove' i]")
        .filter((b) => !safeClosest(b, "#rs-root") && !safeClosest(b, S.turn))
        .forEach((b) => { try { b.click(); } catch {} });
    } catch {}
  }

  async function typeAndSend(text, images) {
    const ed = getEditor();
    if (!ed) throw new Error("Mistral chat box not found — open chat.mistral.ai/work");
    const relock = _locked || safeRead(() => ed.getAttribute("contenteditable"), null) === "false" || safeRead(() => ed.hasAttribute("readonly"), false);
    text = truncateForSend(text);
    try {
      if (relock) setInputLock(false);
      ed.focus();
      if (editorText(ed).trim() !== String(text).trim()) setRichText(ed, text);
      if (images && images.length && !hasPendingAttachment()) {
        try { await attachImages(images); } catch {}
      }
      const sendReady = () => {
        const b = sendButton();
        return !!b && !safeRead(() => b.disabled, false) && safeRead(() => b.getAttribute("aria-disabled"), null) !== "true";
      };
      await waitFor(sendReady, 3000);
      let sent = false;
      for (let i = 0; i < 6 && !sent; i++) {
        const b = sendButton();
        if (b && !safeRead(() => b.disabled, false) && safeRead(() => b.getAttribute("aria-disabled"), null) !== "true") {
          try { b.click(); } catch {}
        } else if (!isHardGenerating()) {
          const o = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
          try { ed.dispatchEvent(new KeyboardEvent("keydown", o)); } catch {}
        }
        sent = await waitFor(() => editorText().trim() === "" || isHardGenerating(), 900);
      }
      diag("mistral.send", { mode: detectMode(), sent, editorLen: editorText().length });
    } finally {
      if (relock) setInputLock(true);
    }
  }

  function stopGeneration() {
    const b = stopButton();
    if (b) { try { b.click(); } catch {} }
  }

  function loginGatePresent() {
    if (/^\/(?:login|sign-?in|auth)(\/|$)/i.test(location.pathname || "")) return true;
    return !getEditor() && !!safeQuery(document, 'a[href*="login"], a[href*="auth"], button[data-testid*="login" i]');
  }

  function modeWarning() {
    if (loginGatePresent()) return "<b>Sign in to Mistral</b> at chat.mistral.ai first, then press Start.";
    if (isCodeMode()) return 'PlazCode only supports Mistral <b>Work</b> mode (Code mode is not supported). Switch to <a href="https://chat.mistral.ai/work" style="color:inherit;text-decoration:underline">chat.mistral.ai/work</a>, then press Start.';
    if (!getEditor()) return "Open <b>chat.mistral.ai/work</b>, then press Start.";
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
    if (!getEditor() && !loginGatePresent()) return "The input box disappeared (session ended?).";
    return null;
  }

  function installSendHooks(handlers) {
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
      const ed = getEditor();
      if (!ed || !safeRead(() => ed.contains(e.target), false) || editorText(ed).trim() === "") return;
      if (handlers.onCoworkSend && (handlers.onCoworkSend)(e)) return;
      if (handlers.isBlocked()) return;
      if (!handlers.isStarted()) {
        if (chatIsEmpty()) handlers.onBlockedAttempt();
        return;
      }
      handlers.onUserMessage(assistantCount());
    }, true);

    document.addEventListener("click", (e) => {
      if (!getEditor() || safeClosest(e.target, "#rs-root")) return;
      const btn = safeRead(() => (e.target).closest, null) && safeClosest(e.target, "button");
      if (!btn) return;
      if (isStopBtn(btn)) {
        if (e.isTrusted !== false) handlers.onNativeStop();
        return;
      }
      const isSend = S.sendAria.test(ariaOf(btn)) || safeRead(() => btn.type, "") === "submit";
      if (!isSend || safeRead(() => btn.disabled, false) || safeRead(() => btn.getAttribute("aria-disabled"), null) === "true") return;
      if (handlers.onCoworkSend && (handlers.onCoworkSend)(e)) return;
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
    for (const block of safeQueryAll(item, S.codeWrap)) {
      if (safeClosest(block, ".rs-chip") || safeClosest(block, S.thinking)) continue;
      if (!CMD_SHAPE.test(safeRead(() => block.textContent, "") || "")) continue;
      block.classList.add("rs-tool-hide");
      item.classList.add("rs-cmd-mask");
      if (!spot && safeRead(() => block.parentElement, null)) {
        spot = { parent: safeRead(() => block.parentElement, null), ref: block };
      }
    }
    return spot;
  }

  return {
    id: "mistral",
    displayName: "Mistral",
    supportsVision: true,
    timings,
    thinkingSel: S.thinking,
    chipAtItemLevel: true,
    chipAnchor: (item) => item,
    reliableCounts: true,
    init({ diag: d } = {}) {
      if (d) diag = d;
      diag("mistral.init", { mode: isCodeMode() ? "unsupported" : detectMode(), path: location.pathname, editor: !!getEditor() });
    },
    allItems, isUserItem, isAssistantItem, itemText, classifyText,
    assistantCount, userCount, lastAssistant, lastAssistantId, itemKey, readAssistant, streamLen, snapshot,
    getEditor, editorText, chatIsEmpty, isFreshChat, composerFrame, barAnchor,
    setInputLock, writeDraft, typeAndSend, stopGeneration,
    isGenerating, isBusyNow, isHardGenerating,
    enforceComposer(reason) {
      if (isCodeMode()) return { ready: false, mode: "unsupported", reason: reason || "" };
      const mode = detectMode();
      return { ready: !!getEditor() && !loginGatePresent(), mode, reason: reason || "" };
    },
    async ensureComposerReady(reason) {
      if (reason === "mode:work") await switchMode("work");
      if (isCodeMode()) {
        diag("mistral.mode_ready", { reason, mode: "unsupported", editor: false, loginGate: loginGatePresent() });
        return { ready: false, detail: "Mistral Code mode is not supported. Switch to Work mode (chat.mistral.ai/work)." };
      }
      const mode = detectMode();
      diag("mistral.mode_ready", { reason, mode, editor: !!getEditor(), loginGate: loginGatePresent() });
      return { ready: !!getEditor() && !loginGatePresent(), detail: mode };
    },
    modeWarning, loginGatePresent,
    turnHalted, findContinueBtn, clickContinueBtn,
    scanError, isTooLongMsg: (t) => RE.tooLong.test(t), isBusyMsg: (t) => RE.busy.test(t),
    attachImages, clearAttachments, hasPendingAttachment, conversationKey,
    installSendHooks, findToolBlockSpot,
  };
})();
