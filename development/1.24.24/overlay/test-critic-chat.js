// SPDX-License-Identifier: GPL-3.0-or-later
// 1.24.21 independent critic chat: the tool logic, the fallbacks, the round limit and the wiring.
const assert = require("assert");
const fs = require("fs");
const Memory = require("./core/memory.js");

(async () => {
  // Reading the score and verdict from the critic's reply
  assert.deepStrictEqual(Memory.criticParse("SCORES:\n- Shape: 7/10\nSCORE: 74%\nVERDICT: REVISE\nFIXES:\n1. Longer blade"), { score: 74, verdict: "REVISE" });
  assert.deepStrictEqual(Memory.criticParse("SCORE: 91%\nVERDICT: APPROVED"), { score: 91, verdict: "APPROVED" });
  assert.strictEqual(Memory.criticParse("I would say about 66% there").score, 66);
  assert.strictEqual(Memory.criticParse("no numbers at all").score, null);
  assert.strictEqual(Memory.criticParse("SCORE: 250%").score, null, "a nonsense percent is ignored");

  const calls = [];
  const bridge = async (message) => {
    const r = message.request; calls.push(r.action + ":" + (r.path || ""));
    if (r.action === "read_image") return { ok: true, path: r.path, mimeType: "image/png", data: "QUJD" };
    if (r.action === "read") return { ok: true, text: "# Rubric\n- Shape\n- Colour", total_chars: 20, next_offset: null, links: [] };
    return { ok: true, start: "", notes: [], total: 0, learning: true };
  };
  await Memory.vaultRefresh(bridge, "");
  const shot = { mimeType: "image/png", data: "U0hPVA==" };
  let asked = [], closed = 0, reply = { ok: true, reply: "SCORE: 60%\nVERDICT: REVISE\nFIXES:\n1. Make it longer" };
  const ctx = (extra) => ({ chat: "chat-1", project: "", lastImage: () => shot, ask: async (r) => { asked.push(r); return reply; }, close: () => { closed++; }, ...extra });
  const args = { references: ["08 References/refs/sword.png"], rubric: "04 Models And Styles/Sword", goal: "A low poly sword" };

  // A normal round: reference pictures first, the screenshot last, the rubric in the question
  let out = await Memory.criticTool(args, ctx());
  assert(/round 1 of 5: 60% - REVISE/.test(out) && /Make it longer/.test(out) && /call plazcode_critic again/.test(out));
  assert.strictEqual(asked.length, 1); assert.strictEqual(asked[0].round, 1);
  assert.strictEqual(asked[0].images.length, 2); assert.strictEqual(asked[0].images[0].name, "08 References/refs/sword.png"); assert.strictEqual(asked[0].images[1].name, "latest-screenshot");
  assert(/LAST picture is the result/.test(asked[0].prompt) && /- Shape/.test(asked[0].prompt) && /A low poly sword/.test(asked[0].prompt) && /pass mark is 80 percent/.test(asked[0].prompt));

  // The second round counts up; approval ends the job and closes the window
  out = await Memory.criticTool(args, ctx());
  assert(/round 2 of 5/.test(out)); assert.strictEqual(asked[1].round, 2);
  reply = { ok: true, reply: "SCORE: 88%\nVERDICT: APPROVED" };
  out = await Memory.criticTool(args, ctx());
  assert(/round 3 of 5: 88% - APPROVED/.test(out) && /record the journey/.test(out)); assert.strictEqual(closed, 1);
  out = await Memory.criticTool(args, ctx());
  assert(/round 1 of 5/.test(out), "after approval the next job starts at round 1");

  // The round limit
  reply = { ok: true, reply: "SCORE: 50%\nVERDICT: REVISE" };
  const other = { references: ["08 References/refs/house.png"] };
  for (let i = 1; i <= 5; i++) out = await Memory.criticTool(other, ctx());
  assert(/round 5 of 5/.test(out)); const closedAfterFive = closed; assert(closedAfterFive >= 2, "the window is closed at round 5");
  const askedBefore = asked.length;
  out = await Memory.criticTool(other, ctx());
  assert(/Round limit reached/.test(out)); assert.strictEqual(asked.length, askedBefore, "no sixth question is sent");

  // Fallbacks: nothing is lost when the second chat is unavailable
  reply = { ok: false, error: "this AI site has no separate critic chat support yet" };
  out = await Memory.criticTool({ references: ["08 References/refs/a.png"] }, ctx({ chat: "chat-2" }));
  assert(/not available/.test(out) && /same-chat critic/.test(out) && /no separate critic chat support/.test(out));
  out = await Memory.criticTool({ references: ["08 References/refs/b.png"] }, ctx({ chat: "chat-3", ask: async () => { throw new Error("boom"); } }));
  assert(/not available \(boom\)/.test(out));
  out = await Memory.criticTool({ references: ["08 References/refs/c.png"] }, ctx({ chat: "chat-4", ask: undefined }));
  assert(/not available/.test(out));

  // Missing inputs are explained, not guessed
  await assert.rejects(Memory.criticTool({}, ctx()), /references/);
  await assert.rejects(Memory.criticTool(args, ctx({ lastImage: () => null })), /plazcode_screenshot/);

  // Wiring
  for (const base of ["", "PlazCode-Extension"]) {
    const dir = base ? base + "/" : "";
    if (base && !fs.existsSync(dir + "core/main.js")) continue;
    const main = fs.readFileSync(dir + "core/main.js", "utf8"), back = fs.readFileSync(dir + "background.js", "utf8");
    assert(main.includes('name === "plazcode_critic"') && main.includes("name:'plazcode_critic'") && main.includes("plazcode_critic: \"Ask an independent critic"));
    assert(main.includes('"rs-critic-run"') && main.includes('"rs-critic-ping"') && main.includes("async function criticRun(msg)"));
    assert(main.includes("if (A.started || A.running || A.starting || A.enhancing || A.injecting) return { ok: false, error: \"this chat tab is busy"), "never hijacks a tab that has its own session");
    assert(/plazcode_memory\|plazcode_vault\|plazcode_critic\|/.test(main), "the critic does not use up the tool budget");
    assert(back.includes('case "rs-critic"') && back.includes("async function runCritic(msg)") && back.includes("chrome.windows.create") && back.includes("focused: false"));
    assert(back.includes("no separate critic chat support yet"), "unsupported sites fall back");
  }
  const note = fs.readFileSync("agent/src/vault.rs", "utf8");
  assert(note.includes("call `plazcode_critic`") && note.includes("same-chat critic"));
  console.log("critic chat ok");
})().catch((error) => { console.error(error); process.exit(1); });
