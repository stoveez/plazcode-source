// SPDX-License-Identifier: GPL-3.0-or-later
// 1.24.21 vault memory: the extension side (start prompt, tool, fallback, learning switch, pictures, wiring).
const assert = require("assert");
const fs = require("fs");
const Memory = require("./core/memory.js");

(async () => {
  const calls = [];
  let learning = true, fail = false;
  const notes = [
    { path: "Lessons/Floating trees.md", type: "lesson", project: "Game A", updated: "2026-10-20", summary: "Anchor the base first." },
    { path: "Preferences/UI fonts.md", type: "preference", project: "", updated: "2026-10-19", summary: "Always GothamSSm." }
  ];
  const bridge = async (message) => {
    assert.strictEqual(message.type, "vault");
    const r = message.request; calls.push(r);
    if (fail) return { ok: false, error: "HTTP 404" };
    switch (r.action) {
      case "init": return { ok: true };
      case "index": return { ok: true, start: "# Start here\nThe user likes short answers.", notes, total: notes.length, learning };
      case "search": return { ok: true, count: 1, results: [{ path: notes[0].path, type: "lesson", updated: "2026-10-20", snippets: ["Anchor the base first."] }] };
      case "read": return { ok: true, text: "Body text", total_chars: 9, next_offset: null, links: ["04 Models And Styles/Low poly"] };
      case "write": return { ok: true, path: r.path.endsWith(".md") ? r.path : r.path + ".md", created: r.mode === "create", chars: String(r.content).length };
      case "read_image": return { ok: true, path: r.path, mimeType: "image/png", data: "QUJD" };
      case "add_image": return { ok: true, path: "08 References/refs/ref.png", linked_in: r.note || null };
      default: return { ok: true };
    }
  };

  // Before the vault is reachable: nothing is injected, the old memory prompt stays in charge.
  assert.strictEqual(Memory.vaultContext(false), "");
  assert.strictEqual(Memory.vaultActive(), false);

  // A failing or old app: no vault prompt, and no repeated hammering of the app.
  fail = true;
  assert.strictEqual(await Memory.vaultRefresh(bridge, "Game A"), null);
  assert.strictEqual(Memory.vaultContext(false), "");
  const failedCalls = calls.length;
  await Memory.vaultRefresh(bridge, "Game A");
  assert.strictEqual(calls.length, failedCalls, "a failed vault is not retried for a minute");
  fail = false;
  assert.strictEqual(typeof Memory.prompt, "function", "the classic memory prompt is still exported");
  assert(Memory.prompt({ automatic: true, entries: [{ id: 1, text: "Use Gotham", title: "Fonts", project: "" }], project_scope: "" }).includes("PLAZCODE PERSONAL MEMORY"));
})().then(async () => {
  // Fresh module state for the success path.
  delete require.cache[require.resolve("./core/memory.js")];
  const M = require("./core/memory.js");
  const calls = []; let learning = true;
  const notes = [
    { path: "Lessons/Floating trees.md", type: "lesson", project: "Game A", updated: "2026-10-20", summary: "Anchor the base first." },
    { path: "Preferences/UI fonts.md", type: "preference", project: "", updated: "2026-10-19", summary: "Always GothamSSm." }
  ];
  const bridge = async ({ type, request }) => {
    assert.strictEqual(type, "vault"); calls.push(request);
    if (request.action === "index") return { ok: true, start: "# Start here\nThe user likes short answers.", notes, total: 2, learning };
    if (request.action === "write") return { ok: true, path: "Lessons/X.md", created: request.mode === "create", chars: 5 };
    if (request.action === "read_image") return { ok: true, path: request.path, mimeType: "image/png", data: "QUJD" };
    if (request.action === "add_image") return { ok: true, path: "08 References/refs/ref.png", linked_in: request.note || null };
    if (request.action === "search") return { ok: true, count: 1, results: [{ path: notes[0].path, type: "lesson", updated: "2026-10-20", snippets: ["Anchor the base first."] }] };
    if (request.action === "read") return { ok: true, text: "Body text", total_chars: 9, next_offset: 4, links: ["A", "B"] };
    return { ok: true };
  };

  const state = await M.vaultRefresh(bridge, "Game A");
  assert(state && M.vaultActive());
  assert(calls.some((c) => c.action === "init"), "migration runs once");
  assert.deepStrictEqual(calls.filter((c) => c.action === "init").length, 1);
  await M.vaultRefresh(bridge, "Game A");
  assert.strictEqual(calls.filter((c) => c.action === "index").length, 1, "throttled: same project within 15 s reuses the index");

  const prompt = M.vaultContext(false);
  assert(prompt.includes("PLAZCODE VAULT") && prompt.includes("The user likes short answers.") && prompt.includes("Lessons/Floating trees.md"));
  assert(prompt.includes("LEARN AUTOMATICALLY") && !prompt.includes("LEARNING IS OFF"));
  assert(prompt.length < 9000, "the start prompt stays small (" + prompt.length + ")");
  assert(!prompt.includes("PLAZCODE PERSONAL MEMORY"));

  // Many notes never blow the budget.
  const many = Array.from({ length: 200 }, (_, i) => ({ path: "Lessons/Note " + i + ".md", type: "lesson", project: "", updated: "2026-10-20", summary: "x".repeat(200) }));
  const bigBridge = async ({ request }) => request.action === "index" ? { ok: true, start: "s".repeat(9000), notes: many, total: 200, learning: true } : { ok: true };
  delete require.cache[require.resolve("./core/memory.js")];
  const B = require("./core/memory.js"); await B.vaultRefresh(bigBridge, "");
  assert(B.vaultContext(false).length < 9500 && B.vaultContext(false).includes("+"), "200 long notes are cut to a short list with a count");
  assert(B.vaultContext(true).length < B.vaultContext(false).length && B.vaultContext(true).length < 4500, "compact sites get a smaller prompt (" + B.vaultContext(true).length + ")");

  // The tool.
  const imgs = []; const ctx = { project: "Game A", lastImage: () => ({ mimeType: "image/png", data: "TEFTVA==" }), attach: (p) => imgs.push(...p) };
  assert((await M.vaultTool({ action: "search", query: "trees" }, ctx)).includes("Lessons/Floating trees.md"));
  assert.strictEqual(calls.filter((c) => c.action === "search").pop().project, "Game A", "search defaults to the current project");
  const read = await M.vaultTool({ action: "read", path: "Lessons/Floating trees.md" }, ctx);
  assert(read.includes("Body text") && read.includes("offset 4") && read.includes("Links: A, B"));
  const wrote = await M.vaultTool({ action: "write", path: "Lessons/X", mode: "create", content: "hello", frontmatter: { type: "lesson" }, project_specific: true }, ctx);
  assert(wrote.includes("created") && calls.filter((c) => c.action === "write").pop().ai === true, "AI writes are flagged so the app can enforce the learning switch");
  assert.strictEqual(calls.filter((c) => c.action === "write").pop().frontmatter.project, "Game A", "project_specific notes get the current project");
  const attached = await M.vaultTool({ action: "read_image", paths: ["08 References/refs/ref.png"], with_last_screenshot: true }, ctx);
  assert(attached.includes("08 References/refs/ref.png") && attached.includes("latest-screenshot") && imgs.length === 2 && imgs[0].data === "QUJD");
  assert((await M.vaultTool({ action: "add_image", name: "Ref", from: "last_screenshot", note: "04 Models And Styles/Low poly" }, ctx)).includes("linked in 04 Models And Styles/Low poly"));
  assert.strictEqual(calls.filter((c) => c.action === "add_image").pop().data, "TEFTVA==", "the last screenshot is what gets stored");
  await assert.rejects(M.vaultTool({ action: "delete" }, ctx), /Use action/);
  await assert.rejects(M.vaultTool({ action: "add_image", from: "last_screenshot" }, { lastImage: () => null }), /no picture/);

  // Learning off: reading works, writing is refused before it reaches the app.
  learning = false; delete require.cache[require.resolve("./core/memory.js")];
  const L = require("./core/memory.js"); await L.vaultRefresh(bridge, "");
  assert(L.vaultContext(false).includes("LEARNING IS OFF") && !L.vaultContext(false).includes("LEARN AUTOMATICALLY"));
  assert((await L.vaultTool({ action: "search", query: "trees" }, ctx)).includes("Floating"));
  await assert.rejects(L.vaultTool({ action: "write", path: "Lessons/Y", content: "x", frontmatter: { type: "lesson" } }, ctx), /Learning is turned off/);
  await assert.rejects(L.vaultTool({ action: "archive", path: "Lessons/Y" }, ctx), /Learning is turned off/);


  // The desktop window has no extension bridge: it talks to its own app over the same origin.
  delete require.cache[require.resolve("./core/memory.js")];
  global.location = { hostname: "127.0.0.1" }; const sent = [];
  global.fetch = async (url, init) => { sent.push([url, JSON.parse(init.body)]); return { json: async () => ({ ok: true, path: "x", notes: 3, learning: true }) }; };
  const D = require("./core/memory.js");
  assert.strictEqual((await D.vaultCall({ action: "settings" })).notes, 3);
  assert.deepStrictEqual(sent[0], ["/api/vault", { action: "settings" }]);
  delete global.fetch; delete global.location;
  // Wiring: the tool exists everywhere it must, Read-only mode never blocks it, and the app route and bridge exist.
  const main = fs.readFileSync("core/main.js", "utf8"), background = fs.readFileSync("background.js", "utf8"), rust = fs.readFileSync("agent/src/main.rs", "utf8");
  assert(main.includes('"plazcode_vault"') && main.includes("name === \"plazcode_vault\"") && main.includes("name:'plazcode_vault'") && main.includes("plazcode_vault:"));
  assert(main.includes("PlazCodeMemory.vaultContext(") && main.includes("PlazCodeMemory.vaultRefresh(bg, currentProject)"));
  assert(/plazcode_memory\|plazcode_vault\|plazcode_skills/.test(main), "vault calls do not count as project work");
  assert(background.includes('case "vault"') && background.includes('"/api/vault"'));
  assert(rust.includes("mod vault;") && rust.includes('"/api/vault"'));
  const Safety = require("./core/safety.js");
  assert.strictEqual(Safety.isChange("plazcode_vault", "studio"), false, "vault writes are allowed in Read-only mode");
  assert.strictEqual(Safety.isChange("plazcode_vault", "local"), false);
  const settings = fs.readFileSync("core/memory.js", "utf8");
  assert(!settings.includes("the AI's brain"), "the old wording is gone");
  for (const key of ["Vault", "Open vault", "Open vault folder", "Open in Obsidian", "Use this folder", "notes in the vault", "Properties", "Move to archive", "Edit note", "Linked from"]) {
    assert(settings.includes(key.replace("'", "\\'")), "settings text present: " + key);
    const catalog = JSON.parse(fs.readFileSync("core/locales/de.json", "utf8")); assert(catalog[key], "translated: " + key);
  }
  console.log("vault memory (extension side) ok");
}).catch((error) => { console.error(error); process.exit(1); });
