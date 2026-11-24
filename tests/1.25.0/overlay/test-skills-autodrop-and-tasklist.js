"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");

const SkillsUI = require("./core/skills-ui.js");
const SkillContext = require("./core/skill-context.js");
const Activity = require("./core/activity.js");
const Checklist = require("./core/checklist.js");
const ByokChatUI = require("./core/byok-chat-ui.js");

(async () => {
  // 1. Imported skills default to enabled:true so they are active automatically on matching tasks.
  const imported = SkillsUI.importSkill("---\nname: Combat VFX\n---\nAdd hit-stop and sparks.", "Combat VFX");
  assert.equal(imported.enabled, true, "imported skills are immediately enabled for automatic matching");

  // 2. SkillContext.catalog surfaces non-top-matched saved skills proactively; readDroppedFolder stages dropped folders.
  const cat = SkillContext.catalog([
    { id: "skill-1", title: "Inventory Pattern", description: "Server-validated slot grid", domain: "roblox", has_files: true },
  ]);
  assert.match(cat, /OTHER SAVED SKILLS/);
  assert.match(cat, /plazcode_skills/);
  assert.match(cat, /Inventory Pattern/);

  const mkFile = (p, text) => ({
    name: p.split("/").pop(),
    webkitRelativePath: p,
    size: Buffer.byteLength(text),
    type: "",
    text: async () => text,
    arrayBuffer: async () => Uint8Array.from(Buffer.from(text)).buffer,
  });
  const entry = (p, children) => children
    ? { name: p.split("/").pop(), isFile: false, isDirectory: true, createReader() { let d = false; return { readEntries(ok) { ok(d ? [] : (d = true, children)); } }; } }
    : { name: p.split("/").pop(), isFile: true, isDirectory: false, file(ok) { ok(mkFile(p, "# " + p + "\nUse clean modular code.")); } };
  const folderTree = entry("MyPack", [entry("a", [entry("MyPack/a/SKILL.md")]), entry("MyPack/.git", [entry("MyPack/.git/HEAD")])]);
  const folderTransfer = { types: ["Files"], items: [{ webkitGetAsEntry: () => folderTree }], files: [] };
  assert.equal(SkillContext.isSkillDropTransfer(folderTransfer, false), true, "directories are detected as skill folder drops");
  assert.equal(SkillContext.isSkillDropTransfer({ types: ["Files"], items: [{ webkitGetAsEntry: () => ({ isDirectory: false }) }], files: [mkFile("shot.png", "png")] }, false), false, "plain image drops are not hijacked");
  const stagedReq = await SkillContext.readDroppedFolder(folderTransfer);
  assert.equal(stagedReq.action, "stage_folder");
  assert.equal(stagedReq.source, "MyPack");
  assert.deepEqual(stagedReq.files.map((f) => f.path), ["MyPack/a/SKILL.md"]);

  // 3. Task list summarizes user prompts into crisp goals + numbered summarized tasks (no raw truncated sentences).
  const multiPrompt = [
    "confirm that skills are easily added and when added are actually functional, meaning that the user doesn't have to tell the ai to use a specific skill.",
    "if the task given correlates to the skill or the skills' usage could be beneficial for it, the ai uses it.",
    "also users should be able to drop folders containing skills inside chats and the ai can automatically add the skills inside to the skills inside plazcode to be used from then on if the user requests.",
    "also fix the task list. instead of actually showing a summarization of the current task/goal, it just shows a portion of the exact sentence/prompt the user gave.",
  ].join(" ");
  const act = Activity.create();
  act.sync(true, "sum-chat", 10);
  act.task(multiPrompt, "sum-k1");
  const grp = act.active();
  assert(grp.taskLabel && grp.taskLabel !== "Planning project work", "summarized task header is immediately populated");
  assert(!grp.taskLabel.includes("actually"), "task header must not end mid-fragment");
  assert(grp.plan && grp.plan.items.length >= 2 && grp.plan.items.length <= 5, "multi-part prompt yields clean summarized task items: " + JSON.stringify(grp.plan?.items));
  for (const it of grp.plan.items) {
    assert(!/\b(?:meaning that|instead of actually|from then on|if the task given)\b/i.test(it.label), "no raw explanation prose in step: " + it.label);
    assert(!/\b(?:and|when|the|actually)$/i.test(it.label), "no dangling stopword at end of step: " + it.label);
  }

  // Checklist UI renders numbered tasks & header goal
  const dom = new JSDOM('<div id="root"><div id="bar"></div></div>', { url: "https://chatgpt.com/c/test" });
  global.window = dom.window;
  global.document = dom.window.document;
  const bar = dom.window.document.getElementById("bar");
  bar.getBoundingClientRect = () => ({ left: 100, right: 700, top: 600, width: 600, height: 36 });
  const checklistUi = Checklist.mount({ root: dom.window.document.getElementById("root"), getGroup: () => act.active(), getBar: () => bar, blocked: () => false });
  checklistUi.render();
  const rows = [...checklistUi.panel.querySelectorAll("ol li .rs-checklist-label")].map((n) => n.textContent);
  assert(rows[0].startsWith("1. ") && rows[1].startsWith("2. "), "tasks are numbered in checklist UI: " + JSON.stringify(rows));
  assert.equal(checklistUi.panel.querySelector("header strong").textContent, grp.taskLabel);
  dom.window.close();

  // 4. Desktop BYOK Chat folder drag-and-drop stages folder & includes dropped folder metadata when sending.
  const bdom = new JSDOM('<!doctype html><html><body><div id="chatHost"></div><div id="modelsHost"></div></body></html>', { url: "http://127.0.0.1:3000/desktop", runScripts: "outside-only" });
  const bw = bdom.window;
  const apiCalls = [];
  const apiFn = async (url, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : null;
    apiCalls.push({ url, body });
    if (url === "/api/byok/platforms") return { ok: true, presets: [], platforms: [{ id: "p1", presetId: "openai", name: "OpenAI", endpointUrl: "https://api.openai.com", fullUrl: false, enabled: true, apiKeyCount: 1, apiKeyPreviews: ["sk-1••••1111"], models: [{ id: "m1", name: "gpt-4o", enabled: true, visionMode: "auto", requestApi: "auto" }] }], activeModelId: "m1" };
    if (url === "/api/byok/chats") return { ok: true, chats: [] };
    if (url === "/api/skills" && body?.action === "stage_folder") return { ok: true, staged_id: "drop-abc123", source: "MyPack", skill_count: 1, skills: [{ title: "Pack Skill" }] };
    if (url === "/api/byok/chat/send") return { ok: true, chatId: "c1", runId: "r1", title: "Add skills" };
    if (url.startsWith("/api/byok/chat/events/")) return { ok: true, done: true, events: [] };
    return { ok: true };
  };
  bw.eval(fs.readFileSync("core/byok-chat-ui.js", "utf8") + ";window.PlazCodeByokChatUI=PlazCodeByokChatUI;");
  const byok = bw.PlazCodeByokChatUI.mount({
    chatHost: bw.document.getElementById("chatHost"),
    modelsHost: bw.document.getElementById("modelsHost"),
    api: apiFn,
    getState: () => ({ workspace_ready: false }),
    getPrefs: () => ({}),
    patchPref: async () => ({}),
    navigateToModels: () => {},
    navigateToChat: () => {},
  });
  await byok.refresh();
  const dropEv = new bw.Event("drop", { bubbles: true, cancelable: true });
  dropEv.dataTransfer = folderTransfer;
  bw.document.getElementById("chatHost").dispatchEvent(dropEv);
  await new Promise((r) => setTimeout(r, 40));
  assert(apiCalls.some((c) => c.url === "/api/skills" && c.body?.action === "stage_folder"), "BYOK drop calls /api/skills stage_folder");
  assert.match(bw.document.getElementById("chatHost").textContent, /MyPack \(1 skill\)/);
  bw.document.querySelector("[data-byok-input]").value = "Add these skills to PlazCode";
  bw.document.querySelector("[data-byok-send]").click();
  await new Promise((r) => setTimeout(r, 40));
  const sent = apiCalls.find((c) => c.url === "/api/byok/chat/send");
  assert(sent && sent.body.attachments.some((a) => String(a.textPreview || "").includes("drop-abc123")), "BYOK send forwards dropped folder staged_id to AI");
  bdom.window.close();

  console.log("PASS skills auto-use defaults, folder drop staging, BYOK folder drop, and task list goal/step summarization.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
