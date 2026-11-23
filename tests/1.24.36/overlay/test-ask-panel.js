"use strict";
// Ask PlazCode: the panel is left out of the AI's pictures of the whole screen (owner, 2026-11-19: "the actual Ask PlazCode panel
// on the side should be hidden, but the rest of your screen should be visible"). Run: node test-ask-panel.js
const assert = require("node:assert/strict"), fs = require("node:fs");
const P = require("./core/ask-panel.js");
// A docked window: the window itself.
assert.deepEqual(P.place({ win: { type: "popup", left: 1500, top: 0, width: 420, height: 1040 }, innerWidth: 404, innerHeight: 1000, screenWidth: 1920, title: "Ask PlazCode" }),
  { kind: "window", title: "Ask PlazCode", x: 1500, y: 0, w: 420, h: 1040, screenWidth: 1920 });
// Chrome's side panel in a maximized window (Windows reports -8 borders): the strip at the right edge, header included.
const side = P.place({ win: { type: "normal", left: -8, top: -8, width: 1936, height: 1048 }, innerWidth: 380, innerHeight: 900, screenX: -8, screenWidth: 1920 });
assert.equal(side.kind, "strip"); assert.equal(side.title, "Ask PlazCode");
assert(side.x <= 1920 - 380 && side.x >= 1920 - 380 - 30, "strip starts where the panel starts: " + side.x);
assert(side.x + side.w >= 1920, "strip reaches the window's right edge");
assert(side.y <= 1040 - 900 - 40 && side.y + side.h >= 1032, "header to bottom");
// Chrome reporting the panel's own left edge is used (a panel moved to the left side).
const leftSide = P.place({ win: { type: "normal", left: 0, top: 0, width: 1600, height: 900 }, innerWidth: 300, innerHeight: 800, screenX: 100, screenWidth: 1920 });
assert.equal(leftSide.x, 92);
assert.equal(P.place({ win: null, innerWidth: 1, innerHeight: 1, screenWidth: 1920 }), null);
assert.equal(P.place({ win: { type: "normal", left: 0, top: 0, width: 800, height: 600 }, innerWidth: 300, innerHeight: 500, screenWidth: 0 }), null);
// Wiring: the panel page sends it with whole-screen sharing, the background passes it to the app, the AI's picture asks for it.
const html = fs.readFileSync("core/ask.html", "utf8"), ask = fs.readFileSync("core/ask.js", "utf8"), bg = fs.readFileSync("background.js", "utf8");
assert(html.indexOf('src="ask-panel.js"') > 0 && html.indexOf('src="ask-panel.js"') < html.indexOf('src="ask.js"'));
assert.match(ask, /shareTabId: -1, words, panel: await panelPlace\(\)/);
assert.match(bg, /JSON\.stringify\(action === "share" \? \{ action, panel: ask\.panel \|\| null \}/);
assert.match(bg, /"\/api\/desktop\/frame\?for=ai"/, "the AI's picture asks the app to leave the panel out");
assert.equal((bg.match(/\/api\/desktop\/frame"/g) || []).length, 2, "the live picture and the first test picture stay plain (no flicker)");
const rs = fs.readFileSync("agent/src/desktop_control.rs", "utf8");
assert.match(rs, /pub fn screen_for_ai\(\)/); assert.match(rs, /if for_ai \{ screen_for_ai \} else \{ screen \}/);
assert.match(fs.readFileSync("agent/src/workspace.rs", "utf8"), /let img = crate::desktop_control::screen_for_ai\(\)\?;/, "screen_capture for the AI leaves it out too");
console.log("PASS Ask panel: docked window and side panel places worked out, sent with whole-screen sharing, left out of the AI's pictures only");
