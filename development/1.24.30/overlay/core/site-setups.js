// SPDX-License-Identifier: GPL-3.0-or-later
// 1.24.21 saved setups per site: one click (or automatic on open) puts back the
// engine, effort, access, safety, instructions, memory project, pinned skills
// and tool add-ons a person uses on that site (ClickUp, Notion, Claude, …).
const PlazCodeSiteSetups = (() => {
  const STORAGE_KEY = "rsSiteSetups";
  // Bar settings a setup remembers, with the values each one may take.
  const SETTINGS = {
    rsWorkMode: ["fast", "balanced", "thorough"],
    rsThinkingLevel: ["default", "low", "mid", "high", "max", "ultracode"],
    rsPermMode: ["sandbox", "ask", "full"],
    rsPlanMode: "boolean", rsExtraThinking: "boolean", rsShowApproach: "boolean",
    rsMultiAgent: "boolean", rsAutoDebug: "boolean", rsReadOnly: "boolean", rsCowork: "boolean",
    rsCustomPrompt: "text",
  };
  const SETTING_KEYS = Object.keys(SETTINGS);
  const LIMITS = { skills: 12, tools: 12, prompt: 25000, project: 80 };

  function validSetting(key, value) {
    const rule = SETTINGS[key];
    if (rule === "boolean") return typeof value === "boolean";
    if (rule === "text") return typeof value === "string" && value.length <= LIMITS.prompt;
    return Array.isArray(rule) && rule.includes(value);
  }
  const ids = (list, max) => [...new Set((Array.isArray(list) ? list : []).map((v) => String(v || "").trim()).filter((v) => v && v.length <= 200))].slice(0, max);

  // Display names for the chosen skills and tools, so the summary reads well.
  function labelsOf(raw, keep) {
    const out = {};
    if (raw && typeof raw === "object") for (const id of keep) if (typeof raw[id] === "string" && raw[id].trim()) out[id] = raw[id].trim().slice(0, 100);
    return out;
  }
  function normalize(raw) {
    const input = raw && typeof raw === "object" ? raw : {};
    const settings = {};
    for (const key of SETTING_KEYS) if (input.settings && validSetting(key, input.settings[key])) settings[key] = input.settings[key];
    return {
      version: 1,
      engine: input.engine === "local" ? "local" : "roblox",
      settings,
      memoryProject: String(input.memoryProject || "").trim().slice(0, LIMITS.project),
      skills: ids(input.skills, LIMITS.skills),
      tools: ids(input.tools, LIMITS.tools).filter((id) => /^[a-z0-9][a-z0-9_-]*$/i.test(id)),
      labels: labelsOf(input.labels, [...ids(input.skills, LIMITS.skills), ...ids(input.tools, LIMITS.tools)]),
      auto: input.auto === true,
      savedAt: typeof input.savedAt === "string" ? input.savedAt : new Date().toISOString(),
    };
  }

  // Build a setup from what the bar shows right now.
  function capture(current) {
    const c = current || {};
    const settings = {};
    for (const key of SETTING_KEYS) if (c.storage && validSetting(key, c.storage[key])) settings[key] = c.storage[key];
    return normalize({ engine: c.engine, settings, memoryProject: c.memoryProject, skills: c.skills, tools: c.tools, labels: c.labels, auto: c.auto, savedAt: new Date().toISOString() });
  }

  // What applying changes. Tools are only turned on, never off.
  function plan(setup) {
    const s = normalize(setup);
    return { storage: { ...s.settings }, engine: s.engine, memoryProject: s.memoryProject, skills: s.skills, toolsOn: s.tools };
  }

  function summary(setup, names) {
    const s = normalize(setup), out = [];
    const n = names || { skills: s.labels, tools: s.labels };
    out.push(["Engine", s.engine === "local" ? "AgentScript" : "Roblox Studio"]);
    if (s.settings.rsWorkMode) out.push(["Effort", s.settings.rsWorkMode]);
    if (s.settings.rsThinkingLevel) out.push(["Reasoning", s.settings.rsThinkingLevel === "ultracode" ? "Ultra" : s.settings.rsThinkingLevel]);
    if (s.settings.rsPermMode) out.push(["Access", s.settings.rsPermMode]);
    if (s.settings.rsReadOnly) out.push(["Safety", "Read-only"]);
    if (s.memoryProject) out.push(["Memory project", s.memoryProject]);
    if (s.skills.length) out.push(["Skills", s.skills.map((id) => (n.skills && n.skills[id]) || id).join(", ")]);
    if (s.tools.length) out.push(["Tools", s.tools.map((id) => (n.tools && n.tools[id]) || id).join(", ")]);
    return out;
  }

  function all(stored) {
    const map = stored && typeof stored === "object" ? stored : {};
    const out = {};
    for (const [site, setup] of Object.entries(map)) if (/^[a-z0-9_.-]{1,60}$/i.test(site)) out[site] = normalize(setup);
    return out;
  }

  // Storage helpers (chrome.storage.local in the extension).
  function load(storage) {
    return new Promise((resolve) => { try { storage.get(STORAGE_KEY, (v) => resolve(all(v && v[STORAGE_KEY]))); } catch { resolve({}); } });
  }
  async function save(storage, site, setup) {
    const map = await load(storage);
    if (setup) map[site] = normalize(setup); else delete map[site];
    await new Promise((resolve) => { try { storage.set({ [STORAGE_KEY]: map }, resolve); } catch { resolve(); } });
    return map;
  }

  // Pinned skills join the task's skill reference as always-use, ahead of matches.
  function mergePinned(matched, pinned) {
    const seen = new Set((pinned || []).map((s) => s && s.id));
    return [...(pinned || []).filter(Boolean).map((skill) => ({ ...skill, always_use: true, pinned_for_site: true })), ...(matched || []).filter((s) => !seen.has(s && s.id))];
  }

  return { STORAGE_KEY, SETTING_KEYS, LIMITS, normalize, capture, plan, summary, all, load, save, mergePinned };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodeSiteSetups;
