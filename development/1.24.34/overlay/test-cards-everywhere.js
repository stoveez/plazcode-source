// The new command cards must show every time, on every AI site (owner, 2026-10-25).
// 1. Every command chip is painted with a card: a phase change (stopped, failed, interrupted) keeps the turn's card,
//    and a chip painted without one finds it from the command written in the turn.
// 2. Every other PlazCode chip (results, Starting Up) gets the same navy and gold card look.
// 3. Notion, which cannot hold PlazCode's own card, draws its CSS card in the same look.
const fs = require("fs"), vm = require("vm"), assert = require("node:assert/strict");
const main = fs.readFileSync("core/main.js", "utf8");

// 1. toolBox, run for real with small stand-ins.
const start = main.indexOf("    toolBox(item, name, phase, detail, owned, body, category, card) {");
const end = main.indexOf("\n    },", start);
assert(start > 0 && end > start, "toolBox found");
const env = {
  diag() {}, RS: { toolCategory: () => "read" }, bareToolName: (n) => String(n || "").split("/").pop(),
  P: { classifyText: (item) => item.text || "" },
  cardForTurn: (txt, name) => (/"command"\s*:\s*"read_file"/.test(txt) && name === "read_file" ? { sig: "from-turn", tool: "read_file" } : null),
};
vm.createContext(env);
vm.runInContext("this.d = {" + main.slice(start, end) + "\n    },\n chip(item, opts) { item.__rsChip = { ...opts }; this.last = opts; } };", env);
const d = env.d;
const item = (text) => ({ dataset: {}, text });

// A card the loop gave stays through a later phase change that passes none.
const a = item("");
d.toolBox(a, "multi_edit", "run", "", true, "", "edit", { sig: "loop-card", tool: "multi_edit" });
d.toolBox(a, "multi_edit", "err", "stopped", true, "", "edit");
assert.equal(d.last.card && d.last.card.sig, "loop-card", "stopping keeps the card");
// A chip painted without a card (site re-drew the turn) finds it from the command in the turn.
const b = item('{"command":"read_file","params":{"path":"run.bat"}}');
d.toolBox(b, "read_file", "done", "", false);
assert.equal(d.last.card && d.last.card.sig, "from-turn", "the command in the turn gives the card");
// A card for another tool on a reused node is never borrowed.
const c = item("");
d.toolBox(c, "tree", "done", "", true, "", "read", { sig: "tree-card" });
c.text = '{"command":"read_file","params":{}}';
d.toolBox(c, "read_file", "run", "", false);
assert.equal(d.last.card && d.last.card.sig, "from-turn", "a different tool does not reuse the old card");
// No command to read: a plain chip, no crash.
d.toolBox(item("no command here"), "list_commands", "done", "", false);
assert.equal(d.last.card, undefined);

// 2. The card look covers every PlazCode chip.
const css = fs.readFileSync("overlay.css", "utf8");
const block = css.slice(css.indexOf("/* ── Tool cards (1.24.21)"));
for (const sel of [".rs-chip.rs-tc, .rs-chip:not(.rs-tc) {", ".rs-chip.rs-tc::before, .rs-chip:not(.rs-tc)::before {",
  "html[data-rs-palette][data-rs-theme] .rs-chip.rs-tc, html[data-rs-palette][data-rs-theme] .rs-chip:not(.rs-tc) {"]) {
  assert(block.includes(sel), "card look also for other chips: " + sel);
}

// 3. Notion's CSS card uses the same look, also when a card is updated.
const notion = fs.readFileSync("providers/notion.js", "utf8");
assert(/const CARD_BG = "linear-gradient\(135deg,var\(--pc-navy-2/.test(notion), "Notion card background is the navy gradient");
assert(/border:\$\{CARD_BORDER\}!important;border-radius:3px 16px 3px 16px!important;background:\$\{CARD_BG\}!important/.test(notion), "first paint");
assert(/bs\.setProperty\("background", CARD_BG, "important"\)/.test(notion) && /bs\.setProperty\("box-shadow", cardShadow\(color\), "important"\)/.test(notion), "updates");
console.log("Cards everywhere: every command chip keeps or finds its card; other chips and Notion's cards use the same look.");
