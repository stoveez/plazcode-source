"use strict";
// Owner log 2026-11-14 (ChatGPT): a Start pressed in a NEW empty chat within 45 s of a Start in another empty chat was treated as a
// retry of the first delivery ("send.duplicateSuppressed"), nothing was sent and the start waited 80 s for a reply, then failed.
// Only a retry inside the SAME chat (its message is on the page) may be coalesced.
const fs = require("fs"), vm = require("vm"), assert = require("node:assert/strict"), { parse } = require("acorn");
const source = fs.readFileSync(__dirname + "/core/main.js", "utf8");
let text = null;
(function walk(n) { if (!n || typeof n !== "object") return; if (n.type === "FunctionDeclaration" && n.id.name === "submitCore") text = source.slice(n.start, n.end); for (const v of Object.values(n)) if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") walk(v); })(parse(source, { ecmaVersion: "latest" }));
assert(text, "submitCore found in core/main.js");
(async () => {
  function make() {
    let chatEmpty = true, key = "", delivered = 0;
    const box = { A: { sessionGen: 1, stop: false, starting: false, enhancing: false, pendingSubmit: null, confirmedSubmit: null }, SendAbortedError: class extends Error {},
      P: { id: "chatgpt", lastAssistantId: () => null, lastAssistant: () => null, conversationKey: () => key, chatIsEmpty: () => chatEmpty, isFreshChat: () => chatEmpty },
      RS: { SYS_MARKER: "⟦RS-SYS⟧" }, RSParse: { isInjectedFeedback: () => false }, rememberSession() {}, ui: { setStarted() {} }, activeEngine: () => "local", diag(n) { box.events.push(n); },
      events: [], Date, Promise, performSubmitCore: async () => { delivered++; return { base: "reply " + delivered }; } };
    vm.createContext(box); vm.runInContext(text + "\nthis.submitCore = submitCore;", box);
    return { box, delivered: () => delivered, setEmpty: (v) => { chatEmpty = v; }, setKey: (k) => { key = k; } };
  }
  const startup = "⟦RS-SYS⟧\nPlazCode is a browser extension running in this page";
  // Two Starts in two different fresh chats: both are delivered.
  const a = make();
  await a.box.submitCore(startup); assert.equal(a.delivered(), 1);
  a.setEmpty(true); a.setKey("");   // the person opened another new chat
  await a.box.submitCore(startup); assert.equal(a.delivered(), 2, "a Start in a new empty chat is sent, not swallowed");
  assert(!a.box.events.includes("send.duplicateSuppressed"));
  // A true retry in the same chat (its message is on the page now) is still coalesced.
  const b = make();
  await b.box.submitCore(startup); b.setEmpty(false);
  await b.box.submitCore(startup); assert.equal(b.delivered(), 1, "a retry of the same delivery in the same chat is still coalesced");
  assert(b.box.events.includes("send.duplicateSuppressed"));
  console.log("PASS duplicate-delivery check: a Start in a new empty chat is always sent; a retry inside the same chat is still coalesced.");
})().catch((e) => { console.error(e); process.exit(1); });
