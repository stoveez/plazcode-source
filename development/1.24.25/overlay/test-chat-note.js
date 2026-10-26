// SPDX-License-Identifier: GPL-3.0-or-later
// 1.24.21: every chat is saved into the vault as a note under "11 Chats", written by PlazCode itself (not the AI).
const assert = require("assert");
const R = require("./core/reliability.js");
globalThis.PlazCodeReliability = R;
const Memory = require("./core/memory.js");

(async () => {
  const rows = [
    { role: "user", text: "⟦RS-SYS⟧ startup text" },
    { role: "assistant", text: "PlazCode is ready." },
    { role: "user", text: "Build a round system for my obby. api_key: abcdefgh12345678" },
    { role: "assistant", text: '{"command":"execute_luau","code":"x"}' },
    { role: "user", text: "Output of 'execute_luau': ok" },
    { role: "user", text: "Output of 'execute_luau': ok" },
    { role: "assistant", text: "Done. Added RoundService and a lobby." },
    { role: "user", text: "Now add a shop." },
  ];
  // 1. The note: summary, key points, and a section titled exactly "Current tasks:".
  const n = R.chatNote({ provider: "ChatGPT", chatId: "chatgpt|/c/abc", rows, plan: { items: [{ label: "Build rounds", status: "completed" }, { label: "Add shop", status: "in_progress" }, { label: "Test it", status: "pending" }] }, times: { "Build rounds": { started: 1e12, finished: 1e12 + 60000 }, "Add shop": { started: 1e12 + 70000 } }, startedAt: 1e12, now: 1e12 + 90000 });
  assert(/^## Summary$/m.test(n.content) && /^## Key points$/m.test(n.content) && /^## Current tasks:$/m.test(n.content), "three sections, tasks titled 'Current tasks:'");
  assert(!/## Now/.test(n.content), "not called Now");
  assert(/^- \[x\] Build rounds \(started \d\d:\d\d, done \d\d:\d\d\)$/m.test(n.content) && /^- \[\/\] Add shop \(started \d\d:\d\d\)$/m.test(n.content) && /^- \[ \] Test it$/m.test(n.content), "done, in progress and pending tasks");
  assert(/Latest request: Now add a shop/.test(n.content) && /Latest reply: Done\. Added RoundService/.test(n.content), "summary has latest request and reply; command JSON skipped");
  assert(/Commands run: execute_luau ×2/.test(n.content), "tool counts");
  assert(!/abcdefgh12345678|api_key/i.test(n.content + n.title), "secrets are redacted");
  assert(!/startup text/.test(n.content), "startup turns are not requests");
  assert.deepStrictEqual(n.frontmatter.tags, ["chat", "previous-chat"]);
  assert.strictEqual(n.frontmatter.origin, "previous-chat");
  assert(Object.keys(n.frontmatter).length <= 14 && Object.values(n.frontmatter).every(v => String(v).length <= 400), "within the vault header limits");
  assert(n.content.length <= 6000);
  // 2. Path: top-level "11 Chats", safe characters only.
  const path = R.chatNotePath({ provider: "ChatGPT", startedAt: 1e12, title: n.title });
  assert(/^11 Chats\/\d{4}-\d\d-\d\d \d{4} ChatGPT [A-Za-z0-9-]+\.md$/.test(path), path);
  assert(R.isChatNotePath(path) && !R.isChatNotePath("05 Projects/x.md"));
  // 3. An empty plan and a long task list stay valid.
  assert(/- \(No tasks yet\.\)/.test(R.tasksSection([])));
  assert(R.tasksSection(Array.from({ length: 40 }, (_, i) => ({ label: "t" + i, status: "pending" }))).split("\n").length === 21, "capped at 20 tasks");
  // 4. Times: start recorded once, finish recorded once.
  const times = {}; R.trackTimes(times, [{ label: "a", status: "in_progress" }], 100); R.trackTimes(times, [{ label: "a", status: "completed" }], 200); R.trackTimes(times, [{ label: "a", status: "completed" }], 300);
  assert.deepStrictEqual(times.a, { started: 100, finished: 200 });
  // 5. Writer: first call creates, later calls replace, unchanged content is skipped, errors fall back.
  const calls = []; const store = new Map();
  const bridge = async ({ request }) => {
    if (request.action === "init") return { ok: true };
    if (request.action === "index") return { ok: true, start: "# Home", notes: [{ path: "11 Chats/old.md" }, { path: "05 Projects/a.md" }], total: 2, learning: false };
    if (request.action === "graph") return { ok: true, total: 3, nodes: [{ path: "00 Start Here/Home.md", title: "Home", dir: "00 Start Here" }, { path: "11 Chats/old.md", title: "old", dir: "11 Chats" }, { path: "05 Projects/a.md", title: "a", dir: "05 Projects" }], edges: [[0, 1], [0, 2], [1, 2]] };
    if (request.action === "write") {
      calls.push(request.mode); const had = store.has(request.path);
      if (request.mode === "create" && had) throw new Error("That note already exists. Use mode append, replace or section");
      if (request.mode === "replace" && !had) throw new Error("That note does not exist yet. Use mode create.");
      store.set(request.path, request); return { ok: true, path: request.path };
    }
    throw new Error("unexpected " + request.action);
  };
  await Memory.vaultRefresh(bridge, "p");
  let state = null; const input = { provider: "ChatGPT", chatId: "c1", rows, plan: { items: [{ label: "Add shop", status: "in_progress" }] } };
  state = await Memory.chatNoteSave(state, input, 1e12);
  state = await Memory.chatNoteSave(state, input, 1e12 + 5000);
  assert.deepStrictEqual(calls, ["create"], "second identical save is skipped");
  state = await Memory.chatNoteSave(state, { ...input, plan: { items: [{ label: "Add shop", status: "completed" }] } }, 1e12 + 9000);
  assert.deepStrictEqual(calls, ["create", "replace"], "a changed note replaces the first one");
  assert.strictEqual(store.size, 1);
  const again = await Memory.chatNoteSave({ path: state.path, startedAt: state.startedAt }, input, 1e12 + 20000); // reload: path known, note exists
  assert.deepStrictEqual(calls.slice(2), ["create", "replace"], "'already exists' falls back to replace"); assert(again.created);
  // 6. Chat notes stay out of the AI's startup list and brain map.
  const ctx = Memory.vaultContext(false);
  assert(!/11 Chats/.test(ctx), "startup text does not list chat notes");
  assert(/BRAIN MAP \(2 notes, 1 links\)/.test(ctx), ctx.match(/BRAIN MAP[^.]*/)[0]);
  // 7. Latest chat note, never the chat we are continuing from.
  const reads = [];
  Memory.vaultCall; // exercised through the bridge below
  const bridge2 = async ({ request }) => {
    if (request.action === "search") return { ok: true, results: [{ path: "11 Chats/2026-10-01 0900 ChatGPT old.md" }, { path: "11 Chats/2026-10-24 2200 Claude newer.md" }, { path: "05 Projects/x.md" }] };
    if (request.action === "read") { reads.push(request.path); return { ok: true, text: "note text" }; }
    return { ok: true, start: "", notes: [], total: 0, learning: true };
  };
  await Memory.vaultRefresh(bridge2, "p9");
  const latest = await Memory.chatNoteLatest("", "");
  assert.strictEqual(latest.path, "11 Chats/2026-10-24 2200 Claude newer.md");
  const other = await Memory.chatNoteLatest("", "11 Chats/2026-10-24 2200 Claude newer.md");
  assert.strictEqual(other.path, "11 Chats/2026-10-01 0900 ChatGPT old.md");
  const pointer = await Memory.chatNoteLatest("11 Chats/pointer.md", "");
  assert.strictEqual(pointer.path, "11 Chats/pointer.md");
  console.log("Chat notes: summary, key points, Current tasks section, secrets redacted, create/replace writer, hidden from the startup map, latest-note lookup.");
})().catch(e => { console.error(e); process.exit(1); });
