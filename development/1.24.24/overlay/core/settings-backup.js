// SPDX-License-Identifier: GPL-3.0-or-later
// Settings backup: one block of text that carries the user's PlazCode choices
// to another browser or back after a reset. It never carries passwords, keys,
// tokens, launch commands, chat or session state, or anything private.
const PlazCodeSettingsBackup = (() => {
  const FORMAT = "plazcode-settings", VERSION = 1, MAX_CHARS = 200000, MAX_KEYS = 120;
  // Secrets and sign-in material, wherever they appear in a name.
  const SECRET = /key|token|secret|password|passwd|credential|auth|cookie|license|pair|webhook/i;
  // Live state, bulky data and anything that launches programs.
  const NOT_SETTINGS = new Set(["rsStartedSessions", "rsLatestHandoff", "rsSessionOps", "rsCheckpoints", "rsPerf", "rsCustomMcpServers",
    "rsSetupSeen", "rsTutorialSeen", "rsContinuationChoices", "rsSys"]);
  const eligible = key => /^rs[A-Z]/.test(key) && !SECRET.test(key) && !NOT_SETTINGS.has(key) && !/mcp|server|session|handoff|queue|history/i.test(key);
  const plain = value => {
    const type = typeof value;
    if (value === null || type === "string" || type === "boolean") return true;
    if (type === "number") return Number.isFinite(value);
    if (Array.isArray(value)) return value.length <= 200 && value.every(plain);
    if (type === "object") return Object.keys(value).length <= 200 && Object.values(value).every(plain);
    return false;
  };
  // values = everything in storage; returns the backup text.
  function create(values, now = new Date()) {
    const settings = {};
    for (const key of Object.keys(values || {}).sort()) {
      if (!eligible(key) || !plain(values[key]) || values[key] === undefined) continue;
      settings[key] = values[key];
    }
    return JSON.stringify({ format: FORMAT, version: VERSION, saved: now.toISOString(), settings }, null, 2);
  }
  // current = what is stored now. Returns { ok, changes, skipped } or { ok:false, error }.
  // A value is accepted only when it has the same kind as the one stored today,
  // so a hand-edited or damaged backup cannot put the wrong kind of value in.
  function parse(text, current = {}) {
    if (typeof text !== "string" || !text.trim()) return { ok: false, error: "empty" };
    if (text.length > MAX_CHARS) return { ok: false, error: "too-big" };
    let data;
    try { data = JSON.parse(text); } catch { return { ok: false, error: "not-json" }; }
    if (!data || data.format !== FORMAT || typeof data.settings !== "object" || data.settings === null || Array.isArray(data.settings)) return { ok: false, error: "not-backup" };
    if (!Number.isInteger(data.version) || data.version > VERSION || data.version < 1) return { ok: false, error: "newer" };
    const changes = {}, skipped = [];
    const entries = Object.entries(data.settings);
    if (entries.length > MAX_KEYS) return { ok: false, error: "too-big" };
    const kind = value => value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
    for (const [key, value] of entries) {
      if (!eligible(key) || !plain(value)) { skipped.push(key); continue; }
      const had = Object.prototype.hasOwnProperty.call(current, key) ? current[key] : undefined;
      if (had !== undefined && had !== null && value !== null && kind(had) !== kind(value)) { skipped.push(key); continue; }
      if (JSON.stringify(had) !== JSON.stringify(value)) changes[key] = value;
    }
    return { ok: true, changes, skipped };
  }
  return { create, parse, eligible, FORMAT, VERSION };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodeSettingsBackup;
