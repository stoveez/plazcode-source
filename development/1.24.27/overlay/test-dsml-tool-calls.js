// 1.24.27 (owner, 2026-10-30): DeepSeek sometimes writes tool calls in its own built-in
// "DSML" markup instead of PlazCode's JSON. It was shown as raw text and never ran.
// Also: AgentScript extras returned results headed with the INNER command's name
// (env_info answered "Output of 'file_info'" plus an "unknown command list_dir" error),
// which made the AI report results as cross-wired. Run: node test-dsml-tool-calls.js
const fs = require("node:fs"), vm = require("node:vm"), assert = require("node:assert/strict");
const RSParse = new Function(fs.readFileSync(__dirname + "/core/parser.js", "utf8") + "; return RSParse;")();

// 1. The documented DeepSeek format runs, with string="false" values decoded as JSON.
const doc = [
  "There's another map system in StarterGui. Let me check it.",
  "<｜DSML｜tool_calls>",
  '<｜DSML｜invoke name="search_game_tree">',
  '<｜DSML｜parameter name="path" string="true">StarterGui.GameMapGui</｜DSML｜parameter>',
  '<｜DSML｜parameter name="head_limit" string="false">80</｜DSML｜parameter>',
  "</｜DSML｜invoke>",
  "</｜DSML｜tool_calls>",
].join("\n");
assert.deepEqual(RSParse.parseToolCalls(doc), [{ tool: "search_game_tree", arguments: { path: "StarterGui.GameMapGui", head_limit: 80 } }]);
assert(RSParse.hasToolSignature(doc) && RSParse.hasCommandShape(doc), "a DSML call is recognised as a command");
assert.equal(RSParse.toolNameFromText(doc), "search_game_tree", "the card shows the real command name");
assert.equal(RSParse.hasOpenToolBlock(doc), false, "a finished DSML call is not treated as still streaming");

// 2. The form seen on the page (ASCII/doubled bars, spaces, "calls" wrapper), all on one line
// because DeepSeek's paragraphs are joined without newlines.
const page = '< | | DSML | | calls>< | | DSML | | invoke name="search_game_tree">< | | DSML | | parameter name="datamodel_type" string="true">Edit</ | | DSML | | parameter>' +
  '< | | DSML | | parameter name="path" string="true">StarterGui.GameMapGui</ | | DSML | | parameter>< | | DSML | | parameter name="head_limit" string="false">80</ | | DSML | | parameter>' +
  "</ | | DSML | | invoke></ | | DSML | | calls>";
assert.deepEqual(RSParse.parseToolCalls(page), [{ tool: "search_game_tree", arguments: { datamodel_type: "Edit", path: "StarterGui.GameMapGui", head_limit: 80 } }]);

// 3. Raw-string values keep code exactly (quotes, braces, newlines); JSON values decode
// objects/arrays/booleans; a whole-object "params" parameter is unwrapped.
const code = 'local t = {a = "x"}\nprint(t.a)';
const luau = RSParse.parseToolCalls('<｜DSML｜tool_calls>\n<｜DSML｜invoke name="execute_luau">\n<｜DSML｜parameter name="code" string="true">' + code +
  '</｜DSML｜parameter>\n<｜DSML｜parameter name="datamodel_type" string="true">Edit</｜DSML｜parameter>\n</｜DSML｜invoke>\n</｜DSML｜tool_calls>');
assert.deepEqual(luau, [{ tool: "execute_luau", arguments: { code, datamodel_type: "Edit" } }]);
const json = RSParse.parseToolCalls('<｜DSML｜invoke name="multi_edit"><｜DSML｜parameter name="edits" string="false">[{"old_string":"a","new_string":"b"}]</｜DSML｜parameter>' +
  '<｜DSML｜parameter name="dry_run" string="false">true</｜DSML｜parameter></｜DSML｜invoke>');
assert.deepEqual(json, [{ tool: "multi_edit", arguments: { edits: [{ old_string: "a", new_string: "b" }], dry_run: true } }]);
const wrapped = RSParse.parseToolCalls('<｜DSML｜invoke name="script_read"><｜DSML｜parameter name="params" string="false">{"target_file":"A.B"}</｜DSML｜parameter></｜DSML｜invoke>');
assert.deepEqual(wrapped, [{ tool: "script_read", arguments: { target_file: "A.B" } }]);
assert.deepEqual(RSParse.parseToolCalls('<｜DSML｜invoke name="list_commands"></｜DSML｜invoke>'), [{ tool: "list_commands", arguments: {} }], "a call with no parameters runs");
// A JSON command inside a DSML parameter is a value, never the call itself.
const nested = RSParse.parseToolCalls('<｜DSML｜invoke name="write_file"><｜DSML｜parameter name="content" string="true">{"command":"delete_path"}</｜DSML｜parameter>' +
  '<｜DSML｜parameter name="path" string="true">x.json</｜DSML｜parameter></｜DSML｜invoke>');
assert.deepEqual(nested, [{ tool: "write_file", arguments: { content: '{"command":"delete_path"}', path: "x.json" } }]);

// 4. While DeepSeek is still writing, the call is open and nothing runs early.
const half = doc.slice(0, doc.indexOf("</｜DSML｜invoke>"));
assert.equal(RSParse.hasOpenToolBlock(half), true, "an unfinished invoke keeps the watcher waiting");
assert.equal(RSParse.parseToolCalls(half).length, 0, "an unfinished invoke never runs");
assert.equal(RSParse.hasOpenToolBlock(doc.slice(0, doc.indexOf("</｜DSML｜tool_calls>"))), true, "an unclosed wrapper may still get another invoke");
assert.equal(RSParse.parseToolCalls(doc.slice(0, doc.indexOf("</｜DSML｜tool_calls>"))).length, 1, "a finished invoke still runs once generation has ended");

// 5. Prose that only mentions DSML is not a command; the old formats are unchanged.
assert.equal(RSParse.hasToolSignature("DeepSeek has a DSML format for tools."), false);
assert.equal(RSParse.hasCommandShape("Use <DSML> tags? No, use JSON."), false);
assert.deepEqual(RSParse.parseToolCalls('{"command":"script_read","params":{"target_file":"A"}}'), [{ tool: "script_read", arguments: { target_file: "A" } }]);
assert.equal(RSParse.parseToolCalls("###LUA###\nreturn 1\n###END_LUA###")[0].tool, "execute_luau");

// 6. DeepSeek hides the raw DSML behind the tool card, through the wrapper closer.
const ds = fs.readFileSync(__dirname + "/providers/deepseek.js", "utf8");
const fnStart = ds.indexOf("  function findToolBlockSpot(item, chip) {");
const fnEnd = ds.indexOf("\n  return {", fnStart); // the provider object follows the function
assert(fnStart !== -1 && fnEnd > fnStart, "findToolBlockSpot found");
const el = (text, kids = []) => {
  const node = { textContent: text, children: kids, parentElement: null, classList: { names: new Set(), add(n) { this.names.add(n); } }, contains: (x) => x === node };
  kids.forEach((k) => { k.parentElement = node; });
  return node;
};
const paras = ["Now let me look at the GameMapGui tree.", "< | | DSML | | calls>", '< | | DSML | | invoke name="search_game_tree">',
  '< | | DSML | | parameter name="path" string="true">StarterGui.GameMapGui</ | | DSML | | parameter>', "</ | | DSML | | invoke>", "</ | | DSML | | calls>", "Done."].map((t) => el(t));
const container = el(paras.map((p) => p.textContent).join(""), paras);
const scope = { RSParse, S: { markdown: ".md", thinking: ".think" }, safeQueryAll: () => [container], safeClosest: () => null, safeRead: (f, d) => { try { return f(); } catch { return d; } } };
vm.createContext(scope);
vm.runInContext(ds.slice(fnStart, fnEnd) + ";this.find=findToolBlockSpot;", scope);
const spot = scope.find({}, null);
const hidden = paras.map((p) => p.classList.names.has("rs-tool-hide"));
assert.deepEqual(hidden, [false, true, true, true, true, true, false], "every DSML paragraph is hidden, prose around it is kept");
assert.equal(spot.ref, paras[1], "the card goes where the DSML call started");

// 7. AgentScript extras: results carry the extra's own name, never the inner command's,
// list_recent uses the real list_directory, and env_info is the desktop app's own.
const extras = {};
vm.createContext(extras);
vm.runInContext(fs.readFileSync(__dirname + "/core/agent_skills.js", "utf8") + ";this.S=AgentScriptSkills;", extras);
const S = extras.S;
assert.equal(S.SKILL_OPS.includes("env_info"), false, "env_info reaches the desktop app's real command");
const calls = [];
const fake = async ({ tool, arguments: a }) => {
  calls.push(tool);
  if (tool === "file_info") return "Output of 'file_info':\nfile.txt  file  12 B";
  if (tool === "run_command") return "Output of 'run_command':\n## main";
  if (tool === "list_directory") return "Output of 'list_directory':\n[file] a.txt (12 B)";
  return "ERROR calling '" + tool + "': it failed";
};
(async () => {
  assert.equal(await S.run("git_status", {}, fake), "Output of 'git_status':\n## main");
  assert.equal(await S.run("list_recent", {}, fake), "Output of 'list_recent':\n[file] a.txt (12 B)");
  assert.equal(calls.includes("list_dir"), false, "no call to the non-existent list_dir");
  const exists = await S.run("file_exists", { path: "file.txt" }, fake);
  assert.equal(exists, 'Output of \'file_exists\':\n{"path":"file.txt","exists":true}\nfile.txt  file  12 B');
  assert.equal((exists.match(/Output of '/g) || []).length, 1, "exactly one result heading");
  assert.equal(await S.run("replace_once", { path: "p", query: "q", replacement: "r" }, fake), "ERROR in 'replace_once' (while it ran read_file): it failed");
  assert.equal(await S.run("npm_script", {}, fake), "ERROR: missing required param 'script'");
  const src = fs.readFileSync(__dirname + "/core/agent_skills.js", "utf8");
  assert(!/call\("list_dir"/.test(src), "no extra calls list_dir");
  // 8. The desktop app's size labels divide by 1024 (they printed raw bytes as "TB").
  const rs = fs.readFileSync(__dirname + "/agent/src/workspace.rs", "utf8");
  assert(/value \/= 1024\.0;/.test(rs) && /human_size\(17179869184\.0\), "16\.0 GB"/.test(rs), "human_size divides and is unit-tested");
  console.log("DSML tool calls run on DeepSeek and are hidden behind the card; extras answer under their own name; sizes use the right unit.");
})().catch((e) => { console.error(e); process.exit(1); });
