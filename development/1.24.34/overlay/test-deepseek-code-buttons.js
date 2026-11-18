// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Owner (2026-11-18), screenshot of a Russian DeepSeek page: DeepSeek answered the startup probe correctly with
// {"command":"list_commands"}, twice, and PlazCode still said "Startup handshake failed". The reply read 48
// characters: "json" + "Копировать" + "Скачать" + the command, because the code box's Copy/Download captions are
// in the page's language and were glued onto the command. DeepSeek's reply reader must leave the code box's
// buttons out in any language and keep the language label. Run: node test-deepseek-code-buttons.js
const fs = require("fs"), vm = require("vm"), assert = require("node:assert/strict"), { parse } = require("acorn");
const { JSDOM } = require("jsdom");
const source = fs.readFileSync(__dirname + "/providers/deepseek.js", "utf8"), functions = {};
(function walk(n) { if (!n || typeof n !== "object") return; if (n.type === "FunctionDeclaration") functions[n.id.name] = source.slice(n.start, n.end); for (const v of Object.values(n)) if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") walk(v); })(parse(source, { ecmaVersion: "latest" }));
const constLine = source.match(/  const CODE_BUTTON = [^\n]+\n/);
assert(constLine && functions.mdText, "DeepSeek has its code-button-free reply reader");
const P = new Function(fs.readFileSync(__dirname + "/core/parser.js", "utf8") + ";return RSParse;")();
const probe = '{"command":"list_commands"}';

function reply(html) {
  const dom = new JSDOM("<body><div class='ds-markdown'>" + html + "</div></body>");
  const box = { document: dom.window.document };
  vm.createContext(box);
  vm.runInContext(functions.safeRead + functions.safeQuery + functions.safeQueryAll + functions.safeClosest + constLine[0] + functions.mdText + ";this.mdText=mdText;", box);
  return box.mdText(dom.window.document.querySelector(".ds-markdown"));
}
const codeBox = (label, buttons, code) =>
  "<div class='md-code-block md-code-block-dark'><div class='md-code-block-banner-wrap'><div class='md-code-block-banner'>" +
  "<div class='d2a24f03'><span class='d813de27'>" + label + "</span></div><div class='efa13877'>" + buttons +
  "</div></div></div><pre><span class='token'>" + code + "</span></pre></div>";

// The owner's page: Russian captions on DeepSeek's design-system buttons (div role=button) and on real <button>s.
for (const [why, buttons] of [
  ["Russian ds buttons", "<div role='button' class='ds-atom-button ds-text-button'><div class='ds-icon'><svg></svg></div><span>Копировать</span></div><div role='button' class='ds-atom-button ds-text-button'><span>Скачать</span></div>"],
  ["Russian <button>s", "<button class='ds-button'><span>Копировать</span></button><button class='ds-button'><span>Скачать</span></button>"],
  ["Chinese buttons", "<div role='button' class='ds-atom-button'><span>复制</span></div><div role='button' class='ds-atom-button'><span>下载</span></div>"],
  ["a caption the command reader has never heard of", "<div role='button'><span>Zkopírovat</span></div><div role='button'><span>Stáhnout</span></div>"],
]) {
  const text = reply(codeBox("json", buttons, probe));
  assert.equal(text, "json" + probe, why + ": only the language label and the code are read");
  assert.equal(P.parseToolCalls(text).map((c) => c.tool).join(","), "list_commands", why + ": the startup probe runs");
}
// A text-labelled code box stays quoted material.
assert.equal(P.parseToolCalls(reply(codeBox("text", "<div role='button'><span>Копировать</span></div>", probe))).length, 0, "a text-labelled block is not run");
// A sentence before the code box still reads the same; replies without buttons are read exactly as before.
assert.equal(reply("<p>Отправляю.</p>" + codeBox("json", "<div role='button'><span>Копировать</span></div>", probe)), "Отправляю.json" + probe);
assert.equal(reply("<p>Plain answer with <b>bold</b>.</p>"), "Plain answer with bold.");
// A button that is part of the answer itself (not in a code box) is kept.
assert.equal(reply("<p>Press <button>OK</button> then wait.</p>"), "Press OK then wait.");
console.log("PASS DeepSeek code box: Copy/Download captions in any language are left out of the reply, so the startup probe runs on non-English DeepSeek pages.");
