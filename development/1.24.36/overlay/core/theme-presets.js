// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.24.36/ts/core/theme-presets.ts (TypeScript): edit that file, then run node development/1.24.36/ts/build.cjs.
// Curated PlazCode theme presets (11 classic + 8 pro presets = 19) and normalized appearance state.








































































const PlazCodeThemePresets = (() => {
  const LEGACY_IDS = [
    "default",
    "amethyst",
    "cyan",
    "rose",
    "emerald",
    "graphite",
    "crimson",
    "ocean",
    "copper",
    "aurora",
    "orchid",
  ];

  const PRO_IDS = [
    "midnight-slate",
    "obsidian-gold",
    "sunset-ember",
    "sakura-dusk",
    "nord-frost",
    "amber-terminal",
    "paper-light",
    "mono-contrast",
  ];

  const PRESETS = {
    default: {
      id: "default",
      name: "Default",
      desc: "Warm gold on deep charcoal.",
      rgb: "233 186 83",
      accent: "#e9ba53",
      light: "#ffe0a1",
      bg: "#18140d",
      canvas: "#18140d",
      surface: "#272116",
      raised: "#393022",
      border: "#5b4b30",
      inkSoft: "#c5b597",
      text: "#eef1f6",
      glow: "rgb(233 186 83 / .22)",
      tone: "dark",
      legacy: "autumn",
      pro: false,
    },
    amethyst: {
      id: "amethyst",
      name: "Amethyst",
      desc: "Violet light on midnight.",
      rgb: "165 113 255",
      accent: "#a571ff",
      light: "#d7b8ff",
      bg: "#0c0918",
      canvas: "#0c0918",
      surface: "#17122b",
      raised: "#241c40",
      border: "#41336d",
      inkSoft: "#b3a6d8",
      text: "#eef1f6",
      glow: "rgb(165 113 255 / .24)",
      tone: "dark",
      legacy: "starglaze",
      pro: false,
    },
    cyan: {
      id: "cyan",
      name: "Polar Cyan",
      desc: "Icy cyan on deep navy.",
      rgb: "39 193 231",
      accent: "#27c1e7",
      light: "#a5eaff",
      bg: "#041017",
      canvas: "#041017",
      surface: "#0b1e29",
      raised: "#122d3d",
      border: "#224d63",
      inkSoft: "#9cc0cf",
      text: "#eef1f6",
      glow: "rgb(39 193 231 / .24)",
      tone: "dark",
      legacy: "starglaze",
      pro: false,
    },
    rose: {
      id: "rose",
      name: "Rose",
      desc: "Soft pink on dark plum.",
      rgb: "241 112 151",
      accent: "#f17097",
      light: "#ffbdd1",
      bg: "#160912",
      canvas: "#160912",
      surface: "#271220",
      raised: "#381b2f",
      border: "#5e304d",
      inkSoft: "#cc9fb6",
      text: "#eef1f6",
      glow: "rgb(241 112 151 / .24)",
      tone: "dark",
      legacy: "sakura",
      pro: false,
    },
    emerald: {
      id: "emerald",
      name: "Emerald",
      desc: "Fresh green on deep forest.",
      rgb: "41 200 148",
      accent: "#29c894",
      light: "#a6f3d1",
      bg: "#05130f",
      canvas: "#05130f",
      surface: "#0d241d",
      raised: "#15362c",
      border: "#265a49",
      inkSoft: "#9bc6b7",
      text: "#eef1f6",
      glow: "rgb(41 200 148 / .24)",
      tone: "dark",
      legacy: "autumn",
      pro: false,
    },
    graphite: {
      id: "graphite",
      name: "Graphite",
      desc: "Calm, cool monochrome.",
      rgb: "156 170 192",
      accent: "#9caac0",
      light: "#e0e7f2",
      bg: "#0a0d13",
      canvas: "#0a0d13",
      surface: "#141923",
      raised: "#1e2633",
      border: "#364255",
      inkSoft: "#a6b0c0",
      text: "#eef1f6",
      glow: "rgb(156 170 192 / .20)",
      tone: "dark",
      legacy: "night",
      pro: false,
    },
    crimson: {
      id: "crimson",
      name: "Crimson",
      desc: "Ruby red on charcoal.",
      rgb: "239 85 105",
      accent: "#ef5569",
      light: "#ffb0bb",
      bg: "#16080c",
      canvas: "#170b10",
      surface: "#29171e",
      raised: "#3b222b",
      border: "#5b3541",
      inkSoft: "#bd9ca6",
      text: "#eef1f6",
      glow: "rgb(239 85 105 / .24)",
      tone: "dark",
      legacy: "blood-moon",
      pro: false,
    },
    ocean: {
      id: "ocean",
      name: "Oceanic",
      desc: "Sea blue on the deep Atlantic.",
      rgb: "70 146 246",
      accent: "#4692f6",
      light: "#a5ceff",
      bg: "#091323",
      canvas: "#091323",
      surface: "#142238",
      raised: "#203452",
      border: "#365475",
      inkSoft: "#a4b8d2",
      text: "#eef1f6",
      glow: "rgb(70 146 246 / .24)",
      tone: "dark",
      legacy: "starglaze",
      pro: false,
    },
    copper: {
      id: "copper",
      name: "Copper Atelier",
      desc: "Copper and clay, a warm studio.",
      rgb: "219 144 102",
      accent: "#db9066",
      light: "#f4c4a3",
      bg: "#17110f",
      canvas: "#17110f",
      surface: "#251c18",
      raised: "#352822",
      border: "#594236",
      inkSoft: "#c1aaa0",
      text: "#eef1f6",
      glow: "rgb(219 144 102 / .22)",
      tone: "dark",
      legacy: "autumn",
      pro: false,
    },
    aurora: {
      id: "aurora",
      name: "Aurora",
      desc: "The mint glow of northern lights.",
      rgb: "102 211 184",
      accent: "#66d3b8",
      light: "#b4f6e7",
      bg: "#0c151b",
      canvas: "#0c151b",
      surface: "#15262e",
      raised: "#203944",
      border: "#355965",
      inkSoft: "#a5c1cc",
      text: "#eef1f6",
      glow: "rgb(102 211 184 / .24)",
      tone: "dark",
      legacy: "starglaze",
      pro: false,
    },
    orchid: {
      id: "orchid",
      name: "Orchid Noir",
      desc: "Orchid pink on noir.",
      rgb: "205 137 235",
      accent: "#cd89eb",
      light: "#edc6ff",
      bg: "#150e1c",
      canvas: "#150e1c",
      surface: "#251930",
      raised: "#35263f",
      border: "#584167",
      inkSoft: "#bca5cc",
      text: "#eef1f6",
      glow: "rgb(205 137 235 / .24)",
      tone: "dark",
      legacy: "sakura",
      pro: false,
    },
    "midnight-slate": {
      id: "midnight-slate",
      name: "Midnight Slate",
      desc: "Cool slate steel on deep twilight.",
      rgb: "125 162 216",
      accent: "#7da2d8",
      light: "#c4daf8",
      bg: "#0b1018",
      canvas: "#0b1018",
      surface: "#141c28",
      raised: "#1d2838",
      border: "#33455e",
      inkSoft: "#9fb0c8",
      text: "#eef2f8",
      glow: "rgb(125 162 216 / .22)",
      tone: "dark",
      legacy: "night",
      pro: true,
    },
    "obsidian-gold": {
      id: "obsidian-gold",
      name: "Obsidian Gold",
      desc: "Burnished bullion on pure obsidian.",
      rgb: "245 196 81",
      accent: "#f5c451",
      light: "#ffe79e",
      bg: "#08080a",
      canvas: "#08080a",
      surface: "#131216",
      raised: "#1e1c21",
      border: "#453c24",
      inkSoft: "#beb39b",
      text: "#f4f1ea",
      glow: "rgb(245 196 81 / .24)",
      tone: "dark",
      legacy: "autumn",
      pro: true,
    },
    "sunset-ember": {
      id: "sunset-ember",
      name: "Sunset Ember",
      desc: "Warm coral tangerine over dusk ash.",
      rgb: "255 122 89",
      accent: "#ff7a59",
      light: "#ffc1ae",
      bg: "#170d0c",
      canvas: "#170d0c",
      surface: "#261614",
      raised: "#36201c",
      border: "#5e362f",
      inkSoft: "#c8a69e",
      text: "#f7efec",
      glow: "rgb(255 122 89 / .24)",
      tone: "dark",
      legacy: "autumn",
      pro: true,
    },
    "sakura-dusk": {
      id: "sakura-dusk",
      name: "Sakura Dusk",
      desc: "Blossom pink over indigo twilight.",
      rgb: "245 154 189",
      accent: "#f59abd",
      light: "#ffd7e7",
      bg: "#140d18",
      canvas: "#140d18",
      surface: "#221629",
      raised: "#31203b",
      border: "#563963",
      inkSoft: "#c6b0cf",
      text: "#f6eff8",
      glow: "rgb(245 154 189 / .24)",
      tone: "dark",
      legacy: "sakura",
      pro: true,
    },
    "nord-frost": {
      id: "nord-frost",
      name: "Nord Frost",
      desc: "Arctic glacier teal on Nordic slate.",
      rgb: "136 192 208",
      accent: "#88c0d0",
      light: "#cce8f0",
      bg: "#0e141b",
      canvas: "#0e141b",
      surface: "#17202b",
      raised: "#212e3d",
      border: "#384c61",
      inkSoft: "#a5b8c7",
      text: "#ecf2f8",
      glow: "rgb(136 192 208 / .22)",
      tone: "dark",
      legacy: "starglaze",
      pro: true,
    },
    "amber-terminal": {
      id: "amber-terminal",
      name: "Amber Terminal",
      desc: "Retro phosphor amber on CRT charcoal.",
      rgb: "255 176 0",
      accent: "#ffb000",
      light: "#ffe07a",
      bg: "#110d05",
      canvas: "#110d05",
      surface: "#1d1709",
      raised: "#2c220e",
      border: "#544018",
      inkSoft: "#c5b282",
      text: "#f8efd9",
      glow: "rgb(255 176 0 / .24)",
      tone: "dark",
      legacy: "autumn",
      pro: true,
    },
    "paper-light": {
      id: "paper-light",
      name: "Paper Light",
      desc: "Crisp warm paper with deep ink contrast.",
      rgb: "45 91 158",
      accent: "#2d5b9e",
      light: "#1e4278",
      bg: "#f4f0e8",
      canvas: "#f4f0e8",
      surface: "#eae4d8",
      raised: "#dfd8ca",
      border: "#c2b8a4",
      inkSoft: "#4a505c",
      text: "#171a20",
      glow: "rgb(45 91 158 / .18)",
      tone: "light",
      legacy: "night",
      pro: true,
    },
    "mono-contrast": {
      id: "mono-contrast",
      name: "Mono Contrast",
      desc: "Stark monochrome silver on pitch black.",
      rgb: "235 239 245",
      accent: "#ebeff5",
      light: "#ffffff",
      bg: "#050507",
      canvas: "#050507",
      surface: "#101114",
      raised: "#1a1c21",
      border: "#3c404a",
      inkSoft: "#b8bec9",
      text: "#ffffff",
      glow: "rgb(235 239 245 / .20)",
      tone: "dark",
      legacy: "night",
      pro: true,
    },
  };

  const IDS = [...LEGACY_IDS, ...PRO_IDS];

  function hasPreset(id) {
    return Object.prototype.hasOwnProperty.call(PRESETS, id);
  }

  function normalizeThemeId(raw) {
    const key = typeof raw === "string" ? raw.trim() : "";
    if (key === "solar" || !key) return "default";
    return hasPreset(key) ? key : "default";
  }

  function getPreset(raw) {
    return PRESETS[normalizeThemeId(raw)];
  }

  function validHex(raw) {
    const s = typeof raw === "string" ? raw.trim() : "";
    return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : "";
  }

  function normalizeGlow(raw) {
    return raw === "off" || raw === "strong" ? raw : "subtle";
  }

  function normalizeGradients(raw) {
    return raw === "off" ? "off" : "on";
  }

  function normalizeMotion(raw) {
    return raw === "reduced" || raw === "off" ? raw : "full";
  }

  function normalizeAppearance(raw) {
    const src = raw && typeof raw === "object" ? (raw) : {};
    return {
      theme: normalizeThemeId(src.theme),
      glow: normalizeGlow(src.glow),
      gradients: normalizeGradients(src.gradients),
      motion: normalizeMotion(src.motion),
      anim: src.anim !== false,
      ripple: src.ripple !== false,
      custom: validHex(src.custom),
      pixelMode: src.pixelMode === true,
      signalRain: src.signalRain === true,
    };
  }

  function mixCustom(hex) {
    const clean = validHex(hex);
    if (!clean) return null;
    const c = [parseInt(clean.slice(1, 3), 16), parseInt(clean.slice(3, 5), 16), parseInt(clean.slice(5, 7), 16)];
    const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    const hx = (rgb) => "#" + rgb.map((v) => ("0" + Math.max(0, Math.min(255, v)).toString(16)).slice(-2)).join("");
    return {
      rgb: c.join(" "),
      accent: clean,
      light: hx(mix(c, [255, 255, 255], 0.5)),
      bg: hx(mix([8, 9, 12], c, 0.08)),
      surface: hx(mix([14, 15, 20], c, 0.12)),
      border: hx(mix([40, 42, 52], c, 0.26)),
    };
  }

  function toCssVars(presetId, glow, customHex) {
    const preset = getPreset(presetId);
    const g = normalizeGlow(glow);
    const custom = typeof customHex === "string" ? mixCustom(customHex) : null;
    const rgb = custom ? custom.rgb : preset.rgb;
    const accent = custom ? custom.accent : preset.accent;
    const light = custom ? custom.light : preset.light;
    const bg = custom ? custom.bg : preset.bg;
    const surface = custom ? custom.surface : preset.surface;
    const border = custom ? custom.border : preset.border;
    const glowStrength = g === "off" ? "0" : g === "strong" ? ".35" : ".13";
    return {
      "--orange": accent,
      "--orange2": light,
      "--bg": bg,
      "--theme-rgb": rgb,
      "--theme-glow": glowStrength,
      "--pc-accent": accent,
      "--pc-light": light,
      "--pc-bg": bg,
      "--pc-rgb": rgb,
      "--pc-surface": surface,
      "--pc-border": border,
      "--pc-glow": g === "off" ? "none" : `rgb(${rgb} / ${g === "strong" ? ".38" : ".22"})`,
      "--pc-glow-strength": glowStrength,
    };
  }

  function applyToDocument(doc, appearance) {
    const normalized = normalizeAppearance(appearance);
    if (!doc || !doc.documentElement) return normalized;
    const root = doc.documentElement;
    const preset = getPreset(normalized.theme);
    root.setAttribute("data-theme-tone", normalized.custom ? "dark" : preset.tone);
    if (normalized.pixelMode) root.setAttribute("data-plazcode-pixel", "1");
    else root.removeAttribute("data-plazcode-pixel");
    const vars = toCssVars(normalized.theme, normalized.glow, normalized.custom);
    for (const [k, v] of Object.entries(vars)) {
      root.style.setProperty(k, v);
    }
    return normalized;
  }

  function toPaletteMap() {
    const out = {};
    for (const id of IDS) out[id] = PRESETS[id];
    return out;
  }

  return {
    IDS,
    LEGACY_IDS,
    PRO_IDS,
    PRESETS,
    normalizeThemeId,
    getPreset,
    normalizeAppearance,
    toCssVars,
    applyToDocument,
    toPaletteMap,
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodeThemePresets;
