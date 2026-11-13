// 1.24.30 (owner): PlazCode also copies the AI site's console warnings/errors into its logs, and the AI can read the
// logs with the read-only plazcode_logs command.
const fs = require("fs"), vm = require("vm"), assert = require("assert");
// 1. Site console copy: prints exactly as before, copies short plain text, never loops or throws.
{
  const printed = [], emitted = [];
  const consoleStub = { warn: (...a) => printed.push(["warn", ...a]), error: (...a) => printed.push(["error", ...a]), log: (...a) => printed.push(["log", ...a]) };
  const listeners = {};
  const documentStub = { addEventListener: (type, fn) => { listeners[type] = fn; }, dispatchEvent: (event) => { emitted.push(JSON.parse(event.detail)); return true; } };
  const context = vm.createContext({ console: consoleStub, document: documentStub, window: { addEventListener() {} }, location: { href: "https://claude.ai/chat/1" },
    CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; }, PerformanceObserver: function () { this.observe = () => {}; }, Date, JSON, Object, String, Error, Array });
  vm.runInContext(fs.readFileSync("core/debug-capture-main.js", "utf8"), context);
  listeners["plazcode:site-log-ready"]();
  const site = context.console;
  site.error("Request failed %s", new Error("rate limited"), { huge: "x".repeat(100000) });
  site.warn("Deprecated API");
  site.log("routine line");
  assert.deepEqual(printed.map((p) => p[0]), ["error", "warn", "log"], "the site's console prints exactly as before");
  assert.equal(printed[0][2].message, "rate limited", "original arguments untouched");
  assert.equal(emitted.length, 2, "warnings and errors are copied, routine lines are not");
  assert.equal(emitted[0].kind, "console"); assert.equal(emitted[0].level, "error");
  assert(emitted[0].text.includes("Error: rate limited") && emitted[0].text.includes("[Object]") && emitted[0].text.length <= 400, emitted[0].text);
  assert(!emitted[0].text.includes("xxxx"), "object contents are never copied");
  assert(site.error.toString().includes("printed.push"), "toString still shows the original function");
  for (let i = 0; i < 100; i++) site.error("loop " + i);
  assert(emitted.length <= 42, "a looping site cannot flood the logs");
  vm.runInContext(fs.readFileSync("core/debug-capture-main.js", "utf8"), context);
  const before = printed.length; site.warn("once"); assert.equal(printed.length, before + 1, "loading twice never doubles printing");
}
// 1b. 1.24.33 (owner screenshot): with the browser's own queueMicrotask, the site's message is printed a moment later from a
// bound native function, so no PlazCode frame is on the stack and Chrome does not list it under PlazCode's errors.
{
  const printed = [], emitted = [], tasks = [];
  const consoleStub = { warn: (...a) => printed.push(["warn", ...a]), error: (...a) => printed.push(["error", ...a]) };
  const context = vm.createContext({ console: consoleStub, document: { addEventListener() {}, dispatchEvent: (e) => { emitted.push(JSON.parse(e.detail)); return true; } }, window: { addEventListener() {} }, location: { href: "https://claude.ai/new" },
    CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; }, PerformanceObserver: function () { this.observe = () => {}; }, queueMicrotask: (fn) => tasks.push(fn), Function, Date, JSON, Object, String, Error, Array });
  vm.runInContext(fs.readFileSync("core/debug-capture-main.js", "utf8"), context);
  context.console.error("[bootstrap] Eager fetch failed: Failed to fetch", 7);
  assert.equal(printed.length, 0, "not printed from inside PlazCode's function");
  assert.equal(tasks.length, 1); assert.notEqual(tasks[0].toString().indexOf("[native code]"), -1, "a bound native function prints it");
  tasks[0]();
  assert.deepEqual(printed, [["error", "[bootstrap] Eager fetch failed: Failed to fetch", 7]], "same text and arguments");
}
// 2. plazcode_logs is registered, read-only and documented.
{
  const main = fs.readFileSync("core/main.js", "utf8"), background = fs.readFileSync("background.js", "utf8");
  assert(/"plazcode_debug", "plazcode_logs"/.test(main), "listed with the PlazCode utility commands");
  assert(/tools\.push\(\{name:'plazcode_logs'/.test(main) && /plazcode_logs: "Read PlazCode's own recent logs \(read-only\)/.test(main));
  assert(/if \(name === "plazcode_logs"\) \{[\s\S]{0,1600}type: "logs"/.test(main), "answered through the background logs route");
  assert(/case "logs": \{[\s\S]{0,400}\/api\/logs\/day\?/.test(background), "background reads the app's logs route");
  const ctx = vm.createContext({}); vm.runInContext(fs.readFileSync("core/safety.js", "utf8") + ";this.S=PlazCodeSafety;", ctx);
  assert.equal(ctx.S.isChange("plazcode_logs", "studio"), false, "read-only: allowed in Read-only mode, never asks for approval");
  assert.equal(ctx.S.isChange("plazcode_logs", "local"), false);
}
console.log("PASS site console warnings/errors copied safely; plazcode_logs registered, read-only and wired to the app logs");
