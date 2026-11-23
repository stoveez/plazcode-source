// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.24.36/ts/core/backdrop-fx.ts (TypeScript): edit that file, then run node development/1.24.36/ts/build.cjs.
// Pure-<canvas> Signal Rain backdrop (< 8 KB, zero audio/fonts/images).

                                         
                                                                                    
                                                                                                                                                             

const PlazCodeBackdropFx = (() => {
  const G = "01{}[]<>/=+*:-_";
  const rgbOf = (s        )         => { const m = String(s || "").match(/\d+/g); return m && m.length >= 3 ? `${m[0]} ${m[1]} ${m[2]}` : "233 186 83"; };
  const cssRgb = (d          )         => {
    try { const s = getComputedStyle(d.documentElement), v = s.getPropertyValue("--theme-rgb") || s.getPropertyValue("--pc-rgb") || s.getPropertyValue("--pz-rgb"); if (v && v.trim()) return rgbOf(v); } catch {}
    return "233 186 83";
  };
  const isPRM = (w                    )          => { try { return !!(w && typeof w.matchMedia === "function" && w.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch { return false; } };
  function readFeel(d          , w                    , exp         )         {
    if (exp === "off") return "off";
    const r = d.documentElement, a = r ? (r.getAttribute("data-pz-motion") || r.getAttribute("data-rs-motion") || "") : "";
    return a === "off" ? "off" : (exp === "reduced" || a === "reduced" || isPRM(w)) ? "reduced" : "full";
  }
  function mount(el                          , init         )         {
    if (!el) return { update: () => {}, pause: () => {}, resume: () => {}, destroy: () => {}, getState: () => ({ mode: "off", columns: 0, frames: 0 }) };
    const cv = el, doc = cv.ownerDocument || document, win = doc.defaultView || (typeof window !== "undefined" ? window : undefined);
    let ctx                                  = null;
    try { ctx = cv.getContext("2d"); } catch { ctx = null; }
    let on = init?.enabled !== false, feelExp                     = init?.feel, rgbSet = init?.rgb ? rgbOf(init.rgb) : "";
    let alpha = typeof init?.alpha === "number" ? Math.max(0.05, Math.min(0.85, init.alpha)) : 0.24;
    let w = 0, h = 0, dpr = 1, raf = 0, last = 0, frames = 0, dead = false, paused = false;
    let drops           = [], spd           = [], seed           = [];
    let mode = "off";
    const stop = ()       => { if (raf && win && typeof win.cancelAnimationFrame === "function") win.cancelAnimationFrame(raf); raf = 0; };
    const asleep = ()          => !!(doc.hidden || (doc.documentElement && doc.documentElement.hasAttribute("data-pz-asleep")));
    function size()       {
      const r = typeof cv.getBoundingClientRect === "function" ? cv.getBoundingClientRect() : null;
      const nw = Math.max(120, Math.round((r && r.width) || cv.clientWidth || (win && win.innerWidth) || 960));
      const nh = Math.max(80, Math.round((r && r.height) || cv.clientHeight || (win && win.innerHeight) || 640));
      dpr = Math.min(1.5, Math.max(1, (win && win.devicePixelRatio) || 1));
      if (nw !== w || nh !== h) { w = nw; h = nh; cv.width = Math.round(nw * dpr); cv.height = Math.round(nh * dpr); }
      const n = Math.min(64, Math.max(8, Math.floor(w / 24)));
      if (drops.length !== n) {
        drops = new Array        (n); spd = new Array        (n); seed = new Array        (n);
        for (let i = 0; i < n; i++) { drops[i] = (((i * 37 + 13) % 97) / 97) * (h / 18 + 8); spd[i] = 0.55 + ((i * 19) % 11) * 0.08; seed[i] = (i * 7 + 3) % G.length; }
      }
    }
    function clear()       { if (ctx) try { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width || w || 1, cv.height || h || 1); } catch {} }
    function draw(dt        , st         )       {
      if (!ctx) return;
      size();
      const rgb = rgbSet || cssRgb(doc), n = drops.length, sx = w / Math.max(1, n), rows = 6;
      try {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h); ctx.font = "600 12px ui-monospace, Consolas, monospace"; ctx.textBaseline = "top";
        for (let i = 0; i < n; i++) {
          if (!st) { drops[i] += spd[i] * dt * 8.5; if (drops[i] * 18 > h + rows * 18) drops[i] = -rows * 0.5; }
          const x = Math.round(i * sx + sx * 0.35), hy = Math.round(drops[i] * 18);
          for (let r = 0; r < rows; r++) {
            const y = hy - r * 18;
            if (y < -18 || y > h) continue;
            ctx.fillStyle = `rgb(${rgb} / ${((1 - r / rows) * alpha * (r === 0 ? 1.35 : 0.72)).toFixed(3)})`;
            ctx.fillText(G[(seed[i] + r + (st ? 0 : Math.floor(drops[i]))) % G.length], x, y);
          }
        }
        frames++;
      } catch {}
    }
    function tick(now        )       {
      raf = 0; if (dead || mode !== "running") return;
      if (asleep() || paused) { mode = "paused"; cv.setAttribute("data-signal-rain", "paused"); return; }
      if (!last || now - last >= 42) { const dt = last ? Math.min(0.08, (now - last) / 1000) : 0.032; last = now; draw(dt, false); }
      if (win && typeof win.requestAnimationFrame === "function") raf = win.requestAnimationFrame(tick);
    }
    function sync()       {
      if (dead) return;
      const f = readFeel(doc, win, feelExp);
      if (!on || f === "off") { stop(); mode = "off"; cv.hidden = true; cv.setAttribute("data-signal-rain", "off"); clear(); return; }
      cv.hidden = false;
      if (f === "reduced") { stop(); mode = "static"; cv.setAttribute("data-signal-rain", "static"); draw(0, true); return; }
      if (paused || asleep()) { stop(); mode = "paused"; cv.setAttribute("data-signal-rain", "paused"); if (!frames) draw(0, true); return; }
      mode = "running"; cv.setAttribute("data-signal-rain", "running");
      if (!raf) { last = 0; if (win && typeof win.requestAnimationFrame === "function") raf = win.requestAnimationFrame(tick); else draw(0, true); }
    }
    const onVis = ()       => sync();
    try { doc.addEventListener("visibilitychange", onVis); } catch {}
    let mo                          = null, ro                        = null, mql                        = null;
    try { if (typeof MutationObserver === "function" && doc.documentElement) { mo = new MutationObserver(onVis); mo.observe(doc.documentElement, { attributes: true, attributeFilter: ["data-pz-asleep", "data-pz-motion", "data-rs-motion", "data-desktop-theme", "data-rs-palette"] }); } } catch {}
    try { if (typeof ResizeObserver === "function") { ro = new ResizeObserver(() => { if (mode === "static" || mode === "paused") draw(0, true); }); ro.observe(cv); } } catch {}
    try { if (win && typeof win.matchMedia === "function") { mql = win.matchMedia("(prefers-reduced-motion: reduce)"); if (typeof mql.addEventListener === "function") mql.addEventListener("change", onVis); } } catch {}
    sync();
    return {
      update(o         )       { if (o) { if (typeof o.enabled === "boolean") on = o.enabled; if (o.feel !== undefined) feelExp = o.feel; if (o.rgb !== undefined) rgbSet = o.rgb ? rgbOf(o.rgb) : ""; if (typeof o.alpha === "number") alpha = Math.max(0.05, Math.min(0.85, o.alpha)); } sync(); },
      pause()       { paused = true; sync(); }, resume()       { paused = false; sync(); },
      destroy()       {
        dead = true; stop();
        try { doc.removeEventListener("visibilitychange", onVis); } catch {}
        try { if (mo) mo.disconnect(); if (ro) ro.disconnect(); if (mql && typeof mql.removeEventListener === "function") mql.removeEventListener("change", onVis); } catch {}
        clear(); cv.hidden = true; mode = "off";
      },
      getState: () => ({ mode, columns: drops.length, frames }),
    };
  }
  return { mount, readFeel };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodeBackdropFx;
