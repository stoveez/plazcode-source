// Every site (owner, 2026-10-25): an empty reply box is not proof a message went out. Seen on Claude: the text never got
// into the box, nothing was sent, PlazCode took the empty box as "sent" and the run waited a minute and paused.
// On sites that count messages reliably, PlazCode now waits briefly for real proof (a new message, our text in the last
// message, or the AI answering); without it, it types the message once more, and if that fails too it says so at once.
// performSubmitCore from core/main.js runs here for real with small stand-ins for the page.
const fs = require("fs"), vm = require("vm"), assert = require("node:assert/strict");
const main = fs.readFileSync("core/main.js", "utf8");
const slice = (from, to) => { const a = main.indexOf(from), b = main.indexOf(to, a); assert(a > 0 && b > a, "found " + from); return main.slice(a, b); };
const submitSrc = slice("  async function performSubmitCore(", "\n  }\n") + "\n  }\n";
const proofSrc = slice("  function sendLandedProof(tail) {", "\n  }\n") + "\n  }\n";

function run({ reliable = true, loseFirst = 0 } = {}) {
  const events = [], banners = [];
  let users = 1, assistants = 1, box = "", typed = 0;
  const lastUser = { textContent: "Earlier message" };
  const P = {
    id: "site", displayName: "Site", reliableCounts: reliable,
    isBusyNow: () => false, conversationKey: () => "/c/x", editorText: () => box, lastAssistant: () => null, streamLen: () => 0,
    turnComplete: () => true, isGenerating: () => false, isHardGenerating: () => false,
    userCount: () => users, assistantCount: () => assistants,
    allItems: () => [lastUser], isUserItem: () => true,
    typeAndSend: async (text) => { typed++; if (typed <= loseFirst) { box = ""; return; } users++; lastUser.textContent = text; box = ""; },
  };
  class SendAbortedError extends Error {}
  const env = {
    P, A: { sessionGen: 1, stop: false }, SendAbortedError, document: { hidden: false }, bgMode: true,
    diag: (e) => events.push(e), captureSendToken() {}, scheduleSweep() {}, setTimeout: () => 0,
    ui: { captureCoworkFocus() {}, inputCover() {}, banner: (_k, title) => banners.push(title), toast() {}, renderCowork() {}, restoreCoworkFocus() {} },
    cowork: { snapshot: () => ({ enabled: false, pending: [] }) },
    sleep: async () => {}, waitFor: async (fn) => { for (let i = 0; i < 3; i++) { if (fn()) return true; await null; } return !!fn(); },
    waitCommandCooldown: async () => {}, jitterBeforeSend: async () => {}, armUrlGuard() {}, waitVisible: async () => true,
    window: {}, String, Date, Math, JSON, Error, Promise,
  };
  vm.createContext(env);
  vm.runInContext(proofSrc + submitSrc + ";this.submit=performSubmitCore;", env);
  return { env, events, banners, typedCount: () => typed, usersNow: () => users };
}

(async () => {
  const result = "Output of 'read_file':\nrun.bat  (2 lines, 39 B)\n    1 | @echo off";
  // 1. Normal send: one try, no extra check needed.
  let t = run();
  await t.env.submit(result);
  assert.equal(t.typedCount(), 1); assert(!t.events.includes("send.notLanded"));

  // 2. The text was lost once (empty box, nothing in the chat): typed again, and it went out.
  t = run({ loseFirst: 1 });
  await t.env.submit(result);
  assert.equal(t.typedCount(), 2, "typed once more");
  assert(t.events.includes("send.notLanded"), "the lost send is logged");
  assert.equal(t.usersNow(), 2, "exactly one message reached the chat");
  assert.equal(t.banners.length, 0);

  // 3. Lost both times: an immediate "Message didn't send" notice instead of a silent minute-long wait.
  t = run({ loseFirst: 5 });
  await assert.rejects(t.env.submit(result), /send did not land/);
  assert.equal(t.typedCount(), 2, "never more than two tries");
  assert.deepEqual(t.banners, ["Message didn't send"]);

  // 4. Sites without reliable message counts keep the old behaviour (no extra try, so never a double message).
  t = run({ reliable: false, loseFirst: 1 });
  await t.env.submit(result);
  assert.equal(t.typedCount(), 1); assert(!t.events.includes("send.notLanded"));

  console.log("Send check: a lost result is typed again once on every site with reliable counts; two losses show a notice at once.");
})().catch((e) => { console.error(e); process.exit(1); });
