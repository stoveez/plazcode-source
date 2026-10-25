# PlazCode next update — everything the owner wants to add

This note is written so an AI in a brand-new chat can pick it up. Read it fully, then read the two design files next to it:
`LICENSE-SYSTEM-DESIGN.md` and `SKILL-WORKSHOP-DESIGN.md` (same folder). Nothing here is built yet unless it says so.

## Update 2026-10-24 (read this first; it overrides the older lines below)
- Work now happens directly on `claude/plazcode-dev` (no task branches); see `CLAUDE.md` and `docs/NOW.md`. Ignore "work in a branch" in section E.
- Item 9 (hang recovery) is partly done inside 1.24.21: the "AI stops mid-task" case is merged and fixture-tested; the two cases "reply cut inside a command" and "message not delivered" are not wired yet.
- New things the owner added after this note was first written (live status is in `docs/vault/open-work.md`):
  - Done in 1.24.21 work, not yet in a test build: chat notes saved into the vault, the continue popup after "PlazCode is ready.", no limit on saved memory, each chat keeps its AS or RS mode.
  - Queued, each needs a high-effort plan first: plan-mode overhaul with approval cards ("Proposed <tool> - Needs your approval"), nicer output cards (diff card with changes / raw request, thought blocks), several vaults with a switcher like Obsidian's, importing a folder of notes into a vault.
- When the version number changes, follow `docs/vault/new-version-checklist.md`; this folder is named after the *next* update, so rename or copy it when the number is decided.

## Where things stand (as of 2026-10-19)
- PlazCode is closed source. Public repo `stoveez/PlazCode` holds only downloads and update feeds. The real source is the private repo `stoveez/plazcode-source`.
- 1.24.21 is built on the official 1.24.20 source plus an overlay in `development/1.24.21/overlay`. It is in validation; this plan is for the update AFTER it (working name 1.25.0).
- Hard rules (the owner's, always apply):
  - Never break the auto-updater.
  - Commits go under the owner's name (stoveez) with NO Claude attribution lines.
  - Release notes and summaries in plain, non-coder language.
  - Full validation for new features, including the Mac desktop test.
  - Publish only through the private-repo workflow, and only after the owner explicitly confirms. Never push or publish without a clear "yes".
  - Test builds must include the apps (Windows and Mac) as well as the extension, and must be checked by staging back and comparing files in the owner's test folder.
  - Respect licences. Do not copy someone else's code without permission (Multi-Script is GPL and the owner has no permission, so write from scratch and do not read it). UltraLab is used with SyphoDev's permission (no sale or paid bundle; credit his YouTube channel).

## A. Login and license system (design written, not built)
Full details: `LICENSE-SYSTEM-DESIGN.md`. Summary:
- Server on Cloudflare Workers + D1. Login happens in the desktop app only.
- Roles: owner, developer, admin, user. Keys are 20 characters with one underscore after the 10th.
- Key types: free (time chosen by owner/dev, basic features), paid (time, paid features), developer, admin. A "24-hour key" button under Log in gives a free key.
- HWID lock with resets by owner, developers and admins. Server-signed tokens; Remove / Remove all take effect within minutes.
- Owner page: user list with search, online status, key pattern, add time to all, generate keys, remove, filter developers, and so on.
- The owner will decide later which features are paid. Keep that list as a server setting.

## B. Skill Workshop (design written, not built)
Full details: `SKILL-WORKSHOP-DESIGN.md`. Summary:
- Runs on the same Cloudflare server and ships in the same later update as the login system.
- Users share skills; the owner approves each one before it is public.
- Seed it with the owner's own content, and with bigger content: the owner wants roughly 897 skills and 300 virtual specialists (to match what Multi-Script advertises), written by us, not copied.
- Ask SyphoDev before putting any UltraLab material in the Workshop.

## C. Ideas taken from Brickwire 3.1.0 (owner's final list, 2026-10-20)
Source: `Brickwire-3.1.0.zip` (the owner attached it to the chat; it may need to be attached again). Licence is MIT: reuse is allowed if the licence text and copyright notice stay, and the credit is "Brickwire contributors". Prefer to write our own versions and keep a credit line in `THIRD-PARTY-NOTICES.txt` for anything derived from it.
The numbers below are the numbers in the comparison table the AI gave the owner. The owner chose items 1, 2, 3, 7, 9, 10, 11, 12, 13, 14 and 17. Not chosen: 4, 5, 6, 8, 15, 16 (asset packs, resource library tab, UI style kit, cutscene kits, "asks you questions" which PlazCode already has, many AI sites which PlazCode already has). The owner wants each chosen item ADDED and IMPROVED UPON, not copied.
All of this stays out of 1.24.21 (owner's decision).

1. **Helper library (item 1).** A PlazCode helper library in Luau, our own from scratch: short, tested commands for building, UI, effects, animation and gameplay, added to the AI's code automatically when used. Error messages must point to the AI's own line numbers. Improve: make the Ultra pack and the library agree on the same names, and test against a real Luau compiler and the Luau test VM CI already builds.
2. **Building helpers (item 2).** Rooms with doors and windows, roofs, stairs, fences, trees, "furnish this room", and style palettes (medieval, modern, sci-fi, nature, desert, snow, japanese, candy). Improve: let the AI describe a plan in numbers first and have PlazCode check it before building.
3. **Build self-checks (item 3).** After each build PlazCode runs a check by itself and finds parts floating in the air, sunk into the ground, overlapping or not anchored, and checks UI and effects. Brickwire only offers this as a tool the AI must remember to call; ours should run on its own and report in What happened.
7. **Effects module (item 7).** Lightweight effects (explosion, sword slash and so on): at most 4 layers per effect, short life, no collisions, a cap on live parts (oldest removed first), and a way to trigger them from animation markers. Improve: connect with the helper library and the build self-checks (performance budget check).
9. **Hang recovery (item 9).** Add to the existing stall guard (`core/stall-guard.js`): when the AI stops growing its reply for about 90 seconds, press Stop and send "continue exactly from where you stopped" (once per reply); when a reply ends in the middle of a tool block, ask the AI to resend only that block; retry undelivered messages a couple of times with backoff; detect Studio being in the wrong mode and tell the AI which datamodel to use; warn when Studio does not answer for about 2 minutes. Test on the fake provider pages the test suite already has.
10. **Keep-awake and tab recovery (item 10).** Keep the computer awake during a run (ask first, restore after), and let a run continue after a page reload (F5) without repeating a tool call that was already running. Improve: show a clear message on the bar when it resumes.
11. **Studio plugin chat (item 11).** A chat window inside Roblox Studio with image attach and a "send my selection" button, talking to the same PlazCode app. Improve: it must follow the same safety settings (Read-only, confirm before deleting, allowed folders) and show up in What happened.
12. **History and rollback app (item 12).** A history of every step with rollback to before any step, export as a plain report or a replay, and a library of saved selections, prompts and recipes. Build on Undo and What happened.
13. **Blender and Figma previews (item 13).** A live Blender link with one-click add-on install, 3D previews and snapshots shown in the chat with "send to Studio" and "upload to Roblox" buttons, and Figma layouts shown in the chat. Improve: previews must respect Read-only mode.
14. **Notion Dev log (item 14).** In Notion, an optional switch that keeps a "Roblox Dev Log" page up to date with what was done, the paths in Studio and how it was checked. Improve: make it a general "project log" switch that other sites can use through PlazCode's own file log.
17. **Licence key app (item 17).** Already planned: see section A (login and license system).

Suggested order: 9 and 10 first (small and fix tester pain), then 1, 2 and 3 together, then 7, then 12, then 14, then 11 and 13, with 17 and the Workshop (sections A and B) on the server track in parallel.

## D. Open items carried over
- "Response changed — run paused" banner: needs a debug report from a tester.
- Mac app opening then closing: needs the tester's app version or a crash report (likely an older app with a newer extension).
- Live tests still not done: Ultra on real Studio and AI sites, Vani Co-work, Firefox appearance tests.
- Lawyer review of the licence notices (hat artwork, Check-UI, the privacy wording for the license system).
- GitHub Support request about the locked `v1.24.20` tag; delete the `cleanup-public` branch.

## E. How to start
1. Read this note and both design files.
2. Ask the owner which section to start with (default: C1, then C2, then C3).
3. Work in a branch of the private repo, add tests, run the same checks CI runs, show the owner plain-language results, and wait for a "yes" before any push or publish.
