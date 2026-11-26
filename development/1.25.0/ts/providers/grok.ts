// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.25.0/ts/providers/grok.ts (TypeScript): edit that file, then run node development/1.25.0/ts/build.cjs.
// providers/grok.js — Grok (grok.com) provider.
// Exports the same RSProvider interface as providers/deepseek.js and providers/kimi.js.
//
// Live screenshot cues (signed-in grok.com):
//  - Composer placeholder: "Ask, create images, or build anything..."
//  - "+" attachment menu button, "Fast" mode selector dropdown, mic & voice/send controls.
//
// Selectors flagged for live Chrome DevConsole verification on grok.com:
//  - S.turn / S.userTurn / S.assistantTurn (exact turn wrapper & user-vs-assistant attributes/alignment)
//  - S.reply / S.thinking (assistant markdown container & Think/DeepSearch reasoning block)
//  - S.editor (TipTap/ProseMirror contenteditable vs textarea)
//  - S.attachBtn / S.fileInput / S.attachPreview (the "+" attachment trigger and lazy <input type="file">)
//  - S.sendBtn / S.stopBtn / S.voiceBtn (distinguishing Send from Mic/Voice/Speak controls)
//  - S.modeBtn (the "Fast" / "Expert" / "Auto" / "Heavy" mode selector)
// eslint-disable-next-line no-unused-vars
const RSProvider: PlazCodeProvider = (() => {
  "use strict";
  type RectBox = { x: number; y: number; left: number; top: number; right: number; bottom: number; width: number; height: number; readFailed?: boolean };
  let domReadErrors = 0;
  function safeRead<T, F = T>(read: () => T, fallback: F): T | F {
    try { return read(); } catch { domReadErrors++; return fallback; }
  }
  function safeQuery<T extends Element = Element>(root: ParentNode | null, selector: string): T | null {
    return safeRead(() => (root as ParentNode).querySelector<T>(selector), null);
  }
  function safeQueryAll<T extends Element = Element>(root: ParentNode | null, selector: string): T[] {
    return safeRead(() => Array.from((root as ParentNode).querySelectorAll<T>(selector)), []);
  }
  function safeClosest(node: EventTarget | Node | null | undefined, selector: string): Element | null {
    return safeRead(() => (node as Element).closest(selector), null);
  }
  function safeRect(node: Element | null | undefined): RectBox {
    return safeRead(() => (node as Element).getBoundingClientRect(), { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, readFailed: true });
  }
  function safeStyle(node: Element | null | undefined): CSSStyleDeclaration {
    return safeRead(() => getComputedStyle(node as Element), { display: "none", visibility: "hidden", opacity: "0", overflow: "hidden", overflowY: "hidden" } as CSSStyleDeclaration);
  }
  function safePredicate<T>(predicate: () => T): T | false {
    const before = domReadErrors;
    const result = safeRead(predicate, false as const);
    return before === domReadErrors ? result : false;
  }
  function waitBudget(timeout: number, interval: number): { ms: number; polls: number } {
    const ms = Number.isFinite(timeout) ? Math.min(600000, Math.max(0, timeout)) : 30000;
    return { ms, polls: Math.ceil(ms / interval) };
  }

  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  let diag: Diag = () => {};

  // Layered selectors for grok.com — primary semantic/aria/testid signals plus layout fallbacks.
  const S = {
    turn: '[data-testid="message"], [data-testid="user-message"], [data-testid="assistant-message"], [data-message-id], [data-testid*="message-row"], .message-bubble, [class*="message-bubble"], [class*="chat-message"]',
    userTurn: '[data-message-author-role="user"], [data-role="user"], [data-author="user"], [data-testid*="user-message"]',
    assistantTurn: '[data-message-author-role="assistant"], [data-role="assistant"], [data-author="assistant"], [data-testid*="assistant-message"], [data-testid*="model-message"]',
    reply: '.response-content-markdown, .markdown, .prose, [data-testid*="markdown"], [class*="markdown"]',
    thinking: '[data-testid*="thinking" i], [data-testid*="thought" i], [class*="thinking" i], [class*="reasoning" i], [class*="thought-process" i]',
    editor: [
      'textarea[placeholder*="Ask, create images" i]',
      'textarea[placeholder*="What do you want" i]',
      'textarea[placeholder*="Ask anything" i]',
      'div.ProseMirror[contenteditable]',
      'div.tiptap[contenteditable]',
      '[data-rs-locked="1"]',
      '[contenteditable="true"][role="textbox"]',
      'textarea:not([disabled])',
      'div[contenteditable="true"]',
    ].join(", "),
    composerWrap: 'form, [data-testid*="composer"], [class*="query-bar"], [class*="composer"]',
    attachBtn: 'button[aria-label*="Attach" i], button[aria-label*="Add file" i], button[aria-label*="Upload" i], button[data-testid*="attach" i]',
    fileInput: 'input[type="file"]',
    attachPreview: '[data-testid*="attachment" i], [class*="attachment" i], [class*="file-preview" i], [class*="thumbnail" i]',
    sendAria: /^(?:send|submit|ask|send message|submit prompt)$/i,
    stopAria: /^(?:stop|cancel|abort)(?:\s+(?:generating|generation|response|streaming))?$/i,
    voiceAria: /voice|dictate|mic|microphone|speak/i,
    modeBtn: 'button[aria-haspopup], [data-testid*="model-select" i], [data-testid*="mode-select" i]',
    codeWrap: 'pre, [class*="code-block" i], [class*="codeblock" i]',
    errorSurfaces: '[role="alert"], [data-sonner-toast], [class*="toast"], [class*="error-banner"], [class*="rate-limit"]',
  };

  const RE = {
    contextLimit: /context.{0,20}(limit|exceeded|too long)|conversation.{0,20}too long|(token|context).{0,10}limit|maximum.{0,20}context/i,
    tooLong: /message.{0,20}too long|conversation.{0,20}too long|character limit|too many tokens/i,
    busy: /rate limit|too many requests|try again later|temporarily unavailable|server is busy|usage limit|message limit|upgrade to supergrok|limit reached/i,
    continueBtn: /^(continue|continue generating)$/i,
    modeLabel: /\b(fast|auto|expert|heavy|think|grok\s*\d[\w.]*)\b/i,
    placeholderHint: /ask,\s*create images|what do you want|ask anything|ask grok|message grok/i,
    sideBox: /rename|title|search|filter|feedback|report|comment/i,
  };

  const timings = {
    GEN_IDLE_MS: 1500,
    REASON_IDLE_MS: 14000,
    WARMUP_MS: 45000,
    REASON_NOREPLY_MS: 90000,
    STABLE_MS: 9000,
    RESPONSE_TIMEOUT_MS: 300000,
  };

  function visible(el: Element | null): boolean {
    if (!el || safeClosest(el, "#rs-root")) return false;
    const r = safeRect(el);
    if (r.width < 8 || r.height < 6) return false;
    const s = safeStyle(el);
    return !(s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) === 0);
  }

  const ariaOf = (b: Element): string => (
    safeRead(() => b.getAttribute("aria-label"), null) ||
    safeRead(() => b.getAttribute("title"), null) ||
    safeRead(() => b.getAttribute("data-testid"), null) ||
    ""
  ).trim();

  // ── Editor & Composer ─────────────────────────────────────────────────────
  let lockedEditor: HTMLElement | null = null;
  function getEditor(): HTMLElement | null {
    if (lockedEditor && safeRead(() => lockedEditor!.isConnected, false) && visible(lockedEditor)) return lockedEditor;
    const seen = new Set<HTMLElement>();
    const candidates: HTMLElement[] = [];
    for (const el of safeQueryAll<HTMLElement>(document, S.editor)) {
      if (seen.has(el)) continue;
      seen.add(el);
      if (!visible(el)) continue;
      if (safeClosest(el, "#rs-root, nav, header, aside, [role='navigation'], [role='dialog']")) continue;
      if (safeClosest(el, S.turn)) continue;
      const hint = [
        safeRead(() => el.getAttribute("placeholder"), ""),
        safeRead(() => el.getAttribute("aria-label"), ""),
        safeRead(() => el.getAttribute("data-placeholder"), ""),
      ].filter(Boolean).join(" ");
      if (RE.sideBox.test(hint) && !RE.placeholderHint.test(hint)) continue;
      if (candidates.some((c) => safeRead(() => c.contains(el), false))) continue;
      candidates.push(el);
    }
    if (!candidates.length) return null;
    if (candidates.length === 1) return candidates[0];
    const hinted = candidates.find((el) => {
      const ph = safeRead(() => el.getAttribute("placeholder"), "") || safeRead(() => el.getAttribute("data-placeholder"), "") || "";
      return RE.placeholderHint.test(ph);
    });
    if (hinted) return hinted;
    candidates.sort((a, b) => safeRect(a).bottom - safeRect(b).bottom);
    return candidates[candidates.length - 1] || candidates[0];
  }

  function editorText(el?: Element | null): string {
    const e = el || getEditor();
    if (!e) return "";
    const tag = safeRead(() => e.tagName, "");
    if (tag === "TEXTAREA" || tag === "INPUT") return safeRead(() => (e as HTMLTextAreaElement).value, "") || "";
    return (safeRead(() => (e as HTMLElement).innerText, "") || safeRead(() => e.textContent, "") || "").replace(/\u00a0/g, " ");
  }

  function composerFrame(): Element | null {
    const ed = getEditor();
    if (!ed) return null;
    return safeClosest(ed, S.composerWrap) || safeRead(() => ed.parentElement, null);
  }

  function barAnchor(): Element | null {
    const ed = getEditor();
    if (!ed) return null;
    let n: Element | null = safeRead(() => ed.parentElement, null);
    for (let i = 0; i < 10 && n && n !== document.body; i++) {
      const cls = String(safeRead(() => n!.className, "") || "");
      const r = parseFloat(safeStyle(n).borderTopLeftRadius) || 0;
      if (/rounded|query-bar|composer/i.test(cls) || r >= 14) return n;
      n = safeRead((): Element | null => n!.parentElement, null);
    }
    return composerFrame();
  }

  // ── Turns & Text Extraction ───────────────────────────────────────────────
  function allItems(): Element[] {
    const seen = new Set<Element>();
    const out: Element[] = [];
    for (const el of safeQueryAll(document, S.turn)) {
      if (seen.has(el) || safeClosest(el, "#rs-root, nav, aside, [role='dialog']")) continue;
      seen.add(el);
      if (out.some((p) => safeRead(() => p.contains(el), false))) continue;
      out.push(el);
    }
    if (out.length) return out;
    // Fallback: container children inside main thread holding markdown or user alignment
    const main = safeQuery(document, "main");
    if (main) {
      for (const el of safeQueryAll(main, "[class*='items-end'], [class*='items-start']")) {
        if (!safeClosest(el, S.composerWrap) && (safeQuery(el, S.reply) || (safeRead(() => el.textContent, "") || "").trim())) {
          if (!out.some((p) => safeRead(() => p.contains(el), false))) out.push(el);
        }
      }
    }
    return out;
  }

  function isUserItem(item: Element | null): boolean {
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
    if (role === "assistant" || role === "model" || role === "grok") return false;
    const cls = String(safeRead(() => item.className, "") || "");
    if (/\b(user|items-end|justify-end|self-end)\b/i.test(cls) && !safeQuery(item, S.reply)) return true;
    if (safeQuery(item, S.reply) || safeQuery(item, S.thinking)) return false;
    const r = safeRect(item);
    const p = safeRect(safeRead(() => item.parentElement, null) || item);
    if (!r.readFailed && r.width > 8 && p.width > r.width + 24) {
      if ((r.left - p.left) > (p.right - r.right) + 20) return true;
    }
    return false;
  }

  const isAssistantItem = (item: Element | null): boolean => !!item && !isUserItem(item);

  const CODE_CHROME = "button, [role='button'], .sr-only, [class*='copy' i], [class*='code-header' i]";
  function textWithout(root: Element | null, excludeSel?: string): string {
    if (!root) return "";
    const skip = ".rs-chip, " + CODE_CHROME + (excludeSel ? ", " + excludeSel : "");
    let t = "";
    const walk = (n: Node): void => {
      const type = safeRead(() => n.nodeType, 0);
      if (type === 3) { t += safeRead(() => n.nodeValue, ""); return; }
      if (type !== 1) return;
      if (safeRead(() => (n as Element).matches, null) && safeRead(() => (n as Element).matches(skip), false)) return;
      const tag = safeRead(() => (n as Element).tagName, "");
      if (tag === "BR") { t += "\n"; return; }
      const isCode = tag === "PRE" || (safeRead(() => (n as Element).matches, null) && safeRead(() => (n as Element).matches(S.codeWrap), false));
      const isBlock = isCode || /^(P|DIV|LI|UL|OL|BLOCKQUOTE|H[1-6]|TABLE|TR|SECTION|ARTICLE)$/.test(tag);
      if (isBlock && t && !t.endsWith("\n")) t += "\n";
      for (const c of safeRead(() => n.childNodes, [])) walk(c);
      if (isBlock && !t.endsWith("\n")) t += "\n";
    };
    walk(root);
    return t;
  }

  function replyRoots(item: Element | null): Element[] {
    if (!item) return [];
    const mds = safeQueryAll(item, S.reply).filter((m) => !safeClosest(m, S.thinking) && !safeClosest(m, ".rs-chip"));
    if (!mds.length) return [item];
    const set = new Set<Element>(mds);
    return mds.filter((m) => {
      for (let p = safeRead(() => m.parentElement, null); p && p !== item; p = safeRead(() => p.parentElement, null)) {
        if (set.has(p)) return false;
      }
      return true;
    });
  }

  function itemText(item: Element | null): string {
    if (!item) return "";
    if (isAssistantItem(item)) {
      return replyRoots(item).map((m) => textWithout(m, S.thinking)).join("\n");
    }
    return textWithout(item);
  }

  function classifyText(item: Element | null, excludeSel?: string): string {
    if (!item) return "";
    const skip = excludeSel ? `${S.thinking}, ${excludeSel}` : S.thinking;
    if (isAssistantItem(item)) {
      return replyRoots(item).map((m) => textWithout(m, skip)).join("\n");
    }
    return textWithout(item, excludeSel);
  }

  const assistantItems = (): Element[] => allItems().filter(isAssistantItem);
  const assistantCount = (): number => assistantItems().length;
  const userCount = (): number => allItems().filter(isUserItem).length;
  const lastAssistant = (): Element | null => {
    const it = assistantItems();
    return it.length ? it[it.length - 1] : null;
  };

  const GENERIC_TURN_ID = /^(?:message|user-message|assistant-message|model-message|message-row|chat-message|turn|item|pending|temp|loading)$/i;
  const _turnIds = new WeakMap<Element, string>();
  const _attrOwners = new Map<string, Element>();
  let _turnSeq = 0;
  function ownTurnId(item: Element): string | null {
    const direct =
      safeRead(() => item.getAttribute("data-message-id"), null) ||
      safeRead(() => item.getAttribute("data-turn-id"), null) ||
      safeRead(() => item.getAttribute("data-response-id"), null) ||
      safeRead(() => item.getAttribute("id"), null);
    if (direct && !GENERIC_TURN_ID.test(direct.trim())) return direct.trim();
    const wrap = safeClosest(item, '[id^="response-"], [data-message-id], [data-response-id]');
    if (wrap && wrap !== item) {
      const wrapId =
        safeRead(() => wrap.getAttribute("data-message-id"), null) ||
        safeRead(() => wrap.getAttribute("data-response-id"), null) ||
        safeRead(() => wrap.getAttribute("id"), null);
      if (wrapId && !GENERIC_TURN_ID.test(wrapId.trim())) {
        return (isUserItem(item) ? "u:" : "a:") + wrapId.trim();
      }
    }
    return null;
  }
  function itemKey(item: Element | null): string | null {
    if (!item) return null;
    const own = ownTurnId(item);
    if (own) {
      if (_attrOwners.size > 120) {
        for (const [k, el] of _attrOwners) {
          if (!safeRead(() => el.isConnected, false)) _attrOwners.delete(k);
        }
      }
      const owner = _attrOwners.get(own);
      if (!owner || owner === item || !safeRead(() => owner.isConnected, false)) {
        _attrOwners.set(own, item);
        return own;
      }
    }
    let id = _turnIds.get(item);
    if (!id) { id = "g" + (++_turnSeq); _turnIds.set(item, id); }
    return id;
  }
  const lastAssistantId = (): string | null => itemKey(lastAssistant());

  const chatIsEmpty = (): boolean => allItems().length === 0;
  const isFreshChat = (): boolean => chatIsEmpty() && !!getEditor() && /^\/(?:c|chat)?\/?$/.test(location.pathname || "/");
  const conversationKey = (): string => {
    const p = location.pathname || "/";
    if (chatIsEmpty() || /^\/(?:c|chat)?\/?$/.test(p)) return "";
    const m = p.match(/\/(?:c|chat)\/([A-Za-z0-9_-]+)/);
    return m ? m[1] : p;
  };

  // ── Action Controls (Send / Stop / Voice separation) ──────────────────────
  function composerButtons(): HTMLButtonElement[] {
    const scope = composerFrame() || document;
    return safeQueryAll<HTMLButtonElement>(scope, "button").filter((b) => !safeClosest(b, "#rs-root") && visible(b));
  }

  function isStopBtn(b: Element | null): boolean {
    if (!b) return false;
    const a = ariaOf(b);
    if (S.stopAria.test(a) || /stop/i.test(safeRead(() => b.getAttribute("data-testid"), "") || "")) return true;
    if (S.sendAria.test(a) || S.voiceAria.test(a)) return false;
    // Grok sometimes renders a square <rect> inside the primary circular stop button
    if (safeQuery(b, "rect") && !safeQuery(b, "path[d*='M12']") && safeClosest(b, S.composerWrap)) {
      const r = safeRect(b);
      if (r.width >= 24 && r.width <= 56) return true;
    }
    return false;
  }

  function sendButton(): HTMLButtonElement | null {
    const btns = composerButtons();
    return (
      btns.find((b) => S.sendAria.test(ariaOf(b)) && !S.voiceAria.test(ariaOf(b))) ||
      btns.find((b) => safeRead(() => b.type, "") === "submit" && !isStopBtn(b) && !S.voiceAria.test(ariaOf(b))) ||
      null
    );
  }

  function stopButton(): HTMLButtonElement | null {
    return composerButtons().find(isStopBtn) || null;
  }

  // ── Streaming & Completion ────────────────────────────────────────────────
  function streamText(item: Element | null): string {
    if (!item) return "";
    const think = safeQuery(item, S.thinking);
    const thinkTxt = think ? (safeRead(() => think.textContent, "") || "") : "";
    const replyTxt = replyRoots(item).map((m) => textWithout(m, ".rs-chip, " + S.thinking)).join("\n");
    return (thinkTxt + "\n" + replyTxt).trim();
  }
  const streamLen = (item?: Element | null): number => streamText(item === undefined ? lastAssistant() : item).length;

  let _streamMax = -1, _streamAt = 0, _streamItem: Element | null = null;
  function sampleStream(): void {
    const item = lastAssistant();
    const len = streamText(item).length;
    const now = Date.now();
    if (item !== _streamItem || len < _streamMax - 400) {
      _streamItem = item; _streamMax = len; _streamAt = now; return;
    }
    if (len > _streamMax) { _streamMax = len; _streamAt = now; }
  }
  const grewWithin = (ms: number): boolean => _streamMax > 1 && Date.now() - _streamAt < ms;

  const WEDGE_MS = 10000;
  let _stopSince = 0;
  function genActive(): boolean {
    sampleStream();
    const now = Date.now();
    const stop = !!stopButton();
    const last = lastAssistant();
    const busyAttr = !!(last && safeRead(() => last.getAttribute("aria-busy"), null) === "true");
    if (stop || busyAttr) {
      if (!_stopSince) _stopSince = now;
      return (now - _streamAt < WEDGE_MS) || (now - _stopSince < 2000);
    }
    _stopSince = 0;
    return grewWithin(timings.GEN_IDLE_MS);
  }
  const isGenerating = genActive;
  const isBusyNow = genActive;
  const isHardGenerating = (): boolean => !!stopButton();

  const turnHalted = (): boolean => false;
  const findContinueBtn = (): Element | null => null;
  const clickContinueBtn = (): boolean => false;

  function snapshot(): object {
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

  function readAssistant(): AssistantRead {
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

  async function waitFor(pred: () => unknown, timeout: number): Promise<boolean> {
    const budget = waitBudget(timeout, 120), t0 = Date.now();
    for (let poll = 0; poll < budget.polls && Date.now() - t0 < budget.ms; poll++) {
      if (safePredicate(pred)) return true;
      await sleep(120);
    }
    return false;
  }

  // ── Input Lock, Draft & Sending ───────────────────────────────────────────
  let _locked = false;
  function setInputLock(on: boolean): void {
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
  function truncateForSend(text: string): string {
    if (typeof window.__rsLimitOutgoing === "function") return window.__rsLimitOutgoing(text);
    if (!text || text.length <= SEND_MAX) return text;
    const omitted = text.length - SEND_MAX;
    const marker = `\n\n[…PlazCode: result truncated to fit Grok's input budget - ${omitted} of ${text.length} characters omitted…]\n\n`;
    const budget = SEND_MAX - marker.length;
    const head = Math.floor(budget * 0.85);
    return text.slice(0, head) + marker + text.slice(text.length - (budget - head));
  }

  function setTextareaValue(el: HTMLTextAreaElement | HTMLInputElement, v: string): void {
    const proto = window.HTMLTextAreaElement && window.HTMLTextAreaElement.prototype;
    const setter = proto && Object.getOwnPropertyDescriptor(proto, "value");
    if (setter && setter.set) setter.set.call(el, v);
    else el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setRichText(el: HTMLElement, text: string): void {
    const tag = safeRead(() => el.tagName, "");
    if (tag === "TEXTAREA" || tag === "INPUT") {
      setTextareaValue(el as HTMLTextAreaElement, text);
      return;
    }
    el.focus();
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel!.removeAllRanges();
      sel!.addRange(range);
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

  async function writeDraft(value: unknown, expectedCurrent: unknown): Promise<{ ok: boolean; reason?: string }> {
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

  // ── Attachments ("+" menu & hidden file input / paste fallback) ───────────
  function fileFromImage(img: ImagePayload, i: number): File {
    if (typeof PlazCodeMedia !== "undefined") return PlazCodeMedia.fileFrom(img, i);
    const mime = img.mimeType || "image/png";
    const bin = atob(img.data);
    const arr = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j);
    return new File([arr], `plazcode_${Date.now()}_${i}.${mime.includes("png") ? "png" : "jpg"}`, { type: mime });
  }

  function hasPendingAttachment(): boolean {
    const scope = composerFrame() || document;
    for (const el of safeQueryAll(scope, S.attachPreview)) {
      if (!safeClosest(el, S.turn) && !safeClosest(el, "#rs-root") && visible(el)) return true;
    }
    return false;
  }

  function findAttachTrigger(): HTMLElement | null {
    const btns = composerButtons();
    return (
      btns.find((b) => /attach|add|upload|image|file/i.test(ariaOf(b))) ||
      btns.find((b) => (safeRead(() => b.textContent, "") || "").trim() === "+") ||
      safeQuery<HTMLElement>(document, S.attachBtn) ||
      null
    );
  }

  async function attachImages(images: ImagePayloadList): Promise<boolean> {
    if (!images || !images.length) return false;
    const dt = new DataTransfer();
    images.forEach((img, i) => { try { dt.items.add(fileFromImage(img, i)); } catch {} });
    if (!dt.items.length) return false;

    let fi = safeQueryAll<HTMLInputElement>(document, S.fileInput).find((i) => !safeClosest(i, "#rs-root")) || null;
    let opened: HTMLElement | null = null;
    if (!fi) {
      opened = findAttachTrigger();
      if (opened) {
        try { opened.click(); } catch {}
        await waitFor(() => !!safeQuery(document, S.fileInput), 1500);
        fi = safeQueryAll<HTMLInputElement>(document, S.fileInput).find((i) => !safeClosest(i, "#rs-root")) || null;
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
    const hasSpinner = (): boolean => {
      const box = composerFrame();
      return !!(box && safeQuery(box, spinnerSel));
    };
    await waitFor(hasSpinner, 1000);
    await waitFor(() => !hasSpinner(), 20000);
    return true;
  }

  function clearAttachments(): void {
    try {
      const scope = composerFrame() || document;
      safeQueryAll<HTMLElement>(scope, "[aria-label*='remove' i], [aria-label*='delete' i], [class*='remove' i]")
        .filter((b) => !safeClosest(b, "#rs-root") && !safeClosest(b, S.turn))
        .forEach((b) => { try { b.click(); } catch {} });
    } catch {}
  }

  async function typeAndSend(text: string, images?: ImagePayloadList): Promise<void> {
    const ed = getEditor();
    if (!ed) throw new Error("Grok chat box not found — open grok.com");
    const relock = _locked || safeRead(() => ed.getAttribute("contenteditable"), null) === "false" || safeRead(() => ed.hasAttribute("readonly"), false);
    text = truncateForSend(text);
    try {
      if (relock) setInputLock(false);
      ed.focus();
      if (editorText(ed).trim() !== String(text).trim()) setRichText(ed, text);
      if (images && images.length && !hasPendingAttachment()) {
        try { await attachImages(images); } catch {}
      }
      const sendReady = (): boolean => {
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
      diag("grok.send", { sent, editorLen: editorText().length });
    } finally {
      if (relock) setInputLock(true);
    }
  }

  function stopGeneration(): void {
    const b = stopButton();
    if (b) { try { b.click(); } catch {} }
  }

  // ── Mode, Auth & Errors ───────────────────────────────────────────────────
  function currentModeLabel(): string {
    for (const el of safeQueryAll<HTMLElement>(document, S.modeBtn)) {
      if (safeClosest(el, "#rs-root") || !visible(el)) continue;
      const t = (safeRead(() => el.innerText, "") || safeRead(() => el.textContent, "") || "").replace(/\s+/g, " ").trim();
      if (t && t.length < 40 && RE.modeLabel.test(t)) return t;
    }
    return "";
  }

  function loginGatePresent(): boolean {
    if (/^\/(?:sign-?in|login|auth)(\/|$)/i.test(location.pathname || "")) return true;
    return !getEditor() && !!safeQuery(document, 'a[href*="login"], a[href*="sign-in"], button[data-testid*="login" i]');
  }

  function modeWarning(): string {
    if (loginGatePresent()) return "<b>Sign in to Grok</b> at grok.com first, then press Start.";
    if (!getEditor()) return "Open a chat on <b>grok.com</b>, then press Start.";
    return "";
  }

  function scanError(): string | null {
    try {
      for (const el of safeQueryAll<HTMLElement>(document, S.errorSurfaces)) {
        if (!visible(el) || safeClosest(el, S.turn)) continue;
        const t = (safeRead(() => el.innerText, "") || "").trim();
        if (t.length > 8 && t.length < 600 && RE.contextLimit.test(t)) return t.slice(0, 240);
      }
    } catch {}
    if (!getEditor() && !loginGatePresent()) return "The input box disappeared (session ended?).";
    return null;
  }

  // ── Send Hooks & Tool Camouflage ──────────────────────────────────────────
  function installSendHooks(handlers: SendHooks): void {
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
      const ed = getEditor();
      if (!ed || !safeRead(() => ed.contains(e.target as Node), false) || editorText(ed).trim() === "") return;
      if ((handlers as any).onCoworkSend && (handlers as any).onCoworkSend(e)) return;
      if (handlers.isBlocked()) return;
      if (!handlers.isStarted()) {
        if (chatIsEmpty()) handlers.onBlockedAttempt();
        return;
      }
      handlers.onUserMessage(assistantCount());
    }, true);

    document.addEventListener("click", (e) => {
      if (!getEditor() || safeClosest(e.target, "#rs-root")) return;
      const btn = safeRead(() => (e.target as Element).closest, null) && (safeClosest(e.target, "button") as HTMLButtonElement | null);
      if (!btn) return;
      if (isStopBtn(btn)) {
        if (e.isTrusted !== false) handlers.onNativeStop();
        return;
      }
      const isSend = S.sendAria.test(ariaOf(btn)) || (safeRead(() => btn.type, "") === "submit" && !S.voiceAria.test(ariaOf(btn)));
      if (!isSend || safeRead(() => btn.disabled, false) || safeRead(() => btn.getAttribute("aria-disabled"), null) === "true") return;
      if ((handlers as any).onCoworkSend && (handlers as any).onCoworkSend(e)) return;
      if (handlers.isBlocked()) return;
      if (!handlers.isStarted()) {
        if (chatIsEmpty()) handlers.onBlockedAttempt();
        return;
      }
      handlers.onUserMessage(assistantCount());
    }, true);
  }

  const CMD_SHAPE = /"(?:command|tool)"\s*:\s*"|###\s*lua|###mcp_tool###/i;
  function findToolBlockSpot(item: Element | null): { parent: Element | null; ref: Element | null } | null {
    if (!item) return null;
    let spot: { parent: Element | null; ref: Element | null } | null = null;
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
    id: "grok",
    displayName: "Grok",
    supportsVision: true,
    timings,
    thinkingSel: S.thinking,
    chipAtItemLevel: true,
    chipAnchor: (item: Element) => item,
    reliableCounts: true,
    init({ diag: d } = {}) {
      if (d) diag = d;
      diag("grok.init", { mode: currentModeLabel(), editor: !!getEditor(), loginGate: loginGatePresent() });
    },
    allItems, isUserItem, isAssistantItem, itemText, classifyText,
    assistantCount, userCount, lastAssistant, lastAssistantId, itemKey, readAssistant, streamLen, snapshot,
    getEditor, editorText, chatIsEmpty, isFreshChat, composerFrame, barAnchor,
    setInputLock, writeDraft, typeAndSend, stopGeneration,
    isGenerating, isBusyNow, isHardGenerating,
    enforceComposer() { return { ready: !!getEditor() && !loginGatePresent(), mode: currentModeLabel() }; },
    async ensureComposerReady(reason?: string) {
      const mode = currentModeLabel();
      diag("grok.mode_ready", { reason, mode, editor: !!getEditor(), loginGate: loginGatePresent() });
      return { ready: !!getEditor() && !loginGatePresent() };
    },
    modeWarning, loginGatePresent,
    turnHalted, findContinueBtn, clickContinueBtn,
    scanError, isTooLongMsg: (t: string) => RE.tooLong.test(t), isBusyMsg: (t: string) => RE.busy.test(t),
    attachImages, clearAttachments, hasPendingAttachment, conversationKey,
    installSendHooks, findToolBlockSpot,
  };
})();
