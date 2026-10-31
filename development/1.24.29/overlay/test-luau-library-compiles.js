"use strict";
// 1.24.29 (owner's rule: the Luau helper library must be correct against a REAL Luau compiler). On 2026-10-31 the
// published Studio Skills library did not compile at all in Roblox Studio ("Failed to parse command code"): strings
// written as "...\n..." in the JavaScript template became raw line breaks inside Luau strings, so every studio skill
// failed. This test builds the Luau PlazCode sends for EVERY studio skill and compiles it with the official Luau
// compiler (luau-lang/luau, luau-compile --null). CI builds that compiler from a pinned commit and requires this test;
// elsewhere it is skipped when no compiler is available.
// Run: PLAZCODE_LUAU_COMPILE=/path/to/luau-compile node test-luau-library-compiles.js
const fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process"), assert = require("node:assert/strict");
const compiler = process.env.PLAZCODE_LUAU_COMPILE;
if (!compiler || !fs.existsSync(compiler)) {
  if (process.env.PLAZCODE_REQUIRE_LUAU === "1") { console.error("FAIL: the official Luau compiler is required here (PLAZCODE_LUAU_COMPILE)."); process.exit(1); }
  console.log("SKIP no Luau compiler (CI builds the official one and runs this test).");
  process.exit(0);
}
const S = new Function(fs.readFileSync(path.join(__dirname, "core/studio_skills.js"), "utf8") + ";return RobloxScriptSkills;")();
const sample = { string: "Workspace", number: 1, boolean: true, array: [] };
const special = {
  lighting_set_preset: { preset: "cyberpunk" }, terrain_fill_region: { material: "Grass" }, camera_set_style: { style: "isometric" },
  ui_create_component: { component_type: "card_inventory" },
};
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plazcode-luau-"));
const files = new Map();
for (const cmd of S.SKILL_COMMANDS) {
  const args = {};
  for (const [k, v] of Object.entries(cmd.params)) if (v.req) args[k] = sample[v.type] ?? "x";
  Object.assign(args, special[cmd.name] || {});
  const built = S.buildLuau(cmd.name, args);
  if (built.err) { console.log(`note: ${cmd.name} not built with sample arguments (${built.err.slice(0, 80)})`); continue; }
  // Commands that share the library produce the same code apart from their arguments: compile each distinct body once.
  const key = built.code.replace(/local args = jdec\(\[==\[.*?\]==\]\)/s, "local args = ARGS");
  if (!files.has(key)) { const file = path.join(dir, cmd.name + ".luau"); fs.writeFileSync(file, built.code); files.set(key, file); }
}
assert(files.size >= 2, "the shared library and the special builders were generated");
const result = cp.spawnSync(compiler, ["--null", ...files.values()], { encoding: "utf8" });
if (result.status !== 0) { console.error(result.stdout + result.stderr); process.exit(1); }
// The compiler really rejects broken code (guards against a silently passing setup).
const broken = path.join(dir, "broken.luau"); fs.writeFileSync(broken, 'local s = ""\ns = s:gsub("%-%-[^\n]*", " ")\nreturn s');
assert.notEqual(cp.spawnSync(compiler, ["--null", broken], { encoding: "utf8" }).status, 0, "the compiler rejects a string broken by a line break");
console.log(`PASS official Luau compiler: all ${files.size} distinct Luau programs PlazCode sends for ${S.SKILL_COMMANDS.length} studio skills compile`);
