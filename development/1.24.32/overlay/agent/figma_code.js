// PlazCode helper for Figma (the part that works on your design). Made by PlazCode on this computer.
// It can only do PlazCode's named Figma actions below; it has no network access of its own.
// Safe to delete: PlazCode's "Disconnect" removes it too.
// plazcode-helper-file:figma
(function () {
  "use strict";
  var MAX_NODES = 500, MAX_FOUND = 100, MAX_PICTURE = 5 * 1024 * 1024;

  function fail(message) { var error = new Error(message); error.plain = true; throw error; }
  function num(value, name, fallback) {
    if (value === undefined || value === null) { if (fallback === undefined) fail("Give a number for " + name + "."); return fallback; }
    if (typeof value !== "number" || !isFinite(value)) fail(name + " must be a number.");
    return value;
  }
  function text(value, name, fallback) {
    if (value === undefined || value === null) { if (fallback === undefined) fail("Give " + name + "."); return fallback; }
    if (typeof value !== "string") fail(name + " must be text.");
    return value;
  }
  function round(value) { return typeof value === "number" && isFinite(value) ? Math.round(value * 100) / 100 : undefined; }

  // "#rrggbb" or "#rrggbbaa" -> one solid paint.
  function paint(value, name) {
    var match = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(text(value, name));
    if (!match) fail(name + " must be a colour like #ff8800.");
    var hex = match[1], solid = { type: "SOLID", color: { r: parseInt(hex.slice(0, 2), 16) / 255, g: parseInt(hex.slice(2, 4), 16) / 255, b: parseInt(hex.slice(4, 6), 16) / 255 } };
    if (match[2]) solid.opacity = parseInt(match[2], 16) / 255;
    return solid;
  }
  function hexOf(paints) {
    if (!Array.isArray(paints)) return undefined;
    for (var i = 0; i < paints.length; i++) {
      var p = paints[i];
      if (p && p.type === "SOLID" && p.visible !== false && p.color) {
        var part = function (v) { var s = Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16); return s.length < 2 ? "0" + s : s; };
        return "#" + part(p.color.r) + part(p.color.g) + part(p.color.b);
      }
    }
    return undefined;
  }

  function brief(node) {
    var out = { id: node.id, name: node.name, type: node.type };
    if (typeof node.x === "number") { out.x = round(node.x); out.y = round(node.y); }
    if (typeof node.width === "number") { out.width = round(node.width); out.height = round(node.height); }
    if (node.visible === false) out.visible = false;
    if (node.type === "TEXT" && typeof node.characters === "string") out.text = node.characters.length > 200 ? node.characters.slice(0, 200) + "..." : node.characters;
    return out;
  }
  function detail(node) {
    var out = brief(node);
    if (node.type === "TEXT" && typeof node.characters === "string") out.text = node.characters.slice(0, 20000);
    if (node.parent) out.parent = { id: node.parent.id, name: node.parent.name, type: node.parent.type };
    if (typeof node.rotation === "number" && node.rotation) out.rotation = round(node.rotation);
    if (typeof node.opacity === "number" && node.opacity !== 1) out.opacity = round(node.opacity);
    var fill = hexOf(node.fills), stroke = hexOf(node.strokes);
    if (fill) out.fill = fill;
    if (stroke) { out.stroke = stroke; if (typeof node.strokeWeight === "number") out.stroke_width = node.strokeWeight; }
    if (typeof node.cornerRadius === "number" && node.cornerRadius) out.corner_radius = node.cornerRadius;
    if (node.type === "TEXT") {
      if (typeof node.fontSize === "number") out.font_size = node.fontSize;
      if (node.fontName && typeof node.fontName === "object" && node.fontName.family) out.font = node.fontName.family + " " + node.fontName.style;
    }
    if (typeof node.layoutMode === "string" && node.layoutMode !== "NONE") {
      out.auto_layout = { direction: node.layoutMode === "HORIZONTAL" ? "row" : "column", gap: node.itemSpacing,
        padding: [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft], align: node.primaryAxisAlignItems, cross_align: node.counterAxisAlignItems };
    }
    if (Array.isArray(node.children)) out.children = node.children.length;
    return out;
  }
  function tree(node, depth, budget) {
    var out = brief(node);
    if (Array.isArray(node.children) && node.children.length) {
      if (depth <= 0) { out.children_not_shown = node.children.length; return out; }
      out.children = [];
      for (var i = 0; i < node.children.length; i++) {
        if (budget.left <= 0) { out.cut = "More parts exist than PlazCode lists at once. Ask for the outline of one frame (target) to see inside it."; break; }
        budget.left -= 1;
        out.children.push(tree(node.children[i], depth - 1, budget));
      }
    }
    return out;
  }

  function page() { return figma.currentPage; }
  // A part is named by its id ("12:34") or by its exact name on the current page.
  function find(target) {
    var wanted = text(target, "target (a part's id or exact name)");
    if (/^[0-9A-Za-z]+:[0-9A-Za-z:;]+$/.test(wanted)) {
      return figma.getNodeByIdAsync(wanted).then(function (node) {
        if (!node || node.type === "DOCUMENT") fail("No part has the id " + wanted + ". Use figma_outline or figma_find to see the ids.");
        return node;
      });
    }
    var hits = page().findAll(function (node) { return node.name === wanted; });
    if (!hits.length) fail("Nothing on this page is named \"" + wanted + "\". Use figma_outline or figma_find to see what is there.");
    if (hits.length > 1) fail(hits.length + " parts on this page are named \"" + wanted + "\". Use the id of the one you mean: " + hits.slice(0, 8).map(function (n) { return n.id; }).join(", ") + ".");
    return Promise.resolve(hits[0]);
  }
  function findAllOf(targets) {
    if (!Array.isArray(targets) || !targets.length) fail("Give targets: a list of part ids or names.");
    if (targets.length > 200) fail("That is too many parts for one step (200 at most).");
    return Promise.all(targets.map(find));
  }
  function parentOf(args) {
    if (args.parent === undefined || args.parent === null || args.parent === "") return Promise.resolve(page());
    return find(args.parent).then(function (node) {
      if (typeof node.appendChild !== "function") fail("\"" + node.name + "\" cannot hold other parts. Choose a frame, group or the page.");
      return node;
    });
  }
  function done() { try { if (typeof figma.commitUndo === "function") figma.commitUndo(); } catch (ignored) {} }

  function place(node, args, parent) {
    parent.appendChild(node);
    if (typeof args.name === "string" && args.name) node.name = args.name.slice(0, 200);
    if (args.x !== undefined) node.x = num(args.x, "x");
    if (args.y !== undefined) node.y = num(args.y, "y");
    return node;
  }
  function size(node, args, width, height) {
    var w = num(args.width, "width", width), h = num(args.height, "height", height);
    if (w < 0.01 || h < 0.01 || w > 100000 || h > 100000) fail("width and height must be between 0.01 and 100000.");
    node.resize(w, h);
  }
  function look(node, args) {
    if (args.fill !== undefined) node.fills = args.fill === "none" ? [] : [paint(args.fill, "fill")];
    if (args.stroke !== undefined) node.strokes = args.stroke === "none" ? [] : [paint(args.stroke, "stroke")];
    if (args.stroke_width !== undefined) node.strokeWeight = num(args.stroke_width, "stroke_width");
    if (args.corner_radius !== undefined) { if (!("cornerRadius" in node)) fail("\"" + node.name + "\" has no corners to round."); node.cornerRadius = num(args.corner_radius, "corner_radius"); }
    if (args.opacity !== undefined) { var o = num(args.opacity, "opacity"); if (o < 0 || o > 1) fail("opacity must be between 0 and 1."); node.opacity = o; }
    if (args.rotation !== undefined) node.rotation = num(args.rotation, "rotation");
    if (args.visible !== undefined) node.visible = args.visible === true;
  }
  function fontOf(node, args) {
    var current = node.fontName && typeof node.fontName === "object" && node.fontName.family ? node.fontName : { family: "Inter", style: "Regular" };
    return { family: typeof args.font === "string" && args.font ? args.font : current.family, style: typeof args.font_style === "string" && args.font_style ? args.font_style : current.style };
  }
  // Text can only be changed after its font is loaded; a font Figma does not have is said plainly.
  function write(node, args) {
    var font = fontOf(node, args);
    return figma.loadFontAsync(font).then(function () {
      node.fontName = font;
      if (args.text !== undefined) node.characters = text(args.text, "text").slice(0, 100000);
      if (args.font_size !== undefined) { var s = num(args.font_size, "font_size"); if (s < 1 || s > 2000) fail("font_size must be between 1 and 2000."); node.fontSize = s; }
    }, function () { fail("Figma could not load the font " + font.family + " " + font.style + ". Choose a font that is installed, or leave font out."); });
  }
  var ALIGN = { start: "MIN", center: "CENTER", end: "MAX", between: "SPACE_BETWEEN" };
  function layout(node, args) {
    if (!("layoutMode" in node)) fail("\"" + node.name + "\" cannot use auto layout. Choose a frame or component.");
    var direction = text(args.direction, "direction (row, column or none)", "column");
    if (direction !== "row" && direction !== "column" && direction !== "none") fail("direction must be row, column or none.");
    node.layoutMode = direction === "row" ? "HORIZONTAL" : direction === "column" ? "VERTICAL" : "NONE";
    if (direction === "none") return;
    if (args.gap !== undefined) node.itemSpacing = num(args.gap, "gap");
    if (args.padding !== undefined) {
      var p = typeof args.padding === "number" ? [args.padding, args.padding, args.padding, args.padding] : args.padding;
      if (!Array.isArray(p) || p.length !== 4 || p.some(function (v) { return typeof v !== "number" || !isFinite(v) || v < 0; })) fail("padding must be one number, or [top, right, bottom, left].");
      node.paddingTop = p[0]; node.paddingRight = p[1]; node.paddingBottom = p[2]; node.paddingLeft = p[3];
    }
    if (args.align !== undefined) { if (!ALIGN[args.align]) fail("align must be start, center, end or between."); node.primaryAxisAlignItems = ALIGN[args.align]; }
    if (args.cross_align !== undefined) { if (!ALIGN[args.cross_align] || args.cross_align === "between") fail("cross_align must be start, center or end."); node.counterAxisAlignItems = ALIGN[args.cross_align]; }
    if (args.hug !== undefined) { node.primaryAxisSizingMode = args.hug === true ? "AUTO" : "FIXED"; node.counterAxisSizingMode = args.hug === true ? "AUTO" : "FIXED"; }
  }

  // A new part that cannot be finished (a bad colour, a bad size) is taken away again, so nothing half-made is left.
  function add(args, create, width, height, finish) {
    return parentOf(args).then(function (parent) {
      var node = create();
      try { size(node, args, width, height); place(node, args, parent); look(node, args); if (finish) finish(node); return brief(node); }
      catch (error) { try { node.remove(); } catch (ignored) {} throw error; }
    });
  }

  var OPS = {
    status: { change: false, run: function () {
      var selection = page().selection || [];
      return { app: "Figma", editor: figma.editorType, file: figma.root.name, page: { id: page().id, name: page().name }, pages: figma.root.children.length,
        top_level_parts: page().children.length, selected: selection.length };
    } },
    pages: { change: false, run: function () {
      return figma.root.children.map(function (p) { return { id: p.id, name: p.name, current: p.id === page().id }; });
    } },
    page_set: { change: false, run: function (args) {
      var wanted = text(args.page, "page (a page's id or name)");
      var hit = figma.root.children.filter(function (p) { return p.id === wanted || p.name === wanted; })[0];
      if (!hit) fail("This file has no page \"" + wanted + "\". Use figma_pages to see them.");
      return figma.setCurrentPageAsync(hit).then(function () { return { id: hit.id, name: hit.name }; });
    } },
    outline: { change: false, run: function (args) {
      var depth = Math.max(1, Math.min(8, Math.floor(num(args.depth, "depth", 3)))), budget = { left: MAX_NODES };
      if (args.target === undefined || args.target === null || args.target === "") return tree(page(), depth, budget);
      return find(args.target).then(function (node) { return tree(node, depth, budget); });
    } },
    node: { change: false, run: function (args) { return find(args.target).then(detail); } },
    find: { change: false, run: function (args) {
      var name = typeof args.name === "string" ? args.name.toLowerCase() : "", type = typeof args.type === "string" ? args.type.toUpperCase() : "";
      if (!name && !type) fail("Give name (part of a name) or type (FRAME, TEXT, RECTANGLE, COMPONENT, ...).");
      var hits = page().findAll(function (node) { return (!type || node.type === type) && (!name || String(node.name).toLowerCase().indexOf(name) !== -1); });
      return { found: hits.length, parts: hits.slice(0, MAX_FOUND).map(brief), cut: hits.length > MAX_FOUND ? "Only the first " + MAX_FOUND + " are listed." : undefined };
    } },
    selection: { change: false, run: function () { return (page().selection || []).slice(0, MAX_FOUND).map(detail); } },
    select: { change: false, run: function (args) {
      if (Array.isArray(args.targets) && !args.targets.length) { page().selection = []; return { selected: 0 }; }
      return findAllOf(args.targets).then(function (nodes) {
        nodes.forEach(function (node) { if (node.type === "PAGE") fail("A page cannot be selected. Use figma_page_set to go to it."); });
        page().selection = nodes;
        try { figma.viewport.scrollAndZoomIntoView(nodes); } catch (ignored) {}
        return { selected: nodes.length };
      });
    } },
    frame_add: { change: true, run: function (args) {
      return add(args, function () { return figma.createFrame(); }, 400, 300, function (node) { if (args.direction !== undefined) layout(node, args); });
    } },
    rectangle_add: { change: true, run: function (args) { return add(args, function () { return figma.createRectangle(); }, 100, 100); } },
    ellipse_add: { change: true, run: function (args) { return add(args, function () { return figma.createEllipse(); }, 100, 100); } },
    text_add: { change: true, run: function (args) {
      text(args.text, "text");
      return parentOf(args).then(function (parent) {
        var node = figma.createText();
        return write(node, args).then(function () {
          place(node, args, parent); look(node, args);
          if (!(typeof args.name === "string" && args.name)) node.name = node.characters.slice(0, 40) || "Text";
          return brief(node);
        }).then(null, function (error) { try { node.remove(); } catch (ignored) {} throw error; });
      });
    } },
    update: { change: true, run: function (args) {
      return find(args.target).then(function (node) {
        if (node.type === "PAGE") { if (typeof args.new_name === "string" && args.new_name) node.name = args.new_name.slice(0, 200); return { id: node.id, name: node.name, type: node.type }; }
        var first = (args.text !== undefined || args.font !== undefined || args.font_style !== undefined || args.font_size !== undefined)
          ? (node.type === "TEXT" ? write(node, args) : fail("\"" + node.name + "\" is not text, so text and font cannot be set on it.")) : Promise.resolve();
        return first.then(function () {
          if (typeof args.new_name === "string" && args.new_name) node.name = args.new_name.slice(0, 200);
          if (args.x !== undefined) node.x = num(args.x, "x");
          if (args.y !== undefined) node.y = num(args.y, "y");
          if (args.width !== undefined || args.height !== undefined) { if (typeof node.resize !== "function") fail("\"" + node.name + "\" cannot be resized."); size(node, args, node.width, node.height); }
          look(node, args);
          if (args.parent !== undefined) return parentOf(args).then(function (parent) { if (parent.id === node.id) fail("A part cannot be put inside itself."); parent.appendChild(node); return detail(node); });
          return detail(node);
        });
      });
    } },
    auto_layout: { change: true, run: function (args) { return find(args.target).then(function (node) { layout(node, args); return detail(node); }); } },
    remove: { change: true, run: function (args) {
      return findAllOf(args.targets).then(function (nodes) {
        nodes.forEach(function (node) { if (node.type === "PAGE") fail("PlazCode does not delete whole pages. Delete the page in Figma yourself if you mean to."); });
        var names = nodes.map(function (node) { return node.name; });
        nodes.forEach(function (node) { if (!node.removed) node.remove(); });
        return { removed: names };
      });
    } },
    duplicate: { change: true, run: function (args) {
      var dx = args.offset === undefined ? 20 : null;
      if (dx === null && !(Array.isArray(args.offset) && args.offset.length === 2 && args.offset.every(function (v) { return typeof v === "number" && isFinite(v); }))) fail("offset must be [x, y].");
      return findAllOf(args.targets).then(function (nodes) {
        return nodes.map(function (node) {
          if (typeof node.clone !== "function" || node.type === "PAGE") fail("\"" + node.name + "\" cannot be copied this way.");
          var copy = node.clone();
          if (node.parent && typeof node.parent.appendChild === "function") node.parent.appendChild(copy);
          copy.x = node.x + (dx === null ? args.offset[0] : dx); copy.y = node.y + (dx === null ? args.offset[1] : dx);
          return brief(copy);
        });
      });
    } },
    group: { change: true, run: function (args) {
      return findAllOf(args.targets).then(function (nodes) {
        var parent = nodes[0].parent;
        nodes.forEach(function (node) { if (node.type === "PAGE" || !node.parent) fail("\"" + node.name + "\" cannot be grouped."); if (node.parent.id !== parent.id) fail("Parts must sit in the same frame or page to be grouped."); });
        var made = figma.group(nodes, parent);
        if (typeof args.name === "string" && args.name) made.name = args.name.slice(0, 200);
        return brief(made);
      });
    } },
    component_create: { change: true, run: function (args) {
      return find(args.target).then(function (node) {
        if (node.type === "COMPONENT") fail("\"" + node.name + "\" is already a component.");
        if (node.type === "PAGE" || typeof figma.createComponentFromNode !== "function") fail("\"" + node.name + "\" cannot be turned into a component.");
        return brief(figma.createComponentFromNode(node));
      });
    } },
    instance_add: { change: true, run: function (args) {
      return find(args.component).then(function (component) {
        if (component.type !== "COMPONENT") fail("\"" + component.name + "\" is not a component. Use figma_find with type COMPONENT to see the components on this page.");
        return parentOf(args).then(function (parent) { return brief(place(component.createInstance(), args, parent)); });
      });
    } },
    styles: { change: false, run: function () {
      return Promise.all([figma.getLocalPaintStylesAsync(), figma.getLocalTextStylesAsync()]).then(function (both) {
        return { colours: both[0].slice(0, 200).map(function (s) { return { id: s.id, name: s.name, colour: hexOf(s.paints) }; }),
          text: both[1].slice(0, 200).map(function (s) { return { id: s.id, name: s.name, font: s.fontName && s.fontName.family ? s.fontName.family + " " + s.fontName.style : undefined, font_size: s.fontSize }; }) };
      });
    } },
    export: { change: false, run: function (args) {
      var scale = num(args.scale, "scale", 1);
      if (scale < 0.1 || scale > 4) fail("scale must be between 0.1 and 4.");
      var target = args.target === undefined || args.target === null || args.target === "" ? null : args.target;
      var chosen = target ? find(target) : Promise.resolve((page().selection || [])[0] || null);
      return chosen.then(function (node) {
        if (!node) fail("Nothing is selected. Give target (a part's id or name), or select something in Figma first.");
        if (typeof node.exportAsync !== "function" || node.type === "PAGE") fail("\"" + node.name + "\" cannot be made into a picture. Choose a frame or another part.");
        return node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: scale } }).then(function (bytes) {
          if (bytes.length > MAX_PICTURE) fail("That picture is too large to pass on (" + Math.round(bytes.length / 1048576) + " MB). Use a smaller scale or a smaller part.");
          return { image: "data:image/png;base64," + figma.base64Encode(bytes), of: brief(node), scale: scale };
        });
      });
    } },
    undo: { change: true, run: function () {
      if (typeof figma.triggerUndo !== "function") fail("This Figma cannot undo from a plugin. Press Ctrl+Z (Cmd+Z on a Mac) in Figma.");
      figma.triggerUndo();
      return { undone: true };
    } }
  };

  function run(cmd, args) {
    return new Promise(function (resolve) {
      var op = Object.prototype.hasOwnProperty.call(OPS, cmd) ? OPS[cmd] : null;
      if (!op) { resolve({ ok: false, message: "PlazCode's Figma helper does not know the action \"" + String(cmd).slice(0, 60) + "\"." }); return; }
      var given = args && typeof args === "object" && !Array.isArray(args) ? args : {};
      Promise.resolve().then(function () { return op.run(given); }).then(function (result) {
        if (op.change) done();
        resolve({ ok: true, result: result === undefined ? null : result });
      }, function (error) {
        // A step that failed half-way is still one undo step, so nothing half-made hides in the history.
        if (op.change) done();
        resolve({ ok: false, message: error && error.plain ? error.message : "Figma could not do that: " + String(error && error.message || error).slice(0, 300) });
      });
    });
  }

  var tools = { version: "1.0.0", run: run, ops: Object.keys(OPS).map(function (name) { return { name: name, change: OPS[name].change }; }) };
  (typeof globalThis !== "undefined" ? globalThis : this).__plazcodeFigma = tools;

  // In Figma: open the helper's small window (it holds the connection to PlazCode) and answer only its requests.
  if (typeof figma !== "undefined" && typeof __html__ !== "undefined" && typeof figma.showUI === "function") {
    figma.showUI(__html__, { width: 280, height: 132, title: "PlazCode" });
    figma.ui.onmessage = function (message) {
      if (!message || message.type !== "run" || typeof message.id !== "number" || typeof message.cmd !== "string") return;
      run(message.cmd, message.args).then(function (reply) { figma.ui.postMessage({ type: "answer", id: message.id, ok: reply.ok, result: reply.result, message: reply.message }); });
    };
  }
})();
