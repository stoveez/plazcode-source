// Several vaults: the list never deletes files, switching resets caches in every tab, nesting is refused.
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const Memory = require("./core/memory.js");
const R = Memory.vaultRegistry;
assert(R, "memory.js exposes vaultRegistry");

// ── pure list rules ──
let list = R.withDefault([]);
assert.deepEqual(list.map((v) => v.id), ["default"]);
list = R.add(list, "Game notes", "D:\\Game notes");
assert.equal(list.length, 2); assert.equal(list[1].name, "Game notes");
assert.equal(R.add(list, "", "E:\\School").pop().name, "School", "the folder name becomes the name");
assert.throws(() => R.add(list, "x", "d:\\game notes\\"), /already in your list/);
assert.throws(() => R.add(list, "x", "D:\\Game notes\\Sub"), /inside another vault/);
assert.throws(() => R.add(list, "x", "D:\\"), /inside another vault|hold one/);
assert.throws(() => R.add(list, "x", ""), /full path/); assert.throws(() => R.add(list, "x", "relative/folder"), /full path/);
assert.throws(() => R.forget(list, "default", "default"), /stays in the list/);
assert.throws(() => R.forget(list, list[1].id, list[1].id), /Switch to another vault first/);
assert.equal(R.forget(list, list[1].id, "default").length, 1);
assert.equal(R.rename(list, list[1].id, "  <b>Big</b> notes ")[1].name, "bBig/b notes", "names are cleaned, never HTML");
assert.throws(() => R.rename(list, list[1].id, "  "), /Type a name/);
assert.equal(R.activeId(list, { custom: false }), "default");
assert.equal(R.activeId(list, { custom: true, path: "d:/GAME NOTES" }), list[1].id, "paths compare without case or slash style");
assert.equal(R.activeId(list, { custom: true, path: "F:\\Elsewhere" }), null);
const adopted = R.adopt(list, { custom: true, path: "F:\\Elsewhere" });
assert.equal(adopted.length, 3); assert.equal(adopted[2].name, "Elsewhere"); assert.equal(R.adopt(adopted, { custom: true, path: "F:\\Elsewhere" }).length, 3, "no duplicate adoption");

// ── the Memory page, with a fake desktop app and fake browser storage ──
function setup() {
  const dom = new JSDOM("<!doctype html><body><div id=root></div></body>", { runScripts: "outside-only" });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  const store = {};
  globalThis.chrome = { storage: { local: { get(keys, cb) { const out = {}; for (const k of [].concat(keys)) if (k in store) out[k] = store[k]; cb(out); }, set(v, cb) { Object.assign(store, JSON.parse(JSON.stringify(v))); cb && cb(); } } } };
  const app = { custom: false, path: "C:/Users/me/PlazCode/Vault", notes: 4, learning: true, calls: [] };
  globalThis.PlazCodeVaultApi = async (req) => {
    app.calls.push(req);
    if (req.action === "configure" && req.path !== undefined) { app.custom = !!req.path; app.path = req.path || "C:/Users/me/PlazCode/Vault"; }
    if (req.action === "configure" || req.action === "settings") return { ok: true, path: app.path, custom: app.custom, notes: app.notes, learning: true };
    if (req.action === "index") return { ok: true, notes: [], total: 0, start: "", now: "" };
    return { ok: true };
  };
  return { dom, store, app };
}
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
(async () => {
  let { dom, store, app } = setup();
  const root = document.getElementById("root");
  Memory.mount(root, () => Promise.resolve({ ok: true }), {});
  await tick(80);
  const section = root.querySelector("[data-vault-switch]");
  assert.equal(section.hidden, false, "the list shows where browser storage exists");
  assert.equal(root.querySelectorAll("[data-vault-list] li").length, 1);
  assert.equal(root.querySelector("[data-vault-list] li[data-active=true] strong").textContent, "PlazCode vault");
  assert.deepEqual(store.rsActiveVault && store.rsActiveVault.id, "default");

  // add and open a vault: asks the app to switch, saves the list, marks it open
  root.querySelector("[data-vault-newname]").value = "Game notes"; root.querySelector("[data-vault-newpath]").value = "D:\\Game notes";
  root.querySelector("[data-vault-add]").click(); await tick(60);
  assert(app.calls.some((c) => c.action === "configure" && c.path === "D:\\Game notes"));
  assert.equal(root.querySelectorAll("[data-vault-list] li").length, 2);
  assert.equal(root.querySelector("[data-vault-list] li[data-active=true] strong").textContent, "Game notes");
  assert.equal(store.rsVaults.length, 2, "the saved list holds the default vault and the new one");
  assert.equal(store.rsActiveVault.name, "Game notes");
  assert(/"Game notes" is open/.test(root.querySelector("[data-vault-status]").textContent));
  // nested folder is refused with a plain message and nothing is switched
  const before = app.calls.length;
  root.querySelector("[data-vault-newpath]").value = "D:\\Game notes\\Inner"; root.querySelector("[data-vault-add]").click(); await tick(30);
  assert(/inside another vault/.test(root.querySelector("[data-vault-status]").textContent)); assert.equal(app.calls.length, before);

  // switch back to the default vault with Open; a tab that did not switch drops its cache and warns the AI once
  [...root.querySelectorAll("[data-vault-list] li")].find((li) => li.dataset.vaultId === "default").querySelector("[data-vault-actions] button").click(); await tick(60);
  assert.equal(app.custom, false); assert.equal(store.rsActiveVault.id, "default");
  store.rsActiveVault = { id: "other", name: "Other \"vault\"", at: 1 };
  const note = await Memory.vaultTool({ action: "index" }, {});
  assert(/active vault is now "Other "vault""/.test(note) && /Read Home/.test(note), "the AI is told the vault changed, once");
  assert(!/active vault is now/.test(await Memory.vaultTool({ action: "index" }, {})), "the notice is shown only once");

  // rename and remove never delete files: no delete-like call reaches the app
  const removeLi = [...root.querySelectorAll("[data-vault-list] li")].find((li) => li.dataset.vaultId !== "default");
  const rename = [...removeLi.querySelectorAll("button")].find((b) => b.textContent === "Rename"); rename.click();
  const input = root.querySelector("[data-vault-rename-input]"); input.value = "School"; [...root.querySelectorAll("[data-vault-list] button")].find((b) => b.textContent === "Save name").click(); await tick();
  assert.equal(store.rsVaults.find((v) => v.name === "School") ? 1 : 0, 1);
  const rm = [...root.querySelectorAll("[data-vault-list] button")].find((b) => b.textContent === "Remove from list"); rm.click();
  [...root.querySelectorAll("[data-vault-list] button")].find((b) => /Click again/.test(b.textContent)).click(); await tick();
  assert.equal(root.querySelectorAll("[data-vault-list] li").length, 1);
  assert(!app.calls.some((c) => /delete|remove|archive/.test(c.action)), "taking a vault off the list never touches its files");
  assert(/not touched/.test(root.querySelector("[data-vault-status]").textContent));

  // no browser storage (the desktop window): the list stays hidden and the old one-folder box still works
  dom = null; ({ store, app } = setup()); delete globalThis.chrome;
  const root2 = document.getElementById("root"); Memory.mount(root2, () => Promise.resolve({ ok: true }), {}); await tick(60);
  assert.equal(root2.querySelector("[data-vault-switch]").hidden, true);
  console.log("several vaults: list rules, switching, cross-tab notice, rename/remove safety and no-storage fallback checks passed.");
})().catch((e) => { console.error(e); process.exitCode = 1; });
// chat notes are kept per vault (main.js wiring)
(() => {
  const main = require("node:fs").readFileSync("core/main.js", "utf8");
  assert(main.includes("const noteKey=id=>activeVaultId==='default'?id:activeVaultId+'|'+id;"), "each vault keeps its own state for a chat");
  assert(main.includes("latestChatNote={path:next.path,chat_id:id,at:now,vault:activeVaultId}"), "the latest-chat pointer remembers its vault");
  assert(main.includes("const latestHere=()=>latestChatNote&&(latestChatNote.vault||'default')===activeVaultId?latestChatNote:null;"), "a pointer from another vault is ignored");
  assert(main.includes("changes.rsActiveVault"), "a switch in one tab updates the others");
  console.log("several vaults: chat notes follow the open vault.");
})();
