// Feature guide: every PlazCode menu item, mode switch and bar button must have an entry in
// core/feature-guide.js, every entry must point at something that still exists, and the AI command,
// the startup index and the website guide builder must read the same list.
// A new menu item with no entry fails here and prints a ready-to-paste stub.
const fs = require("node:fs"), assert = require("node:assert/strict");
const Guide = require("./core/feature-guide.js");
const main = fs.readFileSync("core/main.js", "utf8");
const read = (file) => fs.readFileSync(file, "utf8");
let checks = 0;
const ok = (condition, message) => { checks++; assert.ok(condition, message); };

// ---- schema
const E = Guide.ENTRIES;
ok(E.length >= 45, "guide should cover the whole product, got " + E.length);
const ids = new Set();
const SURFACE_KINDS = new Set(["extension", "desktop", "website"]);
for (const e of E) {
  ok(/^[a-z][a-z0-9-]{0,11}$/.test(e.id), "bad id " + e.id);
  ok(!ids.has(e.id), "duplicate id " + e.id); ids.add(e.id);
  ok(typeof e.title === "string" && e.title.length > 0 && e.title.length <= 60, e.id + ": title 1-60 chars");
  ok(typeof e.group === "string" && e.group, e.id + ": group");
  ok(typeof e.where === "string" && e.where.length > 0 && e.where.length <= 140, e.id + ": where 1-140 chars");
  ok(typeof e.does === "string" && e.does.length > 0 && e.does.length <= 240, e.id + ": does 1-240 chars");
  ok(Array.isArray(e.steps) && e.steps.length >= 1 && e.steps.length <= 6, e.id + ": 1-6 steps");
  for (const step of e.steps) ok(typeof step === "string" && step.length > 0 && step.length <= 160, e.id + ": step 1-160 chars");
  ok(Array.isArray(e.keywords) && e.keywords.length >= 1, e.id + ": keywords");
  ok(Array.isArray(e.anchors) && e.anchors.length >= 1, e.id + ": anchors");
  ok(Array.isArray(e.surfaces) && e.surfaces.every((s) => SURFACE_KINDS.has(s)), e.id + ": surfaces");
  ok(typeof e.index === "boolean", e.id + ": index flag");
  ok(!/</.test(JSON.stringify(e)), e.id + ": no markup characters");
}
for (const e of E) for (const r of e.related || []) ok(ids.has(r), e.id + ": related id " + r + " does not exist");

// ---- anchors: everything in the menu must be claimed, everything claimed must exist
const menuStart = main.indexOf("menuEl.innerHTML =");
const menuEnd = main.indexOf('class="rs-menu-foot"', menuStart);
ok(menuStart > 0 && menuEnd > menuStart, "could not find the menu template in main.js");
const menu = main.slice(menuStart, menuEnd);
const barStart = main.indexOf('<div id="rs-brand-stack"');
const barEnd = main.indexOf('id="rs-enhancer-panel"', barStart);
ok(barStart > 0 && barEnd > barStart, "could not find the bar template in main.js");
const bar = main.slice(barStart, barEnd);

const found = new Set();
for (const m of menu.matchAll(/rs-sec-label"><span>([^<]+)<\/span>/g)) found.add("menu:" + m[1].trim());
for (const m of menu.matchAll(/data-mode="([a-z]+)"/g)) found.add("mode:" + m[1]);
for (const m of menu.matchAll(/data-work="([a-z]+)"/g)) found.add("work:" + m[1]);
for (const m of menu.matchAll(/data-perm="([a-z]+)"/g)) found.add("perm:" + m[1]);
for (const m of menu.matchAll(/\bid="(rs-[a-z0-9-]+)"/g)) found.add("ctl:" + m[1]);
for (const m of bar.matchAll(/<button id="(rs-[a-z-]+)"/g)) found.add("bar:" + m[1]);
found.add("bar:rs-engine"); found.add("bar:rs-effort"); found.add("bar:rs-cards-btn");
for (const m of main.matchAll(/<button id="rs-stop"/g)) found.add("bar:rs-stop");

// Ids that are containers, text boxes, status lines or list holders: they are covered by the entry of
// the control they belong to, so they do not need an entry of their own.
const IGNORED = new Set([
  "ctl:rs-language-sec", "ctl:rs-language-picker", "ctl:rs-safety-sec", "ctl:rs-backup-sec", "ctl:rs-setup-sec",
  "ctl:rs-setup-project", "ctl:rs-setup-more", "ctl:rs-setup-skills", "ctl:rs-setup-tools", "ctl:rs-setup-status",
  "ctl:rs-allowed-folders", "ctl:rs-allowed-status", "ctl:rs-backup-text", "ctl:rs-backup-status",
  "ctl:rs-checkpoint-list", "ctl:rs-thinking-hint", "ctl:rs-always-box", "ctl:rs-tool-budget",
  "ctl:rs-task-minutes", "ctl:rs-command-cooldown", "ctl:rs-input-char-limit", "ctl:rs-output-char-limit",
  "ctl:rs-checkpoint-sec", "ctl:rs-i2m-status", "ctl:rs-set-status", "ctl:rs-set-text", "ctl:rs-mcp-name", "ctl:rs-mcp-url", "ctl:rs-mcp-status",
  "bar:rs-brand-stack",
]);
// Menu parts that are only a label for the entry of the section they sit in.
const SECTION_COVERED = new Set(["menu:Language", "menu:Models", "menu:Support"]);
void SECTION_COVERED;

const claimed = new Set();
for (const e of E) for (const a of e.anchors) if (!a.startsWith("surface:")) claimed.add(a);

const missing = [...found].filter((a) => !claimed.has(a) && !IGNORED.has(a)).sort();
if (missing.length) {
  console.error("These PlazCode controls have no feature-guide entry (add one to core/feature-guide.js, or add the id to IGNORED here if it is only a container):");
  for (const a of missing) console.error('  { "id": "?", "title": "?", "anchors": ["' + a + '"], ... }');
}
ok(!missing.length, "controls without a guide entry: " + missing.join(", "));

const gone = [...claimed].filter((a) => !found.has(a)).sort();
ok(!gone.length, "guide entries point at controls that no longer exist: " + gone.join(", "));

// ---- surfaces: places outside the menu (cards, memory page, popup) that an entry talks about
const SURFACES = {
  "memory-page": ["core/memory.js", "Open vault"],
  "quick-notes": ["core/memory.js", "Learn as I work"],
  "vault": ["core/memory.js", "Let the AI write"],
  "vault-list": ["core/memory.js", "Your vaults"],
  "vault-import": ["core/vault-import-page.js", "Import a folder"],
  "chat-notes": ["core/memory.js", "11 Chats"],
  "mem-transfer": ["core/memory.js", "Save or move memory"],
  "approval-card": ["core/main.js", 'id="rs-approve"'],
  "approval-always": ["core/main.js", 'id="rs-approve-always"'],
  "plan-card": ["core/main.js", "Approve plan"],
  "tool-cards": ["core/tool-cards.js", "rs-tcard"],
  "run-log": ["core/main.js", "rs-cards-btn"],
  "popup": ["popup.html", "Open on-page menu"],
};
const claimedSurfaces = new Set();
for (const e of E) for (const a of e.anchors) if (a.startsWith("surface:")) {
  const name = a.slice(8);
  claimedSurfaces.add(name);
  ok(SURFACES[name], e.id + ": unknown surface " + name);
  const [file, needle] = SURFACES[name];
  ok(read(file).includes(needle), e.id + ": surface " + name + " - '" + needle + "' not found in " + file);
}
for (const name of Object.keys(SURFACES)) ok(claimedSurfaces.has(name), "surface " + name + " has no entry");

// ---- labels that entries tell people to click must exist somewhere in the product
const SOURCES = ["core/main.js", "core/memory.js", "core/vault-import-page.js", "core/tool-cards.js", "popup.html"].map(read).join("\n");
const CLICKED = ["Copy backup", "Restore backup", "Save folders", "Connect Blender", "Repair Studio link", "Paste builder template",
  "Save current setup", "Apply setup", "Remove all", "Memory summary", "Save continuation file", "Resume paused task",
  "Add server", "Add a note", "Approve plan", "Ask for changes", "Show details", "Approve all", "Open vault",
  "Import a folder of notes", "Read the Tutorial", "Enhance &amp; Send", "Add and open", "Learn as I work"];
for (const label of CLICKED) ok(SOURCES.includes(label) || SOURCES.includes(label.replace("&amp;", "&")), "label no longer exists: " + label);

// ---- answers
ok(Guide.get("undo") && Guide.get("UNDO") === Guide.get("undo"), "get is by id, any case");
ok(Guide.get("nope") === null, "unknown id gives null");
for (const e of E) {
  ok(Guide.answer(e.id).includes(e.title) && Guide.answer(e.id).includes("1. "), e.id + ": answer by id shows the steps");
  const hit = Guide.search(e.title, 3).map((x) => x.id);
  ok(hit.includes(e.id), e.id + ": its own title finds it, got " + hit.join(","));
}
const listing = Guide.answer("");
for (const e of E) ok(listing.includes(e.id + ": "), e.id + ": missing from the full list");
ok(Guide.answer("always approve").split("\n---\n")[0].includes("Always approved") || Guide.answer("always approve").includes("always-appr"), "always approve question finds its entry");
ok(Guide.search("how do i undo the last change", 3)[0].id === "undo", "plain question finds undo");
ok(Guide.search("plan mode", 2)[0].id === "plan-mode", "plan mode question finds plan-mode");
ok(Guide.answer("zzzz qqqq").includes("No PlazCode feature matches"), "unknown topic says so");
for (const e of E) ok(Guide.answer(e.id).length <= Guide.MAX_ENTRY_CHARS + 400, e.id + ": answer stays short");

// ---- startup index
const index = Guide.indexLine();
ok(index.length > 0 && index.length <= Guide.INDEX_MAX, "index within " + Guide.INDEX_MAX + " chars, got " + index.length);
for (const id of index.split(", ")) ok(ids.has(id), "index names unknown id " + id);
ok(Guide.indexLine(200).length <= 200, "short index (Notion) within 200 chars");

// ---- wiring
const config = read("core/config.js");
ok(config.includes("function featureHelpPolicy") && config.includes("featureHelpPolicy(opts)"), "config.js adds the feature help to the startup text");
ok(config.includes('typeof PlazCodeFeatureGuide === "undefined"'), "startup text is safe when the guide is not loaded");
for (const needle of ['name === "plazcode_features"', "plazcode_features:", "name:'plazcode_features'", 'features: "plazcode_features"']) ok(main.includes(needle), "main.js is missing " + needle);
ok(/DESKTOP_UTILITY_TOOLS = \[[^\]]*"plazcode_features"/.test(main), "plazcode_features is a utility tool");
const manifest = JSON.parse(read("manifest.json"));
let lists = 0;
for (const cs of manifest.content_scripts) if (cs.js.includes("core/main.js")) {
  lists++;
  const g = cs.js.indexOf("core/feature-guide.js");
  ok(g >= 0, "a manifest list loads main.js without the feature guide");
  ok(g < cs.js.indexOf("core/config.js"), "feature guide must load before config.js");
}
ok(lists >= 15, "expected the 15 content script lists, got " + lists);
const guideSource = read("core/feature-guide.js");
const a = guideSource.indexOf("/*GUIDE-JSON-START*/"), b = guideSource.indexOf("/*GUIDE-JSON-END*/");
ok(a > 0 && b > a, "JSON markers present");
assert.deepEqual(JSON.parse(guideSource.slice(a + "/*GUIDE-JSON-START*/".length, b)), E, "the JSON between the markers is the guide");
const safety = require("./core/safety.js");
void safety;

console.log("feature guide: " + E.length + " entries, " + found.size + " controls checked, " + checks + " checks passed");
