---
title: Open work and known bugs
updated: 2026-10-28
---
# Open work

- 2026-10-28: persistent Approve all implemented for 1.24.26; focused tests passed. Extension reload plus AI-tab refresh is sufficient for this fix; full browser validation remains.

- 2026-10-28: 1.24.26 code protection implementation started, without app signing or extra user steps. See [code-protection](code-protection.md). Signing/verification, encrypted maps, package integration and migration are implemented. Linux native and browser cryptography tests passed; production key is configured; hosted Windows/Mac validation remains open. Installed-extension checks passed. Run 40696596361 was blocked before job startup by GitHub billing/spending limits.

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

- 2026-10-28: public build window is open. Automated secret-management hit 403 with the publishing token (40705538648); owner has since added `PLAZCODE_RELEASE_SIGNING_KEY`. The public-key-only bootstrap and production gates are ready. No separate test-build delivery.

- 2026-10-28: production integrity key provisioned by the one-time workflow; only its public key is committed. Arrange an external owner key backup securely. Full release validation and publication remain pending.

- 2026-10-28: integrity secret is now configured by owner; bootstrap 40713055559 committed public key 6229d98. No further secret setup needed. Hosted protected-extension checks passed; language-storage race diagnosed as an unrelated asynchronous chat-mode autosave rejection and fixed with a deterministic regression. Final production platform gates remain open.

- 2026-10-28: production validation 40715015896 runs on f1e928e. Publication workflow now records NOW with each automated source push and attempts authorized Private restoration after success; source administration may still be denied.

- 2026-10-28: valid read-only installation roots no longer need permission to write a migration marker; native regression added. Every signature/hash check remains required. Final platform/browser validation must rerun on this compatibility change.

- 2026-10-28: final release-note draft follows the four-section owner format and states live-testing limits. Production validation 40715893481 on d17badc is running; packaged Mac gate and publication remain.

- 2026-10-28: complete hosted browser gate passed in 40715893481 on d17badc, including the storage-failure regression. Native Windows/Mac/Linux jobs are still running; publication and packaged Mac lifetime gate remain.

- 2026-10-28: publication now retains encrypted per-platform decoder maps in the private release record after checking real decryption outside the repo. This preserves future error decoding after CI artifacts expire; no raw maps or private key enter Git/downloads.

- 2026-10-28: browser and Linux gates passed in 40715893481. Private-record retention also passed actual encrypted-map recovery with isolated ephemeral trust, ciphertext-only persistence and overwrite rejection. Windows/Mac, packaged Mac lifetime gate and publication remain.

- 2026-10-28: 40715893481 passed browser/Linux and both native release builds; Windows/Mac handoff fixtures failed because the published feed is older than the new protected binary. Debug fixture now compiles at the live published version without weakening production anti-downgrade checks. Final validation rerun required; no release yet.

- 2026-10-28: WIP 40761358270 protected browser check failed after earlier green runs. Job-log storage returns 403; stack annotations added to diagnose without bypassing access restrictions. No release; fresh full exact-source validation remains required.

- 2026-10-28: browser diagnostic 40761757580 identified worker readiness polling using setTimeout before worker globals existed. Poll moved into Node; actual installed-extension verification remains required. Full final validation reruns; no release yet.

- 2026-10-28: full browser job passed in final-source run 40762506114 (2f775f0). Native Windows/Mac/Linux jobs continue; no release yet.

- 2026-10-28: Windows handoff annotation in 40762506114 exposed a fixture Cargo.lock match using executable name instead of package name. Corrected to plazcode-agent and verified one match in actual manifest/lockfile. Browser/Linux passed; full new-source gates remain required.
