// PlazCode's Blockbench toolset against a stand-in for Blockbench's plugin API (release-tools/fake-blockbench.js).
// This proves the toolset's own logic and wording. It does NOT prove anything about a real Blockbench.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const source = fs.readFileSync(path.join(__dirname, "core", "blockbench-tools.js"), "utf8");
const fake = fs.readFileSync(path.join(__dirname, "release-tools", "fake-blockbench.js"), "utf8");
const same = (a, b, why) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), why); // answers come from another script world
function world(withFake = true) { const box = vm.createContext({}); if (withFake) vm.runInContext(fake, box); vm.runInContext(source, box); return box; }

(async () => {
  // No free-code door, in the file or in the list of actions.
  assert(!/\beval\s*\(|new Function|\brequire\s*\(|\bimport\s*\(|XMLHttpRequest|\bfetch\s*\(|WebSocket/.test(source), "the toolset runs no free code and opens no connection itself");
  const box = world(), tools = box.__plazcodeBlockbench, run = (cmd, args) => tools.run(cmd, args);
  assert(!tools.ops.some((op) => /eval|script|code|exec/i.test(op.name)), "no action runs free code");
  same(tools.ops.filter((op) => !op.change).map((op) => op.name).sort(), ["animation_list", "export", "formats", "outline", "screenshot", "select", "selection", "status", "texture_list"]);

  // Before a model is open: status answers, everything else says what to do in plain words.
  let reply = await run("status");
  assert(reply.ok && reply.result.project === null && reply.result.blockbench === "5.0.1");
  reply = await run("cube_add", { name: "door" });
  assert(!reply.ok && /No model is open in Blockbench/.test(reply.message));
  reply = await run("read_file", { path: "/etc/passwd" });
  assert(!reply.ok && /no action named "read_file"/.test(reply.message));
  reply = await run("__proto__");
  assert(!reply.ok, "inherited names are not actions");
  reply = await run("project_new", { format: "nope" });
  assert(!reply.ok && /no model format "nope"/.test(reply.message));

  reply = await run("project_new", { format: "free", name: "house" });
  assert(reply.ok && reply.result.project.name === "house" && reply.result.project.format === "free");
  reply = await run("group_add", { name: "walls", origin: [0, 0, 0] });
  assert(reply.ok && reply.result.kind === "group");
  reply = await run("cube_add", { name: "front", from: [0, 0, 0], size: [16, 16, 1], group: "walls" });
  assert(reply.ok && reply.result.to.join() === "16,16,1" && reply.result.group === "walls");
  reply = await run("cube_add", { name: "door", from: [6, 0, 0], to: [10, 8, 1] });
  const door = reply.result.id;
  reply = await run("update", { target: door, new_name: "front door", group: "walls", rotation: [0, 45, 0] });
  assert(reply.ok && reply.result.name === "front door" && reply.result.group === "walls" && reply.result.rotation.join() === "0,45,0");
  reply = await run("update", { target: "front door" });
  assert(!reply.ok && /Nothing to change/.test(reply.message));
  assert.strictEqual(box.Undo.log.at(-1), "cancelled", "a refused change is taken back, not half kept");
  reply = await run("update", { target: "roof" });
  assert(!reply.ok && /no part named "roof"/.test(reply.message));
  reply = await run("cube_add", { name: "x", group: "front" });
  assert(!reply.ok && /"front" is a cube, not a group/.test(reply.message));

  reply = await run("outline");
  same(reply.result.parts.map((p) => p.name), ["walls"]);
  same(reply.result.parts[0].children.map((p) => p.name), ["front", "front door"]);
  reply = await run("duplicate", { targets: ["front"], offset: [0, 0, 15] });
  assert(reply.ok && reply.result[0].from.join() === "0,0,15");
  reply = await run("mesh_add", { name: "roof", vertices: [[0, 16, 0], [16, 16, 0], [8, 24, 8]], faces: [[0, 1, 2]] });
  assert(reply.ok && reply.result.vertices === 3 && reply.result.faces === 1);
  reply = await run("mesh_add", { name: "bad", vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], faces: [[0, 1, 7]] });
  assert(!reply.ok && /point number 7/.test(reply.message));

  reply = await run("texture_add", { name: "bricks", width: 32, height: 32, color: "#aa5533" });
  assert(reply.ok && reply.result.name === "bricks.png");
  reply = await run("texture_add", { name: "bad", data_url: "javascript:alert(1)" });
  assert(!reply.ok && /PNG picture/.test(reply.message));
  reply = await run("texture_apply", { texture: "bricks.png", targets: ["front", "walls"] });
  assert(reply.ok && reply.result.applied_to.join() === "front", "groups are skipped, cubes get the texture");
  reply = await run("texture_list");
  assert(reply.ok && reply.result.length === 1);

  reply = await run("animation_add", { name: "swing", length: 2 });
  assert(reply.ok);
  reply = await run("animation_keyframe", { animation: "swing", target: "walls", channel: "rotation", time: 1, values: [0, 90, 0] });
  assert(reply.ok && box.Animation.all[0].keyframes[0].value.y === 90);
  reply = await run("animation_keyframe", { animation: "swing", target: "front", values: [0, 0, 0] });
  assert(!reply.ok && /is a cube, not a group/.test(reply.message));

  reply = await run("select", { targets: ["front", "front door"] });
  assert(reply.ok && reply.result.selected.length === 2);
  reply = await run("selection");
  same(reply.result.selected.map((p) => p.name), ["front", "front door"]);
  reply = await run("screenshot");
  assert(reply.ok && reply.result.image.startsWith("data:image/png;base64,"));
  reply = await run("export");
  assert(reply.ok && reply.result.name === "house.bbmodel" && JSON.parse(reply.result.text).name === "house");
  reply = await run("export", { as: "format" });
  assert(reply.ok && reply.result.text === "FORMAT-TEXT");
  reply = await run("remove", { targets: ["walls"] });
  assert(reply.ok);
  reply = await run("status");
  assert.strictEqual(reply.result.project.groups, 0);
  assert.strictEqual(reply.result.project.cubes, 0, "removing a group removes what is inside it");
  assert.strictEqual(reply.result.project.meshes, 1, "a part outside the group stays");
  reply = await run("undo");
  assert(reply.ok && box.Undo.log.at(-1) === "undo");
  assert(box.Undo.log.filter((line) => line.startsWith("PlazCode: ")).length >= 8, "every change is one undo step named after PlazCode");
  assert.strictEqual(box.Undo.open, null);
  // Every answer is plain data.
  for (const [cmd, args] of [["status"], ["outline"], ["formats"], ["texture_list"], ["animation_list"]]) JSON.parse(JSON.stringify((await run(cmd, args)).result));

  // A page that is not Blockbench (or an older one): a plain sentence, no crash.
  const bare = world(false).__plazcodeBlockbench;
  reply = await bare.run("status");
  assert(reply.ok && reply.result.project === null);
  reply = await bare.run("formats");
  assert(!reply.ok && /does not offer "Formats"/.test(reply.message));
  console.log("test-blockbench-tools: PASS");
})().catch((error) => { console.error(error); process.exit(1); });
