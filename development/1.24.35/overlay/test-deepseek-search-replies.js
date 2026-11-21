"use strict";
// Owner (2026-11-21, two console logs and screenshots): with DeepSeek's web search on, the AI kept writing correct commands
// in a json code block, but PlazCode read the reply as a plain answer: nothing ran, the raw JSON stayed on screen, and the
// run stopped ("it continued but wouldn't use tools, just raw json blocks"). The reply is read as textContent, which glues
// the line before the code block onto the code: "...Windows build .2json{...}" (a search citation number) or
// "Goal: download MuMu installerjson{...}" (a heading). Now every code block starts on its own line, and a citation number
// after a sentence end is allowed too. Run: node test-deepseek-search-replies.js
const fs = require("fs"), assert = require("node:assert/strict"), { JSDOM } = require("jsdom");
const source = fs.readFileSync(__dirname + "/providers/deepseek.js", "utf8"), parser = fs.readFileSync(__dirname + "/core/parser.js", "utf8");
const P = new Function(parser + ";return RSParse;")();
const block = (code) => `<div class="md-code-block md-code-block-dark"><div class="md-code-block-banner-wrap"><div class="md-code-block-banner"><span class="d813de27">json</span><div class="efa13877"><div role="button" class="ds-atom-button ds-text-button"><span>Copy</span></div><div role="button" class="ds-atom-button ds-text-button"><span>Download</span></div></div></div></div><pre><span class="token">${code}</span></pre></div>`;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const first = String.raw`{"command": "run_command", "params": {"command": "powershell -NoProfile -Command \"$r=Invoke-WebRequest -Uri 'https://mumu.163.com/download/' -UseBasicParsing; ($r.Links | Where-Object { $_.href -match '\\.exe' } | Select-Object -First 5 href) | Format-List\"", "timeout_seconds": 30}}`;
const second = String.raw`{"command": "run_command", "params": {"command": "curl -L -o \"%USERPROFILE%\\Downloads\\MuMuInstaller2.exe\" \"https://example.com/MuMuInstaller.exe\" && dir \"%USERPROFILE%\\Downloads\\MuMuInstaller2.exe\"", "timeout_seconds": 180}}`;
const replies = {
  // Screenshot 1: a search answer; the paragraph ends with a citation number (a link chip) right before the code block.
  citation: `<p>HTML page saved as .exe. The <code>adl.netease.com</code> endpoint served a redirect/error page, not a binary.</p><p>The download URL was wrong. I'll pull the link from the official MuMu site (<code>mumu.163.com/download/</code>), which lists the current V6.8.11 Windows build .<a class="ds-markdown-cite" href="https://mumu.163.com/"><span>2</span></a></p>${block(esc(first))}`,
  // Screenshot 2: a heading with no full stop right before the code block.
  heading: `<p><strong>Goal: download MuMu installer</strong></p>${block(esc(second))}`,
};
function read(html) {
  const dom = new JSDOM(`<body><div class="ds-message"><div class="ds-markdown">${html}</div></div></body>`, { runScripts: "outside-only", url: "https://chat.deepseek.com/a/chat/s/1" });
  const w = dom.window;
  w.chrome = { runtime: { sendMessage() {}, onMessage: { addListener() {} } }, storage: { local: { get(_, cb) { cb && cb({}); }, set() {} } } };
  w.eval(parser + ";window.RSParse=RSParse;" + source + ";window.__P=RSProvider;");
  return w.__P.classifyText(w.document.querySelector(".ds-message"), ".rs-chip");
}
for (const [name, html] of Object.entries(replies)) {
  const text = read(html);
  assert(!/Copy|Download\{/.test(text.replace(/MuMuInstaller|Downloads/g, "")), name + ": the code block's buttons are left out");
  assert.match(text, /\njson\{"command"/, name + ": the code block starts on its own line");
  const calls = P.parseToolCalls(text);
  assert.equal(calls.length, 1, name + ": the command is found: " + JSON.stringify(text.slice(-120)));
  assert.equal(calls[0].tool, "run_command");
  assert(P.hasToolSignature(text), name + ": the reply counts as a command, not a plain answer");
}
// The old glued reading, too: a citation number after a sentence end is still the end of the sentence.
assert.equal(P.parseToolCalls("lists the current Windows build .2json" + first).length, 1, "citation number glued on");
assert.equal(P.parseToolCalls("as shown in the docs.[3]json" + first).length, 1, "bracketed citation glued on");
// Prose that merely mentions a command is still not a command.
assert.equal(P.parseToolCalls('To list files you could send {"command": "list_directory", "params": {}} later.').length, 0, "prose example stays prose");
assert.equal(P.parseToolCalls('see note 2' + first).length, 0, "a number with no sentence end before it is not a citation");
console.log("PASS DeepSeek search answers: commands after a citation number or a heading are found and run; prose examples stay prose");
