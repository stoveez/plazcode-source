# NOW
Updated: 2026-11-09. No helper agents.

**Latest: 1.24.32 published.** Validation run 42712015243 on `a3f15325`; publish run 42718408426; release record branch `release-record-1.24.32-final`. Live feeds show 1.24.32 and the Windows download hash matched the feed.

**What is in 1.24.32:** Notion bar re-seats when a page or side panel opens; hidden bar tab can be dragged (returns when unhidden); only the real command block runs (examples in text fences, inline code or prose are ignored); the chatbox is released about half a second after the reply's finished buttons appear; Notion command cards attach to the code block; Notion custom agent chats (?at=) recognised; false "Offline" / "Check unavailable" fixed at the cause (stale cached update feed no longer an error in the app; the extension needs 8 failed status reads in a row before saying the bridge is unavailable).

**In progress after 1.24.32 (not published, all on `claude/plazcode-dev`, source still in `development/1.24.32`; publishing needs a new version number, 1.24.33, and the owner's yes):**
- **Notion tool-calling fix.** 1.24.32's "only the real command block runs" rule dropped every Notion command that followed a sentence, because Notion's reply text has no line break between a sentence and the code block (card stuck on "processing", turn ended). `core/parser.js`: Notion declares `flatTranscript`; the trailing run of command blocks is the actionable part; several command blocks in one reply run as a batch again; closing-sentence allowance 200 characters. Test `test-notion-flat-command.js`.
- **Several commands per reply is the default (owner, 2026-11-10: "reads together, edits in order").** Prompts now say SEVERAL COMMANDS PER REPLY (up to eight blocks). In a batch, neighbouring read-only commands run at the same time and changes run in the written order; a failure holds back later changes but never cancels reads (`runCommandBatch` in `core/main.js`, `test-command-batch.js`). The app runs calls to one server one at a time, so the gain is mostly fewer AI turns.
- **Helpers / sub-agents (owner, 2026-11-10: extra chats on the same AI site, the AI decides, 2 at a time, full tools in separate areas, UI in PlazCode's glow and gradient style).** New command `plazcode_helpers` (start / status / wait / stop). The background worker keeps the roster (`createHelperRoster` in `background.js`): queue of two per main chat, each helper in its own unfocused popup window with its own PlazCode session, edit locks so two agents never change the same script or file at once, summaries handed back once. The AI tab side is the "Helper agents" block in `core/main.js` (helper run and report, auto-delivery of results when the main chat is idle, Agents button and panel). Test `test-helper-agents.js`. **Not tried on a live AI site or in Studio yet: owner field test needed** (does the helper window start its session, send the task, and report back on Notion and ChatGPT).
- All three are extension-only: reloading the extension is enough.

**Owner field retest pending:** the Notion bar lag and the "Offline" cause were not reproduced live, only hardened. If either still shows, collect logs. The Status-card part of the Offline fix is inside the app, so the app must be replaced.

**Release:** https://github.com/stoveez/PlazCode/releases/tag/v1.24.32

**Visibility:** repo is still Public after the build window; owner must set it back to Private (https://github.com/stoveez/plazcode-source/settings). Check the actual visibility before stopping.

**Handoff:** work on `claude/plazcode-dev`; main ancestry was merged back after publish. Stale branches kept: `release-record-1.24.31`, `fix/bar-status-json-lock`. Other account/Workshop/Brickwire plans remain deferred. See [open work](vault/open-work.md).
