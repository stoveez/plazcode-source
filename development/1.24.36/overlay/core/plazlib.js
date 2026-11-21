// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.24.36/ts/core/plazlib.ts (TypeScript): edit that file, then run node development/1.24.36/ts/build.cjs.
// PlazLib injection (owner, 2026-11-19: "give the AI short, pre-tested Luau helpers that PlazCode injects only when used,
// cutting hundreds of lines of repetitive Luau down to a few lines"). Owner's choice: build code only.
// inject(code): when execute_luau code uses PL.<helper>, PlazCode puts just the helpers it uses (and what they need) in
// front of it, ON THE SAME FIRST LINE, so every line number in an error is still the AI's own. A PL name that does not
// exist is refused before anything runs, with the list of real ones. Code that defines its own PL is left alone.
// The helpers and the catalog come from core/plazlib-data.js (generated from development/<ver>/plazlib/plazlib.luau).
const PlazCodePlazLib = (() => {
                                                                                                                                                                            
  const MARK = "local PL = (function() local PL = { version = ";
  const MAX_PRELUDE = 30000;
  const data = ()              => (typeof PlazCodePlazLibData !== "undefined" ? (PlazCodePlazLibData        ) : null);
  // Luau without its comments and strings, so "PL." inside them is not counted.
  function bare(code        )         {
    return String(code)
      .replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, " ")
      .replace(/\[(=*)\[[\s\S]*?\]\1\]/g, " ")
      .replace(/--[^\n]*/g, " ")
      .replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/g, " ");
  }
  // The PL names the code uses ("part", "ui.button", ...), in first-use order.
  function namesIn(code        )           {
    const out           = [];
    const re = /(?<![\w.:])PL\.([A-Za-z_]\w*)(?:\.([A-Za-z_]\w*))?/g;
    let m                        ;
    const text = bare(code);
    while ((m = re.exec(text))) { const name = m[2] ? m[1] + "." + m[2] : m[1]; if (!out.includes(name)) out.push(name); }
    return out;
  }
  function inject(code        , lib              = data())                                                   {
    const src = String(code == null ? "" : code);
    if (!lib || !/\bPL\./.test(src) || src.startsWith(MARK)) return { code: src, used: [] };
    // The AI made its own PL table: not ours to touch.
    if (/(?:^|[\s;])(?:local\s+)?PL\s*=(?!=)/.test(bare(src))) return { code: src, used: [] };
    const names = namesIn(src);
    if (!names.length) return { code: src, used: [] };
    const wanted = new Set        (), unknown           = [];
    for (const name of names) {
      if (name === "version") continue;
      const helper = lib.DEFINES[name] || (name.includes(".") ? null : lib.DEFINES[name]);
      const table = !name.includes(".") && Object.keys(lib.DEFINES).some((k) => k.startsWith(name + "."));
      if (helper) wanted.add(helper);
      else if (table) wanted.add(lib.DEFINES[Object.keys(lib.DEFINES).find((k) => k.startsWith(name + ".")) ]);
      else unknown.push("PL." + name);
    }
    const real = Object.keys(lib.DEFINES).filter((k) => !/(?:^|\.)_/.test(k) && !["NL", "need", "enum", "lua", "enumName"].includes(k)).map((k) => "PL." + k);
    if (unknown.length) return { code: src, used: [], error: unknown.join(", ") + " is not a PlazLib helper. Use one of: " + real.join(", ") + ". Nothing was run." };
    // Everything the wanted helpers need, in the library's own order.
    const all = new Set        ();
    const add = (h        ) => { if (all.has(h)) return; all.add(h); for (const n of lib.NEEDS[h] || []) add(n); };
    wanted.forEach(add);
    const chunks = lib.code();
    const parts = lib.ORDER.filter((h) => all.has(h)).map((h) => chunks[h]);
    if (parts.some((p) => typeof p !== "string" || !p)) return { code: src, used: [], error: "PlazLib could not load its helpers (update the PlazCode app and extension together). Nothing was run." };
    const prelude = MARK + JSON.stringify(lib.VERSION) + " } " + parts.join(" ") + " return PL end)(); ";
    if (prelude.length > MAX_PRELUDE) return { code: src, used: [], error: "The PlazLib helpers this code uses are too large to add. Split the code into smaller commands. Nothing was run." };
    return { code: prelude + src, used: [...wanted] };
  }
  // What the AI is told (the luau and studio-gui topics carry it; see core/lean-startup.js).
  function reference(lib              = data())         {
    if (!lib) return "";
    return "PLAZLIB (PlazCode's Luau helpers for BUILD code): in execute_luau you may call PL.* helpers and PlazCode adds the ones you use automatically, so a build is a few lines instead of hundreds. Do not define PL yourself, and never use PL inside a Script, LocalScript or ModuleScript you write into the game (those must be plain Luau that runs without PlazCode; PL.tween, PL.touchPad and PL.ui.button write such scripts for you). Arguments are checked; a wrong one stops with a clear PL.<name> error at your line.\n"
      + lib.doc()
      + "\nExample: local g = PL.ui.screen(\"Shop\") local panel = PL.ui.frame(g, {center=true, size={0.4,0,0.5,0}, padding=16, list=\"vertical\"}) PL.ui.text(panel, \"Shop\", {heading=true, textSize=28}) PL.ui.button(panel, \"Buy\", {size={1,0,0,48}})";
  }
  return { inject, namesIn, reference, MARK };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodePlazLib;
