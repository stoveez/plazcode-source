# NOW
Updated: 2026-11-09. No helper agents.

**Latest: 1.24.32 published.** Validation run 42712015243 on `a3f15325`; publish run 42718408426; release record branch `release-record-1.24.32-final`. Live feeds show 1.24.32 and the Windows download hash matched the feed.

**What is in 1.24.32:** Notion bar re-seats when a page or side panel opens; hidden bar tab can be dragged (returns when unhidden); only the real command block runs (examples in text fences, inline code or prose are ignored); the chatbox is released about half a second after the reply's finished buttons appear; Notion command cards attach to the code block; Notion custom agent chats (?at=) recognised; false "Offline" / "Check unavailable" fixed at the cause (stale cached update feed no longer an error in the app; the extension needs 8 failed status reads in a row before saying the bridge is unavailable).

**In progress after 1.24.32 (not published):** Notion tool calls broke in 1.24.32: Notion's reply text has no line break between a sentence and the code block after it, so the new "only the real command block runs" rule dropped every command that followed a sentence (card stuck on "processing", turn ended). Fixed on `claude/plazcode-dev` in `core/parser.js` (Notion declares `flatTranscript`; the trailing run of command blocks is the actionable part; several command blocks in one reply run as a batch again; closing sentence allowance 200 characters) with `test-notion-flat-command.js`. Extension reload is enough. Needs a new version number (1.24.33) to publish. Owner also asked for sub-agents and parallel tool calls by default: questions sent, not started.

**Owner field retest pending:** the Notion bar lag and the "Offline" cause were not reproduced live, only hardened. If either still shows, collect logs. The Status-card part of the Offline fix is inside the app, so the app must be replaced.

**Release:** https://github.com/stoveez/PlazCode/releases/tag/v1.24.32

**Visibility:** repo is still Public after the build window; owner must set it back to Private (https://github.com/stoveez/plazcode-source/settings). Check the actual visibility before stopping.

**Handoff:** work on `claude/plazcode-dev`; main ancestry was merged back after publish. Stale branches kept: `release-record-1.24.31`, `fix/bar-status-json-lock`. Other account/Workshop/Brickwire plans remain deferred. See [open work](vault/open-work.md).
