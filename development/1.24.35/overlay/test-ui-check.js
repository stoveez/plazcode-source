"use strict";
// UI standard + ui_audit + automatic UI check (owner, 2026-11-19). Run: node test-ui-check.js
// With the official Luau VM (CI builds it next to luau-compile; or set PLAZCODE_LUAU) the real ui_audit Luau is also run
// against stand-in screens (release-tools/ui-audit-mock.luau).
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), cp = require("node:child_process"), os = require("node:os");
const U = require("./core/ui-check.js");

// 1. Which commands change UI.
assert.equal(U.changesUi({ tool: "ui_build", arguments: {} }), true);
assert.equal(U.changesUi({ tool: "roblox__ui_set_text", arguments: {} }), true);
assert.equal(U.changesUi({ tool: "execute_luau", arguments: { code: 'local f=Instance.new("Frame") f.Size=UDim2.new(0,1,0,1)' } }), true);
assert.equal(U.changesUi({ tool: "plazcode_batch", arguments: { calls: [{ command: "ui_create_component", params: {} }] } }), true);
for (const c of [{ tool: "ui_audit" }, { tool: "ui_tokens" }, { tool: "ui_tokens_set" }, { tool: "ui_list_tree" }, { tool: "execute_luau", arguments: { code: "workspace.Part.Anchored=true" } }, { tool: "multi_edit" }, null])
  assert.equal(U.changesUi(c), false, JSON.stringify(c));
assert.deepEqual(U.errorsIn("ui_audit (HUD): 1 error(s)\nERROR phone HUD.Buy: too small\nwarn style: x"), ["ERROR phone HUD.Buy: too small"]);

// 2. The finish check: only new errors, at most 2 rounds, then a plain notice.
function rig(reports) {
  const s = { audits: 0, status: [], banners: [], enabled: true, roblox: true, stop: false };
  const api = U.create({
    enabled: () => s.enabled, roblox: () => s.roblox, stopped: () => s.stop,
    audit: async () => { const r = reports[Math.min(s.audits, reports.length - 1)]; s.audits++; return r; },
    status: (t) => s.status.push(t), banner: (a, b) => s.banners.push([a, b]),
  });
  return { s, api };
}
const OLD = "ERROR phone Old.Close: too small to tap on a phone (20x20 px, needs at least 44x44)";
const NEW = "ERROR phone Shop.Buy: text is cut off (needs 300x20 px at size 18, box is 120x40)";
(async () => {
  let { s, api } = rig(["head\n" + OLD, "head\n" + OLD + "\n" + NEW, "head\n" + OLD + "\n" + NEW.replace("300", "290"), "head\n" + OLD + "\n" + NEW]);
  await api.before({ tool: "ui_build" }); // the person's old screens already had one problem
  api.note({ tool: "ui_build" });
  await api.before({ tool: "ui_build" }); assert.equal(s.audits, 1, "the starting point is read once per task");
  const first = await api.afterDone();
  assert.match(first, /UI CHECK/); assert.match(first, /Shop\.Buy/); assert.doesNotMatch(first, /Old\.Close/, "old problems are not the AI's job"); assert.match(first, /Fix round 1 of 2/);
  assert.match(await api.afterDone(), /Fix round 2 of 2/, "the same problem with other numbers is still the same problem");
  assert.equal(await api.afterDone(), null); assert.equal(s.banners.length, 1); assert.match(s.banners[0][1], /Shop\.Buy/);
  // Fixed: passes.
  ({ s, api } = rig(["head", "head\n" + NEW, "head"]));
  await api.before({ tool: "ui_build" }); api.note({ tool: "ui_build" });
  assert.match(await api.afterDone(), /round 1/); assert.equal(await api.afterDone(), null); assert(s.status.some((x) => /passed/.test(x)));
  // No UI change, switched off, Studio silent, new task.
  ({ s, api } = rig(["head\n" + NEW])); api.note({ tool: "multi_edit" }); assert.equal(await api.afterDone(), null); assert.equal(s.audits, 0);
  ({ s, api } = rig(["head\n" + NEW])); s.enabled = false; api.note({ tool: "ui_build" }); assert.equal(await api.afterDone(), null); assert.equal(s.audits, 0);
  ({ s, api } = rig([null])); api.note({ tool: "ui_build" }); assert.equal(await api.afterDone(), null); assert(s.status.some((x) => /skipped/.test(x)));
  ({ s, api } = rig(["head\n" + NEW])); api.note({ tool: "ui_build" }); api.reset(); assert.equal(await api.afterDone(), null);

  // 3. Wiring: studio skills, safety, the UI standard topic, the menu switch and the finish order.
  const R = new Function(fs.readFileSync("core/studio_skills.js", "utf8") + ";return RobloxScriptSkills;")();
  for (const op of ["ui_audit", "ui_tokens", "ui_tokens_set"]) { assert(R.SKILL_OPS.includes(op), op); assert(!R.buildLuau(op, op === "ui_tokens_set" ? { tokens: { font: "Gotham" } } : {}).err, op); }
  const Safety = new Function(fs.readFileSync("core/safety.js", "utf8") + ";return PlazCodeSafety;")();
  assert.equal(Safety.isChange("ui_audit", "roblox"), false); assert.equal(Safety.isChange("ui_tokens", "roblox"), false); assert.equal(Safety.isChange("ui_tokens_set", "roblox"), true);
  assert.match(fs.readFileSync("agent/src/safety.rs", "utf8"), /"ui_audit", "ui_tokens"/, "the app's safety list matches");
  const lean = fs.readFileSync("core/lean-startup.js", "utf8");
  assert.match(lean, /UI STANDARD \(PlazCode/); assert.match(lean, /build: s => join\(UI_STANDARD,/);
  const main = fs.readFileSync("core/main.js", "utf8");
  assert.match(main, /data-mode="uicheck"/); assert.match(main, /rsUiCheck/); assert.match(main, /await uiCheck\?\.before\(call\)/);
  const ui = main.indexOf("fix = finishUi ? await finishUi.afterDone()"), play = main.indexOf("fix = await finishPlay.afterDone()");
  assert(ui > 0 && play > ui, "the UI check runs before the playtest");
  const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
  for (const cs of manifest.content_scripts.filter((c) => c.js.includes("core/main.js"))) assert(cs.js.indexOf("core/ui-check.js") > -1 && cs.js.indexOf("core/ui-check.js") < cs.js.indexOf("core/main.js"));
  const en = JSON.parse(fs.readFileSync("core/locales/en.json", "utf8"));
  for (const w of ["Check UI when done", "UI check passed: no new layout problems", "UI check still shows problems"]) assert(w in en, w);

  // 4. The real ui_audit Luau on stand-in screens (needs the official Luau VM).
  const vm = process.env.PLAZCODE_LUAU || (process.env.PLAZCODE_LUAU_COMPILE ? path.join(path.dirname(process.env.PLAZCODE_LUAU_COMPILE), "luau") : "");
  if (!vm || !fs.existsSync(vm)) {
    if (process.env.PLAZCODE_REQUIRE_LUAU === "1") throw new Error("the official Luau VM is required here but was not found at " + vm);
    console.log("PASS ui check (Luau run skipped: no Luau VM; CI runs it)"); return;
  }
  let script = fs.readFileSync("release-tools/ui-audit-mock.luau", "utf8");
  for (const [op, a] of [["ui_audit", { screen: "Good" }], ["ui_audit", { screen: "Bad" }], ["ui_tokens", {}]]) {
    const code = R.buildLuau(op, a).code; assert(!code.includes("]=====]"));
    script += "\nprint(runLib([=====[" + code + "]=====]))\n";
  }
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "plazcode-ui-audit-")), "run.luau");
  fs.writeFileSync(file, script);
  const run = cp.spawnSync(vm, [file], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const [good, bad, tokens] = run.stdout.split(/\n(?=\{"ok")/);
  assert.match(good, /0 error\(s\)/, good);
  for (const want of [/Bad\.Away: partly off screen/, /Bad\.B: overlaps the button Bad\.A/, /Bad\.Dim: text is hard to read/, /Bad\.Long: text is cut off/, /Bad\.Tiny: too small to tap/, /5 error\(s\)/])
    assert.match(bad, want);
  assert.doesNotMatch(bad, /Item\d/, "buttons in a UIListLayout do not overlap each other");
  assert.doesNotMatch(bad, /Deep/, "content scrolled out of view in a ScrollingFrame is not cut off");
  assert.match(tokens, /No UI design tokens saved/);
  console.log("PASS ui check: UI changes found, only new errors sent, 2 rounds, wired before the playtest; real ui_audit Luau finds every planted problem");
})().catch((e) => { console.error(e); process.exit(1); });
