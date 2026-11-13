// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// PlazCode bar redesign (1.24.33), step 4: the Studio look for PlazCode's own pages beside the chat (Ask PlazCode and the
// large live view). Reads the app's look (rsAppearance: palette, glow, gradients, Feel) and follows changes, like the bar.
// Square panels with a gradient rim and lit corner brackets; rounded buttons and switches. Plan: BAR-REDESIGN-PLAN.md.
(() => {
  const PALETTES = { default: ["#e9ba53", "#ffe0a1", "#18140d", "233 186 83"], amethyst: ["#a571ff", "#d7b8ff", "#0c0918", "165 113 255"], cyan: ["#27c1e7", "#a5eaff", "#041017", "39 193 231"], rose: ["#f17097", "#ffbdd1", "#160912", "241 112 151"], emerald: ["#29c894", "#a6f3d1", "#05130f", "41 200 148"], graphite: ["#9caac0", "#e0e7f2", "#0a0d13", "156 170 192"], crimson: ["#ef5569", "#ffb0bb", "#16080c", "239 85 105"], ocean: ["#4692f6", "#a5ceff", "#091323", "70 146 246"], copper: ["#db9066", "#f4c4a3", "#17110f", "219 144 102"], aurora: ["#66d3b8", "#b4f6e7", "#0c151b", "102 211 184"], orchid: ["#cd89eb", "#edc6ff", "#150e1c", "205 137 235"] };
  const root = document.documentElement;
  function apply(value) {
    const look = value && typeof value === "object" ? value : {};
    const theme = look.theme === "solar" ? "default" : look.theme;
    const [accent, light, bg, rgb] = PALETTES[theme] || PALETTES.default;
    root.dataset.studio = "";
    root.dataset.palette = PALETTES[theme] ? theme : "default";
    root.dataset.glow = ["off", "subtle", "strong"].includes(look.glow) ? look.glow : "subtle";
    root.dataset.gradients = look.gradients === "off" ? "off" : "on";
    root.dataset.motion = ["full", "reduced", "off"].includes(look.motion) ? look.motion : "full";
    root.dataset.ripple = look.ripple === false || look.ripple === "off" ? "off" : "on";
    for (const [key, v] of Object.entries({ "--st-a": accent, "--st-l": light, "--st-bg": bg, "--st-rgb": rgb, "--a": accent })) root.style.setProperty(key, v);
  }
  apply(null);
  try {
    chrome.storage.local.get("rsAppearance").then((r) => apply(r && r.rsAppearance), () => {});
    chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && changes && changes.rsAppearance) apply(changes.rsAppearance.newValue); });
  } catch {}
  // Click ripples on buttons (Feel: not when motion is off or ripples are off).
  document.addEventListener("pointerdown", (event) => {
    const target = event.target.closest && event.target.closest("button,label.sw");
    if (!target || root.dataset.motion === "off" || root.dataset.ripple === "off") return;
    const box = target.getBoundingClientRect(), ring = document.createElement("span"), size = Math.max(box.width, box.height) * 2;
    ring.className = "st-rpl"; ring.setAttribute("aria-hidden", "true");
    ring.style.cssText = `width:${size}px;height:${size}px;left:${event.clientX - box.left - size / 2}px;top:${event.clientY - box.top - size / 2}px`;
    target.append(ring); setTimeout(() => ring.remove(), 650);
  }, true);
})();
