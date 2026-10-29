---
title: Open work and known bugs
updated: 2026-10-29
---
# Open work

- 2026-10-29: owner requested full 1.24.27 test builds. Ready to run full platform/browser validation on dev once owner makes source Public. Visibility API denied (403); request sent. Deliver both verified inner lean ZIPs with apps and Chromium/Firefox, then restore Private. No public release authorized by this test-build request.

- 2026-10-29: 1.24.27 initialized, incorporating the actual owner-uploaded DeepSeek guard. Fast follow-ups observe an 8–9.8 second completion-based cooldown, sliced waits and forwarded options. Local targeted/version/package checks passed, including three-copy parity, provider preservation, locales, Ultra and promotion guards; full production CI and live DeepSeek remain. Historical 1.24.26 overlay restored to its released provider baseline. Source stays Private.

- 2026-10-29: DeepSeek shared send queue implemented and locally verified; unreleased. Covers direct UI sends, completion-based eight-second pause plus jitter for fast replies, diagnostics and failure recovery. See [DeepSeek pacing](deepseek-send-pacing.md). Next signed version/build and live DeepSeek verification remain. Source repo is confirmed Private.

- 2026-10-28: 1.24.26 published. Validation 40772509288 on `a74ae17`; publish run 40781780030. Permanent approvals and code protection are complete. Live signed feeds/download verification passed. Private visibility restoration was later confirmed complete on 2026-10-29. Other deferred features and original live Studio/account checks remain open. No separate test-build delivery.






- 2026-10-27: all 58 repository notes restored on `main` and `claude/plazcode-dev` at the owner's request, including the 1.24.26 plans. The separate Windows `PlazCode-Vault` folder was not changed by this cloud session.

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
- 1.24.25 SHIPPED: screenshot display, task approvals, creator HTTP diagnostics and red outdated/version-mismatch warnings. Validation 40362663766; publish 40368356121. Still needs confirmation on the original user setup for grey Studio captures and the reported creation-preview error. See `development/1.24.25/NEXT-UPDATE-PLAN.md`.
- Update 1.24.26: accounts (no license keys), code protection, Skill Workshop, Brickwire list, hang recovery, keep-awake. (The plan file has a 2026-10-24 update block at its top; keep it current.) See `development/1.24.26/` and `docs/TASK-BOARD.md`.
- Website: `PlazCode-website.zip`, to deploy on Cloudflare Pages once the owner has a domain.
- Lawyer review of licence notices; GitHub Support request about the locked `v1.24.20` tag; delete the `cleanup-public` branch.

Release: see [releasing](releasing.md).
- 1.24.24 SHIPPED 2026-10-26: Claude false "12000 character input limit" error and higher plan usage. Still needs a live check on a real Claude account with a 12,000 limit (only simulated and practice-page tested).
- 1.24.23 SHIPPED 2026-10-26: antivirus false positive (Chrome blocks the 1.24.22 zip as "Virus detected"; VirusTotal showed 2 of 69 on the 1.24.21 app). Earlier fix plan in `development/1.24.26/NEXT-UPDATE-PLAN.md` (no encoded PowerShell, app manifest, signing decision).
- The live 1.24.21 release text needs the owner's version pasted in by hand (this session cannot edit GitHub releases).
- 1.24.22 SHIPPED 2026-10-25. Still worth a live check on Claude free, ClickUp free, ChatGPT free and DeepSeek to confirm the startup fits each plan (only practice-page tested).
- Antivirus: after 1.24.23 ships, the owner can report the new download as a false positive to Google (https://safebrowsing.google.com/safebrowsing/report_error/) and Microsoft (https://www.microsoft.com/wdsi/filesubmission). Code signing (Azure Artifact Signing) is the lasting fix: every new unsigned build starts with no reputation.





















