// 1.24.29 (owner, 2026-10-31): "make sure that by default the AI reads all memory notes and all memory in the vault".
// plazcode_vault read_all returns every vault note except saved chats (11 Chats) and _Archive/_Templates, in pages of
// whole notes; a note bigger than a page is split and continued. Runs the real core/memory.js with a fake app.
// Run: node test-read-all-memory.js
const assert = require("assert");
const R = require("./core/reliability.js");
globalThis.PlazCodeReliability = R;
const Memory = require("./core/memory.js");

const big = Array.from({ length: 1400 }, (_, i) => `- fact ${i}: the sword shop opens at level ${i % 30}.`).join("\n"); // ~70,000 chars
const notes = {
  "00 Start Here/Home.md": "# Home\nThe start note.",
  "00 Start Here/Now.md": "- Project: Island fighter\n- Next: shop",
  "01 About You/Profile.md": "---\ntags: [user]\n---\n# Profile\nLikes low poly.",
  "03 Coding Style/Luau.md": "# Luau\nUse task.wait, never wait.",
  "05 Projects/Island fighter.md": big,
  "07 Lessons And Decisions/WaitForChild.md": "# WaitForChild\nAlways pass a timeout.",
  "11 Chats/2026-10-30 2200 Claude Build.md": "SAVED CHAT: must not be read at startup",
  "_Archive/Old idea.md": "ARCHIVED: must not be read",
};
const calls = [];
async function bridge(message) {
  const req = message.request; calls.push(req.action);
  if (req.action === "graph") return { ok: true, nodes: Object.keys(notes).map((path) => ({ path, title: path.split("/").pop() })), edges: [] };
  if (req.action === "read") {
    const text = notes[req.path]; if (text == null) return { ok: false, error: "That note does not exist." };
    const offset = req.offset || 0, limit = Math.min(30000, req.limit || 12000), end = Math.min(text.length, offset + limit);
    return { ok: true, path: req.path, text: text.slice(offset, end), total_chars: text.length, next_offset: end < text.length ? end : null };
  }
  return { ok: true, notes: [], total: 0, path: "/vault", learning: true, exists: true };
}

(async () => {
  await Memory.vaultRefresh(bridge, "");
  // Page through with the AI's own command, rebuilding every note from the pages.
  const rebuilt = {}, pages = []; let cursor = undefined, current = null;
  for (let n = 0; n < 20; n++) {
    const text = await Memory.vaultTool({ action: "read_all", cursor, max_chars: 30000 }, {});
    pages.push(text);
    assert(text.length <= 30000 + 400, "page stays within its budget: " + text.length);
    const next = /Next page: plazcode_vault \{"action":"read_all","cursor":"([\d:]+)"\}\]$/.exec(text);
    assert(/\n\n\[read_all:[^\]]*\]$/.test(text), "the page ends with its status line after a blank line");
    const body = text.replace(/\n\n\[read_all:[^\]]*\]$/, "");
    for (const part of body.split(/\n\n(?==== )/)) {
      const head = /^=== (.+?)(?: \(continued from character (\d+)\))? ===\n/.exec(part);
      if (!head) { assert.strictEqual(part.trim(), "", "nothing outside a note: " + part.slice(0, 60)); continue; }
      const content = part.slice(head[0].length);
      if (head[2]) { assert.strictEqual(current, head[1], "a continued note follows its first part"); assert.strictEqual(rebuilt[head[1]].length, Number(head[2])); rebuilt[head[1]] += content; }
      else { assert(!(head[1] in rebuilt), "each note once: " + head[1]); rebuilt[head[1]] = content; }
      current = head[1];
    }
    if (!next) { assert(/this was the last page/.test(text)); break; }
    cursor = next[1];
  }
  const expected = Object.keys(notes).filter((p) => !p.startsWith("11 Chats/") && !p.startsWith("_Archive/")).sort();
  assert.deepStrictEqual(Object.keys(rebuilt).sort(), expected, "every note except saved chats and the archive");
  for (const p of expected) assert.strictEqual(rebuilt[p], notes[p].replace(/\s+$/, ""), "note read completely and exactly: " + p);
  assert(!pages.join("").includes("SAVED CHAT") && !pages.join("").includes("ARCHIVED"), "saved chats and archived notes are not read");
  assert(pages.length >= 3, "the 70,000-character note spans pages");
  console.log(`PASS plazcode_vault read_all: ${expected.length} notes over ${pages.length} pages, the big note split and rebuilt exactly; saved chats and archive left out`);

  // The startup loader returns the same pages in one go.
  const all = await Memory.vaultReadAllPages(30000, 40);
  assert.deepStrictEqual(all.map((p) => p.text), pages, "startup pages match what the AI would read itself");
  assert.strictEqual(all[all.length - 1].done, true);
  // Bad cursor and an empty vault.
  await assert.rejects(() => Memory.vaultTool({ action: "read_all", cursor: "abc" }, {}), /cursor must look like/);
  for (const k of Object.keys(notes)) delete notes[k];
  assert.deepStrictEqual(await Memory.vaultReadAllPages(30000, 40), [], "an empty vault adds no startup pages");
  console.log("PASS startup loader returns the same pages; bad cursors and empty vaults are handled");
})().catch((e) => { console.error(e); process.exit(1); });
