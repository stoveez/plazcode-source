"use strict";
// 1.24.34 (owner: PlazCode runs on macOS 10.15 Catalina). On a Mac the app window is drawn by the system Safari
// engine, and Catalina stops at Safari 15.6: no color-mix() (16.2) and, before 15.4, no crypto.randomUUID. The small
// head script in desktop.html (id="pz-old-safari") fills both gaps only on such engines. This test checks the
// rewrite rules, then renders the page twice in Chromium (native, and with color-mix "missing") and requires that no
// panel loses its background and no text turns invisible.
const fs = require("fs"), assert = require("node:assert/strict");
const html = fs.readFileSync(__dirname + "/agent/src/desktop.html", "utf8");
const shim = html.match(/<script id="pz-old-safari">([\s\S]*?)<\/script>/);
assert(shim, "desktop.html has the old-Safari script");
assert(html.indexOf('<script id="pz-old-safari">') < html.indexOf("</head>"), "it runs in the head, before the page is drawn");
assert(!/(=>|`|\blet\b|\bconst\b|\?\.|\?\?)/.test(shim[1]), "it uses only syntax every old engine reads");
try { require("acorn").parse(shim[1], { ecmaVersion: 5 }); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw new Error("the old-Safari script must be plain ES5: " + error.message); }
const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
for (const rule of css.match(/\{[^{}]*\}/g)) if (/(?<![-\w])backdrop-filter\s*:/.test(rule)) assert(rule.includes("-webkit-backdrop-filter"), "Safari needs -webkit-backdrop-filter beside " + rule.slice(0, 80));
assert(css.includes("height:clamp(420px,calc(100vh - 290px),1000px);height:clamp(420px,calc(100dvh - 290px),1000px)"), "vh fallback before dvh");
console.log("PASS old-Safari support: head script, -webkit-backdrop-filter, vh fallback");

(async () => {
  let browser = null, why = "";
  if (process.env.PLAZCODE_TEST_BROWSER !== "skip") {
    try { const { chromium } = require("playwright"); const exe = process.env.PLAZCODE_CHROMIUM; browser = await chromium.launch(exe ? { executablePath: exe } : {}); } catch (error) { why = String((error && error.message) || error).split("\n")[0]; }
  } else why = "PLAZCODE_TEST_BROWSER=skip";
  if (!browser) {
    if (process.env.PLAZCODE_REQUIRE_BROWSER === "1") throw new Error("Chromium is required for the old-Safari check: " + why);
    console.log("SKIP real-browser old-Safari check (" + why.slice(0, 120) + ")"); return;
  }
  // The static page with only the old-Safari script (the app script needs the app behind it).
  const page = html.replaceAll("__PLAZCODE_VERSION__", "1.24.34").replace(/<script>[\s\S]*?<\/script>/g, "");
  const pretendOld = () => {
    const real = CSS.supports.bind(CSS);
    CSS.supports = function (a, b) { return String(b === undefined ? a : b).includes("color-mix") ? false : real(a, b); };
    Object.defineProperty(Crypto.prototype, "randomUUID", { value: undefined, configurable: true, writable: true });
  };
  const survey = () => [...document.querySelectorAll("body *")].filter(e => e.getClientRects().length).map(e => {
    const s = getComputedStyle(e), alpha = c => { const m = c.match(/rgba?\(([^)]*)\)/); if (!m) return 1; const p = m[1].split(/[ ,/]+/).filter(Boolean); return p.length > 3 ? parseFloat(p[3]) : 1; };
    return { id: e.id || e.className || e.tagName, bg: alpha(s.backgroundColor), ink: e.textContent.trim() && !e.children.length ? alpha(s.color) : 1 };
  });
  try {
    const native = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await native.setContent(page);
    const before = await native.evaluate(survey);
    assert.equal(await native.evaluate(() => typeof window.__plazcodeColorMixFallback), "undefined", "engines with color-mix are left alone");

    const old = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await old.setContent(page.replace('<script id="pz-old-safari">', "<script>(" + pretendOld + ")()</script>" + '<script id="pz-old-safari">'));
    const rules = await old.evaluate(() => {
      const f = window.__plazcodeColorMixFallback;
      return {
        uuid: crypto.randomUUID(),
        left: [...document.querySelectorAll("style")].some(s => s.textContent.includes("color-mix(")),
        cases: [
          "color-mix(in srgb,var(--orange2,#ffc052) 60%,#fff)", "color-mix(in srgb,var(--orange2,#ffbc67) 25%,transparent)",
          "color-mix(in srgb,var(--orange2,#ffbc67) 38%,transparent)", "color-mix(in srgb,var(--stroke,#2b303b) 30%,rgb(var(--pz-rgb)) 70%)",
          "color-mix(in srgb,var(--surface,#12151c) calc(var(--nx-panel)*94%),transparent)", "color-mix(in srgb,rgb(var(--pz-rgb,233 186 83)) 20%,transparent)",
          "color-mix(in srgb,color-mix(in srgb,#000 50%,#fff) 80%,transparent)", "border:1px solid color-mix(in srgb,#f00 38%,transparent)!important",
          "color-mix(in srgb,#9fb0c7 60%,var(--v-bg))", "color-mix(in srgb,var(--v-bg) 91%,var(--v-accent))",
        ].map(f),
      };
    });
    assert.match(rules.uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, "randomUUID stand-in gives a version-4 id");
    assert.equal(rules.left, false, "no color-mix() left in the page styles");
    assert.deepEqual(rules.cases, [
      "var(--orange2,#ffc052)", "transparent", "var(--orange2,#ffbc67)", "rgb(var(--pz-rgb))", "var(--surface,#12151c)",
      "rgb(var(--pz-rgb,233 186 83) / 0.2)", "#000", "border:1px solid #f00!important", "#9fb0c7", "var(--v-bg)",
    ]);
    const after = await old.evaluate(survey);
    // Styles added later (the vault page adds its own) are rewritten too.
    const later = await old.evaluate(async () => {
      const style = document.createElement("style"); style.textContent = "#pzlate{background:color-mix(in srgb,#ff0000 80%,#0000ff)}";
      const box = document.createElement("div"); box.id = "pzlate"; box.textContent = "x"; document.body.append(style, box);
      await new Promise(r => setTimeout(r, 30));
      return [style.textContent, getComputedStyle(box).backgroundColor];
    });
    assert.deepEqual(later, ["#pzlate{background:#ff0000}", "rgb(255, 0, 0)"], "a style added later is rewritten");

    assert.equal(after.length, before.length, "same elements drawn");
    const lostBackground = before.map((b, i) => [b, after[i]]).filter(([b, a]) => b.bg > 0.5 && a.bg === 0).map(([b]) => b.id);
    const lostInk = before.map((b, i) => [b, after[i]]).filter(([b, a]) => b.ink > 0.3 && a.ink < 0.3).map(([b]) => b.id);
    assert.deepEqual(lostBackground, [], "no panel loses its background without color-mix");
    assert.deepEqual(lostInk, [], "no text turns invisible without color-mix");
    // 2026-11-16 (owner's Catalina agent.log: "list.replaceChildren is not a function"): an engine older than Safari 14, with no
    // replaceChildren and no "inset" shorthand. The stand-in works and the styles are rewritten into words that engine reads.
    const older = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const pretendOlder = () => {
      const real = CSS.supports.bind(CSS);
      CSS.supports = function (a, b) { const t = String(b === undefined ? a : b) + "|" + a; return /color-mix|inset/.test(t) ? false : real(a, b); };
      for (const P of [Element.prototype, Document.prototype, DocumentFragment.prototype]) Object.defineProperty(P, "replaceChildren", { value: undefined, configurable: true, writable: true });
      // 2026-11-19: that engine also draws no flex gap and stacks the parts of a button laid out as a grid.
      window.__pzForceNoFlexGap = true; window.__pzForceNoButtonGrid = true;
    };
    await older.setContent(page.replace('<script id="pz-old-safari">', "<script>(" + pretendOlder + ")()</script>" + '<script id="pz-old-safari">'));
    const o = await older.evaluate(async () => {
      const list = document.createElement("ul"); list.innerHTML = "<li>a</li><li>b</li>";
      const li = document.createElement("li"); li.textContent = "c"; list.replaceChildren(li, "d");
      const style = document.createElement("style"); style.textContent = "#pzold{position:absolute;inset:4px 8px!important}:is(#pzold,#none):focus-visible{color:red}";
      document.head.append(style); await new Promise(r => setTimeout(r, 30));
      const text = [...document.querySelectorAll("style")].map(s => s.textContent).join("\n");
      // 2026-11-19 (owner's Catalina screenshots: the folded sidebar kept its labels): :is() lists with descendant parts are
      // written out as plain selector lists, inside @media too; comments are dropped first.
      const expand = document.createElement("style");
      expand.textContent = "/* a { b } */html[x] :is(.a h2,.b) > i{display:none!important}@media (max-width:9px){:is(.c,.d .e):hover{color:red}}main:is(#m,[data-p]) .f{top:0}";
      document.head.append(expand); await new Promise(r => setTimeout(r, 30));
      // Flex gap becomes margins (children and ::before); a grid button gets the side-by-side fallback.
      const box = document.createElement("div"); box.id = "pzgapbox"; box.innerHTML = "<span>a</span><span>b</span>text<span style='margin-left:3px'>c</span>";
      const dot = document.createElement("div"); dot.id = "pzgapdot"; dot.textContent = "Bridge";
      const gapStyle = document.createElement("style"); gapStyle.textContent = "#pzgapbox,#pzgapdot{display:flex;gap:8px}#pzgapdot::before{content:'';width:4px;height:4px}";
      document.head.append(gapStyle); document.body.append(box, dot); window.__plazcodeFlexGapFill();
      const kids = [...box.children].map(k => k.style.marginLeft + "|" + k.style.marginRight);
      return { list: list.innerHTML, late: style.textContent, isLeft: /:is\(/.test(text), insetLeft: /(^|[{;\s])inset\s*:/.test(text), expanded: expand.textContent,
        kids, before: dot.getAttribute("data-pz-gb"), beforeMargin: getComputedStyle(dot, "::before").marginRight, oldButton: document.documentElement.hasAttribute("data-pz-oldbutton") && !!document.getElementById("pz-old-buttons") };
    });
    assert.equal(o.list, "<li>c</li>d", "replaceChildren stand-in empties the list and adds the new children");
    assert.equal(o.late, "#pzold{position:absolute;top:4px !important;right:8px !important;bottom:4px !important;left:8px !important}#pzold:focus,#none:focus{color:red}", "inset, :is() and :focus-visible are rewritten");
    assert.equal(o.expanded, "html[x] .a h2 > i,html[x] .b > i{display:none!important}@media (max-width:9px){.c:hover,.d .e:hover{color:red}}main#m .f,main[data-p] .f{top:0}", ":is() lists become plain selector lists");
    assert.deepEqual(o.kids, ["|", "8px|8px", "3px|"], "flex gap becomes a margin between parts (also around text), never over a margin of its own");
    assert.equal(o.before, "right:8", "a status dot drawn as ::before gets the gap before its word"); assert.equal(o.beforeMargin, "8px");
    assert.equal(o.oldButton, true, "grid buttons get the side-by-side fallback");
    assert.equal(o.isLeft, false, "no :is() left in the page styles");
    assert.equal(o.insetLeft, false, "no inset shorthand left in the page styles");
    if (process.env.PLAZCODE_SHOTS) { await native.screenshot({ path: process.env.PLAZCODE_SHOTS + "/old-safari-native.png" }); await old.screenshot({ path: process.env.PLAZCODE_SHOTS + "/old-safari-fallback.png" }); }
    console.log(`PASS old-Safari rendering: ${before.length} drawn elements, every background and text kept; rewrite rules and later styles checked`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
