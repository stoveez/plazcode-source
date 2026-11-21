// The full production PlazCode core on an offline stand-in AI chat page, for tests of the PlazCode bar, menus and
// settings that do not depend on one site. Until 1.24.36 these tests used the ClickUp page; ClickUp support was
// removed (owner, 2026-11-18), so the stand-in is the ChatGPT page shape with the real ChatGPT site file.
// No account, live website or real project tool is touched.
// pageFor(browser, agent, core): agent is ignored (kept so callers did not change); core=true loads every
// content script in manifest order and exposes window.fixture = {A, startSession, runTool, agentLoop, ui}.
// Page globals: sent [{text, attachments}], nativeCalls, startupReads, unwanted, autoReply, echo, nextReply, addItem.
const fs = require("node:fs");
const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const SITE = "providers/chatgpt.js";
const html = `<!doctype html><html><head><style>
body{margin:0;background:#141414;color:white;font:14px sans-serif}#timeline{padding:20px 20px 230px}
form{position:fixed;bottom:40px;left:20%;width:60%;background:#222;border:2px solid #678;border-radius:16px;padding:12px;box-sizing:border-box}
#prompt-textarea{min-height:64px;max-height:180px;overflow:auto;white-space:pre-wrap;outline:none}button{height:30px}
[data-message-author-role]{padding:6px;white-space:pre-wrap}.attachment-chip{display:inline-block;width:60px;height:24px}
</style></head><body><main id="timeline"></main><form><div class="prosemirror-parent"><div id="prompt-textarea" contenteditable="true"></div></div>
<input type="file" multiple hidden><button type="button" data-testid="send-button">Send</button></form></body></html>`;

async function pageFor(browser, _agent = false, core = false) {
  const page = await browser.newPage({ viewport: { width: 1365, height: 850 } });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (route) => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("https://chatgpt.com/c/fixture-chat"); // inside a chat, as the old stand-in page was
  await page.addScriptTag({ path: "providers/chatgpt-cm.js" });
  await page.evaluate(() => {
    window.sent = []; window.nativeCalls = []; window.startupReads = []; window.unwanted = 0;
    window.autoReply = true; window.echo = true; window.nextReply = null;
    window.addItem = (role, text, id) => {
      const item = document.createElement("div"); item.dataset.messageAuthorRole = role; item.dataset.messageId = id;
      const body = document.createElement("div"); body.className = "markdown"; body.style.whiteSpace = "pre-wrap"; body.textContent = text;
      item.append(body); document.querySelector("#timeline").append(item); return item;
    };
    const form = document.querySelector("form"), editor = document.querySelector("#prompt-textarea");
    form.onsubmit = (e) => { e.preventDefault(); unwanted++; };
    form.querySelector("input[type=file]").onchange = (e) => {
      for (const file of e.target.files) { const chip = document.createElement("span"); chip.className = "attachment-chip"; chip.textContent = "Attachment " + file.name; editor.append(chip); }
    };
    form.querySelector('[data-testid="send-button"]').onclick = (e) => {
      e.preventDefault();
      // Read the text from the live box (innerText keeps line breaks, as the real site does), without attachment chips.
      const chips = [...editor.querySelectorAll(".attachment-chip")], attachments = chips.length;
      chips.forEach((n) => n.remove());
      const text = editor.innerText;
      if (!text.trim() && !attachments) return;
      sent.push({ text, attachments }); editor.innerHTML = "";
      if (!echo) return;
      addItem("user", text, "user-" + sent.length);
      const ack = text.match(/More context follows\. Reply with exactly "([^"]+)"/);
      if (autoReply) addItem("assistant", nextReply || (ack ? ack[1] : sent.length === 1 ? '```json\n{"command":"list_commands"}\n```' : "PlazCode is ready."), "ai-" + sent.length);
    };
    const tools = [["execute_luau", "roblox", "code"], ["execute_blender_code", "blender", "code"], ["read_file", "local", "path"], ["write_file", "local", "path"]]
      .map(([name, server, field]) => ({ name, server, description: "Isolated fixture tool", inputSchema: { type: "object", properties: { [field]: { type: "string" } }, required: [field] } }));
    // Read-only startup-memory probes use an empty fixture project and are tracked apart from task commands.
    const answer = (msg) => {
      if (msg.type === "live-status") return { ok: true, bridge_reachable: true, connected: true, roblox_connected: true, local_connected: true, blender_connected: true, profile_required: false };
      if (msg.type === "call_tool") {
        if ((msg.name === "execute_luau" && msg.arguments?.code?.includes("ServerStorage.RobloxScript.Memory") && msg.arguments.code.includes('"op":"read_scripts"')) || (msg.name === "read_file" && msg.arguments?.path === "PLAZCODE_MEMORY.md")) {
          startupReads.push(msg); return { ok: true, text: "Not found: fixture has no saved startup memory" };
        }
        nativeCalls.push(msg); return { ok: true, text: "FIXTURE RESULT " + msg.name };
      }
      if (msg.type === "list_tools") return { ok: true, fresh: true, connected: true, blender: true, servers: [{ id: "roblox", alive: true, tools: 1 }, { id: "local", alive: true, tools: 2 }, { id: "blender", alive: true, tools: 1 }], tools };
      if (msg.type === "rs-memory") return { ok: true, memory: { entries: [] } };
      return { ok: true, connected: true, mcpAlive: true, roblox_connected: true, local_connected: true, blender: true, tools, skills: [], templates: [], servers: [] };
    };
    const get = (_k, cb) => { const value = {}; if (cb) queueMicrotask(() => cb(value)); return Promise.resolve(value); };
    window.chrome = { runtime: { id: "fixture", getManifest: () => ({ version: "1.24.36" }), getURL: (p) => "https://chatgpt.com/fixture/" + p, onMessage: { addListener() {} },
      sendMessage: (msg, cb) => { const value = answer(msg); if (cb) queueMicrotask(() => cb(value)); return Promise.resolve(value); } },
      storage: { local: { get, set: () => Promise.resolve(), remove: () => Promise.resolve() }, onChanged: { addListener() {} } } };
  });
  if (core) {
    await page.addStyleTag({ path: "overlay.css" });
    for (const file of siteScripts()) {
      let code = fs.readFileSync(file, "utf8");
      if (file === SITE) code += ';window.provider=RSProvider;Object.assign(RSProvider.timings,{GEN_IDLE_MS:30,WARMUP_MS:100});Object.defineProperty(RSProvider.timings,"STABLE_MS",{value:100});';
      if (file === "core/main.js") code = code.replace("const TOKEN_CHARS = 4;", "window.fixture={A,startSession,runTool,agentLoop,ui};const TOKEN_CHARS = 4;");
      await page.addScriptTag({ content: code });
    }
    await page.waitForSelector("#rs-bar"); await page.waitForTimeout(450);
  } else { await page.addScriptTag({ content: fs.readFileSync(SITE, "utf8") + ";window.provider=RSProvider;" }); await page.addScriptTag({ path: "core/parser.js" }); }
  return { page, errors };
}
// Every content script the stand-in site loads, in manifest order.
function siteScripts() { return manifest.content_scripts.find((x) => x.js.includes(SITE)).js; }
module.exports = { pageFor, siteScripts, SITE };
