const fs = require("fs"), assert = require("assert");
const main = fs.readFileSync("core/main.js", "utf8"), popup = fs.readFileSync("popup.js", "utf8"), bg = fs.readFileSync("background.js", "utf8");
const desktop = fs.readFileSync("agent/src/desktop.html", "utf8"), css = fs.readFileSync("overlay.css", "utf8"), memory = fs.readFileSync("core/memory.js", "utf8");
const vault = fs.existsSync("agent/src/vault.rs") ? fs.readFileSync("agent/src/vault.rs", "utf8") : "";
// Thorough work mode sets Max effort in the extension, the popup and the desktop app.
assert(/thorough: \{ thinking: "max" \}/.test(main), "extension: Thorough = Max");
assert(/thorough: \{ thinking: "max", extra: true \}/.test(popup), "popup: Thorough = Max");
assert(/thorough: 'max'/.test(desktop), "desktop: Thorough = Max");
// Effort in the bar is a button that opens a list of levels.
assert(/id="rs-effort" role="button" tabindex="0"/.test(main) && /pc-effort-menu/.test(main) && /#rs-root #rs-effort:hover/.test(css) && /#rs-root #rs-effort\{cursor:pointer/.test(css));
for (const level of ["default", "low", "mid", "high", "max", "ultracode"]) assert(main.includes('["' + level + '",'), "effort list has " + level);
// AgentScript -> Roblox is refused while Studio is not connected (bar, double click, popup/background).
assert(main.includes('next === "roblox" && currentMode === "local" && await studioMissing()') && main.includes("Roblox Studio isn't connected"));
assert(bg.includes('error:"studio_not_connected"') && popup.includes("engine-note"));
// Vault viewer: a + on folders adds a note, notes can be deleted, the + shows only on hover.
assert(memory.includes("data-act = 'newnote'") || memory.includes("add.dataset.act = 'newnote'"));
assert(memory.includes("action: 'delete'") && memory.includes("#pcv-root .pcv-row:hover .pcv-plus"));
// Saved notes are copied into the vault and a deleted vault note is removed from Quick notes too.
if (vault) assert(vault.includes("fn sync_memory") && vault.includes("fn do_delete") && vault.includes('"delete" =>'));
console.log("Bar and vault controls: Thorough sets Max, Effort opens a list, Roblox switch needs Studio, vault + and delete, saved notes sync.");
