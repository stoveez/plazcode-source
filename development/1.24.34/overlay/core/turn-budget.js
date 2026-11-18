// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.24.34/ts/core/turn-budget.ts (TypeScript): edit that file, then run node development/1.24.34/ts/build.cjs.
// Turn budget (owner, 2026-11-18: "how many tokens the commands consume ... especially on the Claude free plan").
// Every command result used to end with the whole state block (engine, modes, permissions, capabilities, the mode-lock
// rules and the per-turn reminders): about 1,000 to 1,400 characters, and the AI site re-reads every earlier result on
// every turn. The full block is now sent when anything in it changed, on the first result of a chat, and every
// `every` results; in between, one short line says it is unchanged (the bridge state stays visible on every result).
const PlazCodeTurnBudget = (() => {
                                                                  
  function stateTag(full        , memo      , scope        , every = 8)         {
    if (!full || !memo) return full;
    if (memo.scope !== scope) { memo.scope = scope; memo.last = ""; memo.repeats = 0; }
    if (full === memo.last && (memo.repeats || 0) < every - 1) {
      memo.repeats = (memo.repeats || 0) + 1;
      const bridge = /\| BRIDGE (UP|DOWN)\b/.exec(full);
      return "[SYSTEM_STATE: unchanged since the last full state line" + (bridge ? " | BRIDGE " + bridge[1] : "") + "]";
    }
    memo.last = full; memo.repeats = 0;
    return full;
  }
  return { stateTag };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodeTurnBudget;
