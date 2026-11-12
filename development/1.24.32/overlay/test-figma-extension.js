// The extension side of PlazCode's Figma helper: the block "Figma (1.24.33)" in background.js, run on its own with a
// stand-in for the desktop app. Proves when the tools are offered, what is sent to the app and how answers come back.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const background = fs.readFileSync(path.join(__dirname, "background.js"), "utf8");
const start = background.indexOf("// ── Figma (1.24.33)"), end = background.indexOf("function blenderServers(list) {");
assert(start > 0 && end > start, "the Figma block is in background.js");
const block = background.slice(start, end);
assert(!/chrome\.tabs|chrome\.scripting|executeScript|\beval\s*\(|new Function/.test(block), "the Figma tools touch no browser tab and run no code: they only ask the app");

(async () => {
  const sent = [], states = [];
  let answer = { status: 200, body: { ok: true, result: { file: "Shop app designs" } } };
  const box = vm.createContext({ AbortSignal, JSON, Math, String, Object, Set, RUST_ROBLOX_HTTP: "http://127.0.0.1:3000", broadcastStatus: () => states.push(1),
    bridgeFetch: async (url, options) => { sent.push({ url, body: JSON.parse(options.body), type: options.headers["Content-Type"] }); if (answer.throws) throw new Error(answer.throws); return { status: answer.status, json: async () => answer.body }; } });
  vm.runInContext(block + "\nglobalThis.api = { FIGMA_TOOLS, isFigmaToolName, figmaLive, setFigma, figmaCall };", box);
  const { FIGMA_TOOLS, isFigmaToolName, figmaLive, setFigma, figmaCall } = box.api;
  const plain = (value) => JSON.parse(JSON.stringify(value));

  // Tools: well-formed, PlazCode's own server name, nothing that sounds like free code.
  assert.strictEqual(FIGMA_TOOLS.length, 22);
  for (const tool of FIGMA_TOOLS) {
    assert(/^figma_[a-z_]+$/.test(tool.name) && tool.server === "plazcode-figma" && tool.description.length > 10 && tool.inputSchema.type === "object", tool.name);
    for (const need of tool.inputSchema.required) assert(need in tool.inputSchema.properties, tool.name + " requires " + need);
    assert(!/code|script|eval|exec/.test(tool.name), tool.name);
  }
  assert(isFigmaToolName("figma_frame_add") && isFigmaToolName("plazcode-figma__figma_export"));
  for (const other of ["figma_run_code", "get_design_context", "figma__get_code", "blockbench_status", ""]) assert(!isFigmaToolName(other), other + " is not one of PlazCode's Figma tools (the older Figma Dev Mode tools are left alone)");

  // Offered only while the app says the helper is connected after Allow; the bar is told when that changes.
  assert.strictEqual(figmaLive(), false);
  setFigma({ consent: true, connected: false }); assert.strictEqual(figmaLive(), false); assert.strictEqual(states.length, 0);
  setFigma({ consent: false, connected: true }); assert.strictEqual(figmaLive(), false, "connected without Allow counts for nothing");
  setFigma({ consent: "yes", connected: 1 }); assert.strictEqual(figmaLive(), false, "only true counts");
  setFigma({ consent: true, connected: true }); assert.strictEqual(figmaLive(), true); assert.strictEqual(states.length, 1);
  setFigma({ consent: true, connected: true }); assert.strictEqual(states.length, 1, "no repeat when nothing changed");
  assert.match(background, /if \(typeof figmaLive === "function" && figmaLive\(\)\) rest\.push\(\{ id: "plazcode-figma"/, "listed as a live server only while connected");
  assert.match(background, /if \(typeof figmaLive === "function" && figmaLive\(\)\) \{ const known = [^\n]+ for \(const t of FIGMA_TOOLS\)/, "tools are offered to the AI only while connected");
  assert.match(background, /if\(j\.figma && typeof j\.figma==="object"\)setFigma\(j\.figma\);/, "the app's status decides");
  assert.match(background, /if \(isFigmaToolName\(msg\.name\)\) \{\s*sendResponse\(await figmaCall\(msg\.name, msg\.arguments, timeout\)\);/, "tool calls are routed to the Figma path");

  // A call: the action's name and arguments go to the app as data.
  let reply = plain(await figmaCall("plazcode-figma__figma_frame_add", { name: "\"); alert(1); //", width: 320 }, 130000));
  assert.deepStrictEqual(sent.pop(), { url: "http://127.0.0.1:3000/api/figma", body: { cmd: "frame_add", args: { name: "\"); alert(1); //", width: 320 }, timeout_seconds: 30 }, type: "application/json" });
  assert.deepStrictEqual(reply, { ok: true, text: JSON.stringify({ file: "Shop app designs" }, null, 2), images: [] });
  await figmaCall("figma_export", { target: "Card" }, 130000);
  assert.strictEqual(sent.pop().body.timeout_seconds, 60, "a picture gets more time");
  await figmaCall("figma_status", undefined, 1000);
  assert.deepStrictEqual(plain(sent.pop().body), { cmd: "status", args: {}, timeout_seconds: 5 });

  // Pictures come back as real pictures; anything else in that place is refused.
  answer = { status: 200, body: { ok: true, result: { image: "data:image/png;base64,iVBORw0KGgo=", of: { name: "Card" }, scale: 2 } } };
  assert.deepStrictEqual(plain(await figmaCall("figma_export", {}, 60000)), { ok: true, text: "Picture of \"Card\" from Figma.", images: [{ mimeType: "image/png", data: "iVBORw0KGgo=" }] });
  for (const bad of ["data:text/html;base64,PHNjcmlwdD4=", "https://example.com/x.png", "data:image/png;base64,<script>", ""]) {
    answer = { status: 200, body: { ok: true, result: { image: bad } } };
    assert.deepStrictEqual(plain(await figmaCall("figma_export", {}, 60000)), { ok: false, error: "Figma did not give a picture." });
  }

  // Failures are said plainly and nothing is retried.
  answer = { status: 200, body: { ok: false, error: "Figma is not connected. In the Figma desktop app open a design file and choose Plugins, Development, PlazCode." } };
  const before = sent.length;
  assert.match((await figmaCall("figma_status", {}, 30000)).error, /Plugins, Development, PlazCode/);
  assert.strictEqual(sent.length, before + 1, "one request, no retry");
  answer = { status: 404, body: {} };
  assert.match((await figmaCall("figma_status", {}, 30000)).error, /needs the newer PlazCode desktop app/, "an older app is named plainly");
  answer = { status: 200, body: null };
  assert.match((await figmaCall("figma_status", {}, 30000)).error, /could not reach Figma/);
  answer = { throws: "Failed to fetch" };
  assert.match((await figmaCall("figma_status", {}, 30000)).error, /Figma could not be reached \(Failed to fetch\)/);
  answer = { status: 200, body: { ok: true, result: "x".repeat(400100) } };
  assert.match((await figmaCall("figma_outline", {}, 30000)).text, /\[cut: the answer was longer/);
  // Before Allow nothing is sent to the app at all.
  setFigma({ consent: false, connected: false });
  const quiet = sent.length;
  assert.match((await figmaCall("figma_status", {}, 30000)).error, /go to Apps & servers and connect Figma/);
  assert.strictEqual(sent.length, quiet);

  // Read-only mode: the look-only actions pass, everything else counts as a change.
  const safety = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, "core", "safety.js"), "utf8") + "\nglobalThis.S = PlazCodeSafety;", safety);
  const isChange = safety.S.isChange || safety.S.changesThings;
  if (typeof isChange === "function") {
    for (const look of ["figma_status", "figma_outline", "figma_export", "plazcode-figma__figma_node"]) assert.strictEqual(isChange(look, "mcp"), false, look);
    for (const change of ["figma_frame_add", "figma_update", "figma_remove", "figma_undo", "plazcode-figma__figma_text_add", "figma_something_new"]) assert.strictEqual(isChange(change, "mcp"), true, change);
  } else assert.match(fs.readFileSync(path.join(__dirname, "core", "safety.js"), "utf8"), /if \(\/\^figma_\/\.test\(bare\(raw\)\)\) return !FIGMA_READ\.has\(bare\(raw\)\);/);

  console.log("PASS Figma tools in the extension: 22 named tools offered only while PlazCode's helper is connected after Allow, calls go to the app as data, pictures checked, plain failures without retry, older app named, nothing sent before Allow, look-only actions pass Read-only mode.");
})().catch((error) => { console.error(error); process.exit(1); });
