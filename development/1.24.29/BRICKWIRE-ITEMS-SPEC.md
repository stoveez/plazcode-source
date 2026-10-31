# Brickwire items for 1.24.27 - detailed spec

Read `NEXT-UPDATE-PLAN.md` section C first (the short list), then this file (the detail). Written 2026-10-20 for any AI (Codex, Claude Code) that picks one of these up from `docs/TASK-BOARD.md`.

## Ground rules for every item
- These are for update 1.24.27 (1.24.25 is reserved for a new issue; earlier moves: 1.24.22 short startup, 1.24.23 antivirus fix, 1.24.24 input limit and usage).
- **Write our own code.** Brickwire 3.1.0 is MIT, so ideas and small reuse are legal, but the plan is our own versions. If anything is derived from its files, keep its licence text and add the credit "Brickwire contributors" to `THIRD-PARTY-NOTICES.txt`. Never copy from Multi-Script (GPL).
- The owner wants every item ADDED and IMPROVED, not copied. Each item below says what to improve.
- Follow `docs/MAINTAINER-GUIDE.md`: edit the overlay, add tests, hash pins, all 15 languages for new text, safety settings respected, plain-language notes.
- Brickwire's source for reference is the owner's `Brickwire-3.1.0.zip` (attach again if missing). Paths below are inside it. Brickwire is TypeScript with a separate local server ("bridge"); PlazCode is plain JavaScript in the extension plus a Rust app, so ideas must be re-implemented, not pasted.
- Build and verify against a real Luau compiler for anything that produces Luau (CI already builds a Luau test VM; see the Luau tests in `release-tools`).
- Honest testing: say what ran on fake pages and what was not tried on a live site or real Studio.

Suggested order: 9, 10, then 1+2+3 together, 7, 12, 14, then 11 and 13. Item 17 and the Workshop run on the server track in parallel.

---

## Item 9 - Hang recovery  (normal effort)
**Goal:** when a run gets stuck, PlazCode fixes it by itself instead of waiting for the user.
**Brickwire reference:** `shared/src/hang-monitor.ts` (decision table), `docs/HANGS.md` (8 cases, thresholds). It returns at most one recovery per incident and logs a plain line for each.
**What PlazCode already has:** `core/stall-guard.js` (repeat-call/loop guard, read-repeat windows), the delivery check in `core/main.js`, per-provider Stop buttons, the "Fix connection" button.
**Build:**
1. Model never finishes: Stop button visible and the reply text has not grown for about 90 s -> press Stop, then send "Continue exactly from where you stopped. Do not repeat finished steps." Once per reply. Needs a provider hook `pressStop()` (most providers already have a stop finder; reuse it).
2. Reply ended mid tool block (an unclosed tool block at the end): ask the AI to resend only that block. Reuse the existing truncated-block reminder text.
3. Message not delivered: composer still holds our text, or no new user turn after about 8 s -> retry up to 2 times with a refocus, then tell the user. Do not click Send twice unless the first is provably not taken (see the Notion `_sendNotTaken` pattern in `providers/notion.js`).
4. Studio not answering: a tool call with no result for about 120 s -> ping Studio, mark the call failed, tell the AI.
5. Wrong Studio mode: errors like "Edit datamodel is not available in Play mode" -> read the Studio state, attach it, tell the AI which datamodel to retry in (edit/server/client). One hint per call; do not switch automatically.
6. App offline: reconnect with backoff 1 s, 2 s, 4 s ... max 30 s with a banner.
7. Same call repeated 3 times in a row -> stop auto-run and explain (the existing stall guard already does part of this; unify).
8. AI is asking the user a question with no tool -> notify, never auto-continue.
**Improve on Brickwire:** one shared decision function (pure, unit-testable) used by every provider; every recovery appears as a line in What happened; the thresholds are settings with safe defaults; no recovery fires while the user is typing or while a Confirm-before-deleting prompt is open; per-reply counters so nothing loops forever.
**Files:** `core/stall-guard.js` (decisions), `core/main.js` (wiring), `providers/*.js` (`pressStop`), `core/action-log.js` (log lines), locale files.
**Tests:** a pure-function test per case (like Brickwire's one-test-per-row), plus fake-provider-page tests for cases 1, 2, 3. Update hash pins. Check `test-provider-preservation.js`.
**Not testable offline:** live sites, a stopped app (case 6 banner), real Studio modes. Say so.

## Item 10 - Keep-awake and tab recovery  (normal effort)
**Goal:** a long run is not killed by the computer sleeping or the page reloading.
**Brickwire reference:** the app's keep-awake option and run resume (see `app/main.js`, `docs/PRO.md`).
**Build:**
1. Keep the computer awake while a run is active: the desktop app asks the OS (Windows: SetThreadExecutionState; Mac: IOPMAssertion / `caffeinate`-style assertion) and releases when the run ends or the app closes. It must ask the owner once (setting "Keep my computer awake during runs", off until accepted) and restore normal behaviour afterwards.
2. After a page reload (F5) or a tab crash, the run continues: the extension saves a small run record (current step, which tool call ids were already sent, what is pending) and on load shows "Resuming" on the bar. A tool call that was already running or finished must NOT be run again (use the call id and the app's result log).
**Improve on Brickwire:** a clear bar message when it resumes and when it deliberately does not (for example the chat changed); a "Resume / Start fresh" choice if the record is old (over about 10 minutes).
**Files:** `agent/src` (power code, new `power.rs`; settings), `core/main.js`, `background.js`, locale files.
**Tests:** unit tests for the run-record logic and the do-not-repeat rule; Rust test for the assertion lifecycle where possible (mock). **Needs a real Windows and Mac check** - say it was not done if it was not.

## Item 1 - PlazCode helper library in Luau  (HIGH effort)
**Goal:** short, tested building blocks (build, UI, effects, animation, gameplay) the AI can call instead of writing hundreds of lines. Fewer tokens, fewer bugs.
**Brickwire reference:** `shared/src/bw-helpers.luau` (core `BW.*` helpers), `shared/src/library/bw-library.luau` (kits, VFX, Cinema, Cutscene), `docs/LIBRARY.md` (catalog), `shared/src/bw-luau.ts` (the library is injected only into code that uses `BW.`), `scripts/gen-library.ts`, `scripts/library/dump.luau`.
**Build (our own, from scratch):**
1. A module `PlazLib` written in Luau, in a source folder under `development/1.24.27/` (or the overlay), compiled into a generated JS/JSON file the same way Ultra is generated. A generator script plus a test that the generated file is up to date (like `test-ultralab-generated.py`).
2. Injection: when the AI's Luau uses `PL.` calls, the app/extension prepends only the needed part of the library, so code that does not use it stays untouched. Detect usage with a plain pattern check; cap the injected size.
3. **Error messages that point at the AI's own line numbers:** when injected code fails, translate the line number back (subtract the prelude length) so the AI sees "line 12 of your code".
4. Start with a small, solid core, grow later: `PL.part`, `PL.weld`, `PL.model`, `PL.tween`, `PL.sound`, safe `PL.find`/`PL.wait`, UI helpers (frames, buttons, rounded styles), simple gameplay helpers (touch pad, leaderboard stat, respawn point). Every helper validates its arguments and returns clear errors.
**Improve on Brickwire:** (a) the Ultra pack and the library use the SAME names and examples - generate both from one catalog so they cannot disagree; (b) every helper runs in a real Luau compiler/VM test in CI (Brickwire only had a hand-checked list); (c) a `PL.version` and a minimum-version check so an old app does not run new code wrong.
**Files:** new `luau/` source folder + generator, `core/` injection code, `agent/src/workspace.rs` (where Luau is sent to Studio), Ultra generator (shared catalog), `THIRD-PARTY-NOTICES.txt`.
**Tests:** compile every helper with the real Luau compiler; run pure helpers in the test VM; JS test for injection and line-number translation; generated-file freshness test.
**Not testable offline:** real Studio behaviour of physics/UI helpers - mark each helper "compiled" vs "run in Studio".

## Item 2 - Building helpers  (normal effort; builds on item 1)
**Goal:** the AI builds houses, rooms and scenery by describing them, not by placing hundreds of parts.
**Brickwire reference:** `docs/LIBRARY.md` kits (`cottage`, `modern_house`, `house_plan`, `watchtower`, `barn`, `well`, `skyscraper`), `BW.kit`, `BW.furnish("path", "bedroom")`, `palette` names, ASCII floor plans (`house_plan`).
**Build:** `PL.room`, `PL.door`, `PL.window`, `PL.roof` (gable, flat), `PL.stairs`, `PL.fence`, `PL.tree`, `PL.furnish(roomPath, type)` (bedroom, kitchen, living, bathroom, office), and style palettes: medieval, modern, sci-fi, nature, desert, snow, japanese, candy (a table of material + colour sets). Make every builder produce a named Model with anchored parts and sensible names.
**Improve on Brickwire:** **plan first, check, then build.** The AI first returns a small numeric plan (sizes, door and window positions). PlazCode checks it (walls meet, door fits wall, stairs reach the next floor, roof covers the walls) and returns plain-language problems BEFORE anything is created. Palettes are data-driven so the owner can add more without code.
**Files:** library source from item 1, `core/` plan checker (pure JS so it is unit-testable), Ultra skill notes pointing at the helpers.
**Tests:** plan-checker unit tests (valid/invalid plans); Luau compile of each builder; a "build then self-check" test once item 3 exists (no floating parts).

## Item 3 - Automatic build self-checks  (HIGH effort)
**Goal:** after each build PlazCode inspects the result by itself and reports problems, so the AI fixes them without the user noticing.
**Brickwire reference:** `shared/src/studio2/analyzer.ts` (Luau bodies that scan the DataModel: issues such as `unanchored_loose`, `duplicate_overlap`; read-only analyzer plus a safe optimizer with reversible fixes), `docs/STUDIO2.md`. Note Brickwire only offers this as a tool the AI must remember to call.
**Build:**
1. A Luau checker (our own) run by the app through the existing Studio script runner after a build action finishes. Checks: floating parts (nothing under or touching, not anchored), sunk parts (below the ground plane), overlapping/duplicate parts (z-fighting), unanchored loose parts, missing PrimaryPart on models, parts outside the build area, UI elements off-screen or zero-size, effects with unbounded emitters, instance count over a budget.
2. Output: a short list, worst first, with Studio paths (cap the sample count). Feed it back to the AI automatically as a tool result (only when something is found) and add it to What happened ("Check found 3 floating parts").
3. Read-only by default. Any auto-fix is a separate, reversible step that respects Read-only mode and Confirm-before-deleting, and is wrapped in an Undo waypoint.
**Improve on Brickwire:** it runs on its own (setting on by default, with a quick off switch); it only checks what the last action touched (fast on big places); thresholds are settings; it shares names with the helper library so it knows what a "door" or "roof" should look like.
**Files:** checker Luau, `agent/src/workspace.rs` (trigger after build tools), `core/main.js` (feed result back), `core/action-log.js`, locale files.
**Tests:** compile the checker with real Luau; run it in the Luau test VM against a mock DataModel with known floating/sunk/overlapping parts and assert exact findings; JS tests for the trigger and the report.
**Not testable offline:** real Studio place scale/performance.

## Item 7 - Effects module  (normal effort; builds on items 1 and 3)
**Goal:** good-looking effects (explosion, sword slash, magic burst, impact) that cannot lag the game.
**Brickwire reference:** `docs/VFX.md`, `bw-library.luau` VFX section (`VFX.play`, `bolt`, `flash`, `trail`, `shake`, `loop`).
**Build:** `PL.fx(name, where, opts)` with a catalog of effects. Hard limits: at most 4 layers per effect, short lifetime, `CanCollide=false`, no `Touched` listeners, and a global cap on live effect parts (when exceeded, oldest removed first). Effects can be triggered from animation markers (a keyframe marker name maps to an effect).
**Improve on Brickwire:** a performance budget check that plugs into the build self-checks (item 3): count emitters, rates and lifetimes and warn. Everything cleans itself up (Debris/after lifetime) and an `PL.fx.clearAll()` exists.
**Files:** library source, checker budget rule, Ultra notes.
**Tests:** compile + VM tests for the cap and cleanup logic; budget rule tests.

## Item 12 - History and rollback app  (normal effort)
**Goal:** see every step PlazCode took and go back to before any step; keep and reuse good prompts and selections.
**Brickwire reference:** the Pro app (`app/`, `docs/PRO.md`): history list, workspaces, saved selections/prompts/recipes, export.
**What PlazCode already has:** What happened (`core/action-log.js`) with Undo for changed files and scripts (`agent/src/checkpoints.rs`).
**Build:** (1) a History view in the desktop window that lists steps per project/chat with time, tool, result, and a "Roll back to before this step" button (uses checkpoints; for Studio, use ChangeHistoryService waypoints and say clearly what can and cannot be rolled back); (2) export a run as a plain-language report (Markdown/HTML) or a replay file; (3) a small library of saved selections, prompts and recipes (named, searchable, shareable like skill packs).
**Improve on Brickwire:** rollback is honest - it shows exactly what it will undo before doing it and refuses when something outside PlazCode changed the file since; exports remove secrets the way the debug report does.
**Files:** `agent/src/checkpoints.rs`, `gui.rs`/`desktop.html`, `core/action-log.js`, new storage module for the library.
**Tests:** Rust tests for rollback correctness and the "file changed since" refusal; export content test (no keys/tokens).

## Item 14 - Notion Dev log, generalised to a project log  (normal effort)
**Goal:** keep a "Roblox Dev Log" page up to date automatically in Notion.
**Build:** an optional switch (off by default). When on, after meaningful steps PlazCode appends a short plain entry (what was done, paths in Studio, how it was checked) to a log page. Make it a general **project log** that other sites can use: PlazCode writes the log to its own file first (the app's project log file), and the Notion provider just mirrors that file into the page, so other AI sites can show or attach the same log.
**Improve on Brickwire:** the file log is the source of truth, so a Notion failure never loses entries; entries are batched (not one Notion write per tool call) and use the file-not-taken safe sending already in `providers/notion.js`.
**Files:** `providers/notion.js` (very sensitive: follow the send-safety rules in the guide), app log writer, settings UI, locale files.
**Tests:** log-writer unit tests; fake-Notion-page test for the mirror; keep `test-provider-preservation.js` green.
**Not testable offline:** live Notion.

## Item 11 - Studio plugin chat  (normal effort, larger)
**Goal:** a chat window inside Roblox Studio so the user does not have to switch to the browser.
**Brickwire reference:** `plugin/BrickwireChat.plugin.lua` (dock widget, talks to a local server on 127.0.0.1, image/file attach, "send selection"), `shared/src/chat-outbox.ts` (queue of things the tools want to post into the chat; the extension takes items, types/attaches them and reports what really happened).
**Build:** (1) a Studio plugin (our own Luau, packaged as `.rbxmx`) with a dock widget: text box, send, image attach, and a **Send my selection** button that lists the selected objects (names, classes, paths, key properties); (2) the plugin talks to the PlazCode app on localhost with a per-install token (never open to other programs); (3) the app queues the message in an outbox; the extension picks it up, puts it in the AI chat, and reports delivered/failed back.
**Improve on Brickwire:** the plugin follows the SAME safety settings (Read-only, confirm before deleting, allowed folders) because every action still goes through the app; messages and results appear in What happened; a clear "chat not connected" state; the plugin one-click install copies it into Studio's Plugins folder and confirms.
**Files:** new `studio-plugin/` source, `agent/src` (localhost endpoints with token auth, outbox), extension polling code, installer step.
**Tests:** Luau compile of the plugin; Rust tests for the endpoints (auth, size limits, queue timeout re-queue); JS tests for the outbox pickup. **Needs real Studio** to verify the widget.

## Item 13 - Blender and Figma previews  (normal effort, larger)
**Goal:** see Blender models and Figma layouts in the chat and send them on to Studio.
**Brickwire reference:** `blender/brickwire_blender.py` (Blender add-on), `docs/BLENDER-MCP.md`, `docs/BLENDER-FIGMA.md`, `figma-plugin/`.
**What PlazCode already has:** Blender and Figma connectors (`agent/src` connectors) and 17 engine file tools.
**Build:** (1) one-click Blender add-on install (writes the add-on and shows the enable steps); (2) live 3D preview/snapshot images shown in the chat panel with buttons **Send to Studio** and **Upload to Roblox**; (3) Figma layout previews in the chat.
**Improve on Brickwire:** previews and sends respect Read-only mode and the allowed-folders list; uploads always ask first (they may cost Robux or publish); the add-on is pinned to a version and checked by hash.
**Files:** `agent/src` connectors, UI, add-on source (own), notices.
**Tests:** connector unit tests with fixtures; safety-mode tests. **Needs real Blender/Figma** to verify; mark clearly.

## Item 17 - Licence key and login  (HIGH effort)
Already designed: `LICENSE-SYSTEM-DESIGN.md` (and section A of the plan). Server on Cloudflare Workers + D1. Security review before any release. Do not put secrets in files or chat.

## Also planned: Skill Workshop (HIGH effort)
Designed in `SKILL-WORKSHOP-DESIGN.md`. Owner-approved moderation. Ask SyphoDev before distributing any Ultra material through the Workshop.

---

## Definition of done for each item
- [ ] Code in the overlay, own implementation, credits updated if anything derived.
- [ ] Tests for every part; Luau checked with a real compiler; hash pins updated; locales built.
- [ ] CI green on the exact commit (all four jobs); Mac desktop test passed for anything that touches the app.
- [ ] Plain-language release-note lines written.
- [ ] A handoff note on `docs/TASK-BOARD.md` listing what was tested, what was NOT (live sites, real Studio, real Mac), and what is next.
- [ ] Nothing pushed or published without the owner's yes.
