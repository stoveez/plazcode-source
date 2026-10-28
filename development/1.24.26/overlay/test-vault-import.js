// Folder import: what is skipped, where notes go, same names, secrets, limits, the report, and the import page.
const fs = require("node:fs"), assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const Imp = require("./core/vault-import.js"), Rel = require("./core/reliability.js");
const f = (path, text, size) => ({ path, size: size === undefined ? (text == null ? 10 : text.length) : size, text });

// ── planning ──
let plan = Imp.plan([
  f("My Notes/Home.md", "# Home\nHello"),
  f("My Notes/Lessons/Lua tips.md", "---\ntags: [lua]\n---\nUse task.wait"),
  f("My Notes/.obsidian/app.json", "{}"), f("My Notes/.git/config", "x"), f("My Notes/.hidden.md", "secret-free"),
  f("My Notes/node_modules/x/readme.md", "x"),
  f("My Notes/pic.png", null), f("My Notes/files/doc.pdf", null),
  f("My Notes/empty.md", "  \n "), f("My Notes/Big.md", "x".repeat(60001)), f("My Notes/Huge.md", "x", 400000),
  f("My Notes/keys.md", "my key is sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"),
  f("My Notes/CON.md", "reserved name"), f("My Notes/bad:name?.md", "chars"),
  f("My Notes/Dup.md", "one"), f("My Notes/dup.MD", "two"),
], { redact: Rel.redact });
assert.equal(plan.folder, "My Notes"); assert.equal(plan.prefix, "10 Inbox/Imported My Notes/");
const dests = plan.notes.map((n) => n.dest);
assert(dests.includes("10 Inbox/Imported My Notes/Home.md"));
assert(dests.includes("10 Inbox/Imported My Notes/Lessons/Lua tips.md"), "subfolders are kept");
assert(dests.includes("10 Inbox/Imported My Notes/_CON.md"), "a Windows-reserved name is made safe");
assert(dests.includes("10 Inbox/Imported My Notes/bad-name-.md"), "illegal characters are replaced");
const reasons = Imp.counts(plan.skipped);
assert.equal(reasons.hidden, 4, ".obsidian, .git, a dot-file and node_modules are skipped");
assert.equal(reasons.picture, 1); assert.equal(reasons["not-note"], 1); assert.equal(reasons.empty, 1);
assert.equal(reasons["too-long"], 2, "over 60,000 characters or over the size limit");
assert.equal(reasons.secret, 1, "a note with a key inside is skipped");
assert.equal(reasons["same-name"], 1, "the second Dup note is skipped");
assert.equal(plan.notes.find((n) => n.dest.endsWith("Lua tips.md")).text, "---\ntags: [lua]\n---\nUse task.wait", "text is kept exactly");
assert.equal(plan.notes.some((n) => /secret|keys/.test(n.dest)), false);
// 300 note limit
const many = Array.from({ length: 305 }, (_, i) => f("Big/n" + i + ".md", "note " + i));
plan = Imp.plan(many, { redact: Rel.redact }); assert.equal(plan.notes.length, 300); assert.equal(Imp.counts(plan.skipped)["over-limit"], 5);
// a path that is too long is refused, never silently cut
plan = Imp.plan([f("F/" + "a".repeat(100) + "/" + "b".repeat(100) + "/" + "c".repeat(60) + ".md", "x")], {}); assert.equal(Imp.counts(plan.skipped)["bad-name"], 1);
// a throwing secret check fails closed
assert.equal(Imp.plan([f("F/a.md", "x")], { redact() { throw new Error("x"); } }).notes.length, 0);

// ── running against a fake vault ──
function fakeVault(existing = [], failSave = []) {
  const notes = new Map(existing.map((p) => [p, "old"])); const calls = [];
  const call = async (req) => {
    calls.push(req);
    if (req.action === "write" && req.mode === "create") { if (notes.has(req.path)) throw new Error("That note already exists."); notes.set(req.path, req.content); return { ok: true }; }
    if (req.action === "save_raw") { if (failSave.includes(req.path)) throw new Error("A note cannot hold a secret."); if (!notes.has(req.path)) throw new Error("That note does not exist."); notes.set(req.path, req.text); return { ok: true }; }
    if (req.action === "write" && req.mode === "replace") { notes.set(req.path, req.content); return { ok: true }; }
    throw new Error("unexpected " + req.action);
  };
  return { notes, calls, call };
}
(async () => {
  const p2 = Imp.plan([f("F/a.md", "alpha"), f("F/b.md", "beta"), f("F/c.md", "gamma")], {});
  let v = fakeVault(["10 Inbox/Imported F/b.md"], ["10 Inbox/Imported F/c.md"]);
  const seen = []; const result = await Imp.run(p2, v.call, { progress: (i, n) => seen.push(i + "/" + n) });
  assert.deepEqual(result.imported, ["10 Inbox/Imported F/a.md"]); assert.equal(v.notes.get("10 Inbox/Imported F/a.md"), "alpha", "the exact text is stored");
  assert.deepEqual(result.skipped, [{ rel: "F/b.md", reason: "same-name" }]); assert.equal(v.notes.get("10 Inbox/Imported F/b.md"), "old", "an existing note is never overwritten");
  assert.equal(result.failed.length, 1); assert.match(v.notes.get("10 Inbox/Imported F/c.md"), /could not be imported/, "no half-written stub is left");
  assert.deepEqual(seen, ["1/3", "2/3", "3/3"]);
  assert(!v.calls.some((c) => c.ai === true), "imports are written as the person's own notes, not as the AI's");
  assert(!v.calls.some((c) => /delete|archive/.test(c.action)));
  // stop midway
  const ctl = new AbortController(); v = fakeVault(); const r3 = await Imp.run(p2, v.call, { signal: ctl.signal, progress: (i) => { if (i === 1) ctl.abort(); } });
  assert.equal(r3.imported.length, 1);
  // report: names only, never contents
  const body = Imp.report(Imp.plan([f("F/a.md", "alpha"), f("F/.git/x", "t"), f("F/k.md", "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG")], { redact: Rel.redact }), { imported: ["x"], skipped: [], failed: [] }, "2026-10-24");
  assert(/Imported 1 note from "F" on 2026-10-24/.test(body)); assert(/look like they contain a password/.test(body)); assert(/- F\/k\.md/.test(body)); assert(!/sk-ant/.test(body), "secrets never reach the report");
  assert(/Hidden or system folders/.test(body) && /not listed/.test(body));

  // ── the page ──
  const html = fs.readFileSync("core/vault-import.html", "utf8");
  const dom = new JSDOM(html.replace(/<script src[^>]*><\/script>/g, ""), { runScripts: "dangerously" });
  const w = dom.window, store = {}; const sent = []; const vault = fakeVault();
  w.chrome = { runtime: { lastError: null, sendMessage(msg, cb) { sent.push(msg); (async () => { try { if (msg.request.action === "settings") cb({ ok: true, custom: false, path: "C:/v" }); else cb({ ok: true, ...(await vault.call(msg.request)) }); } catch (e) { cb({ ok: false, error: e.message }); } })(); } }, storage: { local: { get(k, cb) { cb({ rsActiveVault: { name: "Game notes" } }); } } } };
  for (const file of ["core/reliability.js", "core/vault-import.js", "core/vault-import-page.js"]) { const s = w.document.createElement("script"); s.textContent = fs.readFileSync(file, "utf8"); w.document.body.appendChild(s); }
  const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
  await tick();
  assert.equal(w.document.getElementById("vault").textContent, "Game notes");
  const mk = (path, text) => { const file = new w.File([text], path.split("/").pop()); Object.defineProperty(file, "webkitRelativePath", { value: path }); return file; };
  await w.__vaultImport.pick([mk("Vault/Home.md", "# Home"), mk("Vault/<img src=x onerror=alert(1)>.md", "weird name"), mk("Vault/.obsidian/x.json", "{}"), mk("Vault/pic.png", "png")]);
  const box = w.document.getElementById("preview");
  assert.equal(box.hidden, false); assert(/Folder: Vault/.test(box.textContent)); assert.equal(box.querySelector("img"), null, "file names are shown as text");
  assert.equal(w.document.getElementById("go").textContent, "Import 2 notes");
  w.document.getElementById("go").click(); await tick(150);
  assert(/Done\. 2 notes imported, 2 skipped/.test(w.document.getElementById("msg").textContent), w.document.getElementById("msg").textContent);
  assert(vault.notes.has("10 Inbox/Imported Vault/Home.md")); assert(vault.notes.has("10 Inbox/Imported Vault/Import report.md"), "the report note is written");
  assert(sent.every((m) => m.type === "vault"));
  // the Memory page and the background know about the page
  const mem = fs.readFileSync("core/memory.js", "utf8"), bg = fs.readFileSync("background.js", "utf8");
  assert(mem.includes("data-vault-import") && mem.includes("rs-open-vault-import")); assert(bg.includes('case "rs-open-vault-import"') && bg.includes('core/vault-import.html'));
  console.log("vault import: planning rules, same names, secrets, limits, runner, report and the import page checks passed.");
})().catch((e) => { console.error(e); process.exitCode = 1; });
