// PlazCode tool cards (1.24.21+): turns a tool call into a readable card.
// Edits show a CHANGES tab (red and green lines) and a RAW REQUEST tab.
// The diff always comes from the request the AI sent; the result only adds the OUTPUT tab.
// Pure logic plus a small DOM renderer. Every piece of text goes in through textContent.
const PlazCodeToolCards = (() => {
  const MAX_SIDE = 2000;        // lines per side that are compared
  const MAX_CELLS = 1500000;    // diff table size limit (keeps a big edit fast)
  const PAGE = 500;             // diff rows drawn at a time
  const FIRST_PAGE = 1500;      // rows drawn when a pane first opens
  const RAW_CAP = 200000;       // characters of raw request drawn
  const OUT_CAP = 100000;       // characters of output drawn
  const CONTEXT = 3;            // unchanged lines kept around a change

  const bare = (name) => String(name || "").split("__").pop();
  const nice = (name) => {
    const words = bare(name).replace(/[_-]+/g, " ").trim();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Tool";
  };
  const text = (value) => (value === undefined || value === null ? "" : typeof value === "string" ? value : (() => { try { return JSON.stringify(value); } catch { return String(value); } })());
  const first = (obj, keys) => { for (const key of keys) if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key]; return undefined; };
  function splitLines(value) {
    const raw = text(value);
    if (raw === "") return [];
    const lines = raw.split(/\r\n|\r|\n/);
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    return lines;
  }
  function hash(value) {
    const s = String(value);
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + ":" + s.length;
  }

  // Line diff. Returns {rows, added, removed, tooLarge}. Rows: {t:"+"|"-"|" ", s}. Context is NOT trimmed here.
  function diffLines(oldText, newText) {
    const a = splitLines(oldText), b = splitLines(newText);
    if (a.length > MAX_SIDE || b.length > MAX_SIDE) {
      return { rows: b.map((s) => ({ t: "+", s })), added: b.length, removed: a.length, tooLarge: true };
    }
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    let endA = a.length, endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
    const rows = [];
    for (let i = 0; i < start; i++) rows.push({ t: " ", s: a[i] });
    const midA = a.slice(start, endA), midB = b.slice(start, endB);
    let added = 0, removed = 0;
    const push = (t, s) => { rows.push({ t, s }); if (t === "+") added++; else if (t === "-") removed++; };
    const m = midA.length, n = midB.length;
    if (m === 0 || n === 0 || (m + 1) * (n + 1) > MAX_CELLS) {
      for (const s of midA) push("-", s);
      for (const s of midB) push("+", s);
    } else {
      const width = n + 1;
      const table = new Int32Array((m + 1) * width);
      for (let i = m - 1; i >= 0; i--) {
        for (let j = n - 1; j >= 0; j--) {
          table[i * width + j] = midA[i] === midB[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
        }
      }
      let i = 0, j = 0;
      while (i < m && j < n) {
        if (midA[i] === midB[j]) { rows.push({ t: " ", s: midA[i] }); i++; j++; }
        else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) push("-", midA[i++]);
        else push("+", midB[j++]);
      }
      while (i < m) push("-", midA[i++]);
      while (j < n) push("+", midB[j++]);
    }
    for (let i = endA; i < a.length; i++) rows.push({ t: " ", s: a[i] });
    return { rows, added, removed, tooLarge: false };
  }
  // Keep only CONTEXT unchanged lines around changes; the rest becomes one "… N unchanged lines" row.
  function compact(rows) {
    const keep = new Array(rows.length).fill(false);
    rows.forEach((row, index) => {
      if (row.t === " ") return;
      for (let k = Math.max(0, index - CONTEXT); k <= Math.min(rows.length - 1, index + CONTEXT); k++) keep[k] = true;
    });
    const out = [];
    let skipped = 0;
    rows.forEach((row, index) => {
      if (keep[index] || row.t !== " ") { if (skipped) { out.push({ t: "…", s: skipped + " unchanged line" + (skipped === 1 ? "" : "s") }); skipped = 0; } out.push(row); }
      else skipped++;
    });
    if (skipped) out.push({ t: "…", s: skipped + " unchanged line" + (skipped === 1 ? "" : "s") });
    return out;
  }

  const TARGET_KEYS = ["target_file", "path", "script_path", "instance_path", "file_path", "file", "name"];
  const OLD_KEYS = ["old_string", "old", "search", "find", "before"];
  const NEW_KEYS = ["new_string", "new", "replacement", "replace", "after"];
  function cleanEdit(edit) {
    const e = edit && typeof edit === "object" ? edit : {};
    return { old: text(first(e, OLD_KEYS)), next: text(first(e, NEW_KEYS)), all: e.replace_all === true };
  }

  function rawRequest(args) {
    let out;
    try { out = JSON.stringify(args === undefined ? {} : args, null, 2); } catch { out = String(args); }
    return out;
  }
  function cap(value, limit) {
    const s = text(value);
    return s.length > limit ? { text: s.slice(0, limit), cut: s.length - limit } : { text: s, cut: 0 };
  }

  // The card model. call = {tool, arguments}; feedback = the result text (optional).
  function model(call, feedback) {
    const tool = String((call && call.tool) || "");
    const args = (call && call.arguments && typeof call.arguments === "object") ? call.arguments : {};
    const name = bare(tool);
    const target = text(first(args, TARGET_KEYS)).slice(0, 200);
    const m = { tool, title: nice(tool), target, kind: "other", edits: [], stats: null, code: "", raw: rawRequest(args), output: feedback === undefined || feedback === null ? "" : text(feedback), defaultTab: "RAW REQUEST" };
    let edits = null;
    if (name === "multi_edit" && Array.isArray(args.edits)) edits = args.edits.map(cleanEdit);
    else if (name === "edit_file" || name === "replace_once") edits = [cleanEdit(args)];
    if (edits && edits.length) {
      m.kind = "edit";
      m.edits = edits.map((edit) => {
        const created = edit.old === "";
        const diff = diffLines(edit.old, edit.next);
        return { created, all: edit.all, diff };
      });
      m.stats = { added: 0, removed: 0, edits: m.edits.length };
      for (const edit of m.edits) { m.stats.added += edit.diff.added; m.stats.removed += edit.diff.removed; }
    } else if (name === "script_append" || name === "write_file" || name === "script_set_source") {
      const body = text(first(args, ["source", "content", "code", "text", "data"]));
      const diff = diffLines("", body);
      m.kind = "edit";
      m.edits = [{ created: name !== "script_append", all: false, diff, label: name === "script_append" ? "Added at the end" : "New content (" + diff.added + " line" + (diff.added === 1 ? "" : "s") + ")" }];
      m.stats = { added: diff.added, removed: 0, edits: 1 };
    } else if (name === "execute_luau") {
      m.kind = "code";
      m.code = text(args.code).trim();
    }
    if (m.kind === "edit") m.defaultTab = "CHANGES";
    else if (m.kind === "code") m.defaultTab = "CODE";
    else if (m.output) m.defaultTab = "OUTPUT";
    m.sig = hash([tool, target, m.kind, m.raw.length, m.output.length, hash(m.raw), hash(m.output)].join("|"));
    return m;
  }

  function tabs(m) {
    const list = [];
    if (m.kind === "edit" && m.edits.length) list.push("CHANGES");
    if (m.kind === "code") list.push("CODE");
    list.push("RAW REQUEST");
    if (m.output) list.push("OUTPUT");
    return list;
  }
  // One line for the chip header: "+12 −3 · 2 edits · ServerScriptService.Main"
  function summary(m) {
    const parts = [];
    if (m.stats) {
      parts.push("+" + m.stats.added + " −" + m.stats.removed);
      if (m.stats.edits > 1) parts.push(m.stats.edits + " edits");
    }
    if (m.target) parts.push(m.target.length > 60 ? "…" + m.target.slice(-59) : m.target);
    return parts.join(" · ");
  }
  // Same tool on the same target as the previous card: that older card becomes an "Earlier call".
  function sameCall(a, b) { return !!(a && b && a.tool === b.tool && a.target === b.target && a.kind === b.kind); }

  // ── drawing ──
  function el(doc, tag, cls, txt) {
    const node = doc.createElement(tag);
    if (cls) node.className = cls;
    if (txt !== undefined) node.textContent = txt;
    return node;
  }
  function drawRows(doc, host, rows, from, to) {
    const frag = doc.createDocumentFragment();
    for (let i = from; i < Math.min(to, rows.length); i++) {
      const row = rows[i];
      const line = el(doc, "div", "rs-dl rs-dl-" + (row.t === "+" ? "add" : row.t === "-" ? "del" : row.t === "…" ? "gap" : "ctx"));
      line.appendChild(el(doc, "span", "rs-dl-sign", row.t === "…" ? "" : row.t));
      line.appendChild(el(doc, "span", "rs-dl-tx", row.s));
      frag.appendChild(line);
    }
    host.appendChild(frag);
  }
  function pagedRows(doc, pane, rows) {
    let shown = 0;
    const holder = el(doc, "div", "rs-dl-wrap");
    pane.appendChild(holder);
    const more = el(doc, "button", "rs-card-more");
    more.type = "button";
    const step = (count) => {
      drawRows(doc, holder, rows, shown, shown + count);
      shown = Math.min(rows.length, shown + count);
      if (shown >= rows.length) { if (more.parentNode) more.parentNode.removeChild(more); }
      else { more.textContent = "Show " + Math.min(PAGE, rows.length - shown) + " more (" + (rows.length - shown) + " left)"; if (!more.parentNode) pane.appendChild(more); }
    };
    more.onclick = () => step(PAGE);
    step(FIRST_PAGE);
  }
  function plainPane(doc, pane, value, limit, label) {
    const capped = cap(value, limit);
    const pre = el(doc, "pre", "rs-card-pre", capped.text);
    pane.appendChild(pre);
    if (capped.cut) pane.appendChild(el(doc, "div", "rs-card-note", "Showing the first " + limit.toLocaleString("en-US") + " characters; " + capped.cut.toLocaleString("en-US") + " more were cut from view."));
    if (capped.cut || text(value).length > 400) {
      const copy = el(doc, "button", "rs-card-copy", "Copy all");
      copy.type = "button";
      copy.onclick = () => { try { const done = doc.defaultView.navigator.clipboard.writeText(text(value)); copy.textContent = "Copied"; if (done && done.catch) done.catch(() => {}); } catch { copy.textContent = "Copy not available"; } };
      pane.appendChild(copy);
    }
  }
  function buildPane(doc, pane, m, tab) {
    pane.textContent = "";
    if (tab === "CHANGES") {
      m.edits.forEach((edit, index) => {
        if (m.edits.length > 1 || edit.label || edit.created) {
          const label = edit.label || (edit.created ? "Edit " + (index + 1) + " of " + m.edits.length + ": new script" : "Edit " + (index + 1) + " of " + m.edits.length + (edit.all ? " (every match)" : ""));
          pane.appendChild(el(doc, "div", "rs-card-sub", label));
        }
        if (edit.diff.tooLarge) pane.appendChild(el(doc, "div", "rs-card-note", "Too large to compare line by line; showing the new text."));
        pagedRows(doc, pane, edit.diff.tooLarge ? edit.diff.rows : compact(edit.diff.rows));
      });
    } else if (tab === "CODE") plainPane(doc, pane, m.code, RAW_CAP, "code");
    else if (tab === "OUTPUT") plainPane(doc, pane, m.output, OUT_CAP, "output");
    else plainPane(doc, pane, m.raw, RAW_CAP, "request");
  }
  // Draws the card into `host` (the chip body). Nothing heavy is built until the card is opened.
  function render(host, m, opts) {
    const doc = host.ownerDocument;
    host.textContent = "";
    const root = el(doc, "div", "rs-tcard");
    const meta = el(doc, "div", "rs-tcard-meta" + (opts && opts.tag ? " rs-has-tag" : ""));
    if (m.target) meta.appendChild(el(doc, "span", "rs-card-target", m.target));
    if (m.stats) {
      const stat = el(doc, "span", "rs-card-stat");
      stat.appendChild(el(doc, "span", "rs-stat-add", "+" + m.stats.added));
      stat.appendChild(doc.createTextNode(" "));
      stat.appendChild(el(doc, "span", "rs-stat-del", "−" + m.stats.removed));
      if (m.stats.edits > 1) stat.appendChild(doc.createTextNode(" · " + m.stats.edits + " edits"));
      meta.appendChild(stat);
    }
    if (opts && opts.tag) meta.appendChild(el(doc, "span", "rs-card-tag", opts.tag));
    root.appendChild(meta);
    const bar = el(doc, "div", "rs-card-tabs");
    const pane = el(doc, "div", "rs-card-pane");
    const names = tabs(m);
    const buttons = {};
    let current = "", built = false;
    const select = (name) => {
      current = name;
      for (const key of names) buttons[key].classList.toggle("on", key === name);
      buildPane(doc, pane, m, name);
    };
    for (const name of names) {
      const button = el(doc, "button", "rs-card-tab", name);
      button.type = "button";
      button.onclick = (event) => { try { event.stopPropagation(); } catch {} built = true; select(name); };
      buttons[name] = button;
      bar.appendChild(button);
    }
    if (names.length > 1) root.appendChild(bar);
    root.appendChild(pane);
    host.appendChild(root);
    host.__rsEnsure = () => { if (!built) { built = true; select(m.defaultTab); } };
    host.__rsBuilt = () => built;
    if (opts && opts.open) host.__rsEnsure();
    return root;
  }

  // The pieces of the chip header: a file pill and a coloured +/- count. Returns an array of elements.
  function headBits(doc, m) {
    const out = [];
    if (!m) return out;
    if (m.target) { const tg = el(doc, "span", "rs-chip-tg"); tg.title = m.target; tg.appendChild(el(doc, "bdi", "", m.target)); out.push(tg); }
    if (m.stats) {
      const st = el(doc, "span", "rs-chip-st");
      st.appendChild(el(doc, "span", "rs-stat-add", "+" + m.stats.added));
      st.appendChild(el(doc, "span", "rs-stat-del", "\u2212" + m.stats.removed));
      if (m.stats.edits > 1) st.appendChild(el(doc, "span", "rs-stat-edits", m.stats.edits + " edits"));
      out.push(st);
    }
    return out;
  }

  // A short version for old cards: keeps the header and the first part of the request/output, drops the diff.
  function slim(m) {
    if (!m || m.slim) return m;
    const small = (v) => (text(v).length > 2000 ? text(v).slice(0, 2000) + "\n\u2026 (older card, shortened)" : text(v));
    const out = { ...m, edits: [], raw: small(m.raw), output: small(m.output), code: small(m.code), slim: true, sig: m.sig + ":s" };
    out.defaultTab = m.kind === "code" ? "CODE" : out.output ? "OUTPUT" : "RAW REQUEST";
    return out;
  }

  return { model, render, slim, summary, headBits, tabs, sameCall, diffLines, compact, hash, nice, limits: { MAX_SIDE, MAX_CELLS, PAGE, FIRST_PAGE, RAW_CAP, OUT_CAP } };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodeToolCards;
