"use strict";
// 1.24.29 (owner, 2026-10-31): "the AI does a bunch of individual script reads which takes forever; add a tool it uses
// by default to read many scripts at once". Checks the read_scripts command, its safety class and the prompts, and
// guards the Studio Skills Luau library against the bug found while building it: strings written as "...\n..." in the
// JavaScript template became a raw line break inside a Luau string, so Studio refused to compile the WHOLE library and
// every studio skill failed ("Failed to parse command code", confirmed in real Studio on 2026-10-31).
// Run: node test-read-scripts.js
const fs = require("fs"), vm = require("vm"), assert = require("node:assert/strict");
const dir = __dirname;
const skillsSrc = fs.readFileSync(dir + "/core/studio_skills.js", "utf8");
const S = new Function(skillsSrc + ";return RobloxScriptSkills;")();

// ── 1. Every Luau string in the library is closed on its own line (a tiny Lua lexer). ─────────────────────────
function luaStringProblems(code) {
  const problems = []; let i = 0, line = 1;
  const longOpen = (at) => { const m = /^\[(=*)\[/.exec(code.slice(at, at + 40)); return m ? m[1].length : -1; };
  while (i < code.length) {
    const c = code[i];
    if (c === "\n") { line++; i++; continue; }
    if (c === "-" && code[i + 1] === "-") {
      const level = longOpen(i + 2);
      if (level >= 0) { const close = "]" + "=".repeat(level) + "]", end = code.indexOf(close, i + 2); if (end < 0) { problems.push(line + ": unclosed long comment"); break; } line += (code.slice(i, end).match(/\n/g) || []).length; i = end + close.length; continue; }
      while (i < code.length && code[i] !== "\n") i++; continue;
    }
    if (c === "[") {
      const level = longOpen(i);
      if (level >= 0) { const close = "]" + "=".repeat(level) + "]", end = code.indexOf(close, i); if (end < 0) { problems.push(line + ": unclosed long string"); break; } line += (code.slice(i, end).match(/\n/g) || []).length; i = end + close.length; continue; }
    }
    if (c === '"' || c === "'" || c === "`") {
      const start = line; let j = i + 1, ok = false;
      while (j < code.length) {
        if (code[j] === "\\") { if (code[j + 1] === "\n") line++; j += 2; continue; }
        if (code[j] === "\n") break;
        if (code[j] === c) { ok = true; break; }
        j++;
      }
      if (!ok) { problems.push(start + ": string broken by a line break: " + code.slice(i, i + 50).replace(/\n/g, "⏎")); i = j; continue; }
      i = j + 1; continue;
    }
    i++;
  }
  return problems;
}
const lib = S.SKILLS_LIB_LUA;
assert.deepEqual(luaStringProblems(lib), [], "every Luau string in the Studio Skills library is closed on its line");
// The guard must catch exactly the shipped bug.
assert(luaStringProblems('s = s:gsub("%-%-[^\n]*", " ")').length >= 1, "a raw line break inside a string is caught");
assert.equal(luaStringProblems('s = s:gsub("%-%-[^\\n]*", " ")').length, 0, "an escaped \\n is fine");
assert.equal(luaStringProblems("local t = [==[\nmulti\nline\n]==] -- [[\nnot code\n]]").length, 0, "long strings and comments may span lines");
console.log("PASS Studio Skills library: every Luau string is closed on its own line (the whole library compiles again)");

// ── 2. read_scripts: registered, read-only, tolerant arguments. ─────────────────────────────────────────────────
assert(S.SKILL_OPS.includes("read_scripts"));
assert(/^\s*read_scripts = api\.read_scripts,$/m.test(lib), "dispatched in the Luau library");
const argsOf = (built) => JSON.parse(/local args = jdec\(\[==\[(.*?)\]==\]\)/s.exec(built.code)[1]);
assert.deepEqual(argsOf(S.buildLuau("read_scripts", { path: "ServerScriptService.Main", folder: "StarterGui", cursor: 3 })),
  { op: "read_scripts", cursor: "3", paths: ["ServerScriptService.Main"], folders: ["StarterGui"] }, "single path/folder and a numeric cursor");
assert.deepEqual(argsOf(S.buildLuau("read_scripts", { paths: "A.B, C.D", max_chars: "5000" })), { op: "read_scripts", paths: ["A.B", "C.D"], max_chars: 5000 }, "comma-separated paths");
assert.deepEqual(argsOf(S.buildLuau("read_scripts", {})), { op: "read_scripts" }, "no params = the whole game");
const described = S.describeCommands().find((l) => l.startsWith("read_scripts:"));
assert(/many scripts in ONE call/.test(described) && /Use it instead of script_read/.test(described), "the AI is told what it is for");
const fn = lib.slice(lib.indexOf("function api.read_scripts(a)"), lib.indexOf("function api.script_analysis(a)"));
assert(/math\.clamp\(math\.floor\(tonumber\(a\.max_chars\) or 60000\), 2000, 90000\)/.test(fn), "pages default to 60,000 and stay below Studio's 100,000 limit");
assert(/SES:GetEditorSource\(s\)/.test(fn) && /s\.Source/.test(fn), "unsaved editor text first, saved source as fallback");
assert(!/:Destroy\(|\.Parent\s*=|:Clone\(|SetAttribute|\.Source\s*=|UpdateSourceAsync|Instance\.new/.test(fn), "read_scripts changes nothing");
const safety = new Function(fs.readFileSync(dir + "/core/safety.js", "utf8") + ";return PlazCodeSafety;")();
assert.equal(safety.isChange("read_scripts", "studio"), false, "read_scripts is a read in Read-only mode");
assert.equal(safety.isChange("execute_luau", "studio"), true, "execute_luau itself still counts as a change");
console.log("PASS read_scripts: registered, read-only, accepts the shapes AIs send, pages under Studio's limit");

// ── 3. Its inner execute_luau is PlazCode's own trusted read; the AI cannot use that path. ───────────────────────
const main = fs.readFileSync(dir + "/core/main.js", "utf8");
assert(/const TRUSTED_READS = new WeakSet\(\);/.test(main), "a private object set, never reachable from the AI's text");
assert(/const trustedRead = bareName === "execute_luau" && TRUSTED_READS\.has\(call\);/.test(main));
assert(/if \(!trustedRead && safetySettings\.readOnly && PlazCodeSafety\.isChange\(bareName, safetyEngine\)\)/.test(main), "Read-only refusal skips only trusted reads");
assert(/if\(trustedRead\)\{\s*\/\/ PlazCode's own read: nothing to approve\.\s*\}else if\(typeof approvalMode!=="undefined"&&approvalMode\)\{/.test(main), "approvals skip only trusted reads");
assert(/const readOnlySkill = !PlazCodeSafety\.isChange\(name, "studio"\);/.test(main) && /if \(readOnlySkill\) TRUSTED_READS\.add\(inner\);/.test(main), "only read-only skills are marked");
assert(/readOnlySkill \? \{ _orNoTxn: true \} : \{\}/.test(main), "reads add no Studio undo step");
assert(/if \(PlazCodeSafety\.isChange\(name, "studio"\)\) \{ try \{ createCheckpoint\(name, args\); \} catch \{\} \}/.test(main), "reads add no undo-history entry");
assert.equal((main.match(/TRUSTED_READS\.add\(/g) || []).length, 1, "nothing else marks calls as trusted");
console.log("PASS trusted reads: only PlazCode's own read-only skills skip Read-only and approval checks");

// ── 4. The AI uses it by default. ─────────────────────────────────────────────────────────────────────────────
const cfg = fs.readFileSync(dir + "/core/config.js", "utf8"), lean = fs.readFileSync(dir + "/core/lean-startup.js", "utf8");
assert(/READ FAST: read code with read_scripts/.test(cfg) && /Never read scripts one by one with script_read/.test(cfg), "full startup prompt");
assert(/- READ FAST: read code with read_scripts/.test(lean) && /COMMANDS \(parameters come from list_commands\): read_scripts, /.test(lean), "short startup prompt");
assert(/script_read\|read_scripts\|script_search/.test(cfg), "counted as a read tool");
console.log("PASS the startup prompts tell the AI to read with read_scripts by default");
