// Claude (2026-10-25 layout): after a command the chat showed an empty "json" frame and a small empty grey bubble.
// 1. The code frame's copy button draws its icon with an icon-font character, which made the "only a label and a
//    copy button" check fail, so only the code was hidden and the frame stayed. The whole frame must be hidden.
// 2. A PlazCode turn hidden with no chip left Claude's empty message bubble behind. That user row must be hidden,
//    and shown again when the turn gets a chip or is no longer hidden.
const fs = require("fs"), vm = require("vm"), assert = require("node:assert/strict");
const { JSDOM } = require(process.env.PLAZCODE_TEST_JSDOM || "jsdom");
const dom = new JSDOM("<main></main>", { url: "https://claude.ai/chat/test", runScripts: "outside-only", pretendToBeVisual: true });
try {
  vm.runInContext(fs.readFileSync("providers/claude.js", "utf8") + ";globalThis.provider=RSProvider;", dom.getInternalVMContext());
  const d = dom.window.document, p = dom.window.provider, command = '{"command":"list_commands","params":{}}';
  const style = d.createElement("style"); style.textContent = (fs.readFileSync("overlay.css", "utf8").match(/\.rs-empty-turn \{[^}]*\}/) || [""])[0]; assert(style.textContent, "overlay.css hides .rs-empty-turn"); d.head.append(style);

  // 1. Claude's real frame: sticky copy bar (icon-font glyph inside the button), a "json" label, then the scroll box with <pre>.
  const item = d.createElement("div"); d.body.append(item);
  item.innerHTML = '<p id="narration">Inspecting an embedded context block within the prompt.</p>' +
    '<div id="frame" class="relative group/copy" aria-label="json code">' +
      '<div class="sticky"><div><button aria-label="Copy to clipboard"><span></span></button></div></div>' +
      '<div class="text-secondary">json</div>' +
      '<div class="overflow-x-auto"><pre><code>' + command + '</code></pre></div>' +
    '</div>';
  const spot = p.findToolBlockSpot(item);
  assert.equal(spot.ref, d.querySelector("#frame"), "the whole frame (label, copy button, code) is hidden, not just the code");
  assert(!d.querySelector("#narration").closest(".rs-tool-hide"), "narration stays");
  // A frame with real words next to the code is still left alone.
  item.innerHTML = '<div id="mixed"><div><button aria-label="Copy to clipboard"></button></div><span>Important explanation</span><div class="overflow-x-auto"><pre>' + command + '</pre></div></div>';
  p.findToolBlockSpot(item);
  assert(!d.querySelector("#mixed").classList.contains("rs-tool-hide"), "explanation next to the code keeps its frame");

  // 2. Empty bubble.
  const row = d.createElement("div"); row.setAttribute("data-user-scope", ""); d.body.append(row);
  row.innerHTML = '<div data-turn-key="1"><div class="bubble" style="padding:12px 16px"><div><div class="cds-user-message-body">' +
    '<div data-testid="user-message" id="um"><p>Output of \'list_commands\': ...</p></div></div></div></div><div class="actions"><button>Edit</button></div></div>';
  const um = d.querySelector("#um");
  um.classList.add("rs-hidden"); p.syncHiddenShell(um);
  assert(row.classList.contains("rs-empty-turn"), "a hidden turn with no chip hides its whole row");
  assert.equal(dom.window.getComputedStyle(row).display, "none");
  const chip = d.createElement("div"); chip.className = "rs-chip result"; um.prepend(chip); p.syncHiddenShell(um);
  assert(!row.classList.contains("rs-empty-turn"), "once the result chip is there the row shows again");
  chip.remove(); p.syncHiddenShell(um); assert(row.classList.contains("rs-empty-turn"));
  um.classList.remove("rs-hidden"); p.syncHiddenShell(um);
  assert(!row.classList.contains("rs-empty-turn"), "a normal user message is never hidden");
  p.syncHiddenShell(null); // no crash

  // main.js calls the hook wherever it hides or shows a turn.
  const main = fs.readFileSync("core/main.js", "utf8");
  assert((main.match(/P\.syncHiddenShell && P\.syncHiddenShell\(/g) || []).length >= 5, "main.js syncs the row at every hide/show");
  console.log("Claude: command frames with an icon-font copy button are hidden whole; hidden turns leave no empty bubble.");
} finally { dom.window.close(); }
