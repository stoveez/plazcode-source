# PlazCode next update — everything the owner wants to add

This note is written so an AI in a brand-new chat can pick it up. Read it fully, then read the two design files next to it:
`LICENSE-SYSTEM-DESIGN.md` and `SKILL-WORKSHOP-DESIGN.md` (same folder). Nothing here is built yet unless it says so.

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

## C. Ideas taken from Brickwire 3.1.0 (new)
Source: `Brickwire-3.1.0.zip` (the owner attached it to the chat; it may need to be attached again). Licence is MIT: reuse is allowed if the licence text and copyright notice stay, and the credit is "Brickwire contributors". Prefer to write our own versions and keep a credit line in `THIRD-PARTY-NOTICES.txt` for anything derived from it.
Build in this order (the owner approved the list on 2026-10-19):

1. **Helper library and build self-checks.** Biggest gain.
   - Write a PlazCode helper library in Luau, our own from scratch. Short, tested helper commands for building (rooms with doors and windows, roofs, stairs, fences, trees, "furnish this room", style palettes), UI, effects, animation and gameplay. It is added to the AI's code automatically when used. Error messages must point to the AI's own line numbers.
   - Add a "check my build" step that runs automatically after each build and finds parts floating in the air, sunk into the ground, overlapping or not anchored. Also check UI and effects. Brickwire only offers this as a tool the AI must remember to call; ours should run on its own.
   - Test the library against a real Luau compiler and a Luau test VM (CI already builds one). Check how it fits with the existing Ultra pack and `core/headless-builder.js`.
2. **Hang recovery.** Small, fixes real tester pain.
   - Add to the existing stall guard (`core/stall-guard.js`): when the AI stops growing its reply for about 90 seconds, press Stop and send "continue exactly from where you stopped" (once per reply); when a reply ends in the middle of a tool block, ask the AI to resend only that block; retry undelivered messages a couple of times with backoff; detect Studio being in the wrong mode and tell the AI which datamodel to use.
   - Test on the fake provider pages the test suite already has.
3. **Asset packs and resource library.**
   - Ship as a separate, optional download, not inside the extension (Brickwire's packs are 6.7 MB of Roblox files).
   - FIRST check the licences. Brickwire's NDC kit is Roblox's own content, so redistributing it may not be allowed. Do not ship anything whose licence is unclear.
   - Add a Library tab with previews and "Build this" / "Make something like it" buttons.
4. **Effects, UI styles and cutscene kits.** Ultra already covers a lot, so turn the best parts into ready modules: lightweight effects (limit live parts, trigger from animation markers), around a dozen UI styles with a "restyle my UI" button, camera fly-ins, and "open a case / egg / dice" kits with rarity styling.
5. **Step-by-step rollback and export.** Build on Undo and "What happened": roll back to before any step, export the history as a report or a replay.
6. **Studio plugin chat and Blender/Figma previews.** Bigger jobs; later version. A chat window inside Roblox Studio (with image and selection attach), a live Blender link with 3D previews in the chat, and Figma layouts in the chat.

Skipped on purpose: Notion "Dev log" (Notion-only), extra AI-site adapters (PlazCode already has about 20), asking the user questions (already in PlazCode), Brickwire's own licence-key app (we have our own plan in section A).

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
