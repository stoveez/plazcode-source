"use strict";
// Owner (2026-11-18): "if you're using Gemini and press Ask PlazCode, that should be powered by and open the Gemini chat you're
// CURRENTLY USING, not a DeepSeek one". Ask PlazCode uses the AI chat tab the person last used (opening the panel from a chat counts),
// never minimises, moves or closes it, and opens a background chat only when no AI chat tab is open. Run: node test-ask-own-chat.js
const fs = require("fs"), vm = require("vm"), assert = require("node:assert/strict");
const src = fs.readFileSync(__dirname + "/background.js", "utf8");
const from = src.indexOf("const ASK_DEFAULT_SITE"), to = src.indexOf("async function askShareTab");
assert(from > 0 && to > from);
function make(tabs) {
  const log = [];
  const ctx = vm.createContext({
    URL, setTimeout, console, ask: { own: false, tabId: null, windowId: null, busy: false, goto: null, chatUrl: "" }, askSave() {}, askSay() {}, askPost() {}, tabEngines: new Map(),
    criticTabReady: async () => true, helperPing: async () => true, criticSleep: async () => {},
    chrome: {
      storage: { local: { get: async () => ({}), set: async () => {} }, session: { set: async () => {} } },
      tabs: { get: async (id) => { if (!tabs[id]) throw new Error("gone"); return { ...tabs[id] }; }, update: async (id, o) => { log.push(["tabs.update", id, o.url]); tabs[id].url = o.url; } },
      windows: { create: async (o) => { log.push(["windows.create", o.url]); tabs[99] = { id: 99, windowId: 98, url: o.url }; return { id: 98, tabs: [{ id: 99 }] }; },
        update: async (id, o) => { log.push(["windows.update", id, o.state]); }, get: async () => ({ state: "minimized" }), remove: async (id) => { log.push(["windows.remove", id]); } },
    },
  });
  vm.runInContext(fs.readFileSync(__dirname + "/core/ask-site.js", "utf8"), ctx);
  vm.runInContext(src.slice(from, to) + ";this.note = (tab) => askNoteSite({ tab }); this.ensure = () => askEnsure();", ctx);
  return { ctx, log, tabs };
}
(async () => {
  // The person is using a Gemini chat: Ask PlazCode uses that very tab.
  let t = make({ 11: { id: 11, windowId: 1, active: true, url: "https://gemini.google.com/app/abc123" } });
  t.ctx.note(t.tabs[11]);
  assert.equal((await t.ctx.ensure()).ok, true);
  assert.equal(t.ctx.ask.tabId, 11, "the Gemini chat the person is using");
  assert.equal(t.ctx.ask.own, true);
  assert.deepEqual(JSON.parse(JSON.stringify(t.log)), [], "no new window, nothing minimised, moved, closed or navigated");
  // They switch to a Claude chat and use PlazCode there: Ask PlazCode follows.
  t.tabs[12] = { id: 12, windowId: 1, active: true, url: "https://claude.ai/chat/9" };
  t.ctx.note(t.tabs[12]);
  await t.ctx.ensure();
  assert.equal(t.ctx.ask.tabId, 12, "follows the chat used last");
  // A background AI tab checking its status does not take over.
  t.ctx.note({ id: 13, windowId: 2, active: false, url: "https://chatgpt.com/c/1" });
  t.tabs[13] = { id: 13, windowId: 2, active: false, url: "https://chatgpt.com/c/1" };
  await t.ctx.ensure();
  assert.equal(t.ctx.ask.tabId, 12, "a tab in the background is not the chat being used");
  // That chat is closed and no other AI chat is open: only then a background chat, on the site last used.
  delete t.tabs[12]; delete t.tabs[11]; delete t.tabs[13];
  assert.equal((await t.ctx.ensure()).ok, true);
  assert.equal(t.ctx.ask.own, false);
  assert.deepEqual(JSON.parse(JSON.stringify(t.log[0])), ["windows.create", "https://claude.ai/new"], "a new chat on the site last used, not DeepSeek");
  // "New chat" in the History list takes the person's own tab to a new chat on the same site.
  t = make({ 21: { id: 21, windowId: 1, active: true, url: "https://gemini.google.com/app/abc123" } });
  t.ctx.note(t.tabs[21]); t.ctx.ask.goto = "new";
  await t.ctx.ensure();
  assert.deepEqual(JSON.parse(JSON.stringify(t.log)), [["tabs.update", 21, "https://gemini.google.com/app"]]);
  // Opening the panel from a chat binds Ask PlazCode to that chat (background.js "ask_open").
  assert(/case "ask_open":[\s\S]{0,400}askUseOwn\(opener\)/.test(src), "the panel opened from a chat uses that chat");
  console.log("PASS Ask PlazCode uses the AI chat the person is using (follows it, ignores background tabs, never hides it); a background chat only when none is open.");
})().catch((e) => { console.error(e); process.exit(1); });
