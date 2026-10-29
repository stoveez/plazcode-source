// SPDX-License-Identifier: GPL-3.0-or-later
// 1.24.21: the desktop window must send the vault its signed-in connection; a plain-text refusal must read as a clear message.
const assert = require("assert");
const fs = require("fs");
const Memory = require("./core/memory.js");

(async () => {
  // 1. The desktop hook is used when present, and its answer is returned.
  const seen = [];
  globalThis.PlazCodeVaultApi = async (request) => { seen.push(request); return { ok: true, path: "C:/Vault", notes: 3 }; };
  const reply = await Memory.vaultCall({ action: "settings" });
  assert.deepStrictEqual(seen, [{ action: "settings" }]);
  assert.strictEqual(reply.notes, 3);
  delete globalThis.PlazCodeVaultApi;

  // 2. Without the hook, a plain-text "Pair PlazCode" refusal becomes a readable message, never a JSON parse error.
  globalThis.location = { hostname: "127.0.0.1" };
  globalThis.fetch = async () => ({ status: 401, text: async () => "Pair PlazCode first: missing bearer key" });
  await assert.rejects(Memory.vaultCall({ action: "settings" }), (error) => {
    assert(!/JSON|Unexpected token/.test(error.message), "no raw parser error");
    assert(/PlazCode app/.test(error.message));
    return true;
  });
  delete globalThis.fetch; delete globalThis.location;

  // 3. The desktop page defines the hook with its own authorised API call.
  const html = fs.readFileSync("agent/src/desktop.html", "utf8");
  assert(/window\.PlazCodeVaultApi\s*=\s*function\s*\(Request\)\s*\{\s*return Api\("\/api\/vault"/.test(html), "desktop page passes its signed-in API call to the vault");
  assert(html.indexOf("window.PlazCodeVaultApi =") < html.indexOf("PlazCodeMemory.mount(Byid(\"memorySettings\")"), "hook is set before the memory screen mounts");
  console.log("PASS vault desktop sign-in hook and readable errors");
})().catch((error) => { console.error(error); process.exit(1); });
