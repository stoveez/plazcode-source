"use strict";
// Settings dropdowns (owner video + screenshot, 2026-11-16): (1) the open Interface language list was drawn under the next settings
// section; (2) a click ripple, added inside the button as one more <span>, took the chevron's "last span" styling and showed up as a
// small arrow at the button's top-left. Run: node test-dropdown-layer.js
const fs = require("fs"), assert = require("node:assert/strict");
const files = ["overlay.css", "popup.html", "agent/src/desktop.html"];
for (const f of files) {
  const text = fs.readFileSync(__dirname + "/" + f, "utf8");
  assert(!/pc-effort-trigger(\[aria-expanded=true\])?\s*>\s*span:last-child/.test(text), f + ": the chevron must not be styled as the last span (a click ripple becomes the last span)");
  assert(/pc-effort-trigger>span:nth-child\(2\)\{/.test(text), f + ": the chevron is styled as the second span");
}
const css = fs.readFileSync(__dirname + "/overlay.css", "utf8");
assert(/:has\(\.pc-effort-trigger\[aria-expanded=true\]\)\{z-index:4!important\}/.test(css), "the section holding an open list is lifted above the next section");
// Above sibling sections (z-index 1), below the settings search/tabs strip (z-index 5), so the list never covers the tabs.
console.log("PASS settings dropdown layer and chevron checks.");
