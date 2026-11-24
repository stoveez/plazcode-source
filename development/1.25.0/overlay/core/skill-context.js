// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.25.0/ts/core/skill-context.ts (TypeScript): edit that file, then run node development/1.25.0/ts/build.cjs.
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
  function catalog(available, max = 3500) {
    const clean = (Array.isArray(available) ? available : [])
      .filter((s) => s && s.id && !/^bundled-/.test(String(s.id)))
      .slice(0, 40)
      .map((s) => ({
        id: String(s.id || ""),
        title: String(s.title || ""),
        ...(s.description ? { description: String(s.description).slice(0, 140) } : {}),
        ...(s.domain && s.domain !== "all" ? { domain: s.domain } : {}),
        ...(s.has_files ? { has_files: true } : {}),
      }));
    if (!clean.length) return "";
    return "OTHER SAVED SKILLS (proactively open any skill relevant to this task with plazcode_skills {\"action\":\"read\",\"id\":\"...\"} — do not wait for the user to ask for it by name): " + JSON.stringify(clean).slice(0, max);
  }

  const DROP_TEXT = /\.(md|markdown|mdx|txt|json|jsonc|ya?ml|toml|ini|cfg|conf|csv|tsv|xml|html?|css|scss|js|mjs|cjs|ts|tsx|jsx|py|rb|sh|bash|zsh|ps1|psm1|bat|cmd|lua|luau|rs|go|java|kt|cs|c|cc|cpp|h|hpp|swift|sql|graphql|proto|env\.example)$/i;
  const DROP_NAMES = /^(?:readme|license|licence|changelog|contributing|authors|notice|makefile|dockerfile)$/i;
  const isHiddenDropPath = (path) => path.split("/").some((p) => p === ".git" || p === "node_modules" || p === "__MACOSX" || p.startsWith("."));
  const isTextDropPath = (path) => { const n = path.split("/").pop() || ""; return DROP_TEXT.test(n) || DROP_NAMES.test(n); };
  const isZipFile = (file) => !!file && (/\.zip$/i.test(file.name || "") || file.type === "application/zip");

  function isSkillDropTransfer(transfer, allowZipOrSkillFile = false) {
    if (!transfer) return false;
    const types = Array.from(transfer.types || []);
    if (!types.includes("Files")) return false;
    const items = [...(transfer.items || [])];
    for (const dtItem of items) {
      try {
        const entry = (dtItem).webkitGetAsEntry?.();
        if (entry && entry.isDirectory) return true;
      } catch {}
    }
    if (allowZipOrSkillFile) {
      const files = [...(transfer.files || [])];
      if (files.some((f) => isZipFile(f) || /^SKILL\.md$/i.test(f.name || ""))) return true;
      if (items.some((it) => it.type === "application/zip")) return true;
    }
    return false;
  }

  async function readDroppedFolder(transfer) {
    const rawItems = [...(transfer?.items || [])];
    const entries = rawItems.map((item) => item.webkitGetAsEntry?.()).filter(Boolean);
    const collected = [];
    let source = "";
    if (entries.length) {
      source = entries.length === 1 ? String(entries[0].name || "") : "Dropped skills";
      const walk = async (entry, prefix) => {
        const rel = prefix ? prefix + "/" + entry.name : entry.name;
        if (!rel || isHiddenDropPath(rel)) return;
        if (entry.isFile) {
          const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
          collected.push({ path: rel, file });
          return;
        }
        if (!entry.isDirectory) return;
        const reader = entry.createReader();
        for (;;) {
          const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
          if (!batch.length) break;
          for (const child of batch) await walk(child, rel);
        }
      };
      for (const entry of entries) await walk(entry, "");
    } else {
      const files = [...(transfer?.files || [])];
      source = files.length === 1 ? String(files[0].name || "Dropped skills") : "Dropped skills";
      for (const file of files) {
        collected.push({ path: (file).webkitRelativePath || file.name, file });
      }
    }
    if (collected.length === 1 && isZipFile(collected[0].file)) {
      const f = collected[0].file;
      if (f.size > 32 * 1024 * 1024) throw Error("The .zip file is larger than 32 MB.");
      const bytes = new Uint8Array(await f.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.slice(i, i + 8192));
      return { action: "stage_folder", source: f.name.replace(/\.zip$/i, "") || "Dropped skills", zip: btoa(bin) };
    }
    if (collected.length > 3000) throw Error("That folder has more than 3,000 files. Drop a smaller skill folder.");
    const files = [];
    let total = 0;
    for (const entry of collected) {
      const p = String(entry.path || entry.file.name || "").replace(/\\/g, "/");
      if (!p || isHiddenDropPath(p)) continue;
      if (entry.file.size > 1024 * 1024) { files.push({ path: p, skipped: "larger than 1 MB" }); continue; }
      if (!isTextDropPath(p)) { files.push({ path: p, skipped: "not a text file" }); continue; }
      total += entry.file.size;
      if (total > 24 * 1024 * 1024) throw Error("That folder has more than 24 MB of text. Drop a smaller skill folder.");
      files.push({ path: p, text: await entry.file.text() });
    }
    if (!files.length) throw Error("No readable skill or text files were found in that folder.");
    return { action: "stage_folder", source: source || "Dropped skills", files };
  }

  return { item, text, catalog, isSkillDropTransfer, readDroppedFolder };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodeSkillContext;
