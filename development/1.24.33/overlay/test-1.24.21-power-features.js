// 1.24.21: safety limits, the "What happened" log, saved site setups and shared skills.
const fs = require("fs"), vm = require("vm"), assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const Safety = require("./core/safety.js"), Log = require("./core/action-log.js"), Setups = require("./core/site-setups.js"), Skills = require("./core/skills-ui.js");
const main = fs.readFileSync("core/main.js", "utf8"), background = fs.readFileSync("background.js", "utf8");
const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8")), desktop = fs.readFileSync("agent/src/desktop.html", "utf8");
const flush = () => new Promise((r) => setTimeout(r, 20));

(async () => {
  // ── Safety ──────────────────────────────────────────────────────────────
  for (const [name, engine] of [["write_file", "local"], ["run_command", "local"], ["mouse_click", "local"], ["brand_new_tool", "local"], ["execute_luau", "studio"], ["multi_edit", "studio"], ["playwright__browser_click", "studio"], ["unity__manage_gameobject", "local"], ["headless_build", "studio"]])
    assert.equal(Safety.isChange(name, engine), true, name + " changes things");
  for (const [name, engine] of [["read_file", "local"], ["grep_files", "local"], ["script_read", "studio"], ["get_studio_state", "studio"], ["inspect_instance", "studio"], ["figma__get_design_context", "local"], ["playwright__browser_snapshot", "studio"], ["plazcode_memory", "studio"], ["web_search", "local"]])
    assert.equal(Safety.isChange(name, engine), false, name + " only looks");
  for (const cmd of ["rm -rf build", "del /q *.tmp", "Remove-Item -Recurse out", "RD /S /Q cache", "npx rimraf dist", "python -c \"import shutil; shutil.rmtree('x')\""]) assert.equal(Safety.isDelete("run_command", { command: cmd }, "local"), true, cmd);
  for (const cmd of ["npm test", "git status", "echo informed", "cargo build --release", "ls -la"]) assert.equal(Safety.isDelete("run_command", { command: cmd }, "local"), false, cmd);
  assert.equal(Safety.isDelete("delete_path", { path: "a" }, "local"), true);
  assert.equal(Safety.isDelete("delete_path", { path: "a" }, "studio"), false, "Studio deletes stay undoable in Studio");
  // Same delete words as the Rust backstop.
  const rust = fs.readFileSync("agent/src/safety.rs", "utf8");
  for (const word of ["rm", "rmdir", "del", "erase", "rd", "remove-item", "ri", "unlink", "shred", "rimraf"]) assert(rust.includes('"' + word + '"'), "rust knows " + word);
  assert.deepEqual(Safety.fromStorage({}), { readOnly: false, confirmDelete: true, allowedFolders: [] }, "defaults: deletes ask, read-only off");
  assert.deepEqual(Safety.normalizeFolders("C:\\Projects\\\n  \nc:\\projects\nD:/Games/"), ["C:\\Projects", "D:/Games"]);
  assert.match(Safety.stateLine({ readOnly: true, confirmDelete: true, allowedFolders: ["C:\\Work"] }), /READ-ONLY MODE ON[\s\S]*C:\\Work/);
  assert.equal(Safety.stateLine({ readOnly: false, confirmDelete: false, allowedFolders: [] }), "");

  // The one-shot delete permission rides on the call frame, never on AI arguments.
  {
    const a = main.indexOf("  // One-shot permission for the exact delete"), b = main.indexOf("  function requestApproval(op, args, opts) {");
    assert(a > 0 && b > a);
    const box = { Date }; vm.createContext(box);
    vm.runInContext(main.slice(a, b) + ";globalThis.wrap=withDeleteConfirmation;globalThis.allow=(k)=>{deleteConfirmation={key:k,expires:Date.now()+1000};};globalThis.key=deleteKey;", box);
    const frame = { type: "call_tool", name: "delete_path", arguments: { path: "a.txt", confirmed: true }, confirmed: true };
    assert.equal(box.wrap(frame).confirmed, undefined, "a frame the user never allowed loses any confirmed flag");
    box.allow(box.key("delete_path", { path: "a.txt" }));
    assert.equal(box.wrap({ ...frame, arguments: { path: "b.txt" } }).confirmed, undefined, "permission is for that exact file");
    assert.equal(box.wrap(frame).confirmed, true);
    assert.equal(box.wrap(frame).confirmed, undefined, "and only once");
  }
  // Wiring: refusal before Ask mode, prompt fails closed, frame forwarded, prefs synced, menu + app controls.
  const gate = main.indexOf("if (!trustedRead && safetySettings.readOnly && PlazCodeSafety.isChange(bareName, safetyEngine))"); // 1.24.29: PlazCode's own trusted reads skip it
  assert(gate > 0 && gate < main.indexOf('if (!deletes && permMode === "ask" && (ASK_OPS.has(bareName)'), "read-only and delete checks run before Ask mode");
  assert(main.includes('{kicker:"Safety", title:"Allow this delete?", failClosed:true,'));
  assert(!main.includes("resolve(!(opts && opts.failClosed))"), "a missing prompt never auto-allows anything");
  assert(/if \(!root \|\| !allow \|\| !deny\) \{ resolve\(false\); return; \}/.test(main), "a missing prompt denies every change");
  assert(!/body\.innerHTML\s*=\s*`<b>\$\{op\}/.test(main), "the approval text is never put in as HTML");
  assert(/approvalCancel\(\)/.test(main.slice(main.indexOf("function stopLoop"), main.indexOf("function stopLoop") + 1800)), "Stop closes an open approval prompt");
  assert(main.includes('if (msg && msg.type === "call_tool" && typeof withDeleteConfirmation === "function") msg = withDeleteConfirmation(msg);'));
  assert(background.includes("confirmed: msg.confirmed === true"));
  for (const key of ["rsReadOnly", "rsConfirmDelete", "rsAllowedFolders"]) { assert(background.includes('"' + key + '"'), key + " syncs with the app"); assert(desktop.includes(key), key + " in the app"); }
  assert(main.includes('data-mode="readonly"') && main.includes('data-mode="confirmdelete"') && main.includes('id="rs-allowed-folders"'));
  assert(main.includes("${safetyLine}"), "the AI is told about the limits");

  // ── What happened ──────────────────────────────────────────────────────
  assert.equal(Log.describe({ tool: "edit_file", target: "src/a.lua" }).text, "Edited src/a.lua");
  assert.equal(Log.describe({ tool: "run_command", target: "npm test" }).text, "Ran command npm test");
  assert.equal(Log.describe({ tool: "figma__get_screenshot", target: "" }).text, "Figma: get screenshot");
  assert.equal(Log.describe({ tool: "playwright__browser_click", target: "Sign in" }).text, "Playwright: click Sign in");
  assert.equal(Log.describe({ tool: "read_file", target: "x" }).look, true);
  const changes = [{ path: "src/a.lua", kind: "edited", can_undo: true }, { path: "ServerScriptService.Main", kind: "script", studio_id: "s1", can_undo: false }, { path: "new.txt", kind: "created", can_undo: true }];
  assert.equal(Log.changeFor({ tool: "edit_file", target: "src/a.lua" }, changes).path, "src/a.lua");
  assert.equal(Log.changeFor({ tool: "multi_edit", target: "game.ServerScriptService.Main" }, changes).kind, "script");
  assert.equal(Log.changeFor({ tool: "move_path", target: "old.txt → new.txt" }, changes).path, "new.txt");
  assert.equal(Log.changeFor({ tool: "read_file", target: "src/a.lua" }, changes), null);
  {
    const dom = new JSDOM('<div id="host"></div>', { runScripts: "outside-only", url: "http://localhost" }), w = dom.window;
    w.eval(fs.readFileSync("core/action-log.js", "utf8") + ";window.L=PlazCodeActionLog;");
    const calls = [];
    const tasks = [{ id: "t1", label: "Fix the shop", status: "worked", changes, events: [
      { at: "2026-10-17T10:02:00Z", tool: "delete_path", target: "secret.txt", result: "blocked", note: "Read-only mode is on" },
      { at: "2026-10-17T10:01:00Z", tool: "edit_file", target: "src/a.lua", result: "ok" },
      { at: "2026-10-17T10:00:30Z", tool: "multi_edit", target: "game.ServerScriptService.Main", result: "ok" },
      { at: "2026-10-17T10:00:00Z", tool: "read_file", target: "src/a.lua", result: "ok" }] }];
    const request = async (r) => { calls.push(r); return r.action === "list" ? { ok: true, tasks } : { ok: true }; };
    const view = w.L.mount(w.document.getElementById("host"), request, { confirm: () => true });
    await view.refresh();
    const rows = [...w.document.querySelectorAll(".pc-alog-row")].map((r) => r.textContent);
    assert(rows.some((t) => /Deleted secret\.txt.*Blocked.*Read-only/.test(t)), "blocked actions are shown with the reason");
    assert(!rows.some((t) => /^.*Read src\/a\.lua/.test(t)), "reads are hidden by default");
    const undo = [...w.document.querySelectorAll(".pc-alog-undo")];
    assert.equal(undo.length, 3, "edited file, Studio script and the unmatched created file");
    assert.equal(undo[1].disabled, true, "a change that can't be undone is disabled");
    undo[0].click(); await flush();
    assert.equal(JSON.stringify(calls.find((c) => c.action === "revert-one")), JSON.stringify({ action: "revert-one", id: "t1", path: "src/a.lua" }));
    w.document.querySelector(".pc-alog-looks input").checked = true; w.document.querySelector(".pc-alog-looks input").dispatchEvent(new w.Event("change"));
    assert([...w.document.querySelectorAll(".pc-alog-text")].some((n) => n.textContent === "Read src/a.lua"), "reads show when asked");
    w.close();
  }
  assert(main.includes('id="rs-action-log-open"') && main.includes("function openActionLog()") && desktop.includes('id="actionLog"'));
  const rustMain = fs.readFileSync("agent/src/main.rs", "utf8");
  assert(rustMain.includes('"/core/action-log.js"') && rustMain.includes('"/core/safety.js"'), "the app embeds the shared scripts");

  // ── Setup for this site ─────────────────────────────────────────────────
  {
    const setup = Setups.capture({ engine: "local", storage: { rsWorkMode: "thorough", rsThinkingLevel: "ultracode", rsPermMode: "full", rsReadOnly: true, rsPlanMode: "yes", rsBogus: 1, rsCustomPrompt: "Use Notion headings." }, memoryProject: " Notion workspace ", skills: ["skill-a", "skill-a", "", "skill-b"], tools: ["figma", "bad id!"], auto: true });
    assert.equal(setup.engine, "local");
    assert.deepEqual(setup.settings, { rsWorkMode: "thorough", rsThinkingLevel: "ultracode", rsPermMode: "full", rsReadOnly: true, rsCustomPrompt: "Use Notion headings." }, "only known settings with valid values");
    assert.equal(setup.memoryProject, "Notion workspace");
    assert.deepEqual(setup.skills, ["skill-a", "skill-b"]); assert.deepEqual(setup.tools, ["figma"]);
    const plan = Setups.plan(setup);
    assert.deepEqual(plan.toolsOn, ["figma"]); assert.equal(plan.storage.rsPermMode, "full");
    assert.deepEqual(Setups.summary(setup, { skills: { "skill-a": "UI style" }, tools: { figma: "Figma" } }).map(([k]) => k), ["Engine", "Effort", "Reasoning", "Access", "Safety", "Memory project", "Skills", "Tools"]);
    const store = { data: {}, get(key, cb) { cb({ [key]: this.data[key] }); }, set(v, cb) { Object.assign(this.data, JSON.parse(JSON.stringify(v))); cb && cb(); } };
    await Setups.save(store, "notion", setup); await Setups.save(store, "clickup", Setups.capture({ engine: "roblox", storage: {} }));
    let map = await Setups.load(store); assert.deepEqual(Object.keys(map).sort(), ["clickup", "notion"]); assert.equal(map.notion.auto, true);
    await Setups.save(store, "notion", null); map = await Setups.load(store); assert.deepEqual(Object.keys(map), ["clickup"]);
    store.data.rsSiteSetups["../evil"] = setup; assert.deepEqual(Object.keys(await Setups.load(store)), ["clickup"], "odd site keys are ignored");
    const merged = Setups.mergePinned([{ id: "m1" }, { id: "p1", title: "dup" }], [{ id: "p1", title: "Pinned" }]);
    assert.deepEqual(merged.map((s) => [s.id, !!s.always_use]), [["p1", true], ["m1", false]], "pinned skills come first, once, as always-use");
  }
  assert(main.includes('id="rs-setup-sec"') && main.includes("setTimeout(initSiteSetup, 800);") && main.includes("PlazCodeSiteSetups.mergePinned(result.skills||[],pinned)"));
  assert(main.includes("if(scope?.ok && !currentProject && siteMemoryProject && P.conversationKey())"), "new chats get the site's memory project");
  assert(background.includes('case "mcp-catalog"') && background.includes('case "mcp-toggle"'));
  for (const script of manifest.content_scripts.filter((c) => c.js.includes("core/main.js"))) {
    const at = script.js.indexOf("core/main.js");
    for (const file of ["core/safety.js", "core/action-log.js", "core/site-setups.js"]) assert(script.js.indexOf(file) >= 0 && script.js.indexOf(file) < at, file + " loads before main.js for " + script.matches[0]);
  }

  // ── Shared skills ───────────────────────────────────────────────────────
  {
    const skill = { id: "skill-1", title: "Kurze Wege 🙂", description: "Kept short", domain: "ui", scope: "project:Secret", steps: ["Reuse the existing theme.", "Check mobile."], pitfalls: [], verification: ["Open on a phone"], confirmed: true, favorite: true };
    const pack = Skills.packSkills([skill], "My UI");
    assert.equal(pack.format, "plazcode-skill-pack"); assert.equal(pack.skills[0].scope, undefined, "project scope never leaves the computer");
    const code = Skills.shareCode([skill, { ...skill, title: "Second" }]);
    assert(code.startsWith("plazskill:") && !/[+/=\s]/.test(code.slice(10)), "one URL-safe line");
    const back = Skills.importMany(code, "", "a share code");
    assert.deepEqual(back.map((s) => s.title), ["Kurze Wege 🙂", "Second"]);
    assert(back.every((s) => s.confirmed === false && s.community === false && s.revision === 0), "imports arrive untested");
    assert.match(back[0].description, /Imported from a share code$/);
    assert.equal(Skills.importMany(JSON.stringify(pack)).length, 1);
    assert.equal(Skills.importMany(JSON.stringify([skill, skill])).length, 2);
    assert.equal(Skills.importMany(JSON.stringify(skill))[0].title, skill.title, "one exported skill still works");
    assert.equal(Skills.importMany("Always reuse the theme.")[0].steps[0], "Always reuse the theme.");
    assert.throws(() => Skills.importMany("plazskill:@@@"), /damaged/);
    assert.throws(() => Skills.importMany(JSON.stringify({ format: "plazcode-skill-pack", skills: [] })), /no skills/);
    assert.throws(() => Skills.importMany(JSON.stringify(Array(26).fill(skill))), /at most 25/);
    assert.throws(() => Skills.importMany(JSON.stringify([skill, { ...skill, steps: [] }])), /^Error: Skill 2:/);
    assert.throws(() => Skills.packSkills([]), /at least one/);
    assert.equal(Skills.isShareLink("https://gist.github.com/me/1"), true); assert.equal(Skills.isShareLink("http://x"), false);

    // UI: link import goes through the app, and a pack saves every skill as new.
    const dom = new JSDOM('<div id="host"></div>', { runScripts: "outside-only", url: "http://localhost" }), w = dom.window;
    w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
    w.eval(fs.readFileSync("core/skills-ui.js", "utf8") + ";window.S=PlazCodeSkillsUI;");
    const records = [{ ...skill }], calls = [];
    const api = async (r) => { calls.push(r.action); if (r.action === "list") return { ok: true, skills: records }; if (r.action === "fetch_link") return { ok: true, text: JSON.stringify(pack) }; if (r.action === "save") { records.push({ ...r.skill, revision: 1 }); return { ok: true, skill: records.at(-1) }; } return { ok: true }; };
    const host = w.document.getElementById("host"), page = w.S.mount(host, api, async () => {}, () => ({}), async () => {}, async () => ({ tasks: [] }));
    const f = (n) => host.querySelector("[data-sk=" + n + "]"); await page.refresh();
    f("import-text").value = "https://gist.github.com/me/abc"; f("import").click(); await flush(); await flush();
    assert(calls.includes("fetch_link")); assert.equal(records.length, 2); assert.match(records[1].description, /Imported from https:\/\/gist\.github\.com\/me\/abc/);
    f("import-text").value = code; f("import").click(); await flush(); await flush();
    assert.equal(records.length, 4, "a two-skill share code saves two new skills");
    assert.equal(records[0].id, "skill-1", "existing skills are never replaced");
    f("share-panel").open = true; f("share-panel").dispatchEvent(new w.Event("toggle")); await flush();
    assert(f("share-list").querySelectorAll("input").length >= 1);
    w.close();
  }
  const skillsRs = fs.readFileSync("agent/src/skills.rs", "utf8");
  assert(skillsRs.includes('"fetch_link"=>fetch_link(') && skillsRs.includes("LINK_LIMIT"), "the app fetches links with a size cap and host allowlist");

  // ── Connectors ──────────────────────────────────────────────────────────
  const addons = fs.readFileSync("agent/src/mcp_addons.rs", "utf8");
  assert(addons.includes('"mcp-remote@0.15.1", "http://127.0.0.1:3845/mcp"'), "Figma via its desktop Dev Mode server, pinned");
  assert(addons.includes('"mcpforunityserver==10.3.0"'), "Unity server pinned");
  assert(addons.includes('"@playwright/mcp@0.0.83"'), "Browser server pinned");
  assert(rustMain.includes("async fn local_tools(") && rustMain.includes('if engine=="local" && name.contains("__")'), "connectors work in AgentScript mode too");

  console.log("PASS safety limits (read-only, delete confirmation, allowed folders), What happened log with Undo, saved site setups, shared skill packs/codes/links and the Figma, Unity and Browser connectors.");
})().catch((e) => { console.error(e); process.exitCode = 1; });
