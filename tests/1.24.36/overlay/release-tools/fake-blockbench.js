// A small stand-in for Blockbench's plugin API, for PlazCode's tests only (never shipped). It follows the public
// API's shapes as PlazCode's toolset uses them; it is NOT Blockbench and proves nothing about a real Blockbench.
(function (root) {
  "use strict";
  var counter = 0;
  function uuid() { counter += 1; return "id-" + counter; }
  function typed(name, extra) {
    function Type(data) { this.uuid = uuid(); this.name = "x"; this.parent = "root"; this.visibility = true; Object.assign(this, extra ? extra() : {}); this.extend(data || {}); }
    Type.all = [];
    Type.prototype.extend = function (data) { var self = this; Object.keys(data).forEach(function (key) { self[key] = Array.isArray(data[key]) ? data[key].slice() : data[key]; }); return this; };
    Type.prototype.init = function () { if (Type.all.indexOf(this) < 0) Type.all.push(this); if (name !== "Group" && root.Outliner.elements.indexOf(this) < 0) root.Outliner.elements.push(this); if (root.Outliner.root.indexOf(this) < 0 && this.parent === "root") root.Outliner.root.push(this); return this; };
    Type.prototype.addTo = function (group) { var from = this.parent === "root" ? root.Outliner.root : this.parent.children; var at = from.indexOf(this); if (at >= 0) from.splice(at, 1); if (group) { group.children.push(this); this.parent = group; } else { root.Outliner.root.push(this); this.parent = "root"; } return this; };
    Type.prototype.remove = function () { var self = this; (this.children || []).slice().forEach(function (child) { child.remove(); }); var from = this.parent === "root" ? root.Outliner.root : this.parent.children; [from, Type.all, root.Outliner.elements, root.Outliner.selected].forEach(function (pool) { var at = pool.indexOf(self); if (at >= 0) pool.splice(at, 1); }); };
    Type.prototype.duplicate = function () { var copy = new Type({ name: this.name, from: this.from, to: this.to, origin: this.origin, rotation: this.rotation }); copy.init(); if (this.parent !== "root") copy.addTo(this.parent); return copy; };
    Type.prototype.select = function (event) { if (!event) { root.Outliner.selected.length = 0; root.Group.all.forEach(function (g) { g.selected = false; }); } if (name === "Group") this.selected = true; else root.Outliner.selected.push(this); return this; };
    Type.prototype.applyTexture = function (texture) { this.texture = texture.uuid; return this; };
    return Type;
  }
  root.Outliner = { root: [], elements: [], selected: [] };
  root.Group = typed("Group", function () { return { children: [], origin: [0, 0, 0], rotation: [0, 0, 0], selected: false }; });
  root.Cube = typed("Cube", function () { return { from: [0, 0, 0], to: [1, 1, 1], origin: [0, 0, 0], rotation: [0, 0, 0] }; });
  root.Mesh = typed("Mesh", function () { return { vertices: {}, faces: {}, origin: [0, 0, 0], rotation: [0, 0, 0] }; });
  root.Mesh.prototype.addVertices = function () { var self = this; return Array.prototype.map.call(arguments, function (point) { var key = "v" + uuid(); self.vertices[key] = point; return key; }); };
  root.Mesh.prototype.addFaces = function () { var self = this; return Array.prototype.map.call(arguments, function (face) { var key = "f" + uuid(); self.faces[key] = face; return key; }); };
  root.MeshFace = function (mesh, data) { this.vertices = data.vertices; };
  root.Texture = function (data) { this.uuid = uuid(); this.name = data.name; this.width = 16; this.height = 16; };
  root.Texture.all = [];
  root.Texture.prototype.fromDataURL = function (url) { this.source = url; return this; };
  root.Texture.prototype.add = function () { root.Texture.all.push(this); return this; };
  root.Texture.prototype.remove = function () { root.Texture.all.splice(root.Texture.all.indexOf(this), 1); };
  root.Animation = function (data) { this.uuid = uuid(); Object.assign(this, data); this.keyframes = []; };
  root.Animation.all = [];
  root.Animation.prototype.add = function () { root.Animation.all.push(this); return this; };
  root.Animation.prototype.select = function () { root.Animation.selected = this; };
  root.Animation.prototype.remove = function () { root.Animation.all.splice(root.Animation.all.indexOf(this), 1); };
  root.Animation.prototype.getBoneAnimator = function (group) { var animation = this; return { createKeyframe: function (value, time, channel) { animation.keyframes.push({ part: group.name, value: value, time: time, channel: channel }); } }; };
  root.Undo = { log: [], open: null, initEdit: function (aspects) { this.open = aspects; }, finishEdit: function (label) { this.log.push(label); this.open = null; }, cancelEdit: function () { this.open = null; this.log.push("cancelled"); }, undo: function () { this.log.push("undo"); }, redo: function () { this.log.push("redo"); } };
  root.Canvas = { updates: 0, updateAll: function () { this.updates += 1; } };
  root.updateSelection = function () {};
  root.unselectAllElements = function () { root.Outliner.selected.length = 0; root.Group.all.forEach(function (g) { g.selected = false; }); };
  root.Formats = { free: { id: "free", name: "Generic Model", animation_mode: true, codec: { compile: function () { return "FORMAT-TEXT"; } } }, java_block: { id: "java_block", name: "Java Block/Item", animation_mode: false } };
  root.Codecs = { project: { compile: function () { return JSON.stringify({ meta: { format_version: "4.10" }, name: root.Project.name, elements: root.Outliner.elements.length }); } } };
  root.Preview = { selected: { screenshot: function (options, done) { done("data:image/png;base64,iVBORw0KGgo="); } }, all: [] };
  root.Blockbench = { version: "5.0.1", isWeb: root.__fakeBlockbenchWeb !== false };
  root.Project = null;
  root.newProject = function (format) { [root.Group.all, root.Cube.all, root.Mesh.all, root.Texture.all, root.Animation.all, root.Outliner.root, root.Outliner.elements, root.Outliner.selected].forEach(function (pool) { pool.length = 0; }); root.Project = { name: "", format: format }; return true; };
  if (!root.document) root.document = { createElement: function () { return { getContext: function () { return { fillRect: function () {} }; }, toDataURL: function () { return "data:image/png;base64,c29saWQ="; } }; } };
})(typeof window !== "undefined" ? window : globalThis);
