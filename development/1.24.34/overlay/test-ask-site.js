"use strict";
// Owner (2026-11-18): "instead of a backup DeepSeek, make Ask PlazCode powered by the current AI chat you're using".
// Run: node test-ask-site.js
const fs = require("fs"), assert = require("node:assert/strict");
const S = require("./core/ask-site.js");
const manifest = JSON.parse(fs.readFileSync(__dirname + "/manifest.json", "utf8"));
// Every AI site the extension runs on has a background-chat page for Ask PlazCode.
for (const group of manifest.content_scripts.filter((g) => g.js.some((j) => j.startsWith("providers/") && !/media|-net|-cm/.test(j)))) {
  for (const match of group.matches) {
    const address = match.replace(/\*$/, "").replace("*.", "");
    const site = S.siteFor(address);
    assert(site && /^https:\/\//.test(site.url) && site.name, "Ask PlazCode knows " + match);
    assert.equal(S.siteFor(site.url).url, site.url, site.name + "'s chat page belongs to the same site");
  }
}
assert.equal(S.siteFor("https://www.amazon.com/x"), null, "a shop is not an AI chat");
assert.equal(S.siteFor("http://chatgpt.com/"), null, "only https");
assert.equal(S.siteFor("https://gemini.google.com/app/abc123").name, "Gemini");
assert.equal(S.siteFor("https://www.kimi.com/chat/1").url, "https://www.kimi.com/");
// The order: a site the person chose, else the AI chat they last used, else DeepSeek.
assert.deepEqual(S.choose(null, { url: "https://claude.ai/chat/9", name: "x" }), { url: "https://claude.ai/new", name: "Claude", why: "current" });
assert.equal(S.choose({ url: "https://chat.qwen.ai/", name: "Qwen" }, { url: "https://claude.ai/new" }).why, "chosen");
assert.deepEqual(S.choose(null, null), { url: "https://chat.deepseek.com/", name: "DeepSeek", why: "fallback" });
assert.equal(S.choose(null, { url: "https://evil.example/" }).why, "fallback", "a stored address that is not an AI site is ignored");
// The background notes the site from every PlazCode AI tab and loads the chooser in Chrome and Firefox.
const bg = fs.readFileSync(__dirname + "/background.js", "utf8");
assert(/importScripts\("core\/ask-site\.js"\)/.test(bg) && /askNoteSite\(_sender\);/.test(bg), "background.js loads and uses the chooser");
assert(/'core\/ask-site\.js', 'background\.js'/.test(fs.readFileSync(__dirname + "/release-tools/build-firefox.py", "utf8")), "Firefox loads it before background.js");
console.log("PASS Ask PlazCode site: runs on the AI chat the person last used (every supported site known), DeepSeek only as the fallback.");
