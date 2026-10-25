// SPDX-License-Identifier: GPL-3.0-or-later
// 1.24.21: the vault has a live note (00 Start Here/Now.md: where the work stands). It is sent at startup and the AI is told to rewrite it
// at the end of every job. Pictures the user attaches with PlazCode's media button can be stored with the vault's add_image.
const assert = require("assert");
const fs = require("fs");
const Memory = require("./core/memory.js");

(async () => {
  const base = { ok: true, start: "# Home\nStart note text", notes: [], total: 0, learning: true, vault: "C:/Vault" };
  const bridge = now => async ({ request }) => {
    if (request.action === "init") return { ok: true };
    if (request.action === "index") return now === undefined ? base : { ...base, now };
    if (request.action === "graph") throw new Error("Unknown vault action.");
    throw new Error("unexpected " + request.action);
  };

  // 1. The live note is part of the startup text, after the start note.
  await Memory.vaultRefresh(bridge("- Project: Obby\n- Last job: fixed the double jump\n- Next step: add checkpoints"), "p1");
  const text = Memory.vaultContext(false);
  assert(/LIVE NOTE \(00 Start Here\/Now\.md/.test(text), "startup names the live note");
  assert(/Last job: fixed the double jump/.test(text) && text.indexOf("Start note text") < text.indexOf("LIVE NOTE"), "live note text follows the start note");
  assert(/rewrite it with plazcode_vault write mode replace/.test(text), "the AI is told how to update it");

  // 2. The compact startup keeps it, but shorter; a long live note is cut.
  await Memory.vaultRefresh(bridge("x".repeat(5000)), "p2");
  const long = Memory.vaultContext(false), compact = Memory.vaultContext(true);
  assert(long.length < 9000 && compact.length <= long.length, "live note is capped");

  // 3. An older app without the live note (no `now` field) starts exactly as before.
  await Memory.vaultRefresh(bridge(undefined), "p3");
  assert(!/LIVE NOTE/.test(Memory.vaultContext(false)), "no live note section when the app has none");

  // 4. The learning instructions tell the AI to keep the live note current, and how to store an attached picture.
  assert(/rewrite 00 Start Here\/Now\.md/.test(Memory.vaultContext(false)), "learning text mentions the live note");
  assert(/media button, call plazcode_vault add_image/.test(Memory.vaultContext(false)) && !/media button, call plazcode_vault add_image/.test(Memory.vaultContext(true)), "learning text explains saving an attached picture (full prompt only, so small sites stay small)");
  await Memory.vaultRefresh(bridge("x"), "p4");
  assert(/LEARNING IS OFF|LEARN AUTOMATICALLY/.test(Memory.vaultContext(false)));

  // 5. Pictures attached through PlazCode's media panel are kept where add_image finds them.
  const main = fs.readFileSync(require("path").join(__dirname, "core/main.js"), "utf8");
  assert(/rememberImages\(media\.filter\(\(p\) => p\.ref\.kind === "image"\)[^;]+"attached"\)/.test(main), "attached pictures go into the recent pictures list");
  const stored = [];
  const out = await Memory.vaultTool({ action: "add_image", name: "sword", from: "last_screenshot" }, { lastImage: () => ({ mimeType: "image/png", data: "QUJD" }) }).catch(e => String(e.message));
  assert(typeof out === "string");
  console.log("PASS vault live note and attached-picture storage");
})().catch(error => { console.error(error); process.exit(1); });
