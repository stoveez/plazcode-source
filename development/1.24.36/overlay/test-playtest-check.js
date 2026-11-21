"use strict";
// Playtest & Fix (owner, 2026-11-19): after a finished Roblox task that changed scripts, PlazCode plays 10 s, reads red
// errors, stops Play and sends them back, at most 2 fix rounds. Run: node test-playtest-check.js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const P = require("./core/playtest-check.js");

// 1. Which commands count as changing scripts.
const yes = [
  { tool: "multi_edit", arguments: { edits: [] } },
  { tool: "roblox__script_set_source", arguments: {} },
  { tool: "datastore_setup", arguments: {} },
  { tool: "execute_luau", arguments: { code: 'local s=Instance.new("Script") s.Source="print(1)"' } },
  { tool: "execute_luau", arguments: { code: "game:GetService('ScriptEditorService'):UpdateSourceAsync(x, f)" } },
  { tool: "plazcode_batch", arguments: { calls: [{ command: "inspect_instance", params: {} }, { command: "script_append", params: {} }] } },
];
const no = [
  { tool: "execute_luau", arguments: { code: 'local p=Instance.new("Part") p.Parent=workspace' } },
  { tool: "inspect_instance", arguments: {} }, { tool: "script_read", arguments: {} }, { tool: "ui_build", arguments: {} },
  { tool: "plazcode_batch", arguments: { calls: [{ command: "script_read", params: {} }] } }, null,
];
for (const c of yes) assert.equal(P.changesScripts(c), true, JSON.stringify(c));
for (const c of no) assert.equal(P.changesScripts(c), false, JSON.stringify(c));

// 2. Studio noise is dropped, the same error from server and client (or every frame) counts once, at most 6.
assert.deepEqual(P.clean(["ServerScriptService.Main:4: attempt to index nil with 'Parent'", "ServerScriptService.Main:4: attempt to index nil with 'Parent'",
  "Plugin_123.Foo:2: oops", "CoreGui.RobloxGui.Modules:9: x", "Failed to load sound rbxassetid://1", "Players.Bob.PlayerScripts.Client:7: Infinite loop"]),
  ["ServerScriptService.Main:4: attempt to index nil with 'Parent'", "Players.Bob.PlayerScripts.Client:7: Infinite loop"]);
assert.equal(P.clean(Array.from({ length: 20 }, (_, i) => "Workspace.S" + "abcdefghijklmnopqrst"[i] + ":1: bad")).length, 6);
assert.deepEqual(P.errorsFromOutput("old line\n", "old line\n12:00:01 -- ServerScriptService.A:3: attempt to call nil\nStack Begin\nScript 'x', Line 3\nhello\n"),
  ["12:00:01 -- ServerScriptService.A:3: attempt to call nil"]);
assert.match(P.logCode(1700000000.7), /MessageError/); assert.match(P.logCode(1700000000.7), />=1700000000 /);

// 3. The whole round trip with a fake Studio.
function rig(errorsPerRun, opts = {}) {
  const s = { calls: [], status: [], banners: [], clock: 1_700_000_000_000, stop: false, run: 0, enabled: true, roblox: true };
  const api = P.create({
    enabled: () => s.enabled, roblox: () => s.roblox, stopped: () => s.stop,
    call: async (name, args) => {
      s.calls.push(name + (args.is_start === true ? ":start" : args.is_start === false ? ":stop" : args.datamodel_type ? ":" + args.datamodel_type : ""));
      if (name === "start_stop_play") { if (args.is_start && opts.startFails) return { ok: false, error: "Studio is not connected" }; if (args.is_start) s.run++; return { ok: true, text: args.is_start ? "Play started" : "Play stopped" }; }
      if (name === "execute_luau") { if (opts.noLog) return { ok: false, error: "datamodel not available" }; const e = errorsPerRun[s.run - 1] || []; return { ok: true, text: JSON.stringify(args.datamodel_type === "Server" ? e : []) }; }
      if (name === "get_console_output") return { ok: true, text: s.run ? "before\n" + (errorsPerRun[s.run - 1] || []).join("\n") : "before\n" };
      return null;
    },
    wait: async (ms) => { s.clock += ms; if (opts.stopAt && s.clock >= opts.stopAt) s.stop = true; },
    now: () => s.clock, status: (t) => s.status.push(t), banner: (title, text) => s.banners.push([title, text]),
  });
  return { s, api };
}
(async () => {
  // Nothing changed: no Play at all.
  let { s, api } = rig([]);
  assert.equal(await api.afterDone(), null); assert.deepEqual(s.calls, []);
  // Changed scripts, no errors: plays 10 s, stops, nothing for the AI.
  ({ s, api } = rig([[]]));
  api.note(yes[0]);
  const t0 = s.clock;
  assert.equal(await api.afterDone(), null);
  assert.deepEqual(s.calls, ["get_console_output", "start_stop_play:start", "execute_luau:Server", "execute_luau:Client", "start_stop_play:stop"]);
  assert(s.clock - t0 >= 10000, "Play ran 10 seconds");
  assert(s.status.some((x) => /Playtest passed/.test(x)));
  assert.equal(await api.afterDone(), null, "checked once, not again without new changes");
  // Errors: two fix rounds, then a plain notice and done.
  const err = "ServerScriptService.Shop:12: attempt to index nil with 'Coins'";
  ({ s, api } = rig([[err], [err], [err]]));
  api.note(yes[3]);
  const first = await api.afterDone();
  assert.match(first, /PLAYTEST/); assert.match(first, /Shop:12/); assert.match(first, /Fix round 1 of 2/); assert.match(first, /do not start Play yourself/);
  const second = await api.afterDone(); // checked again even though the AI changed nothing
  assert.match(second, /Fix round 2 of 2/);
  assert.equal(await api.afterDone(), null, "no third round");
  assert.equal(s.banners.length, 1); assert.match(s.banners[0][0], /still shows errors/); assert.match(s.banners[0][1], /Shop:12/);
  assert.equal(s.calls.filter((c) => c === "start_stop_play:stop").length, 3, "Play always stopped");
  // A fixed error ends the rounds.
  ({ s, api } = rig([[err], []]));
  api.note(yes[0]); assert.match(await api.afterDone(), /Fix round 1/); assert.equal(await api.afterDone(), null); assert.equal(s.banners.length, 0);
  // LogService unreadable: falls back to the Output text.
  ({ s, api } = rig([[err]], { noLog: true }));
  api.note(yes[0]); assert.match(await api.afterDone(), /Shop:12/);
  // Studio cannot start Play: skipped, no fix message.
  ({ s, api } = rig([[err]], { startFails: true }));
  api.note(yes[0]); assert.equal(await api.afterDone(), null); assert(s.status.some((x) => /skipped/.test(x)));
  assert(!s.calls.includes("start_stop_play:stop"), "does not stop a Play it did not start");
  // The person presses Stop while it plays: nothing sent, Play stopped.
  ({ s, api } = rig([[err]], { stopAt: 1_700_000_003_000 }));
  api.note(yes[0]); assert.equal(await api.afterDone(), null); assert.equal(s.calls.at(-1), "start_stop_play:stop");
  // Switched off, or not Roblox: never plays.
  ({ s, api } = rig([[err]])); s.enabled = false; api.note(yes[0]); assert.equal(await api.afterDone(), null); assert.deepEqual(s.calls, []);
  ({ s, api } = rig([[err]])); s.roblox = false; api.note(yes[0]); assert.equal(await api.afterDone(), null); assert.deepEqual(s.calls, []);
  // A new task starts clean.
  ({ s, api } = rig([[err]])); api.note(yes[0]); api.reset(); assert.equal(await api.afterDone(), null);

  // 4. Wiring: loaded before main.js on every AI site, switch in the menu, called before a reply counts as done.
  const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
  for (const cs of manifest.content_scripts.filter((c) => c.js.includes("core/main.js"))) assert(cs.js.indexOf("core/playtest-check.js") > -1 && cs.js.indexOf("core/playtest-check.js") < cs.js.indexOf("core/main.js"), cs.matches[0]);
  const main = fs.readFileSync("core/main.js", "utf8");
  assert.match(main, /data-mode="playtest"/); assert.match(main, /rsPlaytestCheck/);
  const done = main.indexOf("fix = await finishPlay.afterDone()"), completed = main.indexOf("completed = true;", done);
  assert(done > 0 && completed > done && completed - done < 600, "the check runs right before the reply counts as done");
  assert.match(main, /playtestCheck\?\.note\(call\)/);
  const en = JSON.parse(fs.readFileSync("core/locales/en.json", "utf8"));
  for (const w of ["Playtest when done", "Playtest passed: no errors in 10 seconds of Play", "Playtest still shows errors"]) assert(w in en, "translated: " + w);
  console.log("PASS playtest check: script changes detected, 10 s of Play, errors sent back at most twice, noise dropped, wired before done");
})().catch((e) => { console.error(e); process.exit(1); });
