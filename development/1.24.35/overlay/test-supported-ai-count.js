"use strict";
// Owner (2026-11-18): "clickup got removed but app still says 16. ensure the numbers are right everytime u add/remove an ai
// all accross plazcode". The app's "N browser AIs + Ollama" label, its list of AI buttons and the extension's AI sites must
// agree, and the label must have a translation in every language. Adding or removing a site fails this test until all agree.
// Run: node test-supported-ai-count.js
const fs = require("fs"), assert = require("node:assert/strict");
const html = fs.readFileSync(__dirname + "/agent/src/desktop.html", "utf8");
const manifest = JSON.parse(fs.readFileSync(__dirname + "/manifest.json", "utf8"));
// AI sites the extension runs on: each site group's own site file (helpers such as media.js, *-net.js, *-cm.js are not sites).
const helper = /^providers\/(media|.*-net|.*-cm)\.js$/;
const sites = [...new Set(manifest.content_scripts.flatMap((g) => g.js).filter((j) => j.startsWith("providers/") && !helper.test(j)).map((j) => j.slice(10, -3)))].sort();
// The app's "All supported AIs" buttons (Ollama is the local one and is counted apart).
const card = html.slice(html.indexOf('id="homeSupportedAis"'), html.indexOf("</details>", html.indexOf('id="homeSupportedAis"')));
const buttons = [...card.matchAll(/data-ipc="open:([a-z0-9-]+)"/g)].map((m) => m[1]);
const browserButtons = buttons.filter((b) => b !== "ollama").sort();
assert(buttons.includes("ollama"), "Ollama is listed");
assert.deepEqual(browserButtons, sites, "the app lists exactly the AI sites the extension supports (add or remove the app button with the site)");
const label = /<span class="supported-ai-count">(\d+) browser AIs \+ Ollama<\/span>/.exec(card);
assert(label, "the app shows how many browser AIs there are");
assert.equal(Number(label[1]), sites.length, `the app says ${label[1]} browser AIs but there are ${sites.length}: change the number in agent/src/desktop.html`);
const key = label[1] + " browser AIs + Ollama";
for (const file of fs.readdirSync(__dirname + "/core/locales").filter((f) => f.endsWith(".json"))) {
  const words = JSON.parse(fs.readFileSync(__dirname + "/core/locales/" + file, "utf8"));
  assert(key in words, `${file} has "${key}" (add it, then run build-locales.py)`);
  if (file !== "en.json") assert(typeof words[key] === "string" && words[key].includes(label[1]), `${file} translates "${key}" with the same number`);
}
// No other "N browser AIs" count anywhere in the app or the extension's own pages.
for (const file of ["agent/src/desktop.html", "popup.html", "popup.js", "core/main.js", "core/config.js", "core/lean-startup.js"]) {
  const text = fs.existsSync(__dirname + "/" + file) ? fs.readFileSync(__dirname + "/" + file, "utf8") : "";
  for (const m of text.matchAll(/(\d+) (?:browser |supported )?AIs\b/g)) assert.equal(Number(m[1]), sites.length, `${file} says "${m[0]}" but there are ${sites.length} browser AIs`);
}
console.log(`PASS supported AI count: the app says ${sites.length} browser AIs + Ollama, lists the same ${sites.length} sites the extension runs on, in every language.`);
