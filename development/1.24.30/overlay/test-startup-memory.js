"use strict";
// 1.24.29 (owner, 2026-10-31): the AI reads ALL its memory by default at the start of every chat: every vault note
// (not saved chats or the archive), then the project memory. PlazCode sends them itself as acknowledged startup pages
// before "PlazCode is ready.", so the AI never runs a command during the handshake. Runs the real functions from
// core/main.js with a fake vault and a fake Studio. Run: node test-startup-memory.js
const fs = require("fs"), vm = require("vm"), assert = require("node:assert/strict");
const main = fs.readFileSync(__dirname + "/core/main.js", "utf8");
const skills = new Function(fs.readFileSync(__dirname + "/core/studio_skills.js", "utf8") + ";return RobloxScriptSkills;")();
const from = main.indexOf("  async function readProjectMemoryText(budget) {"), to = main.indexOf("  async function runImportedRobloxTool(name, args) {");
assert(from > 0 && to > from, "startup memory functions found");

function sandbox({ engine = "roblox", vaultPages = ["=== 01 About You/Profile.md ===\nLikes low poly.\n\n[read_all: last page.]"], studio = "--- ServerStorage.RobloxScript.Memory (ModuleScript, 9 lines) ---\nreturn [==[\n# Project memory\n]==]\n[read_scripts: all 1 scripts shown; this was the last page.]", active = true } = {}) {
  const sent = [], events = [];
  const box = {
    RobloxScriptSkills: skills, activeEngine: () => engine, inputBudget: () => 60000, diag: (n, d) => events.push({ n, d }),
    PlazCodeMemory: { vaultActive: () => active, vaultReadAllPages: async (chars) => { sent.push({ vaultChars: chars }); return vaultPages.map((text) => ({ text })); } },
    bg: async (msg) => { sent.push(msg); if (msg.name === "read_file") return { ok: true, text: "# Local memory\n- uses Vite" }; return studio == null ? { ok: false, error: "Studio offline" } : { ok: true, text: studio }; },
    Math, String, RegExp, Number,
  };
  vm.createContext(box);
  vm.runInContext(main.slice(from, to) + ";this.stages=startupMemoryStages;", box);
  return { box, sent, events };
}

(async () => {
  // 1. Vault pages first, then the Studio project memory; each must be acknowledged.
  let { box, sent } = sandbox({ vaultPages: ["PAGE ONE", "PAGE TWO"] });
  let stages = await box.stages();
  assert.equal(stages.length, 3);
  assert(/^PLAZCODE MEMORY, PAGE 1 OF 3: your vault notes/.test(stages[0].text) && stages[0].text.includes("PAGE ONE"));
  assert(/^PLAZCODE MEMORY, PAGE 3 OF 3: this project's memory/.test(stages[2].text) && stages[2].text.includes("# Project memory"));
  assert(stages.every((s) => /Do not run any command now\. Reply with exactly: Memory \d of 3 read\./.test(s.text) && /\(End of memory page \d of 3\./.test(s.text)), "instruction before and after the memory");
  const studioCall = sent.find((m) => m.name === "execute_luau");
  assert(studioCall && /"op":"read_scripts"/.test(studioCall.arguments.code) && /ServerStorage\.RobloxScript\.Memory/.test(studioCall.arguments.code), "project memory read with read_scripts");
  // Acknowledgements: tolerant of formatting, strict about the page.
  const ok = (stage, reply) => stage.ackRe.test(String(reply).replace(/[`*_#>]/g, "").trim());
  assert(ok(stages[0], "Memory 1 of 3 read.") && ok(stages[0], "**Memory 1 of 3 read**") && ok(stages[2], "memory 3 of 3 read!"));
  assert(!ok(stages[0], "Memory 2 of 3 read.") && !ok(stages[0], 'Memory 1 of 3 read. {"command":"script_read"}') && !ok(stages[0], "PlazCode is ready."));
  console.log("PASS startup memory: vault pages then project memory, each acknowledged before the ready step");

  // 2. AgentScript reads PLAZCODE_MEMORY.md; no vault or no Studio simply adds no page.
  ({ box, sent } = sandbox({ engine: "local", vaultPages: [] }));
  stages = await box.stages();
  assert.equal(stages.length, 1); assert(stages[0].text.includes("# Local memory") && sent.some((m) => m.name === "read_file" && m.arguments.path === "PLAZCODE_MEMORY.md"));
  ({ box } = sandbox({ active: false, studio: null }));
  assert.equal((await box.stages()).length, 0, "nothing to read: the startup is unchanged");
  ({ box } = sandbox({ vaultPages: [], studio: "read_scripts: no scripts found.\nNot found: ServerStorage.RobloxScript.Memory" }));
  assert.equal((await box.stages()).length, 0, "no project memory yet: no page");
  console.log("PASS AgentScript memory file; no vault, no Studio or no memory script adds no page");

  // 3. Wiring: the pages go before the ready stages, and the ready check itself is unchanged.
  assert(/const memoryStages = offline \|\| typeof startupMemoryStages !== "function" \? \[\] : await startupMemoryStages\(\);/.test(main));
  assert(/const stages = \[\.\.\.memoryStages, \.\.\.\(P\.startupFeedbackMessages \? P\.startupFeedbackMessages\(readyPrompt\) : \[\{text:readyPrompt\}\]\)\];/.test(main));
  assert(/if\(!stage\.ackRe && stage\.ack && \(readyRes\.kind!=="text" \|\| String\(readyRes\.text\|\|""\)\.trim\(\)!==stage\.ack\)\)/.test(main), "existing acknowledgements keep their exact check");
  assert(/\/\^\(\?:PLAZCODE_READY\|PlazCode is ready\)\[\.!\]\?\$\/i\.test\(readyText\)/.test(main), "the ready reply check is unchanged");
  console.log("PASS memory pages are sent before the ready step; the ready check is unchanged");
})().catch((e) => { console.error(e); process.exit(1); });
