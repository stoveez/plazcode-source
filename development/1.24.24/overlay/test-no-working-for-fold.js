"use strict";
// The foldable "Working for ..." summary is removed from the chat and from the PlazCode bar for every AI site.
const fs = require("fs"), assert = require("assert");
const src = fs.readFileSync("core/main.js", "utf8");
assert(/const ACTIVITY_FOLD_OFF = true;/.test(src), "fold switch must be on");
const sync = src.slice(src.indexOf("  function syncActivityItems()"), src.indexOf("  rsInterval(() => {\n    const busy"));
assert(/if \(activityFoldDisabled\(\)\) \{[\s\S]*activityTranscript\.sync\(\[\], \(\) => null\);\s*return;/.test(sync), "sync must unfold everything and mount nothing");
const render = src.slice(src.indexOf("    function renderActivity()"), src.indexOf("    function captureCoworkFocus"));
assert(/button\.hidden = activityFoldDisabled\(\) \|\| !group;/.test(render), "bar button must stay hidden");
assert(/activityFoldDisabled\(\) \|\| !group\) \{ panel\.hidden = true; return; \}/.test(render), "bar panel must stay hidden");
console.log("no Working-for fold: ok");
