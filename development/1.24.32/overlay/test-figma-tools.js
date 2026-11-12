// PlazCode's Figma helper actions against a stand-in for Figma's plugin API (release-tools/fake-figma.js).
// This proves the helper's own logic and wording. It does NOT prove anything about a real Figma.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const source = fs.readFileSync(path.join(__dirname, "agent", "figma_code.js"), "utf8");
const fake = fs.readFileSync(path.join(__dirname, "release-tools", "fake-figma.js"), "utf8");
const same = (a, b, why) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), why); // answers come from another script world
function world() { const box = vm.createContext({ btoa }); vm.runInContext(fake, box); vm.runInContext(source, box); return box; }

(async () => {
  // No free-code door and no way out, in the file or in the list of actions.
  assert(!/\beval\s*\(|new Function|\brequire\s*\(|\bimport\s*\(|XMLHttpRequest|\bfetch\s*\(|WebSocket|clientStorage|closePlugin/.test(source), "the helper runs no free code, opens no connection and keeps no data");
  const box = world(), tools = box.__plazcodeFigma, figma = box.figma;
  const run = async (cmd, args) => JSON.parse(JSON.stringify(await tools.run(cmd, args)));
  const ok = async (cmd, args) => { const reply = await run(cmd, args); assert.strictEqual(reply.ok, true, cmd + ": " + reply.message); return reply.result; };
  const no = async (cmd, args) => { const reply = await run(cmd, args); assert.strictEqual(reply.ok, false, cmd + " should have been refused"); return reply.message; };
  const names = tools.ops.map((op) => op.name);
  same(names, ["status", "pages", "page_set", "outline", "node", "find", "selection", "select", "frame_add", "rectangle_add", "ellipse_add", "text_add", "update", "auto_layout", "remove", "duplicate", "group", "component_create", "instance_add", "styles", "export", "undo"], "the named actions, and nothing else");
  for (const name of names) assert(/^[a-z_]+$/.test(name) && !/code|script|eval|exec|run/.test(name), name);
  assert.match(await no("eval", { code: "1" }), /does not know the action "eval"/);
  for (const sneaky of ["constructor", "__proto__", "toString", "hasOwnProperty"]) assert.match(await no(sneaky, {}), /does not know the action/, sneaky + " is not an action");
  // The actions that only look are exactly the ones the extension lets through in Read-only mode.
  const safety = fs.readFileSync(path.join(__dirname, "core", "safety.js"), "utf8");
  const readList = /const FIGMA_READ = new Set\(\[([^\]]+)\]\)/.exec(safety);
  assert(readList, "core/safety.js lists the look-only Figma actions");
  same(readList[1].match(/figma_[a-z_]+/g).sort(), tools.ops.filter((op) => !op.change).map((op) => "figma_" + op.name).sort(), "look-only list in safety.js = change:false in the helper");
  // The extension offers exactly these actions, under the same names.
  const background = fs.readFileSync(path.join(__dirname, "background.js"), "utf8");
  same([...background.matchAll(/fgtool\("(figma_[a-z_]+)"/g)].map((m) => m[1]), names.map((name) => "figma_" + name), "the extension's Figma tool list = the helper's actions");

  // Looking around.
  same(await ok("status"), { app: "Figma", editor: "figma", file: "Shop app designs", page: { id: figma.currentPage.id, name: "Home" }, pages: 2, top_level_parts: 0, selected: 0 });
  same((await ok("pages")).map((p) => [p.name, p.current]), [["Home", true], ["Ideas", false]]);
  assert.match(await no("page_set", { page: "Nowhere" }), /no page "Nowhere"/);
  same(await ok("page_set", { page: "Ideas" }), { id: figma.root.children[1].id, name: "Ideas" });
  await ok("page_set", { page: figma.root.children[0].id });
  assert.strictEqual(figma.__fake.undoSteps, 0, "looking makes no undo step");

  // Making things: each change is one undo step.
  const card = await ok("frame_add", { name: "Card", x: 40, y: 60, width: 320, height: 200, fill: "#ff8800", corner_radius: 16 });
  same([card.name, card.type, card.x, card.y, card.width, card.height], ["Card", "FRAME", 40, 60, 320, 200]);
  assert.strictEqual(figma.__fake.undoSteps, 1);
  const title = await ok("text_add", { text: "Summer sale", parent: "Card", x: 24, y: 24, font_size: 28, fill: "#ffffff" });
  same([title.type, title.text, title.name], ["TEXT", "Summer sale", "Summer sale"]);
  const button = await ok("rectangle_add", { name: "Button", parent: card.id, x: 24, y: 130, width: 120, height: 44, fill: "#222222cc", corner_radius: 8 });
  const dot = await ok("ellipse_add", { name: "Dot", width: 12, height: 12, stroke: "#000000", stroke_width: 2, fill: "none" });
  const info = await ok("node", { target: "Button" });
  same([info.fill, info.corner_radius, info.parent.name, info.width], ["#222222", 8, "Card", 120]);
  assert.strictEqual(figma.currentPage.findAll((n) => n.name === "Button")[0].fills[0].opacity, 0.8, "#rrggbbaa sets the opacity");
  same((await ok("node", { target: dot.id })).stroke_width, 2);
  const tree = await ok("outline", {});
  same([tree.type, tree.children.map((c) => c.name), tree.children[0].children.map((c) => c.name)], ["PAGE", ["Card", "Dot"], ["Summer sale", "Button"]]);
  same((await ok("outline", { depth: 1 })).children[0].children_not_shown, 2, "depth cuts the tree and says so");
  same((await ok("outline", { target: "Card" })).children.length, 2);
  same((await ok("find", { type: "text" })).parts.map((p) => p.text), ["Summer sale"]);
  same((await ok("find", { name: "butt" })).found, 1);
  assert.match(await no("find", {}), /Give name .* or type/);

  // Plain refusals: nothing half-made is left behind.
  const before = figma.currentPage.findAll().length;
  assert.match(await no("frame_add", { width: "wide" }), /width must be a number/);
  assert.match(await no("rectangle_add", { fill: "orange" }), /fill must be a colour like #ff8800/);
  assert.match(await no("frame_add", { parent: "No such frame" }), /Nothing on this page is named "No such frame"/);
  assert.match(await no("rectangle_add", { parent: "Dot" }), /"Dot" cannot hold other parts/);
  assert.match(await no("text_add", { parent: "Card" }), /Give text/);
  assert.match(await no("text_add", { text: "Hi", font: "Missing Font" }), /could not load the font Missing Font Regular/);
  assert.match(await no("node", { target: "9:999" }), /No part has the id 9:999/);
  assert.match(await no("frame_add", { width: 0 }), /between 0.01 and 100000/);
  assert.match(await no("text_add", { text: "Hi", fill: "red" }), /fill must be a colour/);
  assert.strictEqual(figma.currentPage.findAll().length, before, "a refused step leaves no half-made part behind");

  // Changing things.
  const changed = await ok("update", { target: "Button", new_name: "Buy button", x: 30, width: 140, fill: "#0055ff", opacity: 0.9 });
  same([changed.name, changed.x, changed.width, changed.height, changed.fill, changed.opacity], ["Buy button", 30, 140, 44, "#0055ff", 0.9]);
  same((await ok("update", { target: title.id, text: "Winter sale", font_size: 30 })).text, "Winter sale");
  assert.match(await no("update", { target: "Buy button", text: "x" }), /is not text/);
  assert.match(await no("update", { target: "Buy button", opacity: 3 }), /opacity must be between 0 and 1/);
  assert.match(await no("update", { target: "Card", parent: "Card" }), /cannot be put inside itself/);
  same((await ok("update", { target: dot.id, parent: "Card" })).parent.name, "Card");
  const laid = await ok("auto_layout", { target: "Card", direction: "column", gap: 12, padding: 24, align: "center", cross_align: "start" });
  same(laid.auto_layout, { direction: "column", gap: 12, padding: [24, 24, 24, 24], align: "CENTER", cross_align: "MIN" });
  same((await ok("auto_layout", { target: "Card", direction: "row", padding: [1, 2, 3, 4] })).auto_layout.padding, [1, 2, 3, 4]);
  assert.match(await no("auto_layout", { target: "Dot" }), /cannot use auto layout/);
  assert.match(await no("auto_layout", { target: "Card", direction: "diagonal" }), /row, column or none/);
  assert.match(await no("auto_layout", { target: "Card", padding: [1, 2] }), /padding must be one number/);
  assert.strictEqual((await ok("auto_layout", { target: "Card", direction: "none" })).auto_layout, undefined);

  // Two parts with one name: the helper asks for the id instead of guessing.
  const copies = await ok("duplicate", { targets: ["Buy button"], offset: [200, 0] });
  same([copies[0].name, copies[0].x], ["Buy button", 230]);
  const twice = await no("update", { target: "Buy button", x: 1 });
  assert.match(twice, /2 parts on this page are named "Buy button"\. Use the id/);
  assert(twice.includes(copies[0].id) && twice.includes(button.id));
  const grouped = await ok("group", { targets: [button.id, copies[0].id], name: "Buttons" });
  same([grouped.type, grouped.name], ["GROUP", "Buttons"]);
  assert.match(await no("group", { targets: [title.id, "Card"] }), /same frame or page/);

  // Components.
  const component = await ok("component_create", { target: "Card" });
  same([component.type, component.name], ["COMPONENT", "Card"]);
  assert.match(await no("component_create", { target: component.id }), /already a component/);
  const instance = await ok("instance_add", { component: component.id, x: 500, y: 60, name: "Card copy" });
  same([instance.type, instance.x, instance.name], ["INSTANCE", 500, "Card copy"]);
  assert.match(await no("instance_add", { component: "Card copy" }), /is not a component/);
  same(await ok("styles"), { colours: [{ id: "S:1", name: "Brand / Orange", colour: "#ff8000" }], text: [{ id: "S:2", name: "Heading", font: "Inter Bold", font_size: 32 }] });

  // Selection and pictures.
  same(await ok("select", { targets: [component.id] }), { selected: 1 });
  same((await ok("selection")).map((n) => n.name), ["Card"]);
  assert.strictEqual(figma.__fake.zoomed, 1);
  const picture = await ok("export", { scale: 2 });
  assert.match(picture.image, /^data:image\/png;base64,iVBORw0KGgo/);
  same([picture.of.name, picture.scale], ["Card", 2]);
  same((await ok("export", { target: "Card copy" })).of.name, "Card copy");
  assert.match(await no("export", { scale: 9 }), /scale must be between 0.1 and 4/);
  figma.currentPage.findAll((n) => n.name === "Card copy")[0].huge = true;
  assert.match(await no("export", { target: "Card copy" }), /too large to pass on \(6 MB\)/);
  same(await ok("select", { targets: [] }), { selected: 0 });
  assert.match(await no("export", {}), /Nothing is selected/);
  assert.match(await no("select", { targets: [figma.currentPage.id] }), /A page cannot be selected/);

  // Removing, and what is never removed.
  assert.match(await no("remove", { targets: [figma.currentPage.id] }), /does not delete whole pages/);
  assert.match(await no("remove", { targets: [] }), /Give targets/);
  same(await ok("remove", { targets: ["Card copy"] }), { removed: ["Card copy"] });
  assert.match(await no("node", { target: "Card copy" }), /Nothing on this page is named/);
  const steps = figma.__fake.undoSteps;
  same(await ok("undo"), { undone: true });
  assert.strictEqual(figma.__fake.undone, 1);
  await ok("status"); await ok("outline", {}); await ok("find", { type: "FRAME" }); await ok("export", { target: "Card" });
  assert.strictEqual(figma.__fake.undoSteps, steps + 1, "only the changing action added an undo step");

  // Arguments are data: a name full of code stays a name.
  const odd = await ok("frame_add", { name: "\"); figma.root.remove(); //" });
  assert.strictEqual(odd.name, "\"); figma.root.remove(); //");
  assert.strictEqual(figma.root.children.length, 2);
  same((await run("status", "not an object")).ok, true, "odd arguments are treated as none");

  // In Figma the helper opens its small window and answers only well-formed requests from it.
  const live = vm.createContext({ btoa, __html__: "<p>window</p>" });
  vm.runInContext(fake, live); vm.runInContext(source, live);
  same(live.figma.__fake.shown, { width: 280, height: 132, title: "PlazCode" });
  const sent = []; live.figma.ui.postMessage = (message) => sent.push(JSON.parse(JSON.stringify(message)));
  for (const junk of [null, "run", { type: "run" }, { type: "run", id: "1", cmd: "status" }, { type: "other", id: 1, cmd: "status" }, { type: "run", id: 1 }]) live.figma.ui.onmessage(junk);
  live.figma.ui.onmessage({ type: "run", id: 7, cmd: "status", args: {} });
  live.figma.ui.onmessage({ type: "run", id: 8, cmd: "format_disk", args: {} });
  await new Promise((resolve) => setTimeout(resolve, 50));
  sent.sort((a, b) => a.id - b.id); // answers are matched by number, so their order does not matter
  same(sent.map((m) => [m.type, m.id, m.ok]), [["answer", 7, true], ["answer", 8, false]], "only real requests are answered, each under its own number");
  assert.strictEqual(sent[0].result.file, "Shop app designs");
  assert.strictEqual(world().figma.__fake.shown, undefined, "outside Figma (no window text) nothing is opened");

  console.log("PASS PlazCode's Figma helper against a stand-in Figma: " + names.length + " named actions and no free code, look-only list matches safety.js, tool list matches the extension, one undo step per change, plain refusals, ids for same-named parts, text only after its font loads, auto layout, components, pictures with a size limit, pages never deleted, arguments stay data, the helper's window is the only caller. Not a real Figma.");
})().catch((error) => { console.error(error); process.exit(1); });
