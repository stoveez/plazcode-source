// PlazCode's Blockbench toolset. Written from scratch against Blockbench's public plugin API (blockbench.net/wiki).
// One file, used two ways: the browser extension runs it inside the web.blockbench.net tab, and the desktop app
// wraps the same text into the plugin file plazcode_blockbench.js. Named operations only: there is no "run any
// JavaScript" operation. Everything returned is plain data.
(function (root) {
  "use strict";
  var VERSION = "1";
  function fail(message) { var error = new Error(message); error.plain = true; throw error; }
  function has(name) { return typeof root[name] !== "undefined" && root[name] !== null; }
  function need(name) { if (!has(name)) fail("This Blockbench does not offer \"" + name + "\". Update Blockbench, then try again."); return root[name]; }
  function project() { var current = has("Project") ? root.Project : null; if (!current) fail("No model is open in Blockbench. Use blockbench_project_new first, or open a model."); return current; }
  function num(value, fallback) { var n = Number(value); return isFinite(n) ? n : fallback; }
  function vec(value, fallback) { if (!Array.isArray(value) || value.length < 3) return fallback; return [num(value[0], 0), num(value[1], 0), num(value[2], 0)]; }
  function text(value, fallback, limit) { return (typeof value === "string" && value.trim() ? value.trim() : fallback).slice(0, limit || 120); }
  function list(value) { return Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value]; }
  function all(name) { var type = root[name]; return type && Array.isArray(type.all) ? type.all.slice() : []; }
  function kind(node) {
    if (has("Group") && node instanceof root.Group) return "group";
    if (has("Cube") && node instanceof root.Cube) return "cube";
    if (has("Mesh") && node instanceof root.Mesh) return "mesh";
    return String(node && node.type || "element");
  }
  function nodes() { return all("Group").concat(has("Outliner") && Array.isArray(root.Outliner.elements) ? root.Outliner.elements : all("Cube").concat(all("Mesh"))); }
  function find(target, wanted) {
    var key = String(target === undefined || target === null ? "" : target);
    if (!key) fail("Say which part you mean: give its name or its id.");
    var pool = nodes(), hit = pool.filter(function (node) { return node.uuid === key; })[0] || pool.filter(function (node) { return node.name === key; })[0];
    if (!hit) fail("There is no part named \"" + key.slice(0, 80) + "\" in this model. Use blockbench_outline to see the names.");
    if (wanted && kind(hit) !== wanted) fail("\"" + hit.name + "\" is a " + kind(hit) + ", not a " + wanted + ".");
    return hit;
  }
  function targets(args) { var names = list(args.targets).concat(list(args.target)).concat(list(args.name && !args.targets && !args.target ? args.name : [])); if (!names.length) fail("Say which parts you mean (targets: a list of names or ids)."); return names.map(function (name) { return find(name); }); }
  function brief(node) {
    var out = { id: node.uuid, name: node.name, kind: kind(node) };
    if (node.parent && node.parent !== "root" && node.parent.uuid) out.group = node.parent.name;
    if (Array.isArray(node.from)) out.from = node.from.slice(0, 3);
    if (Array.isArray(node.to)) out.to = node.to.slice(0, 3);
    if (Array.isArray(node.origin)) out.origin = node.origin.slice(0, 3);
    if (Array.isArray(node.rotation) && node.rotation.some(Boolean)) out.rotation = node.rotation.slice(0, 3);
    if (node.visibility === false) out.hidden = true;
    if (out.kind === "mesh" && node.vertices) { out.vertices = Object.keys(node.vertices).length; out.faces = Object.keys(node.faces || {}).length; }
    return out;
  }
  function tree(children, depth) {
    return (children || []).slice(0, 400).map(function (node) {
      var out = brief(node);
      if (out.kind === "group") out.children = depth > 12 ? [] : tree(node.children, depth + 1);
      return out;
    });
  }
  function edit(aspects, label, work) {
    var undo = has("Undo") ? root.Undo : null;
    if (undo && undo.initEdit) undo.initEdit(aspects);
    var result;
    try { result = work(); } catch (error) { if (undo && undo.cancelEdit) { try { undo.cancelEdit(); } catch (ignored) {} } throw error; }
    if (undo && undo.finishEdit) undo.finishEdit("PlazCode: " + label, result && result.aspects ? result.aspects : aspects);
    if (has("Canvas") && root.Canvas.updateAll) root.Canvas.updateAll();
    if (typeof root.updateSelection === "function") root.updateSelection();
    return result && result.value !== undefined ? result.value : result;
  }
  // Where a new part goes is looked up BEFORE the part is made, so a wrong name never leaves a half-made part behind.
  function home(group) { return group ? find(group, "group") : null; }
  function place(node, group) { if (group) node.addTo(group); return node; }
  function textureOf(target) {
    var key = String(target || ""), pool = all("Texture");
    var hit = pool.filter(function (t) { return t.uuid === key; })[0] || pool.filter(function (t) { return t.name === key; })[0];
    if (!hit) fail("There is no texture named \"" + key.slice(0, 80) + "\". Use blockbench_texture_list to see the names.");
    return hit;
  }
  function animationOf(target) {
    var key = String(target || ""), pool = all("Animation");
    var hit = pool.filter(function (a) { return a.uuid === key; })[0] || pool.filter(function (a) { return a.name === key; })[0];
    if (!hit) fail("There is no animation named \"" + key.slice(0, 80) + "\". Use blockbench_animation_list to see the names.");
    return hit;
  }
  function solid(width, height, color) {
    var canvas = root.document.createElement("canvas"); canvas.width = width; canvas.height = height;
    var context = canvas.getContext("2d"); context.fillStyle = color; context.fillRect(0, 0, width, height);
    return canvas.toDataURL("image/png");
  }

  var OPS = {
    status: { change: false, run: function () {
      var current = has("Project") && root.Project ? root.Project : null, bench = has("Blockbench") ? root.Blockbench : {};
      return { blockbench: String(bench.version || ""), web: bench.isWeb === true, toolset: VERSION, project: current ? { name: current.name || "", format: current.format && current.format.id || "", cubes: all("Cube").length, groups: all("Group").length, meshes: all("Mesh").length, textures: all("Texture").length, animations: all("Animation").length } : null };
    } },
    formats: { change: false, run: function () { var formats = need("Formats"); return Object.keys(formats).map(function (id) { return { id: id, name: String(formats[id] && formats[id].name || id) }; }); } },
    project_new: { change: true, run: function (args) {
      var formats = need("Formats"), id = text(args.format, "free", 60);
      if (!formats[id]) fail("Blockbench has no model format \"" + id + "\". Use blockbench_formats to see the choices (for example free, bedrock, java_block).");
      if (typeof root.newProject !== "function") fail("This Blockbench cannot start a new model from here. Update Blockbench, then try again.");
      if (root.newProject(formats[id]) === false) fail("Blockbench did not start a new model. If it is asking a question on screen, answer it, then try again.");
      if (args.name && root.Project) root.Project.name = text(args.name, "model", 80);
      return OPS.status.run();
    } },
    outline: { change: false, run: function () { project(); return { parts: tree(has("Outliner") ? root.Outliner.root : [], 0) }; } },
    cube_add: { change: true, run: function (args) {
      project(); var Cube = need("Cube"), into = home(args.group), skin = args.texture ? textureOf(args.texture) : null;
      return edit({ elements: [], outliner: true }, "add cube", function () {
        var from = vec(args.from, [0, 0, 0]), size = vec(args.size, null), to = vec(args.to, size ? [from[0] + size[0], from[1] + size[1], from[2] + size[2]] : [from[0] + 1, from[1] + 1, from[2] + 1]);
        var cube = new Cube({ name: text(args.name, "cube"), from: from, to: to, origin: vec(args.origin, from), rotation: vec(args.rotation, [0, 0, 0]) }).init();
        place(cube, into);
        if (skin) cube.applyTexture(skin, true);
        return { aspects: { elements: [cube], outliner: true }, value: brief(cube) };
      });
    } },
    group_add: { change: true, run: function (args) {
      project(); var Group = need("Group"), into = home(args.parent || args.group);
      return edit({ outliner: true }, "add group", function () {
        var group = new Group({ name: text(args.name, "group"), origin: vec(args.origin, [0, 0, 0]), rotation: vec(args.rotation, [0, 0, 0]) }).init();
        place(group, into);
        return { value: brief(group) };
      });
    } },
    mesh_add: { change: true, run: function (args) {
      project(); var Mesh = need("Mesh"), MeshFace = need("MeshFace"), into = home(args.group);
      var points = list(args.vertices), faces = list(args.faces);
      if (points.length < 3 || points.length > 5000) fail("A mesh needs between 3 and 5000 points (vertices: a list of [x,y,z]).");
      return edit({ elements: [], outliner: true }, "add mesh", function () {
        var mesh = new Mesh({ name: text(args.name, "mesh"), vertices: {} }), keys = mesh.addVertices.apply(mesh, points.map(function (point) { return vec(point, [0, 0, 0]); }));
        var made = faces.slice(0, 10000).map(function (face) {
          var corners = list(face).map(function (index) { var key = keys[Number(index)]; if (!key) fail("A face points at point number " + index + ", which does not exist (points are numbered from 0)."); return key; });
          if (corners.length < 3 || corners.length > 4) fail("Each face needs 3 or 4 point numbers.");
          return new MeshFace(mesh, { vertices: corners });
        });
        if (made.length) mesh.addFaces.apply(mesh, made);
        mesh.init(); place(mesh, into);
        return { aspects: { elements: [mesh], outliner: true }, value: brief(mesh) };
      });
    } },
    update: { change: true, run: function (args) {
      project(); var node = find(args.target || args.name), into = args.group && args.group !== "root" ? home(args.group) : null, skin = args.texture ? textureOf(args.texture) : null;
      return edit({ elements: kind(node) === "group" ? [] : [node], outliner: true }, "change " + node.name, function () {
        var change = {};
        if (typeof args.new_name === "string" && args.new_name.trim()) change.name = text(args.new_name, node.name);
        ["from", "to", "origin", "rotation"].forEach(function (field) { var value = vec(args[field], null); if (value && (field === "origin" || field === "rotation" || kind(node) === "cube")) change[field] = value; });
        if (typeof args.visible === "boolean") change.visibility = args.visible;
        if (!Object.keys(change).length && !args.group && !args.texture) fail("Nothing to change was given (new_name, from, to, origin, rotation, visible, group or texture).");
        node.extend(change);
        if (args.group) node.addTo(into || undefined);
        if (skin && node.applyTexture) node.applyTexture(skin, true);
        return { value: brief(node) };
      });
    } },
    remove: { change: true, run: function (args) {
      project(); var picked = targets(args);
      return edit({ elements: picked.filter(function (node) { return kind(node) !== "group"; }), outliner: true }, "remove parts", function () {
        var names = picked.map(function (node) { return node.name; });
        picked.forEach(function (node) { node.remove(kind(node) === "group" ? false : undefined); });
        return { value: { removed: names } };
      });
    } },
    duplicate: { change: true, run: function (args) {
      project(); var picked = targets(args);
      return edit({ elements: [], outliner: true }, "duplicate parts", function () {
        var copies = picked.map(function (node) { var copy = node.duplicate(); var offset = vec(args.offset, null); if (offset && copy && Array.isArray(copy.from)) copy.extend({ from: copy.from.map(function (v, i) { return v + offset[i]; }), to: copy.to.map(function (v, i) { return v + offset[i]; }), origin: copy.origin.map(function (v, i) { return v + offset[i]; }) }); return copy; }).filter(Boolean);
        return { aspects: { elements: copies.filter(function (node) { return kind(node) !== "group"; }), outliner: true }, value: copies.map(brief) };
      });
    } },
    select: { change: false, run: function (args) {
      project(); var picked = list(args.targets).concat(list(args.target)).map(function (name) { return find(name); });
      if (typeof root.unselectAllElements === "function") root.unselectAllElements(); else if (typeof root.unselectAll === "function") root.unselectAll();
      picked.forEach(function (node, index) { if (node.select) node.select(index ? { shiftKey: true } : undefined, true); });
      if (typeof root.updateSelection === "function") root.updateSelection();
      return { selected: picked.map(function (node) { return node.name; }) };
    } },
    selection: { change: false, run: function () { project(); var picked = (has("Outliner") && Array.isArray(root.Outliner.selected) ? root.Outliner.selected : []).concat(all("Group").filter(function (group) { return group.selected; })); return { selected: picked.map(brief) }; } },
    texture_list: { change: false, run: function () { project(); return all("Texture").map(function (t) { return { id: t.uuid, name: t.name, width: t.width, height: t.height }; }); } },
    texture_add: { change: true, run: function (args) {
      project(); var Texture = need("Texture");
      var source = typeof args.data_url === "string" ? args.data_url : "";
      if (source && !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(source)) fail("data_url must be a PNG picture as a data: address.");
      if (source.length > 6000000) fail("That picture is too large (about 4 MB at most).");
      var width = Math.min(1024, Math.max(1, Math.round(num(args.width, 16)))), height = Math.min(1024, Math.max(1, Math.round(num(args.height, 16))));
      var color = /^#[0-9a-fA-F]{6}$/.test(String(args.color || "")) ? args.color : "#808080";
      return edit({ textures: [] }, "add texture", function () {
        var texture = new Texture({ name: text(args.name, "texture") + (/\.png$/i.test(String(args.name || "")) ? "" : ".png") }).fromDataURL(source || solid(width, height, color)).add(false);
        return { aspects: { textures: [texture] }, value: { id: texture.uuid, name: texture.name } };
      });
    } },
    texture_apply: { change: true, run: function (args) {
      project(); var texture = textureOf(args.texture), picked = targets(args).filter(function (node) { return kind(node) !== "group" && typeof node.applyTexture === "function"; });
      if (!picked.length) fail("None of those parts can take a texture (only cubes and meshes can).");
      return edit({ elements: picked }, "apply texture", function () { picked.forEach(function (node) { node.applyTexture(texture, true); }); return { value: { texture: texture.name, applied_to: picked.map(function (node) { return node.name; }) } }; });
    } },
    texture_remove: { change: true, run: function (args) { project(); var texture = textureOf(args.texture); return edit({ textures: [texture] }, "remove texture", function () { var name = texture.name; texture.remove(true); return { aspects: { textures: [] }, value: { removed: name } }; }); } },
    animation_list: { change: false, run: function () { project(); return all("Animation").map(function (a) { return { id: a.uuid, name: a.name, length: a.length, loop: a.loop }; }); } },
    animation_add: { change: true, run: function (args) {
      project(); var Animation = need("Animation");
      if (root.Project.format && root.Project.format.animation_mode === false) fail("This model format has no animations. Start a model in a format that has them (for example bedrock or free).");
      return edit({ animations: [] }, "add animation", function () {
        var animation = new Animation({ name: text(args.name, "animation"), length: Math.max(0, num(args.length, 1)), loop: ["once", "hold", "loop"].indexOf(args.loop) >= 0 ? args.loop : "loop" }).add(true);
        return { aspects: { animations: [animation] }, value: { id: animation.uuid, name: animation.name } };
      });
    } },
    animation_keyframe: { change: true, run: function (args) {
      project(); var animation = animationOf(args.animation), group = find(args.target || args.group, "group");
      var channel = ["rotation", "position", "scale"].indexOf(args.channel) >= 0 ? args.channel : "rotation", values = vec(args.values, null);
      if (!values) fail("Give the three values for the keyframe (values: [x,y,z]).");
      return edit({ animations: [animation] }, "add keyframe", function () {
        if (animation.select) animation.select();
        var animator = animation.getBoneAnimator(group);
        animator.createKeyframe({ x: values[0], y: values[1], z: values[2] }, Math.max(0, num(args.time, 0)), channel, false, false);
        return { value: { animation: animation.name, part: group.name, channel: channel, time: Math.max(0, num(args.time, 0)) } };
      });
    } },
    animation_remove: { change: true, run: function (args) { project(); var animation = animationOf(args.animation); return edit({ animations: [animation] }, "remove animation", function () { var name = animation.name; animation.remove(false); return { aspects: { animations: [] }, value: { removed: name } }; }); } },
    screenshot: { change: false, wait: true, run: function () {
      project(); var Preview = need("Preview"), preview = Preview.selected || (Array.isArray(Preview.all) ? Preview.all[0] : null);
      if (!preview) fail("Blockbench has no 3D view open to take a picture of.");
      return new Promise(function (resolve, reject) {
        var done = function (url) { if (typeof url === "string" && /^data:image\/png;base64,/.test(url) && url.length < 7500000) resolve({ image: url }); else reject(new Error("Blockbench did not give a picture of the 3D view.")); };
        try {
          if (typeof preview.screenshot === "function") preview.screenshot({ crop: false }, done);
          else { if (preview.render) preview.render(); done(preview.canvas.toDataURL("image/png")); }
        } catch (error) { reject(error); }
      });
    } },
    export: { change: false, run: function (args) {
      var current = project(), codecs = need("Codecs");
      var own = args.as === "format" && current.format && current.format.codec;
      var codec = own ? current.format.codec : codecs.project;
      if (!codec || typeof codec.compile !== "function") fail("Blockbench cannot turn this model into text here.");
      var out = codec.compile(); out = typeof out === "string" ? out : JSON.stringify(out);
      if (out.length > 3000000) fail("The model's file is too large to hand over here (over 3 MB). Save it from Blockbench's File menu instead.");
      return { name: (current.name || "model") + (own ? "" : ".bbmodel"), as: own ? "format" : "bbmodel", text: out };
    } },
    undo: { change: true, run: function () { project(); need("Undo").undo(); return { ok: true }; } },
    redo: { change: true, run: function () { project(); need("Undo").redo(); return { ok: true }; } }
  };

  function run(cmd, args) {
    return new Promise(function (resolve) {
      var op = Object.prototype.hasOwnProperty.call(OPS, cmd) ? OPS[cmd] : null;
      if (!op) { resolve({ ok: false, message: "PlazCode's Blockbench helper has no action named \"" + String(cmd).slice(0, 60) + "\"." }); return; }
      var problem = function (error) { resolve({ ok: false, message: error && error.plain ? error.message : "Blockbench could not do that (" + String(error && error.message || error).slice(0, 300) + ")." }); };
      try { Promise.resolve(op.run(args && typeof args === "object" ? args : {})).then(function (result) { resolve({ ok: true, result: result === undefined ? null : result }); }, problem); } catch (error) { problem(error); }
    });
  }
  root.__plazcodeBlockbench = { version: VERSION, run: run, ops: Object.keys(OPS).map(function (name) { return { name: name, change: OPS[name].change }; }) };
})(typeof window !== "undefined" ? window : globalThis);
