# PlazCode 1.24.13 review

Validation: all exact-source platform CI jobs and the packaged macOS desktop check passed. See release-validation-1.24.13.

Built from the published `PlazCode-source-1.24.12.zip` with `overlay/` applied by `prepare.py`.

Root causes and fixes:
- False "not connected" bar and long startup pause: `roblox_tools` waited for `AddonManager::list_tools`, which started every MCP add-on one after another (initialize timeout 120 s, runtime setup up to 300 s) while holding the manager lock. The browser's 8 s intro timed out and its `ok:false` frame could overwrite a verified connection. Add-ons now start with `join_all`, `addon_snapshot` waits at most 4 s and otherwise serves the cached catalogue (the refresh continues in the background), and a timed-out intro frame is dropped instead of reported as disconnected.
- "PlazCode Agent crashed" (OS Error 1450): tokio's reactor panics on ERROR_NO_SYSTEM_RESOURCES. The panic hook now relaunches the executable (max 5, `PLAZCODE_CRASH_RESTARTS`) instead of a modal box; panics on tokio worker threads no longer open a blocking MessageBox.
- `local (0 tools)`: `statusObj` hard-coded 0 for the local server; it now reports the real tool count.
- "Startup handshake failed": the single prose correction retry was Notion-only; every provider now gets it, and extra calls next to `list_commands` no longer fail the handshake.
- Crax/ChatGPT pasting scripts: the startup result states the connection; a reply with a Lua code block and no command triggers one reminder while Studio is verified connected.
- Notion unsent tool result: when our own text is verifiably still in the composer and no new turn appeared, it is delivered once more regardless of size.
- Task checklist: `requestSteps` condenses each request sentence into a short imperative; the system prompt asks for labels of at most 8 words.

Not changed: GLM "No response ... <!doctype" is z.ai returning an HTML error page.

Tests: `test-1.24.13-fixes.js`, updated `test-desktop-regression.js` (hashes for core/config.js and core/main.js), Rust `reactor_resource_panics_are_recognised_but_other_panics_are_not`.

Live Studio, Blender, Notion, Crax and ChatGPT behaviour is not yet verified.

## Test build 2 (Notion startup regression)
- Notion startup keeps the exact 1.24.12 checklist wording; the new "Goal:"/label wording applies to the other providers only.
- The stuck-draft resend never runs during startup or after an ambiguous send click.
- `list_tools` serves a non-empty add-on catalogue refreshed in the last 30 s immediately and waits at most 2.5 s otherwise.

## Test build 3 (Studio status, Blender in AgentScript, Claude startup)
- Every Studio probe path (heartbeat `studio_status`, `list_tools`, browser intro, restart, auto-connect) shares one consecutive-miss counter: a verified link drops only after 3 misses or a dead helper process. Timeouts are misses, not fatal.
- The bridge's first frame reports the already-verified link; a successful probe sets `mcpAlive`, so the heartbeat auto-heal no longer restarts a working helper.
- AgentScript status lists the Blender add-on and its own tool count (separate local catalogue), so list_mcp_servers and the startup note tell the AI Blender is connected.
- Claude: never clicks a guessed composer button (voice/model) while Send is disabled or labelled in another language; waits for the enabled Send, else presses Enter; one Enter fallback only when the draft provably did not submit.

## Test build 4 (Skills library)

- Cause of the duplicate cards: every finished task saved an automatic candidate `task-<id>` with the task label as its title. A label that stays the same across follow-ups (or the "Planning project work" placeholder) produced one identical card per finished turn, in every chat. The agent now skips automatic candidates with placeholder titles, too few distinct tool steps, an existing skill of the same normalized title in that engine, or 10 unreviewed candidates already pending. A one-time cleanup collapses untouched duplicate/placeholder candidates; edited, tested, enabled or favourite cards are never removed.
- Skill cards: favourite star (top right) and a two-click delete button beside it; favourites are listed first. Page "Delete all" (two clicks) keeps the 11 starter skills, the 8 UltraGUI references, automatic shared workflows and favourites. Favourites survive editor saves, community sync and shared-workflow refreshes.
- AI: when the user states a lasting preference it asks whether to save it as a skill; only `user_approved:true` saves are enabled for future tasks. A second card with the same name is refused with the existing id/revision so the AI updates it. Skill matching ignores filler words and weights title hits; skill references tell the AI to adapt the principle to the game's genre and skip skills that do not fit.
- Tests: `test-1.24.13-skills.js`, `test-skills-menu.js` (card count), Rust `skills::tests` (dedupe/gate/cap, cleanup, favourite/delete_all, filler words).
- Clarification panel covered by "Agent is working…" and the Tasks button (Notion): the panel was mounted in `<body>`, while the cover and `#rs-root` (Tasks button, bar) live on `<html>`. Notion makes `<body>` its own stacking context, so the panel's z-index only counted inside `<body>` and every `<html>`-level PlazCode overlay painted over its Submit button. Reproduced in Chromium with five body stacking styles. The panel (and the screenshot viewer) now mount on `<html>` with the top z-index; the cover and Tasks button/checklist also hide while a question waits. Test: `test-1.24.13-dialog-layer.js` (browser check runs when Playwright/Chromium exist); `test-page-startup.js` updated for the new mount point.
- Paste into the prompt enhancer did nothing: the enhancer box lives in PlazCode's `#rs-root`, outside the site's editor, and pages such as Notion install page-wide capture handlers that cancel paste (and edit shortcuts) for anything outside their own editor; the same lock earlier forced the clarification panel into an iframe. New `core/input-isolation.js` runs at `document_start` on every supported site (and first in each main script list), so its window-capture listener sees events before any page handler. For trusted paste/copy/cut/beforeinput events and Ctrl/Cmd+V/C/X/A/Z/Y in PlazCode's own text boxes it stops propagation without preventing the browser default, so native paste and undo work and the page never sees them. File pastes still reach the media panel; page elements, synthetic events and normal typing are untouched. Test: `test-1.24.13-enhancer-paste.js` reproduces the block on a hostile page in Chromium and verifies the fix.

## Test build 5 (user answers on build 4)

- Automatic task candidates are off: finished tasks no longer create skill cards (agent refuses non-manual checkpoints; the extension no longer asks). The Skills page drops the "Save completed task candidates" toggle; "Save candidate" for a chosen finished task remains.
- Favourites get priority: starred skills are eligible for matching even if unverified and rank above unstarred ones (+6).
- One-click "Save as skill": when the user states a lasting preference the AI calls `plazcode_skills` action `suggest`; PlazCode shows a small top-right card (away from the chat box) with Save as skill / Not now. Only the click saves (enabled, unverified, all projects unless `project_only`). Repeats in a chat and names that already exist are not offered again.
- While a clarification waits, the chat box is shown normally: the "Agent is working" cover and the typing mask are both lifted, and come back once the answer is submitted.
- UltraGUI references stay protected by Delete all.
- Tests: `test-1.24.13-skill-offer.js` (real content-script boot), updated `test-skills-regression.js`, `test-1.24.13-skills.js`, Rust `favourites_get_priority_in_matching`.

## Test build 6 (merge of the user's tested fixes + answers on build 5)
Merged from the user's tested package (build 3 + their fixes); builds 4-5 never touched these files, so nothing conflicted.
- Blender screenshots (user-tested): `plazcode_screenshot` renders the live 3D View off-screen into a unique file and returns a capture receipt (`PLAZCODE_SHOT_JSON`); falls back to a forced redraw + `screenshot_area`; no image is returned without a receipt. `background.js` (all copies) and `launch_blender_mcp.py`.
- Studio "semi connected" loop (user-tested): no heal while Studio is attaching, linked or closed; 3 missed heartbeats; 60 s grace after the socket opens; 3 min cooldown; asks the bridge `mcp_status` first. Note: the bridge has no `mcp_status` handler (it replies "unknown bridge message type"), so the confirmation never passes and the auto-restart is effectively off. Kept exactly as tested; pending the user's decision.
- Dashboard (user-tested): the Studio card uses `roblox_connected` (Connected / Open / Offline) instead of "Studio open + helper running". `agent/src/desktop.html`.
- Release files: `package.py` now ships `launch_blender_mcp.py`, `SOURCE.txt` and `ollama-page.js` from this source (they were stale 1.23.0 baseline copies), rebuilds `PlazCode-Extension-Firefox` inside the native package from this source, recomputes every `SHA256SUMS.txt` entry and asserts all of this. Update feeds and `latest.json` are untouched (release-time only).
- Save as skill card now sits just above the chat box (aligned with it, never over it) and closes by itself after 45 s without hover/focus; closing saves nothing.
- Favourites are always used in their project/engine: up to 8 starred skills come first in every task's skill reference (marked `always_use`), then the 3 best other matches.
- Clarification answers: only the PlazCode question panel takes answers (it is a full-page modal over the Notion chat box), unchanged.
- Tests: new `test-1.24.13-merged-fixes.js`; updated `test-blender-receipts.js` (off-screen capture + no stale image without a receipt), `test-desktop-regression.js` (Connected/Open/Offline from the real editor link), `test-1.24.13-skill-offer.js`, Rust `favourites_get_priority_in_matching`.
