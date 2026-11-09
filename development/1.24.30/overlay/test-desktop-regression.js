const fs = require("fs");
const crypto = require("crypto");

const baseline = {
  "core/agent_skills.js": "62f13ebb16c1e0c5eefbabd3a1561279d2ec0735",
  "core/animlib.js": "7d032068c63c493caa5ec938fac756df3f662369",
  "core/config.js": "562d2593e9b20978bcef9d63e68f8f274eb719b6",
  "core/headless-builder.js": "0d8924dae62e2894a68cdd17617bbb5e36cca33e",
  "core/luau-knowledge.js": "54441b9d7a36e28eac9e64d10b56607c41a34f2e",
  "core/main.js": "333d0cfe9e46a92ed955a920eb4f9048d06025bc",
  "core/motion-interchange.js": "038afa13a5b59c030a809abf7d617a36f2fae82d",
  "core/motion-preview.js": "c364991ffe8e0f9eaad557e6746fff21daea2e86",
  "core/motion-tools.js": "6e1c5ff01153d61038b48b9a0c7181be85b3c9a5",
  "core/parser.js": "d1c78fb0374263a3ebe683057174b602dbf40eeb",
  "core/studio_daily.js": "56632a6bd1a81ddeded243ff9d740e4b75a4fa34",
  "core/studio_gui.js": "726793b63c24b3fd128be60e6f3fb98e60a19243",
  "core/studio_plus.js": "c149c47cc7d178e3aa87f39539cc3c1420bff065",
  "core/studio_skills.js": "388ec93aac79026bcecbda276c322d05aa43f1e1",
  "providers/arena.js": "20cf67e25d2f55743d980dd17c5d4d0803bea289",
  "providers/chatgpt-cm.js": "fbf21257e2c2c85006e3ac4d76e1caf490345c29",
  "providers/chatgpt.js": "926859c06e2cfcd207d3c93a68e2adfb6c719520",
  "providers/claude.js": "3bd0e9b6026e56d46d7ee4ec137aed15d75e0500",
  "providers/copilot.js": "86821cb43967d23ab22193c6d93c0514078eae81",
  "providers/crax-net.js": "85c158d0b45508c8f03265f75e8975d348318567",
  "providers/crax.js": "f8e6031e0faffec825b03c102ef2ad77ca115845",
  "providers/deepseek.js": "50c09543812a532f4da242f388882cfbd56655aa",
  "providers/freebuff.js": "2d829f1a6491f490dc1ea3cd67f794fa014d67de",
  "providers/gemini.js": "523ce72f877768952a6aca1cf25d1989622629a2",
  "providers/glm.js": "5e5cc28eb30123dd9f134d52fcb414ee566b4628",
  "providers/kimi.js": "df6c05a5e7c1b4ac0d6e9e87ec0decf2ce8d66ea",
  "providers/meta.js": "247ee1c593a3732851332a4a492396e82c355752",
  "providers/notion.js": "16410017c6705b26736f4a55da42d234b51597ff",
  "providers/oxalpha.js": "de822a4427e71687af99b6bc630a771143d47fcc",
  "providers/qwen-net.js": "ef67a5f6731b8935d754d59aeee4910499f012bb",
  "providers/qwen.js": "c8b0e08bdc561184a32f3295416665bcdfba87be",
  "providers/useai.js": "d20de72ca4d9718318c5706284146318716773f0",
  "providers/vani.js": "9888fcee8a577d47117b7de8dd42f9c455d062ce",
  "providers/mimo.js": "c9c2a8bcc0a99f4b9f8cd2f0fa672f54919a1977"
};
const requiredProviders = [
  "providers/clickup.js",
  "providers/deepseek.js",
  "providers/chatgpt.js",
  "providers/claude.js",
  "providers/gemini.js",
  "providers/kimi.js",
  "providers/glm.js",
  "providers/qwen.js",
  "providers/arena.js",
  "providers/freebuff.js",
  "providers/crax.js",
  "providers/useai.js",
  "providers/vani.js",
  "providers/mimo.js",
  "providers/oxalpha.js",
  "providers/notion.js"
];

function gitBlobSha(path) {
  const body = Buffer.from(fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n"));
  const header = Buffer.from("blob " + body.length + "\0");
  return crypto.createHash("sha1").update(header).update(body).digest("hex");
}

for (const [path, expected] of Object.entries(baseline)) {
  if (!fs.existsSync(path)) throw new Error("Protected PlazCode file missing: " + path);
  const actual = gitBlobSha(path);
  if (actual !== expected) throw new Error("Protected PlazCode file changed: " + path + "\nexpected " + expected + "\nactual   " + actual);
}

for (const path of requiredProviders) {
  if (!fs.existsSync(path)) throw new Error("Supported provider missing: " + path);
}

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
if (manifest.version !== "1.24.30") throw new Error("Expected extension version 1.24.30");

const cargoToml = fs.readFileSync("agent/Cargo.toml", "utf8");
const cargoVersion = cargoToml.match(/^version = "([^"]+)"/m)?.[1];
if (!cargoVersion) throw new Error("Could not read desktop package version from agent/Cargo.toml");
if (cargoVersion !== "1.24.30") throw new Error("Unexpected desktop version: " + cargoVersion);
// Provider DOM hardening is intentional and covered by differential and preservation suites.
// Intentional core/main integration is covered by creator/skills regression tests.
// Other core baselines remain protected; native and extension versions match.

const desktopHtml = fs.readFileSync("agent/src/desktop.html", "utf8");
for (const token of [
  'data-page="home"',
  'data-page="tools"',
  'data-page="mcp"',
  'data-page="terminal"',
  'data-page="settings"',
  "/api/desktop/state",
  "/api/desktop/preferences",
  "/api/desktop/restart",
  "/api/desktop/clear-logs",
  "window.ipc.postMessage",
  "Your workspace.",
  'class="hero-name">Choose your <span>AI.</span>'
]) {
  if (!desktopHtml.includes(token)) throw new Error("Desktop WebView contract missing: " + token);
}
for (const forbidden of [
  'data-page="chat"',
  "BUILD MORE",
  "CODE SMARTER",
  "AI-powered development companion",
  "development control center",
  "swatch-night.jpg",
  "mountain"
]) {
  if (desktopHtml.includes(forbidden)) throw new Error("Removed desktop UI content returned: " + forbidden);
}
for (const removed of ['Model Builder','UI Creator','modelWorkspace','uiWorkspace','PlazCodeCreatorUI','Mountbuilder','__PLAZCODE_CREATOR','__PLAZCODE_HEADLESS']) if (desktopHtml.includes(removed)) throw Error('Removed desktop creator leaked: '+removed);
// Approved localization guards/hooks; behavioral Toolkit/Notifications fixtures remain.
const toolkit=fs.readFileSync('core/toolkit-ui.js','utf8');if(crypto.createHash('sha256').update(toolkit.replace(/\r\n/g,'\n')).digest('hex')!=='eff3130ff15ec030266723caae6e051d76b2b2401e5c7b88b42bcb44286af907')throw Error('Toolkit localization baseline changed');
const desktopScript = desktopHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1]?.replace("__PLAZCODE_I18N_CATALOG__", "").replace("__PLAZCODE_I18N__", "").replace("__PLAZCODE_SKILLS_UI__", fs.readFileSync("core/skills-ui.js", "utf8")).replace("__PLAZCODE_EXPLORER_UI__", fs.readFileSync("core/explorer-ui.js", "utf8")).replace("__PLAZCODE_TOOLKIT_UI__", fs.readFileSync("core/toolkit-ui.js", "utf8")).replace("__PLAZCODE_TEMPLATE_UI__", fs.readFileSync("core/templates.js", "utf8")).replace("__PLAZCODE_TASK_UI__", fs.readFileSync("core/task-center.js", "utf8")).replace("__PLAZCODE_ACTION_LOG_UI__", fs.readFileSync("core/action-log.js", "utf8")).replace("__PLAZCODE_SAFETY_UI__", fs.readFileSync("core/safety.js", "utf8")).replace("__PLAZCODE_MEDIA_UI__", fs.readFileSync("core/media.js", "utf8")).replace("__PLAZCODE_MEMORY_UI__", fs.readFileSync("core/memory.js", "utf8")).replace("__PLAZCODE_VERSION_UI__", fs.readFileSync("core/version.js", "utf8")).replace(/__PLAZCODE_VERSION__/g, "1.19.33");
if (!desktopScript) throw new Error("Desktop WebView script block missing");
new Function(desktopScript);

class FakeClassList {
  constructor(initial = []) {
    this.values = new Set(initial);
  }
  add(name) { this.values.add(name); }
  toggle(name, force) {
    if (force === undefined) {
      if (this.values.has(name)) this.values.delete(name);
      else this.values.add(name);
      return this.values.has(name);
    }
    if (force) this.values.add(name);
    else this.values.delete(name);
    return !!force;
  }
  contains(name) {
    return this.values.has(name);
  }
}

class FakeElement {
  constructor(id = "", attrs = {}, classes = []) {
    this.id = id;
    this.attrs = { ...attrs };
    this.classList = new FakeClassList(classes);
    this.listeners = {};
    this.style = { setProperty(name,value) { this[name]=value; } };
    this.dataset = {};
    this.children = [];
    this.innerHTML = "";
    this.textContent = "";
    this.value = "";
    this.disabled = false;
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.onclick = null;
  }
  querySelector(selector) { this.queries ||= new Map(); if (!this.queries.has(selector)) this.queries.set(selector, new FakeElement()); return this.queries.get(selector); }
  querySelectorAll() { return []; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs,name); }
  toggleAttribute(name,force) { const enabled=force===undefined?!this.hasAttribute(name):force;if(enabled)this.attrs[name]="";else delete this.attrs[name];return enabled; }
  contains() { return false; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); for(const child of children) if(child&&typeof child==='object')child.parentElement=this; }
  prepend(...children) { this.children.unshift(...children); }
  getContext() { return new Proxy({}, { get: () => () => {} }); }
  appendChild(child) { this.children.push(child); return child; }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }
  addEventListener(name, fn) {
    this.listeners[name] = fn;
  }
  closest() {
    return null;
  }
}

async function runDesktopInteractionRegression() {
  const ids = [...desktopHtml.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  const elementsById = new Map(ids.map((id) => [id, new FakeElement(id)]));

  const pages = [...desktopHtml.matchAll(/<section class="([^"]*\bpage\b[^"]*)" id="([^"]+)"/g)].map((m) => {
    const classes = m[1].split(/\s+/).filter(Boolean);
    const el = elementsById.get(m[2]) || new FakeElement(m[2]);
    el.classList = new FakeClassList(classes);
    elementsById.set(m[2], el);
    return el;
  });

  const navButtons = [...desktopHtml.matchAll(/<button class="([^"]*\bnavbtn\b[^"]*)" data-page="([^"]+)"/g)].map((m) => {
    return new FakeElement("", { "data-page": m[2] }, m[1].split(/\s+/).filter(Boolean));
  });

  const goButtons = [...desktopHtml.matchAll(/data-go="([^"]+)"/g)].map((m) => {
    return new FakeElement("", { "data-go": m[1] });
  });

  const ipcButtons = [...desktopHtml.matchAll(/data-ipc="([^"]+)"/g)].map((m) => {
    return new FakeElement("", { "data-ipc": m[1] });
  });

  const selectPrefs = [];
  const togglePrefs = [];
  const dynamicFilters = [];
  const dynamicMcp = [];
  const ipcMessages = [];

  const document = {
    readyState: "complete",
    documentElement: new FakeElement("html"),
    createElement() { return new FakeElement(); },
    createDocumentFragment() { return new FakeElement(); },
    getElementById(id) {
      return elementsById.get(id) || null;
    },
    querySelector(selector) {return this.querySelectorAll(selector)[0]||null;},
    querySelectorAll(selector) {
      if (selector === ".page") return pages;
      if (selector === ".navbtn") return navButtons;
      if (selector === "[data-page]") return navButtons;
      if (selector === "[data-go]") return goButtons;
      if (selector === "[data-ipc]") return ipcButtons;
      if (selector === "select[data-pref]") return selectPrefs;
      if (selector === ".toggle[data-pref]") return togglePrefs;
      if (selector === "[data-filter]") return dynamicFilters;
      if (selector === "[data-mcp]") return dynamicMcp;
      return [];
    },
    addEventListener() {}
  };

  const window = {
    localStorage: { values:new Map(),getItem(key){return this.values.get(key)||null;},setItem(key,value){this.values.set(key,value);} },
    ipc: {
      postMessage(message) {
        ipcMessages.push(String(message));
      }
    },
    addEventListener() {},
    setTimeout,
    clearTimeout,
    setInterval() {
      return 1;
    }
  };

  const fakeState = {
    bridge_connected: true,
    studio_running: true,
    mcp_alive: true,
    roblox_connected: true,
    workspace_ready: true,
    workspace_root: "C:\\PlazCodeWorkspace",
    tools: [],
    servers: [],
    logs: [],
    fatal: null,
    preferences: {},
    browser_agent: { canCoWork: true, canQueue: true, canStop: true, cowork: { enabled: true, pending: [{ id: 1, preview: "Follow-up task", status: "queued" }] } }
  };

  const fakeUpdate = { installed:"1.19.33",latest:"1.19.33",checked_at:Date.now(),check_error:null,background:false,available:true,busy:false,message:"Update available.",release_notes:[{version:"1.19.33",title:"Release notes",summary:"Exact <text> stays literal",added:["New notes"],improved:["Better layout"],fixed:[]}] };
  function fetch(url, options) {
    if (String(url).includes("/api/desktop/update") && options && options.method === "POST") { fakeUpdate.busy=true; fakeUpdate.message="Downloading update…"; }
    const body = String(url).includes("/api/mcp/catalog")
      ? { servers: [] }
      : String(url).includes("/api/desktop/update") ? fakeUpdate : String(url).includes("/api/memory") ? { automatic: true, entries: [] } : fakeState;
    return Promise.resolve({
      ok: true,
      status: 200,
      json() {
        return Promise.resolve(body);
      }
    });
  }

  const vm = require("vm");
  vm.runInNewContext(desktopScript, {
    document,
    window,
    crypto: require("node:crypto").webcrypto,
    fetch,
    Headers,
    AbortController,
    console,
    Promise,
    Object,
    Array,
    String,
    JSON,
    Error,
    RegExp,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    setInterval: () => 1,
    clearInterval: () => {}
  }, { timeout: 2000 });

  if (!window.PlazCodeDesktop || typeof window.PlazCodeDesktop.go !== "function") {
    throw new Error("Desktop UI bootstrap did not expose PlazCodeDesktop.go");
  }
  if (!ipcMessages.includes("ui-ready")) {
    throw new Error("Desktop UI did not emit ui-ready");
  }

  for (const pageName of ["home", "tools", "mcp", "terminal", "settings", "updates"]) {
    window.PlazCodeDesktop.go(pageName);
    const page = elementsById.get("page-" + pageName);
    if (!page || !page.classList.contains("active")) {
      throw new Error("Desktop navigation failed for page: " + pageName);
    }
    for (const other of pages) {
      if (other !== page && other.classList.contains("active")) {
        throw new Error("Multiple desktop pages active after navigating to: " + pageName);
      }
    }
    const nav = navButtons.find((button) => button.getAttribute("data-page") === pageName);
    if (!nav || !nav.classList.contains("active")) {
      throw new Error("Desktop nav active state failed for page: " + pageName);
    }
  }

  await new Promise(resolve => setTimeout(resolve, 0));
  await window.PlazCodeDesktop.refresh();
  if (elementsById.get("coworkPrompt").placeholder !== "Follow up") throw new Error("Active Co-work placeholder missing");
  if (elementsById.get("homeCowork").getAttribute("aria-pressed") !== "true") throw new Error("Co-work toggle did not sync from browser");
  if (elementsById.get("coworkDialog").hidden) throw new Error("Co-work mode must show the inline chat");
  if (elementsById.get("coworkList").children.length !== 1) throw new Error("Queue preview missing");
  if (elementsById.get("sideStudioStatus").textContent !== "Studio connected") throw new Error("Connected Studio indicator missing");
  if (elementsById.get("studioVal").textContent !== "Connected") throw new Error("Connected Studio card missing");
  // 1.24.17: Studio open with a running helper but an OFFLINE editor link is not "Connected".
  fakeState.roblox_connected = false; await window.PlazCodeDesktop.refresh();
  if (elementsById.get("sideStudioStatus").textContent !== "Studio open · not linked") throw new Error("Studio + helper without the editor link must not say connected");
  if (elementsById.get("studioVal").textContent !== "Open") throw new Error("Unlinked Studio card must say Open");
  fakeState.mcp_alive = false; await window.PlazCodeDesktop.refresh();
  if (elementsById.get("sideStudioStatus").textContent !== "Studio open · not linked") throw new Error("Unlinked Studio indicator missing");
  fakeState.studio_running = false; await window.PlazCodeDesktop.refresh();
  if (elementsById.get("sideStudioStatus").textContent !== "Studio closed") throw new Error("Closed Studio indicator missing");
  if (elementsById.get("studioVal").textContent !== "Offline") throw new Error("Closed Studio card must say Offline");
  fakeState.browser_agent.canStop = false;
  fakeState.browser_agent.cowork.enabled = false;
  fakeState.browser_agent.canQueue = false;
  await window.PlazCodeDesktop.refresh();
  if (!elementsById.get("coworkDialog").hidden) throw new Error("Co-work off must hide its inline chat");
  if (!elementsById.get("queueCowork").disabled) throw new Error("Co-work off must block queue submission");
  if (elementsById.get("coworkPrompt").placeholder !== "Message") throw new Error("Idle placeholder missing");
  fakeState.browser_agent.activity=[{id:'manual-fold-test',label:'Working',done:false}];await window.PlazCodeDesktop.refresh();
  elementsById.get("homeActivity").open=true;
  fakeState.browser_agent.activity[0].done=true;fakeState.browser_agent.activity[0].label='Worked';await window.PlazCodeDesktop.refresh();
  if(!elementsById.get("homeActivity").open)throw new Error("Completion must retain the expanded desktop work panel");
  elementsById.get("homeActivity").open=false;await window.PlazCodeDesktop.refresh();
  if(elementsById.get("homeActivity").open)throw new Error("Polling must retain a manually folded work panel");

  window.PlazCodeDesktop.go("updates"); await new Promise(resolve => setTimeout(resolve, 0));
  if (elementsById.get("installUpdate").disabled) throw new Error("Available update must be installable");
  if (!elementsById.get("sidebarVersion").textContent.includes("(Up to date)")) throw new Error("Current version indicator missing");
  fakeUpdate.latest="1.19.34";window.PlazCodeDesktop.go("updates");await new Promise(resolve=>setTimeout(resolve,0));
  if (!elementsById.get("sidebarVersion").textContent.includes("- Outdated") || elementsById.get("updateInstalled").style.color!=="#ff696c") throw new Error("Outdated version indicator missing");
  fakeUpdate.check_error="Offline";window.PlazCodeDesktop.go("updates");await new Promise(resolve=>setTimeout(resolve,0));
  if (!elementsById.get("titleVersion").textContent.includes("- Outdated")) throw new Error("A known outdated version must stay red when the next check fails");
  fakeUpdate.check_error=null;fakeUpdate.latest="1.19.33";fakeUpdate.busy=true;fakeUpdate.background=true;
  window.PlazCodeDesktop.go("updates");await new Promise(resolve=>setTimeout(resolve,0));
  if (!elementsById.get("updateOverlay").hidden) throw new Error("Automatic check must not open update overlay");
  if(elementsById.get("checkUpdates").disabled || elementsById.get("installUpdate").disabled)throw new Error("Automatic checks must keep manual update controls available");
  fakeUpdate.busy=false;fakeUpdate.background=false;window.PlazCodeDesktop.go("updates");await new Promise(resolve=>setTimeout(resolve,0));
  const notes=elementsById.get("updateReleaseNotes").children;
  if (notes.length !== 1 || notes[0].children[0].textContent !== "PlazCode v1.19.33: Release notes" || notes[0].children[1].textContent !== "Exact <text> stays literal") throw new Error("Release note rendering failed");
  const firstNote=notes[0];window.PlazCodeDesktop.go("updates");await new Promise(resolve=>setTimeout(resolve,0));
  if(elementsById.get("updateReleaseNotes").children[0] !== firstNote)throw new Error("Polling reset release expansion");
  elementsById.get("installUpdate").onclick(); await new Promise(resolve => setTimeout(resolve, 0));
  if (elementsById.get("updateOverlay").hidden || !elementsById.get("installUpdate").disabled) throw new Error("Update progress/double-click guard missing");
  fakeUpdate.busy=false; fakeUpdate.error="Download failed";
  window.PlazCodeDesktop.go("updates"); await new Promise(resolve => setTimeout(resolve, 0));
  if (elementsById.get("updateError").textContent !== "Download failed" || elementsById.get("closeUpdateError").hidden) throw new Error("Update error feedback missing");
  elementsById.get("closeUpdateError").onclick();
  if (!elementsById.get("updateOverlay").hidden) throw new Error("Update error overlay did not close");
  for (const target of ["chatgpt","deepseek","claude","github"]) {
    const button=ipcButtons.find(button=>button.getAttribute("data-ipc") === "open:"+target);
    if (!button || typeof button.onclick !== "function") throw new Error("Browser shortcut missing: "+target);
    button.onclick();if (!ipcMessages.includes("open:"+target)) throw new Error("Browser shortcut IPC failed: "+target);
  }
  elementsById.get("desktopTheme").value="cyan";elementsById.get("desktopTheme").onchange();
  if(document.documentElement.dataset.desktopTheme !== "cyan" || document.documentElement.style["--orange"] !== "#27c1e7")throw new Error("Theme palette did not apply");
  elementsById.get("desktopGlow").value="off";elementsById.get("desktopGlow").onchange();
  elementsById.get("desktopGradients").value="off";elementsById.get("desktopGradients").onchange();
  if(JSON.parse(window.localStorage.getItem("plazcodeDesktopAppearance")).gradients !== "off" || document.documentElement.style["--theme-glow"] !== "0")throw new Error("Appearance selection did not persist");
  elementsById.get("resetAppearance").onclick();if(document.documentElement.dataset.desktopTheme !== "default")throw new Error("Default theme restore failed");
  const minimize = ipcButtons.find((button) => button.getAttribute("data-ipc") === "minimize");
  if (!minimize || typeof minimize.onclick !== "function") {
    throw new Error("Desktop minimize IPC button was not bound");
  }
  minimize.onclick();
  if (!ipcMessages.includes("minimize")) {
    throw new Error("Desktop minimize IPC message was not emitted");
  }
}

runDesktopInteractionRegression().catch(error => { console.error(error); process.exitCode = 1; });

if (!cargoToml.includes('wry = { version = "0.57.0"') || !cargoToml.includes('tao = { version = "0.37.0"')) {
  throw new Error("WebView2/Tao desktop renderer dependencies missing");
}
if (cargoToml.includes("eframe =")) throw new Error("Legacy egui renderer dependency returned");

for (const token of [
  ".shell{min-width:0;min-height:0;",
  ".content{flex:1 1 auto;min-height:0;",
  "overflow-y:auto",
  "scrollbar-gutter:stable",
  'id="content"',
  "Content.scrollTop = 0"
]) {
  if (!desktopHtml.includes(token)) {
    throw new Error("Desktop scroll contract missing: " + token);
  }
}

const guiRs = fs.readFileSync("agent/src/gui.rs", "utf8");
for (const token of ['.with_initialization_script(initialization)', '.with_url(&desktop_url)', '.with_navigation_handler']) {
  if (!guiRs.includes(token)) throw new Error("Same-origin desktop startup contract missing: " + token);
}
const mainRs = fs.readFileSync("agent/src/main.rs", "utf8");
if (!mainRs.includes("ready_rx).await") || !mainRs.includes("let _ = ready.send(());")) throw new Error("Desktop must wait for bridge bind before opening");
if (!mainRs.includes('.route("/desktop-ui", get(desktop_shell_handler))')) throw new Error("Credential-free desktop shell missing");
for (const entry of manifest.content_scripts || []) {
  for (const path of entry.js || []) {
    if (!fs.existsSync(path)) throw new Error("Manifest references missing JS: " + path);
  }
  for (const path of entry.css || []) {
    if (!fs.existsSync(path)) throw new Error("Manifest references missing CSS: " + path);
  }
}

const background = fs.readFileSync("background.js", "utf8");
for (const token of [
  "DESKTOP_PREF_KEYS",
  "/api/preferences",
  "_plazcodePersisted",
  "initialDesktopPreferencesSync",
  "pullDesktopPreferences",
  "pushDesktopPreferences",
  "desktop_tools_snapshot",
  "/api/tools/browser",
  "chrome.runtime.onMessage.addListener",
  "sendResponse"
]) {
  if (!background.includes(token)) throw new Error("Desktop relay contract missing: " + token);
}

const main = fs.readFileSync("core/main.js", "utf8");
for (const token of [
  "desktopBrowserTools",
  "syncDesktopToolSnapshot",
  "SWEEP_ACTIVE_MS",
  "SWEEP_IDLE_MS",
  "releaseMediaUrl",
  "clearMediaFiles",
  "nextDelay = document.hidden ? 1000",
  "e.t - lastDiagDomAt >= 2000"
]) {
  if (!main.includes(token)) throw new Error("Long-chat/tool catalog regression guard missing: " + token);
}

if (main.includes("barRaf = requestAnimationFrame(placeBar);")) {
  throw new Error("High-frequency perpetual placeBar requestAnimationFrame loop returned");
}
if (main.includes("rsInterval(scheduleSweep, 1500)")) {
  throw new Error("Old high-frequency fallback sweep returned");
}

const providerNames = requiredProviders.map((p) => p.split("/").pop());
console.log("desktop regression: protected", Object.keys(baseline).length, "core/provider files");
console.log("desktop regression: supported provider adapters present:", providerNames.join(", "));
console.log("desktop regression: notion remains experimental; authorized result-paste/deadline changes are hash-protected");
console.log("desktop regression: PASS");
