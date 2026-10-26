---
title: Open work and known bugs
updated: 2026-10-24
---
# Open work

## Needs a test or build
- A new test build to carry the 2026-10-24 desktop changes. See [test-builds](test-builds.md).
- Firefox checks run only in CI. Not live-tested: Ultra on real Studio and AI sites, Vani Co-work, Firefox appearance, Windows/Mac desktop apps.

- Pictures pasted directly into an AI site's composer are not captured by the vault yet. (The vault live note and picture storage are already in the test zips of CI run 40152156785.)

- Merged into `claude/plazcode-dev` but NOT proven on real sites or in any test build: hang recovery (Claude stops mid-task), Claude send fixes, Effort chevron, ChatGPT old-chat fix, one-step checklist. Test with the 15-tool-call job on Claude. Hang recovery cases 2 (reply cut inside a command) and 3 (message not delivered) are not wired yet.

- Per-chat AS/RS mode (2026-10-24): each chat keeps its mode across refresh (`rsChatEngines`); jsdom-tested only, extension reload is enough.
- Built 2026-10-24, jsdom-tested only, extension reload is enough: plan-mode approval cards, Always approve (with its Remove list in the menu), output cards, the navy and gold look, several vaults, folder import (see [vault-memory](vault-memory.md)). Left for the next desktop app: native folder picker, real folder rename, batch import, vault list in the desktop window.
- In-chat feature guide: done in the extension (`plazcode_features`, startup index, test, website `features.json`). Still open: show it inside the desktop app, and real-site checks that AIs call the command when asked how to use PlazCode. Other queued owner decisions are in [decisions](decisions.md).
- Chat notes and the after-startup continue popup (2026-10-24): fixture-tested only, not tried on a real site. Queued next, each needs its own plan: several vaults with a switcher (like Obsidian's), and importing a whole folder of notes into the vault when asked.

## Bugs
- "Response changed - run paused" banner: needs a debug report from a tester (high effort).
- Notion startup in new workspaces; commands sometimes shown "not run".
- Claude randomly stops mid-task: one real cause FOUND and fixed 2026-10-25 (clearing an empty reply box made Claude refuse the typed result; `providers/claude.js`), verified live with two 15-call runs (15/15). Not yet in a test zip. If pauses still happen, capture `#rs-diag-log` from the page at the moment it stops.
- ChatGPT AgentScript sometimes pauses; tool chip sometimes still "in progress". Fixture-tested only. (Claude: see the line above; Claude chips now keep the new card after re-draws, verified live.)

## Not started / optional
- Lean startup phases 2 and 3 (`development/1.24.21/overlay/core/lean-startup.js`, unwired, off).
- Next update (1.25.0): login/license server, Skill Workshop, Brickwire list, hang recovery, keep-awake. (The plan file has a 2026-10-24 update block at its top; keep it current.) See `development/1.25.0/` and `docs/TASK-BOARD.md`.
- Website: `PlazCode-website.zip`, to deploy on Cloudflare Pages once the owner has a domain.
- Lawyer review of licence notices; GitHub Support request about the locked `v1.24.20` tag; delete the `cleanup-public` branch.

Release: see [releasing](releasing.md).
- Antivirus false positive on the 1.24.21 Windows app (2 of 69 on VirusTotal). Fix plan for the next update in `development/1.25.0/NEXT-UPDATE-PLAN.md` (no encoded PowerShell, app manifest, signing decision).
- The live 1.24.21 release text needs the owner's version pasted in by hand (this session cannot edit GitHub releases).
