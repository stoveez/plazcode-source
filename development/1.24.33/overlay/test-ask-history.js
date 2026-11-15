// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Ask PlazCode History (owner, 2026-11-14): every chat is kept, listed, reopened into the same AI chat, started fresh or deleted.
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const src = fs.readFileSync('background.js', 'utf8');
const askLine = src.match(/^const ask = \{.*\};$/m)[0];
const from = src.indexOf('const ASK_LOG_MAX'), to = src.indexOf('async function askShareTab');
assert(from > 0 && to > from && askLine);
const SITE = 'https://chat.deepseek.com/';
function world({ tabUrl = SITE, stored = {}, session = {} } = {}) {
  const calls = [], posts = [];
  const store = { local: JSON.parse(JSON.stringify(stored)), session: JSON.parse(JSON.stringify(session)) };
  const tabs = new Map(); if (tabUrl) tabs.set(5, { id: 5, windowId: 7, url: tabUrl });
  const area = (name) => ({ get: async (k) => (k in store[name] ? { [k]: store[name][k] } : {}), set: async (o) => { Object.assign(store[name], JSON.parse(JSON.stringify(o))); } });
  const ctx = vm.createContext({
    setTimeout, clearTimeout, URL, JSON, Date, Math, calls, posts, tabEngines: new Map(),
    criticTabReady: async () => true, helperPing: async () => ({ ok: true, ready: true }), criticSleep: async () => {},
    controlRefusal: () => null,
    chrome: {
      storage: { local: area('local'), session: area('session') },
      tabs: {
        get: async (id) => { if (!tabs.has(id)) throw new Error('gone'); return { ...tabs.get(id) }; },
        update: async (id, o) => { calls.push(['tabs.update', id, o.url]); tabs.get(id).url = o.url; return tabs.get(id); },
      },
      windows: {
        get: async () => ({ state: 'minimized' }), update: async (id, o) => { calls.push(['windows.update', id, o.state]); },
        create: async (o) => { calls.push(['windows.create', o.url]); tabs.set(9, { id: 9, windowId: 8, url: o.url }); return { id: 8, tabs: [{ id: 9 }] }; },
        remove: async () => {},
      },
    },
  });
  vm.runInContext(askLine + '\n' + src.slice(from, to) + '\naskPorts.add({ postMessage: (m) => posts.push(m) });', ctx);
  return { ctx, calls, posts, store, tabs, run: (code) => vm.runInContext(code, ctx) };
}
const J = (x) => JSON.parse(JSON.stringify(x));
const wait = (ms = 450) => new Promise((r) => setTimeout(r, ms));
(async () => {
  // 1. A chat is kept once there is a question; its title is the first question.
  const w = world(); w.run('ask.tabId = 5; ask.windowId = 7');
  w.run('askRemember({ t: "me", text: "What is on this page?\\n  Tell me." })'); w.run('askRemember({ t: "ai", text: "A shop." })');
  w.run('ask.chatUrl = "https://chat.deepseek.com/a/chat/s/one"; askRemember({ t: "me", text: "And the price?" })');
  await wait();
  let list = J(w.store.local.rsAskChats);
  assert.equal(list.length, 1); assert.equal(list[0].title, 'What is on this page? Tell me.'); assert.equal(list[0].log.length, 3);
  assert.equal(list[0].url, 'https://chat.deepseek.com/a/chat/s/one');
  // A note alone (no question) is not a chat.
  const empty = world(); empty.run('askRemember({ t: "note", text: "Opening" })'); await wait();
  assert.equal(empty.store.local.rsAskChats, undefined, 'no question, nothing kept');
  // 2. New chat keeps the old one, empties the panel and sends the next question to a fresh AI chat.
  const firstId = w.run('ask.chatId');
  await w.run('askNewChat()');
  assert.equal(w.run('ask.chatId'), null); assert.equal(w.run('ask.log.length'), 0); assert.equal(w.run('ask.goto'), 'new');
  assert(w.posts.some((m) => m.type === 'ask-history' && m.items.length === 0), 'panel is emptied');
  w.run('askRemember({ t: "me", text: "Second chat" })'); await wait();
  list = J(w.store.local.rsAskChats); assert.equal(list.length, 2); assert.equal(list[0].title, 'Second chat'); assert.equal(list[1].id, firstId);
  // The list the panel gets: newest first, current marked.
  const shown = J(await w.run('askChatsList()'));
  assert.equal(shown.type, 'ask-chats'); assert.equal(shown.items.length, 2); assert.equal(shown.current, w.run('ask.chatId')); assert(!('log' in shown.items[0]));
  // 3. Opening an old chat shows its conversation again; the next question moves the background chat to that AI chat.
  w.calls.length = 0; w.posts.length = 0;
  await w.run('askOpenChat(' + JSON.stringify(firstId) + ')');
  assert.equal(w.run('ask.log.length'), 3); assert.equal(w.run('ask.chatId'), firstId);
  assert.equal(J(w.posts.find((m) => m.type === 'ask-history').items).length, 3);
  assert.deepEqual(J(await w.run('askEnsure()')), { ok: true });
  assert.deepEqual(w.calls.filter((c) => c[0] === 'tabs.update'), [['tabs.update', 5, 'https://chat.deepseek.com/a/chat/s/one']]);
  assert.equal(w.run('ask.goto'), null);
  // Already in that chat: no reload.
  w.calls.length = 0; await w.run('askEnsure()'); assert.equal(w.calls.length, 0);
  // Back to a new chat: the AI site's start page.
  await w.run('askNewChat()'); await w.run('askEnsure()');
  assert.deepEqual(w.calls.filter((c) => c[0] === 'tabs.update'), [['tabs.update', 5, SITE]]);
  // 4. The background window is gone: the same chat opens again in a new window, not a new conversation.
  const g = world({ tabUrl: null });
  g.run('askRemember({ t: "me", text: "hi" }); ask.chatUrl = "https://chat.deepseek.com/a/chat/s/two"; ask.tabId = null');
  await g.run('askEnsure()');
  assert.deepEqual(g.calls.filter((c) => c[0] === 'windows.create'), [['windows.create', 'https://chat.deepseek.com/a/chat/s/two']]);
  // A saved address from another site is never used (the Ask site was changed).
  const h = world({ tabUrl: null });
  h.run('askRemember({ t: "me", text: "hi" }); ask.chatUrl = "https://example.com/c/1"; ask.tabId = null');
  await h.run('askEnsure()'); assert.deepEqual(h.calls.filter((c) => c[0] === 'windows.create'), [['windows.create', SITE]]);
  // 5. The address of the AI chat is noted after an answer, but not the start page or a sign-in page.
  const n = world({ tabUrl: 'https://chat.deepseek.com/a/chat/s/abc?x=1' });
  n.run('ask.tabId = 5'); await n.run('askNoteChatUrl()'); assert.equal(n.run('ask.chatUrl'), 'https://chat.deepseek.com/a/chat/s/abc?x=1');
  const n2 = world({ tabUrl: SITE }); n2.run('ask.tabId = 5'); await n2.run('askNoteChatUrl()'); assert.equal(n2.run('ask.chatUrl'), '');
  const n3 = world({ tabUrl: 'https://chat.deepseek.com/sign_in' }); n3.run('ask.tabId = 5'); await n3.run('askNoteChatUrl()'); assert.equal(n3.run('ask.chatUrl'), '');
  // 6. While PlazCode is answering, the chat cannot be switched, started over or the current chat deleted.
  const b = world(); b.run('askRemember({ t: "me", text: "busy one" }); ask.busy = true'); await wait();
  const busyId = b.run('ask.chatId');
  await b.run('askNewChat()'); await b.run('askOpenChat("nope")'); await b.run('askDeleteChat(' + JSON.stringify(busyId) + ')');
  assert.equal(b.run('ask.chatId'), busyId); assert.equal(b.run('ask.log.length'), 1); assert.equal(J(b.store.local.rsAskChats).length, 1);
  // 7. Deleting: another chat is just removed; the current one also empties the panel and does not come back.
  w.run('ask.busy = false');
  await w.run('askOpenChat(' + JSON.stringify(firstId) + ')');
  const other = J(w.store.local.rsAskChats).find((c) => c.id !== firstId).id;
  const afterOther = J(await (async () => { await w.run('askDeleteChat(' + JSON.stringify(other) + ')'); return w.run('askChatsList()'); })());
  assert.deepEqual(afterOther.items.map((c) => c.id), [firstId]); assert.equal(w.run('ask.chatId'), firstId);
  await w.run('askDeleteChat(' + JSON.stringify(firstId) + ')'); await wait();
  assert.equal(w.run('ask.chatId'), null); assert.equal(w.run('ask.log.length'), 0); assert.deepEqual(J(w.store.local.rsAskChats), []);
  assert.deepEqual(J((await w.run('askChatsList()')).items), []);
  // 8. The list never grows past its cap, and very long answers are cut when kept.
  const big = world();
  for (let i = 0; i < 45; i++) { big.run('askReset(); askRemember({ t: "me", text: "chat ' + i + '" })'); await big.run('askArchiveNow()'); }
  list = J(big.store.local.rsAskChats); assert.equal(list.length, 40); assert.equal(list[0].title, 'chat 44');
  const long = world(); long.run('askRemember({ t: "me", text: "q" }); askRemember({ t: "ai", text: "x".repeat(50000) })'); await long.run('askArchiveNow()');
  assert.equal(J(long.store.local.rsAskChats)[0].log[1].text.length, 30000); assert.equal(long.run('ask.log[1].text.length'), 50000, 'the live chat is untouched');
  // 9. Survives the worker sleeping: the session copy brings the chat identity back; a stored goto is kept.
  const s1 = world(); s1.run('askRemember({ t: "me", text: "keep" }); ask.chatUrl = "https://chat.deepseek.com/a/chat/s/zzz"; ask.goto = "new"; askSave()'); await wait(350);
  const s2 = world({ session: s1.store.session, tabUrl: null }); await s2.run('askRestored');
  assert.equal(s2.run('ask.chatId'), s1.run('ask.chatId')); assert.equal(s2.run('ask.chatUrl'), 'https://chat.deepseek.com/a/chat/s/zzz'); assert.equal(s2.run('ask.goto'), 'new'); assert.equal(s2.run('ask.log.length'), 1);
  console.log('PASS Ask PlazCode history: kept, listed, reopened into the same AI chat, new chat, delete, busy guard, caps, restart.');
})().catch((e) => { console.error(e); process.exit(1); });
