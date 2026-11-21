// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.24.35/ts/core/ask-panel.ts (TypeScript): edit that file, then run node development/1.24.35/ts/build.cjs.
// Where the Ask PlazCode panel is on screen (owner, 2026-11-19: "in the Ask PlazCode screenshots the AI uses, the panel on the
// side should be hidden, but the rest of your screen should be visible, so the panel doesn't block a portion of the screen").
// The panel page works it out and sends it with "share the whole screen"; the PlazCode app leaves that area out of the AI's
// pictures: a docked panel window is hidden for a moment (what is behind it shows), Chrome's side panel (a strip of the browser
// window with nothing behind it) is blanked out. Coordinates are the browser's screen coordinates (CSS pixels).
const PlazCodeAskPanel = (() => {
                                                                                             
                                                                                                                                   
                                                                                                                            
  const HEADER = 56, EDGE = 8; // Chrome's side panel title row, and the window's resize border (both covered, to be safe)
  const num = (v         ) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
  function place(o       )               {
    const w = o.win || {};
    const left = num(w.left), top = num(w.top), width = num(w.width), height = num(w.height), sw = num(o.screenWidth);
    const title = String(o.title || "Ask PlazCode").slice(0, 80) || "Ask PlazCode";
    if (![left, top, width, height, sw].every(Number.isFinite) || width <= 0 || height <= 0 || sw <= 0) return null;
    // A docked window: its own window is the panel.
    if (w.type === "popup") return { kind: "window", title, x: left, y: top, w: width, h: height, screenWidth: sw };
    // Chrome's side panel: as wide as this page, at the browser window's right edge (where Chrome puts it unless moved), from
    // its title row down to the bottom. Chrome reports the panel's own left edge as screenX; that is used when it lies inside.
    const pw = Math.max(1, Math.round(num(o.innerWidth) || 0)), ph = Math.max(1, Math.round(num(o.innerHeight) || 0));
    const right = left + width;
    let x = num(o.screenX);
    if (!(x > left + 40 && x < right - 40)) x = right - pw - EDGE;
    const y = Math.max(top, top + height - ph - HEADER - EDGE);
    return { kind: "strip", title, x: x - EDGE, y, w: Math.min(right, x + pw + EDGE) - (x - EDGE), h: top + height - y, screenWidth: sw };
  }
  return { place };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodeAskPanel;
