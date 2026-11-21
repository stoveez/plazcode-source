"use strict";
// Import a whole folder (or .zip) of skills (owner, 2026-11-20). The app does the grouping (agent/src/skill_folder.rs, tested
// with cargo test); this checks the Skills page side (folder picker, drag and drop, .zip) and how folder skills reach the AI.
// Run: node test-skills-folder-import.js
const fs = require("fs"), assert = require("node:assert/strict"), { JSDOM } = require("jsdom");
const ui = require("./core/skills-ui.js");
const Context = require("./core/skill-context.js");
const file = (path, text, extra = {}) => ({ name: path.split("/").pop(), webkitRelativePath: path, size: Buffer.byteLength(text), type: "", text: async () => text, arrayBuffer: async () => Uint8Array.from(Buffer.from(text)).buffer, ...extra });
(async () => {
  // 1. What is sent: text files only, hidden folders never read, the folder name as the source.
  const read = [];
  const items = [["Pack/ui/SKILL.md", "# UI"], ["Pack/ui/references/a.md", "ref"], ["Pack/ui/logo.png", "\u0000PNG"], ["Pack/.git/config", "secret"], ["Pack/node_modules/x/index.js", "x"], ["Pack/LICENSE", "MIT"]]
    .map(([path, text]) => ({ path, file: { ...file(path, text), text: async () => { read.push(path); return text; } } }));
  const request = await ui.folderRequest(items, "Pack");
  assert.equal(request.action, "import_folder"); assert.equal(request.source, "Pack");
  assert.deepEqual(request.files.map((f) => f.path), ["Pack/ui/SKILL.md", "Pack/ui/references/a.md", "Pack/ui/logo.png", "Pack/LICENSE"]);
  assert.equal(request.files[2].skipped, "not a text file"); assert.equal(request.files[3].text, "MIT", "files without an extension (LICENSE) are text");
  assert(!read.includes("Pack/.git/config") && !read.includes("Pack/ui/logo.png"), "hidden and binary files are never read");
  const huge = await ui.folderRequest([{ path: "a.md", file: { ...file("a.md", ""), size: 2 * 1024 * 1024 } }, { path: "b.md", file: file("b.md", "x") }], "");
  assert.equal(huge.files[0].skipped, "larger than 1 MB");
  await assert.rejects(ui.folderRequest(Array.from({ length: 25 }, (_, i) => ({ path: i + ".md", file: { ...file(i + ".md", "x"), size: 1024 * 1024 } })), ""), /more than 24 MB/);
  const big = Array.from({ length: 3001 }, (_, i) => ({ path: "f/" + i + ".md", file: file(i + ".md", "x") }));
  await assert.rejects(ui.folderRequest(big, "f"), /more than 3,000 files/);
  assert.match(ui.folderSummary({ source: "Pack", added: 2, updated: 1, kept_edits: 1, in_trash: 0, skipped_count: 1, skipped: [{ path: "logo.png", reason: "not a text file" }] }), /Imported 3 skills from Pack: 2 new, 1 updated\. 1 skill you had changed was kept as a separate copy marked "\(your edit\)"\. Skipped 1 file \(logo\.png: not a text file\)/);

  // 2. Dropped folders (file system entries), walked without hidden folders.
  const entry = (path, children) => children ? { name: path.split("/").pop(), fullPath: "/" + path, isFile: false, isDirectory: true, createReader() { let done = false; return { readEntries(ok) { ok(done ? [] : (done = true, children)); } }; } }
    : { name: path.split("/").pop(), fullPath: "/" + path, isFile: true, isDirectory: false, file(ok) { ok(file(path, "text of " + path)); } };
  const tree = entry("Drop", [entry("Drop/a", [entry("Drop/a/SKILL.md")]), entry("Drop/.git", [entry("Drop/.git/HEAD")]), entry("Drop/notes.md")]);
  const dropped = await ui.droppedFiles({ items: [{ webkitGetAsEntry: () => tree }], files: [] });
  assert.equal(dropped.source, "Drop"); assert.deepEqual(dropped.items.map((i) => i.path), ["Drop/a/SKILL.md", "Drop/notes.md"]);

  // 3. The Skills page: Choose a folder, drop, .zip, labels and the read button.
  const dom = new JSDOM('<div id="host"></div>', { runScripts: "outside-only", url: "http://localhost" }), w = dom.window;
  w.TextEncoder = TextEncoder; w.eval(fs.readFileSync("core/skills-ui.js", "utf8") + ";window.Skills=PlazCodeSkillsUI;");
  let records = [], calls = [];
  const folderSkill = { id: "folder-abc", title: "Clean UI", description: "Menus", domain: "all", scope: "", steps: ["Use scale."], pitfalls: [], verification: [], confirmed: false, enabled: true, revision: 1, files: ["SKILL.md", "references/a.md"], source: "folder:Pack/ui" };
  const api = async (r) => {
    calls.push(r);
    if (r.action === "list") return { ok: true, skills: records };
    if (r.action === "list_deleted") return { ok: true, skills: [], trash_revision: 0 };
    if (r.action === "import_folder") { records = [folderSkill]; return { ok: true, source: "Pack", added: 1, updated: 0, kept_edits: 0, in_trash: 0, skills: [folderSkill], skipped: [], skipped_count: 0 }; }
    if (r.action === "read") return { ok: true, skill: folderSkill, bundle: { content: "# Clean UI\nUse scale.", next_offset: null } };
    return { ok: true };
  };
  const host = w.document.getElementById("host"), field = (n) => host.querySelector("[data-sk=" + n + "]"), flush = () => new Promise((r) => setTimeout(r, 30));
  const page = w.Skills.mount(host, api, async () => {}, () => ({}), async () => {}, async () => ({ tasks: [] })); await page.refresh();
  assert(field("import-folder").hasAttribute("webkitdirectory"), "the folder picker chooses folders");
  assert.match(field("import-file").getAttribute("accept"), /\.zip/);
  assert.match(host.textContent, /Import a whole folder/); assert.equal(field("pick-folder").textContent, "Choose a folder");
  Object.defineProperty(field("import-folder"), "files", { value: [file("Pack/ui/SKILL.md", "# UI"), file("Pack/combat.md", "# Combat")], configurable: true });
  field("import-folder").dispatchEvent(new w.Event("change")); await flush();
  const sent = calls.find((c) => c.action === "import_folder");
  assert(sent && sent.source === "Pack" && sent.files.length === 2, "the picked folder is sent: " + JSON.stringify(sent && sent.source));
  assert.match(field("status").textContent, /Imported 1 skill from Pack: 1 new, 0 updated/);
  assert.equal(field("detail-title").textContent, "Clean UI"); assert.equal(field("detail-source").textContent, "Skill from a folder");
  assert.match(host.querySelector('[data-sk-card="folder-abc"]').textContent, /From a folder/);
  assert.equal(field("read").hidden, false); assert.equal(field("read").textContent, "Read the full skill");
  field("read").click(); await flush(); assert.match(field("instructions").textContent, /Use scale/);
  // A .zip from the file box goes to the app whole.
  calls = [];
  Object.defineProperty(field("import-file"), "files", { value: [file("pack.zip", "PK\u0003\u0004zip")], configurable: true });
  field("import-file").dispatchEvent(new w.Event("change")); await flush();
  const zip = calls.find((c) => c.action === "import_folder");
  assert(zip && zip.source === "pack" && Buffer.from(zip.zip, "base64").toString().startsWith("PK"), "the .zip is sent as base64");
  // Drag and drop: the overlay shows while dragging, and a drop imports.
  calls = [];
  const drag = (type, transfer) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); e.dataTransfer = transfer; host.dispatchEvent(e); return e; };
  const transfer = { types: ["Files"], items: [{ webkitGetAsEntry: () => tree }], files: [] };
  assert(drag("dragenter", transfer).defaultPrevented); assert.equal(field("drop").hidden, false);
  drag("drop", transfer); assert.equal(field("drop").hidden, true); await flush(); await flush();
  const drop = calls.find((c) => c.action === "import_folder");
  assert(drop && drop.source === "Drop" && drop.files.length === 2, "a dropped folder imports");
  assert.equal(drag("dragenter", { types: ["text/plain"] }).defaultPrevented, false, "dragging text is left alone");
  w.close();

  // 4. What the AI sees: folder skills as short cards that say how to read their files; others unchanged.
  const long = { ...folderSkill, steps: Array.from({ length: 30 }, (_, i) => "step " + i + " " + "x".repeat(900)), favorite: true };
  const card = Context.item(long);
  assert.equal(card.steps.length, 2); assert.deepEqual(card.reference_files, ["SKILL.md", "references/a.md"]); assert.equal(card.always_use, true);
  assert.match(card.read_with, /plazcode_skills action read, id folder-abc, resource/); assert.match(card.read_with, /read SKILL\.md first/);
  assert.deepEqual(Context.item(folderSkill).steps, ["Use scale."], "a short folder skill is sent whole");
  const plain = { id: "skill-1", title: "Mine", steps: ["a"], revision: 2 };
  assert.deepEqual(Context.item(plain), plain);
  const starter = Context.item({ id: "starter-syphodev-roblox-ui", title: "UI", description: "d".repeat(900), steps: ["one", "two"] });
  assert.equal(starter.starter_reference, true); assert.equal(starter.description.length, 500); assert.deepEqual(starter.steps, ["one"]);
  const many = Context.text(Array.from({ length: 10 }, () => long), 9000); assert(many.length <= 9000);
  assert(JSON.stringify(Context.text(Array.from({ length: 10 }, (_, i) => ({ ...long, id: "folder-" + i })))).length < 30000);

  // 5. Wiring: loaded before main.js on every AI site, used for the skill reference, tool description names reference files.
  const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
  for (const cs of manifest.content_scripts.filter((c) => c.js.includes("core/main.js"))) { const at = (f) => cs.js.indexOf(f); assert(at("core/skill-context.js") > -1 && at("core/skill-context.js") < at("core/main.js"), cs.matches[0]); }
  const main = fs.readFileSync("core/main.js", "utf8");
  assert.match(main, /PlazCodeSkillContext\.text\(result\.skills,9000\)/); assert.match(main, /skills imported from a folder \(they list reference_files\)/);
  const rs = fs.readFileSync("agent/src/skills.rs", "utf8");
  assert.match(rs, /"import_folder"=>/); assert.match(fs.readFileSync("agent/src/main.rs", "utf8"), /"\/api\/skills", post\(skills::post\)\.layer\(axum::extract::DefaultBodyLimit::max\(48 \* 1024 \* 1024\)\)/);
  console.log("PASS skill folders: folder picker, drag and drop and .zip send only text files (no hidden folders), the page shows folder skills and reads them, and the AI gets short cards with reference files");
})().catch((e) => { console.error(e); process.exit(1); });
