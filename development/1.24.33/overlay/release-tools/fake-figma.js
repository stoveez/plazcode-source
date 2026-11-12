// A stand-in for Figma's plugin API, for PlazCode's tests only. It is NOT Figma: it models just enough of the public
// plugin API (https://developers.figma.com/docs/plugins/api/api-reference/) for PlazCode's helper to be exercised.
// It keeps Figma's rules that matter for the helper: text can only be changed after its font was loaded, ids look
// like "1:23", the dynamic-page calls are asynchronous. Passing here proves the helper's own logic and wording only.
(function (scope) {
  "use strict";
  var next = 2, loaded = {}, log = { undoSteps: 0, undone: 0, zoomed: 0 };
  function id() { next += 1; return "1:" + next; }
  function base(type, name) {
    var node = { id: id(), type: type, name: name, visible: true, parent: null, removed: false };
    node.remove = function () { if (node.parent) { var list = node.parent.children; list.splice(list.indexOf(node), 1); } node.parent = null; node.removed = true; };
    return node;
  }
  function holder(node) {
    node.children = [];
    node.appendChild = function (child) {
      if (child.parent) { var list = child.parent.children; list.splice(list.indexOf(child), 1); }
      child.parent = node; node.children.push(child);
    };
    node.findAll = function (test) {
      var out = [];
      (function walk(list) { list.forEach(function (child) { if (!test || test(child)) out.push(child); if (child.children) walk(child.children); }); })(node.children);
      return out;
    };
    return node;
  }
  function scene(type, name, width, height) {
    var node = base(type, name);
    node.x = 0; node.y = 0; node.width = width; node.height = height; node.rotation = 0; node.opacity = 1;
    node.fills = type === "FRAME" || type === "COMPONENT" ? [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }] : [{ type: "SOLID", color: { r: 0.85, g: 0.85, b: 0.85 } }];
    node.strokes = []; node.strokeWeight = 1;
    node.resize = function (w, h) { node.width = w; node.height = h; };
    node.exportAsync = function (settings) {
      if (!settings || settings.format !== "PNG") return Promise.reject(new Error("unsupported export"));
      var scale = settings.constraint && settings.constraint.value || 1, bytes = new Uint8Array(node.huge ? 6 * 1024 * 1024 : 16);
      [137, 80, 78, 71, 13, 10, 26, 10].forEach(function (value, index) { bytes[index] = value; });
      bytes[8] = Math.round(scale * 10);
      return Promise.resolve(bytes);
    };
    node.clone = function () { return copy(node); };
    return node;
  }
  function frameLike(type, name) {
    var node = holder(scene(type, name, 100, 100));
    node.cornerRadius = 0; node.layoutMode = "NONE"; node.itemSpacing = 0;
    node.paddingTop = node.paddingRight = node.paddingBottom = node.paddingLeft = 0;
    node.primaryAxisAlignItems = "MIN"; node.counterAxisAlignItems = "MIN"; node.primaryAxisSizingMode = "FIXED"; node.counterAxisSizingMode = "FIXED";
    return node;
  }
  function textNode() {
    var node = scene("TEXT", "Text", 0, 0), font = { family: "Inter", style: "Regular" }, characters = "", fontSize = 12;
    function need(which) { if (!loaded[which.family + "|" + which.style]) throw new Error("Cannot write to node with unloaded font \"" + which.family + " " + which.style + "\". Please call figma.loadFontAsync"); }
    Object.defineProperty(node, "fontName", { enumerable: true, get: function () { return font; }, set: function (value) { need(value); font = { family: value.family, style: value.style }; } });
    Object.defineProperty(node, "characters", { enumerable: true, get: function () { return characters; }, set: function (value) { need(font); characters = String(value); node.width = characters.length * fontSize * 0.6; node.height = fontSize * 1.2; } });
    Object.defineProperty(node, "fontSize", { enumerable: true, get: function () { return fontSize; }, set: function (value) { need(font); fontSize = value; } });
    return node;
  }
  function copy(node) {
    var made = node.type === "TEXT" ? textNode() : node.children ? frameLike(node.type, node.name) : scene(node.type, node.name, node.width, node.height);
    ["name", "x", "y", "rotation", "opacity", "visible", "strokeWeight", "cornerRadius", "layoutMode", "itemSpacing"].forEach(function (key) { if (key in node) made[key] = node[key]; });
    made.width = node.width; made.height = node.height; made.fills = JSON.parse(JSON.stringify(node.fills)); made.strokes = JSON.parse(JSON.stringify(node.strokes));
    if (node.type === "TEXT") { loaded[node.fontName.family + "|" + node.fontName.style] = true; made.fontName = node.fontName; made.characters = node.characters; made.fontSize = node.fontSize; }
    if (node.children) node.children.forEach(function (child) { made.appendChild(copy(child)); });
    return made;
  }
  function page(name) { var node = holder(base("PAGE", name)); node.selection = []; return node; }

  var root = holder({ id: "0:0", type: "DOCUMENT", name: "Shop app designs" });
  var first = page("Home"), second = page("Ideas");
  root.appendChild(first); root.appendChild(second);

  var figma = {
    __fake: log, mixed: {}, editorType: "figma", root: root, currentPage: first,
    viewport: { scrollAndZoomIntoView: function () { log.zoomed += 1; } },
    setCurrentPageAsync: function (target) { figma.currentPage = target; return Promise.resolve(); },
    getNodeByIdAsync: function (wanted) {
      var hit = wanted === root.id ? root : null;
      root.children.forEach(function (p) { if (p.id === wanted) hit = p; p.findAll().forEach(function (node) { if (node.id === wanted) hit = node; }); });
      return Promise.resolve(hit);
    },
    createFrame: function () { var node = frameLike("FRAME", "Frame"); figma.currentPage.appendChild(node); return node; },
    createRectangle: function () { var node = scene("RECTANGLE", "Rectangle", 100, 100); node.cornerRadius = 0; figma.currentPage.appendChild(node); return node; },
    createEllipse: function () { var node = scene("ELLIPSE", "Ellipse", 100, 100); figma.currentPage.appendChild(node); return node; },
    createText: function () { var node = textNode(); figma.currentPage.appendChild(node); return node; },
    loadFontAsync: function (font) {
      if (!font || font.family === "Missing Font") return Promise.reject(new Error("The font \"" + (font && font.family) + "\" could not be loaded"));
      loaded[font.family + "|" + font.style] = true; return Promise.resolve();
    },
    group: function (nodes, parent) {
      var made = holder(scene("GROUP", "Group", 0, 0));
      parent.appendChild(made); nodes.forEach(function (node) { made.appendChild(node); });
      return made;
    },
    createComponentFromNode: function (node) {
      var made = frameLike("COMPONENT", node.name), parent = node.parent, at = parent.children.indexOf(node);
      made.x = node.x; made.y = node.y; made.width = node.width; made.height = node.height;
      (node.children || []).slice().forEach(function (child) { made.appendChild(child); });
      node.remove(); parent.appendChild(made); parent.children.splice(at, 0, parent.children.pop());
      made.createInstance = function () { var instance = copy(made); instance.type = "INSTANCE"; figma.currentPage.appendChild(instance); return instance; };
      return made;
    },
    getLocalPaintStylesAsync: function () { return Promise.resolve([{ id: "S:1", name: "Brand / Orange", paints: [{ type: "SOLID", color: { r: 1, g: 0.5, b: 0 } }] }]); },
    getLocalTextStylesAsync: function () { return Promise.resolve([{ id: "S:2", name: "Heading", fontName: { family: "Inter", style: "Bold" }, fontSize: 32 }]); },
    base64Encode: function (bytes) {
      var text = ""; for (var i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
      return typeof btoa === "function" ? btoa(text) : Buffer.from(text, "binary").toString("base64");
    },
    commitUndo: function () { log.undoSteps += 1; },
    triggerUndo: function () { log.undone += 1; },
    // The helper's small window. In a browser test page this is a sandboxed frame, as in Figma (its origin is "null").
    ui: { onmessage: null, postMessage: function (message) { if (figma.__frame && figma.__frame.contentWindow) figma.__frame.contentWindow.postMessage({ pluginMessage: message }, "*"); } },
    showUI: function (html, options) {
      log.shown = options || {};
      if (typeof document === "undefined") return;
      var frame = document.createElement("iframe");
      frame.setAttribute("sandbox", "allow-scripts"); frame.id = "plazcode-figma-ui"; frame.srcdoc = html;
      document.body.appendChild(frame); figma.__frame = frame;
      window.addEventListener("message", function (event) {
        if (event.source !== frame.contentWindow) return;
        var message = event.data && event.data.pluginMessage;
        if (message !== undefined && typeof figma.ui.onmessage === "function") figma.ui.onmessage(message);
      });
    }
  };
  scope.figma = figma;
})(typeof window !== "undefined" ? window : globalThis);
