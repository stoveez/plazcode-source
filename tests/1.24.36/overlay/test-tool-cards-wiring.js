// Tool cards are loaded before main.js everywhere and wired into the chip, the running/done chips and re-owning.
const fs = require("node:fs"), assert = require("node:assert/strict");
const main = fs.readFileSync("core/main.js", "utf8");
const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
let lists = 0;
for (const entry of manifest.content_scripts || []) {
  const js = entry.js || [];
  if (!js.includes("core/main.js")) continue;
  lists++;
  assert(js.includes("core/tool-cards.js"), "tool-cards.js is loaded in every list that loads main.js");
  assert(js.indexOf("core/tool-cards.js") < js.indexOf("core/main.js"), "tool-cards.js loads before main.js");
}
assert(lists >= 10, "checked every provider list (" + lists + ")");
assert(main.includes("toolBox(item, name, phase, detail, owned, body, category, card)"));
assert(main.includes("PlazCodeToolCards.model(call)") && main.includes("PlazCodeToolCards.model(call, outBody)"));
assert(/A\.toolSettle = \{[\s\S]{0,300}card: doneCard/.test(main), "the settled outcome keeps its card so a site re-render rebuilds the same card");
assert(main.includes("A.toolSettle.body, A.toolSettle.category, A.toolSettle.card"), "re-owning a chip keeps the card");
assert(main.includes("card.sig"), "the chip redraws when the card content changes");
assert(main.includes("while (trail.length > 40)") && main.includes("PlazCodeToolCards.slim"), "only the last 40 cards keep their full diff");
assert(main.includes('"Retry of failed call" : "Earlier call"'));
assert(main.includes("bodyEl.__rsEnsure"), "the diff is drawn only when the card is opened");
console.log("tool cards wiring: " + lists + " script lists, chip, run/done, re-own and older-card limits are wired.");
