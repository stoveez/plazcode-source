// SPDX-License-Identifier: GPL-3.0-or-later
// 1.24.21 vault window: the Markdown reader is safe, links/pictures/edit/archive/search work, keys stay inside the window.
const assert = require("assert");
const { JSDOM } = require("jsdom");

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { pretendToBeVisual: true, url: "https://chat.example/" });
global.window = dom.window; global.document = dom.window.document; global.Event = dom.window.Event;
const Memory = require("./core/memory.js");

(async () => {
  // ── The reader never turns note text into markup ───────────────────────────────────────────────
  const evil = Memory.renderMarkdown('<img src=x onerror=alert(1)> <script>alert(2)</script> [[a" onmouseover="x]] [t](javascript:alert(3)) ![p](https://evil.example/p.png) `<b>`\n\n```\n<script>x</script>\n```');
  assert(!/<img|<script|onerror=/i.test(evil.replace(/&lt;[^]*?&gt;/g, "")), evil);
  assert(evil.includes("&lt;script&gt;") && evil.includes('data-link="a&quot; onmouseover=&quot;x"'), evil);
  assert(!/<a [^>]*href="javascript/i.test(evil) && !/<img/i.test(evil), "no script links and no remote pictures");
  const rich = Memory.renderMarkdown("# Title\n\n> [!warning] Careful [[Home]]\n> Body **bold** and *it* and ==mark== and ~~gone~~\n\n| A | B |\n|---|:-:|\n| 1 | [[Note|alias]] and x\\|y |\n\n- one\n  - nested\n1. first\n- [x] done\n- [ ] todo\n\n%% SECRETCOMMENT %%\nText #tag\n![[pic.png|300]]\n---\n");
  for (const part of ['<h1>Title</h1>', 'class="pcv-co"', 'pcv-co-title', '<strong>bold</strong>', '<em>it</em>', '<mark>mark</mark>', '<del>gone</del>', '<th>A</th>', 'text-align:center', 'data-link="Note"', '>alias</a>', 'x|y', '<ul><li>one<ul><li>nested</li></ul></li></ul>', '<ol><li>first</li></ol>', 'checked', 'pcv-hash', 'data-embed="pic.png"', 'data-width="300"', '<hr>']) assert(rich.includes(part), "missing " + part + " in " + rich);
  assert(!rich.includes("SECRETCOMMENT"), "%% comments are hidden like in Obsidian");

  // ── A fake app behind the window ───────────────────────────────────────────────────────────────
  const notes = {
    "00 Start Here/Home.md": { raw: "---\ntags: [guide, index]\naliases: [Home]\nupdated: 2026-10-20\n---\n\n# Home\n\n> [!info] Home · [[Glossary]]\n> Start here. See [[Sword Journey]] and [[Missing Note]].\n", links: [] },
    "00 Start Here/Glossary.md": { raw: "---\ntags:\n  - glossary\nupdated: 2026-09-28\n---\n\n# Glossary\n\n| Term | Meaning |\n|---|---|\n| Vault | [[Home]] |\n", links: [] },
    "06 Journeys/Sword Journey.md": { raw: "---\ntags: [journey]\nproject: Game A\nupdated: 2026-10-20\n---\n\n# Sword\n\n![[sword.png]]\n\nBack to [[Home]].\n", links: [] },
  };
  const images = { "08 References/refs/sword.png": "QUJD" };
  const log = [];
  const parseFront = raw => {
    const m = /^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/.exec(raw); const order = [], fields = {}; let tags = [], aliases = [];
    if (!m) return { front: { order, fields, tags, aliases }, body: raw };
    for (const line of m[1].split("\n")) { const k = /^([a-z]+):\s*(.*)$/.exec(line); if (k) { order.push(k[1]); fields[k[1]] = k[2]; if (k[1] === "tags") tags = k[2].replace(/[\[\]]/g, "").split(",").map(s => s.trim()).filter(Boolean); if (k[1] === "aliases") aliases = k[2].replace(/[\[\]]/g, "").split(",").map(s => s.trim()).filter(Boolean); } }
    if (/^tags:\s*$/m.test(m[1])) { tags = [...m[1].matchAll(/^\s+- (.+)$/gm)].map(x => x[1]); fields.tags = "[" + tags.join(", ") + "]"; }
    return { front: { order, fields, tags, aliases }, body: m[2] };
  };
  const bridge = async message => {
    assert.strictEqual(message.type, "vault");
    const r = message.request; log.push(r);
    switch (r.action) {
      case "init": return { ok: true };
      case "index": return { ok: true, start: "# Home", notes: [], total: 3, learning: true };
      case "settings": return { ok: true, path: "/data/PlazCode/Vault", notes: 3, learning: true, obsidian_installed: false };
      case "tree": return { ok: true, entries: [
        { path: "_Archive", kind: "folder" }, { path: "00 Start Here", kind: "folder" }, { path: "00 Start Here/Glossary.md", kind: "note", aliases: ["Terms"] }, { path: "00 Start Here/Home.md", kind: "note", aliases: ["Home"] },
        { path: "06 Journeys", kind: "folder" }, { path: "06 Journeys/Sword Journey.md", kind: "note", aliases: [] }, { path: "08 References", kind: "folder" }, { path: "08 References/refs", kind: "folder" }, { path: "08 References/refs/sword.png", kind: "image" }] };
      case "read": { const n = notes[r.path]; if (!n) return { ok: false, error: "That note does not exist." }; const p = parseFront(n.raw); return { ok: true, path: r.path, raw: n.raw, body: p.body, front: p.front, chars: n.raw.length, words: p.body.split(/\s+/).filter(Boolean).length, links: [] }; }
      case "backlinks": return { ok: true, count: r.path.endsWith("Home.md") ? 1 : 0, backlinks: r.path.endsWith("Home.md") ? [{ path: "06 Journeys/Sword Journey.md", title: "Sword Journey" }] : [] };
      case "read_image": return images[r.path] ? { ok: true, path: r.path, mimeType: "image/png", data: images[r.path] } : { ok: false, error: "That picture does not exist." };
      case "save_raw": notes[r.path].raw = r.text; return { ok: true, path: r.path };
      case "archive": delete notes[r.path]; return { ok: true, archived_to: "_Archive/x.md" };
      case "search": return { ok: true, count: 1, results: [{ path: "06 Journeys/Sword Journey.md", title: "Sword Journey", snippets: ["a sword"] }] };
      case "reveal": return { ok: true };
      default: return { ok: false, error: "Unknown vault action." };
    }
  };
  await Memory.vaultRefresh(bridge, "");
  const waitFor = async (check, label) => { for (let i = 0; i < 80; i++) { try { const value = check(); if (value) return value; } catch {} await new Promise(r => setTimeout(r, 25)); } throw new Error("timed out waiting for " + label); };
  const $ = sel => document.querySelector(sel), $$ = sel => [...document.querySelectorAll(sel)];
  const click = el => el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));

  let leaked = 0; document.addEventListener("keydown", () => { leaked++; });
  const root = Memory.openVault({});
  await waitFor(() => $(".pcv-title") && $(".pcv-title").textContent === "Home", "Home to open");
  assert.strictEqual(document.querySelectorAll("#pcv-root").length, 1);
  assert(!/<script|onerror/i.test(root.innerHTML.replace(/&lt;[^]*?&gt;/g, "")));

  // The file list: numbered folders first, underscore folders last, the open note's folder expanded.
  const rows = $$(".pcv-row").map(r => r.querySelector(".pcv-name").textContent);
  assert.deepStrictEqual(rows.slice(0, 4), ["00 Start Here", "Glossary", "Home", "06 Journeys"], rows.join("|"));
  assert.strictEqual(rows[rows.length - 1], "_Archive", "underscore folders sort last");
  assert.strictEqual($(".pcv-row.pcv-active .pcv-name").textContent, "Home");
  assert.strictEqual($("[data-vname]").textContent, "PlazCode Vault");

  // Properties, callout, links and the status bar.
  assert.deepStrictEqual($$(".pcv-chip").map(c => c.textContent), ["guide", "index"]);
  assert.deepStrictEqual($$(".pcv-prop-key span:last-child").map(c => c.textContent), ["tags", "aliases", "updated"], "properties keep the file's order");
  assert(/2026/.test($(".pcv-date").textContent));
  assert($(".pcv-co") && $(".pcv-co-title").textContent.includes("Home"));
  assert.strictEqual($$("a.pcv-link.pcv-unresolved").map(a => a.textContent).join(), "Missing Note", "a link to nothing is dimmed");
  assert(/1 backlink/.test($("[data-status]").textContent) && /3 properties/.test($("[data-status]").textContent));
  assert.strictEqual($(".pcv-back a").textContent, "Sword Journey");
  assert.strictEqual($("[data-crumb]").textContent, "00 Start Here / Home");

  // Clicking a link opens that note; its picture loads through the app; back and forward work.
  click($$(".pcv-md a.pcv-link").find(a => a.textContent === "Sword Journey"));
  await waitFor(() => $(".pcv-title").textContent === "Sword Journey", "journey to open");
  const img = await waitFor(() => { const i = $("img.pcv-img"); return i && i.getAttribute("src") && i; }, "picture to load");
  assert.strictEqual(img.getAttribute("src"), "data:image/png;base64,QUJD");
  assert(log.some(r => r.action === "read_image" && r.path === "08 References/refs/sword.png"), "the picture is found by its short name");
  click($('[data-act="back"]')); await waitFor(() => $(".pcv-title").textContent === "Home", "back");
  click($('[data-act="forward"]')); await waitFor(() => $(".pcv-title").textContent === "Sword Journey", "forward");
  click($(".pcv-row[data-path='08 References']")); click($(".pcv-row[data-path='08 References/refs']")); click($(".pcv-row[data-path='08 References/refs/sword.png']"));
  await waitFor(() => $(".pcv-imgview img") && $(".pcv-imgview img").getAttribute("src"), "picture view");

  // A list-style header (tags on separate lines) still shows as chips.
  click($(".pcv-row[data-path='00 Start Here/Glossary.md']"));
  await waitFor(() => $(".pcv-title").textContent === "Glossary", "glossary"); assert.deepStrictEqual($$(".pcv-chip").map(c => c.textContent), ["glossary"]);
  assert($("table") && $("th").textContent === "Term");

  // Search lists notes; keys typed in the search box do not reach the page behind.
  const search = $("[data-search]"); search.value = "sword";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  const hit = await waitFor(() => $(".pcv-result"), "search results"); assert.strictEqual(hit.querySelector("b").textContent, "Sword Journey");
  search.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "a", bubbles: true })); assert.strictEqual(leaked, 0, "typing stays inside the window");
  click(hit); await waitFor(() => $(".pcv-title").textContent === "Sword Journey", "result click");
  search.value = ""; search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));

  // Editing: the raw text opens, Save sends exactly what was typed, nothing is lost on Cancel.
  click($('[data-act="edit"]'));
  const area = await waitFor(() => $("textarea.pcv-editor"), "editor"); assert(area.value.startsWith("---\ntags: [journey]"));
  click($('[data-act="cancel"]')); await waitFor(() => !$("textarea.pcv-editor") && $(".pcv-md"), "cancel");
  click($('[data-act="edit"]')); const area2 = await waitFor(() => $("textarea.pcv-editor"), "editor again");
  area2.value = area2.value + "\nEdited by hand.\n"; click($('[data-act="save"]'));
  await waitFor(() => !$("textarea.pcv-editor") && $(".pcv-md").textContent.includes("Edited by hand."), "saved note");
  assert(log.some(r => r.action === "save_raw" && r.path === "06 Journeys/Sword Journey.md" && r.text.endsWith("Edited by hand.\n") && !r.ai), "saved by the user, not as the AI");

  // Archive needs a second click; nothing is deleted, and the window goes back to Home.
  click($('[data-act="menu"]')); click($('[data-act="archive"]'));
  assert(!log.some(r => r.action === "archive"), "one click only asks"); assert.strictEqual($("[data-archive-label]").textContent, "Click again to confirm");
  click($('[data-act="archive"]'));
  await waitFor(() => log.some(r => r.action === "archive" && r.path === "06 Journeys/Sword Journey.md" && !r.ai), "archive call");
  await waitFor(() => $(".pcv-title").textContent === "Home", "back to Home after archiving");

  // Escape closes the window; opening again reuses it.
  root.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); assert.strictEqual(root.hidden, true);
  assert.strictEqual(Memory.openVault({}), root); assert.strictEqual(root.hidden, false);
  assert.strictEqual(document.querySelectorAll("#pcv-root").length, 1);
  console.log("vault window ok");
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
