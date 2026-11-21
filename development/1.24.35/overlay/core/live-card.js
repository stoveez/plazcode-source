// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.24.35/ts/core/live-card.ts (TypeScript): edit that file, then run node development/1.24.35/ts/build.cjs.
// The live card (AgentScript control rework, 1.24.35): while PlazCode works in another tab or on the person's screen, a small
// live picture sits above the PlazCode bar; clicking it opens the large live view beside the chat. Moved out of
// core/main.js (split as you go) when the owner asked (2026-11-18): "the live preview when the ai is controlling my screen
// should be draggable and minimizable".
// - Drag: press and move 5 px or more; a plain click still opens the large view. Arrow keys move it too (Shift: further).
// - Minimize: the "–" button folds the card into a small "Live" pill; clicking the pill brings the card back.
// - The spot and the minimized choice are remembered on this site (localStorage; the page keeps working without it).
const PlazCodeLiveCard = (() => {
                                                                                          
                                        
                                                                                             
  const POS = "plazcode.liveCardPosition", MIN = "plazcode.liveCardMinimized";
  const CSS = '.rs-live-card{position:fixed;right:18px;bottom:96px;width:300px;z-index:2147483645;border-radius:14px;overflow:hidden;cursor:pointer;touch-action:none;font:13px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;color:#eef0f6;background:color-mix(in srgb,var(--pc-bg,#141722) 92%,transparent);box-shadow:0 0 0 1px color-mix(in srgb,var(--pc-accent,#8b5cf6) 55%,transparent),0 10px 34px rgba(0,0,0,.45);backdrop-filter:blur(10px)}' +
    '.rs-live-card:focus-visible{outline:2px solid var(--pc-accent,#8b5cf6);outline-offset:2px}.rs-live-card[data-dragging=true]{cursor:grabbing;user-select:none}' +
    '.rs-live-card canvas{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:#1a1d26}.rs-live-row{display:flex;align-items:center;gap:8px;padding:8px 10px}' +
    '.rs-live-dot{width:8px;height:8px;border-radius:50%;background:var(--pc-accent,#8b5cf6);box-shadow:0 0 8px var(--pc-accent,#8b5cf6);flex:none}.rs-live-card.paused .rs-live-dot{background:transparent;border:2px solid var(--pc-accent,#8b5cf6);box-shadow:none}' +
    '.rs-live-txt{flex:1;min-width:0}.rs-live-txt b,.rs-live-txt small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rs-live-txt small{color:#9aa0ae}.rs-live-note{padding:18px 12px;color:#9aa0ae;text-align:center}.rs-live-big{font-size:15px;opacity:.8}' +
    '.rs-live-min{flex:none;display:grid;place-items:center;width:26px;height:26px;padding:0;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:inherit;font:700 15px/1 system-ui,sans-serif;cursor:pointer}' +
    '.rs-live-min:focus-visible{outline:2px solid var(--pc-accent,#8b5cf6);outline-offset:1px}.rs-live-pill{display:none}' +
    // Minimized: only the dot and a short "Live" / "Paused" word, as a pill.
    '.rs-live-card.min{width:auto;border-radius:999px}.rs-live-card.min canvas,.rs-live-card.min .rs-live-note,.rs-live-card.min .rs-live-txt,.rs-live-card.min .rs-live-min,.rs-live-card.min .rs-live-big{display:none!important}' +
    '.rs-live-card.min .rs-live-row{padding:7px 12px}.rs-live-card.min .rs-live-pill{display:block;font-weight:600;white-space:nowrap}';
  function create(o         ) {
    const store = o.storage === undefined ? (() => { try { return window.localStorage; } catch { return null; } })() : o.storage;
    const read = (k        ) => { try { return store ? store.getItem(k) : null; } catch { return null; } };
    const write = (k        , v        ) => { try { if (store) store.setItem(k, v); } catch {} };
    const el = document.createElement("div");
    el.className = "rs-live-card"; el.setAttribute("role", "button"); el.tabIndex = 0;
    el.innerHTML = "<style>" + CSS + "</style>" +
      '<canvas width="480" height="300" aria-hidden="true"></canvas><p class="rs-live-note" hidden></p><div class="rs-live-row"><span class="rs-live-dot" aria-hidden="true"></span>' +
      '<span class="rs-live-txt"><b></b><small></small></span><span class="rs-live-pill"></span><button type="button" class="rs-live-min"></button><span class="rs-live-big" aria-hidden="true">⤢</span></div>';
    const min = el.querySelector(".rs-live-min")                     , pill = el.querySelector(".rs-live-pill")               ;
    min.textContent = "–"; min.title = o.words("Minimize the live view"); min.setAttribute("aria-label", min.title);
    let minimized = read(MIN) === "1", position                                  = null;
    try { const p = JSON.parse(read(POS) || "null"); if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) position = { x: p.x, y: p.y }; } catch {}
    // Keep the card fully on screen (also after the window gets smaller).
    function place() {
      el.classList.toggle("min", minimized);
      if (!position) { el.style.left = el.style.top = ""; el.style.right = el.style.bottom = ""; return; }
      const r = el.getBoundingClientRect(), w = r.width || 300, h = r.height || 220;
      const x = Math.max(8, Math.min(position.x, window.innerWidth - w - 8)), y = Math.max(8, Math.min(position.y, window.innerHeight - h - 8));
      el.style.right = el.style.bottom = "auto"; el.style.left = Math.round(x) + "px"; el.style.top = Math.round(y) + "px";
    }
    function setMinimized(value         ) {
      minimized = value; write(MIN, value ? "1" : "0"); place();
      el.setAttribute("aria-expanded", String(!value));
      if (!value) { try { min.focus({ preventScroll: true }); } catch {} }
    }
    min.addEventListener("click", (event) => { event.stopPropagation(); setMinimized(true); });
    min.addEventListener("keydown", (event) => event.stopPropagation());
    // Drag, with a 5 px start so a plain click stays a click.
    let drag                                                                                         = null, swallow = false;
    el.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || (event.target           ).closest(".rs-live-min")) return;
      const r = el.getBoundingClientRect();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: r.left, top: r.top, moved: false };
      try { el.setPointerCapture(event.pointerId); } catch {}
    });
    el.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.moved) { if (Math.hypot(dx, dy) < 5) return; drag.moved = true; el.dataset.dragging = "true"; }
      position = { x: drag.left + dx, y: drag.top + dy }; place(); event.preventDefault();
    });
    const stop = () => {
      if (!drag) return; const moved = drag.moved; try { el.releasePointerCapture(drag.id); } catch {} drag = null; el.removeAttribute("data-dragging");
      if (moved) { write(POS, JSON.stringify(position)); swallow = true; setTimeout(() => { swallow = false; }, 60); }
    };
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) el.addEventListener(type, stop);
    // A click opens the large view, or brings a minimized card back; the click that ends a drag does nothing.
    el.addEventListener("click", (event) => {
      if (swallow) { swallow = false; event.preventDefault(); return; }
      if (minimized) setMinimized(false); else o.onOpen();
    });
    el.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (minimized) setMinimized(false); else o.onOpen(); return; }
      const step = event.shiftKey ? 40 : 10, moves                                   = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const move = moves[event.key]; if (!move) return;
      const r = el.getBoundingClientRect(); position = { x: r.left + move[0], y: r.top + move[1] }; place(); write(POS, JSON.stringify(position)); event.preventDefault();
    });
    const onResize = () => place();
    window.addEventListener("resize", onResize);
    o.root.append(el); place(); el.setAttribute("aria-expanded", String(!minimized));
    return {
      el,
      canvas: el.querySelector("canvas")                     ,
      // Title, second line, paused state, the Live/Paused word and the spoken label.
      show(s                                                                             ) {
        (el.querySelector("b")               ).textContent = s.title;
        (el.querySelector("small")               ).textContent = s.sub;
        el.classList.toggle("paused", s.paused); el.dataset.tag = s.tag; pill.textContent = s.tag;
        el.setAttribute("aria-label", minimized ? o.words("Live view minimized. Press to show it again.") + " " + s.label : s.label);
      },
      remove() { window.removeEventListener("resize", onResize); el.remove(); },
      get minimized() { return minimized; },
    };
  }
  return { create };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodeLiveCard;
