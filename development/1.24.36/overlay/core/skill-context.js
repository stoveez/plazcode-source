// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.24.36/ts/core/skill-context.ts (TypeScript): edit that file, then run node development/1.24.36/ts/build.cjs.
// The saved skills the AI is shown with a new request (moved out of core/main.js, split as you go, 2026-11-20).
// Skills imported from a folder (owner, 2026-11-20) can be long and come with reference files. They are shown as a short card:
// the description, the first steps (all of them when short), the file names and how to read them, so a big folder never fills
// the request (free-plan limits); the AI opens SKILL.md and the references with plazcode_skills read only when it needs them.
const PlazCodeSkillContext = (() => {

  const SHORT = 3000, FILES = 40;
  function item(skill) {
    const id = String(skill.id || "");
    let out;
    if (id.startsWith("starter-syphodev-")) {
      out = { id: skill.id, title: skill.title, description: String(skill.description || "").slice(0, 500), steps: (skill.steps || []).slice(0, 1), starter_reference: true };
    } else if (Array.isArray(skill.files) && skill.files.length) {
      const steps = Array.isArray(skill.steps) ? skill.steps : [];
      const long = steps.join("\n").length > SHORT;
      out = { id: skill.id, title: skill.title, description: String(skill.description || "").slice(0, 600), steps: long ? steps.slice(0, 2) : steps,
        reference_files: skill.files.slice(0, FILES), ...(skill.files.length > FILES ? { more_files: skill.files.length - FILES } : {}),
        read_with: "plazcode_skills action read, id " + id + ", resource <one of reference_files>" + (long ? "; read SKILL.md first: the steps above are only its start" : "") };
    } else {
      out = { ...skill };
      delete out.source; delete out.import_digest;
    }
    return skill.favorite ? { ...out, always_use:true } : out;
  }
  function text(skills, max = 9000) { return JSON.stringify((skills || []).map(item)).slice(0, max); }
  return { item, text };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodeSkillContext;
