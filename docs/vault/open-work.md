---
title: Open work and known bugs
updated: 2026-10-30
---
**Newest, 2026-10-30:** tool-call consistency fixes (DeepSeek DSML calls, extras' result names, `env_info`/`list_dir`, unknown-command suggestions, desktop size units) and the shorter gap between tool calls (all sites except DeepSeek; not measured live). Bridge drops: the trigger is unconfirmed; diagnostics are in, and the tester's next Terminal lines are needed ([bridge-stability](bridge-stability.md)). See [tool-call-consistency](tool-call-consistency.md). Not in any test zip; live DeepSeek not tested.

**Latest, 2026-10-30:** replacement full 1.24.27 test ZIPs delivered through Google Drive. CI [41085855952](https://github.com/stoveez/plazcode-source/actions/runs/41085855952), source `38fd7d2`, passed Windows, universal Mac, Linux and browsers. Includes profile pictures, bold Up to date, plus/approval icons, splash fade, parallel protected-file checks and ahead-of-stable update fix. Production signatures, all 235 reviewed JS sources and release layouts verified; actual downloaded Linux startup passed. Source remains Public at delivery; owner reminded to restore Private. Account API stays Public independently. Stable remains 1.24.26. [Verification](test-build-1.24.27-followups-verification.json).

# Open work

- 2026-10-31: 1.24.28 assembled; public publication pending. Validation 41214837106 on `b288203`; publish run 41216688966. Permanent approvals and code protection are complete. Public publication remains. Other deferred features and original live Studio/account checks remain open. No separate test-build delivery.


**Current profile delivery:** 2026-10-30: online profiles/sign-in, per-profile data and settings/private-skills sync are included in the full verified 1.24.27 test builds. Owner approved the actual rectangular-profile/background design. CI 40989215099 / source 9c175eb passed Windows, universal Mac, Linux and browsers. Production signatures, reviewed source and official archive layouts verified; inner ZIPs delivered. Account API remains Public by explicit approval. Source repo is now PRIVATE, verified after owner restored visibility. Earlier integration visibility attempts were denied HTTP 403. Latest stable remains 1.24.26. See [profile feature](desktop-profile-sign-in.md) and [archive verification](test-build-1.24.27-profiles-verification.json).

**Current 2026-10-29:** 1.24.27 full test builds delivered. CI 40932400772 / 962899c passed Windows, Mac, Linux and browsers. Archive/signature/source/version/layout verification complete; Windows/Mac exact current release file lists. See [verification](test-build-1.24.27-verification.json). DeepSeek pacing, effort clipping, approval controls, bar alignment and Mac/Linux startup fixes are in these test packages. Original user devices and live AI accounts remain untested. Release-note metadata records completed test delivery; the stable feed stays at 1.24.26.

**Visibility resolved:** source is now PRIVATE, verified after owner restored it. Account API stays Public independently. PC vault folder is not connected.

The dated progress entries below record earlier stages and are superseded by this delivery status.


- 2026-10-29: owner requested full 1.24.27 test builds. Source is PUBLIC for the owner-authorized build window; final scope includes approval menus, composer alignment, effort clipping and Linux visible startup. Visibility API denied (403); request sent. Deliver both verified inner lean ZIPs with apps and Chromium/Firefox, then restore Private. No public release authorized by this test-build request.

- 2026-10-29: 1.24.27 initialized, incorporating the actual owner-uploaded DeepSeek guard. Fast follow-ups observe an 8–9.8 second completion-based cooldown, sliced waits and forwarded options. Local targeted/version/package checks passed, including three-copy parity, provider preservation, locales, Ultra and promotion guards; full production CI and live DeepSeek remain. Historical 1.24.26 overlay restored to its released provider baseline. Source is now PUBLIC for the authorized build window.

- 2026-10-29: DeepSeek shared send queue implemented and locally verified; unreleased. Covers direct UI sends, completion-based eight-second pause plus jitter for fast replies, diagnostics and failure recovery. See [DeepSeek pacing](deepseek-send-pacing.md). Next signed version/build and live DeepSeek verification remain. Source is now PUBLIC for the authorized build window.







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






















- 2026-10-29: owner confirmed Public; API verified. Full validate-1.24.27 run starts with this dev push. Deliver Windows/Mac inner test ZIPs only after full success and package checks; no stable publication.

- 2026-10-29: 40898279700 / 2563eb2 browser job passed. Windows/Linux continue; Mac runner queued. Test delivery remains pending full success and ZIP verification.

- 2026-10-29: initial 1.24.27 CI caught two wrong-version fixtures made equal to the valid version during rollover. Corrected both to invalid 0.0.0. JS protection suite passes locally; native/full packaging validation reruns in CI (no local Rust toolchain). No runtime guard relaxed; no ZIPs delivered.

- 2026-10-29: audit of all pre-existing 1.24.27 literals in the 26 tree found the third identical rollover case in optimized native verifier tests. Its wrong-version CLI request now uses 0.0.0 too; correct-version tamper check remains 1.24.27. All three future-version fixtures accounted for.

- 2026-10-29: owner effort-cutoff recording reproduced in a desktop-style browser fixture: Ultra was covered by Instructions. Synced stale desktop inline picker with shared lift behavior and added viewport-bounded scrolling. All effort choices passed at large/short/narrow sizes with keyboard/close cleanup. Include in 1.24.27 test packages; new app required. Fresh full CI starts with this push.

- 2026-10-29 WIP: owner requested persistent Ask/Approve for me/Bypass approval controls below Effort and in desktop Settings, plus actual running-UI screenshots and robust ChatGPT bar placement. Include with existing 1.24.27 changes in test builds; earlier CI sources superseded.

- 2026-10-29 WIP: approval mode policy, shared preference/native schema, actual bar/app controls and fresh-composer collapsed-tab geometry implemented. Local policy/legacy approval and collapse regressions passed. Browser integration/screenshots, native compilation and final full CI remain; do not deliver earlier test sources.

- 2026-10-29: real compiled desktop and extension frontend screenshots captured; all three approval modes persist/sync and respect read-only/folder limits. New Linux report reproduced in source: GUI stub always fails and continues headless. Native visible Linux frontend/package are now required before final test delivery.

- 2026-10-29: Mac screenshot reports occupied legacy bridge port 17613. Found Mac port reclamation was a no-op. WIP same-user targeted PlazCode recovery and real Mac process regression added alongside native Linux browser desktop and signed Linux packaging; full checks pending.

- 2026-10-29: native Linux real frontend integration passed (launch, secure bootstrap, save/reload, Show, Quit); 216 native tests + 4 build tests passed, 2 ignored. Mac targeted recovery implemented, hosted verification pending. Final Windows/Mac/Linux test artifacts and full browser validation remain. Linux auto-updates have no published feed yet; manual native downloads only.

- 2026-10-29: final Linux package smoke test now runs the exact signed static shipped binary/files, not just debug. Browser shell denies frames and suppresses referrers. Hosted validation remains pending.

- 2026-10-29: CI 40909881281 browser job passed; native JS had one failure: startup golden text expected the pre-approval feature index. Verified old guide restores every previous hash; update golden expectations for intended new guide entry and rerun full validation. Linux native tests passed 216; final packages remain pending.

- 2026-10-29: CI 40911856672 / 671b833 passed Windows, Linux and browsers, including actual signed static Linux frontend/package checks. Mac stale native takeover passed; expected unrelated-listener rejection blocked on a modal alert under --headless. Fixed headless startup errors to log/exit without dialogs; full rerun and final download verification remain.

- 2026-10-29: owner confirmed online profiles, saved login and separated data. Account API deployed owner-private and passed real auth/sync checks; reviewed source mirrored in account-service/. Native path/store foundations and cache/upload isolation WIP. Account manager, API/session gates, migration/sync and actual startup integration still required.

- 2026-10-29: corrected accidental generated preference-harness target files in WIP 6318a5d; removed them from tracking and ignored the harness target path. No credentials were in these generated test artifacts. Account/session integration still in progress.

- 2026-10-29 WIP: encrypted account manager, saved login, legacy-data migration and native API profile/epoch gate compile. Three native account crypto/protocol tests passed. Startup, sync and extension integration remain unfinished; no new preview/build delivered.

- 2026-10-29 WIP: actual desktop startup/profile actions and native portable settings/skills merge sync connected; 2 sync tests and desktop regression pass. Extension storage/profile epochs and socket closure implemented, integration checks pending. Actual empty native picker captured, no completed sign-in preview or new build yet.

- 2026-10-29: account names protected from translation, Overview signed-in label fixed and remembered picker appearance reads the latest saved theme. Five native account tests and desktop/profile UI checks pass; final full CI pending.

- 2026-10-30: late Studio results now use session-bound IDs and are rejected after profile changes, even when caller IDs repeat. Real Worker/native integration and six account tests pass. Extension partition tests pass. CI 40964100055 fixture/refresh failures fixed; actual desktop language runtime passes 15 languages; next full build pending.

- 2026-10-30: owner rejected initial sign-in appearance. Whole welcome/profile/button styling reworked; actual gold/cyan running-app screenshots shown immediately. Two real local test profiles, no fake UI; no JS errors. Screen and desktop tests pass; fresh full CI for rework remains.

- 2026-10-30: real reworked profile screenshots filed under previews/desktop-profiles-{gold,cyan}.png for direct owner viewing. Runtime unchanged from 4c9fba7; current CI remains the build gate.

- 2026-10-30: first-profile UI migration includes the existing IndexedDB wallpaper; originals and profile edits retained. Migration acknowledgement prevents deleted wallpaper reappearing. Real browser storage checks + seven native account tests pass. Full final runtime CI pending.

- 2026-10-30: CI 40979067378 native regression steps pass on all three platforms; browser check exposed preference errors being erased by polling. Fixed sticky save-failure feedback with successful-retry clearing. Actual 15-language test passes three consecutive runs and explicit polling/retry assertions; desktop regression passes. Next full runtime CI pending.

- 2026-10-30: owner authorized public account API; audience changed to Public and real public signup/session/sync/revoke passed without bypass. Stronger requested desktop glow captured in actual gold/cyan previews. Failed-login focus is synchronous; five consecutive Chromium 141 screen tests pass. Full final packages pending.

- 2026-10-30: owner requested cleaner login arrow and desktop shine. Vector alignment, tactile/glossy primary action, surface reflections and restrained animated shine implemented; real compiled gold/cyan screenshots + actual recording filed in previews/. UI/desktop checks pass; fresh full CI pending.

- 2026-10-30: owner wants compact horizontal profile rectangles from the first reference, not square tiles, plus polished full-screen background lighting/shine. Implemented and captured actual gold/cyan/recording previews. UI/design/desktop checks pass. Existing motion guard now explicitly allows only the requested named effects; full next CI pending.

## Startup/icon follow-up
2026-10-30 follow-up (not in the delivered ZIPs): replaced the font plus beside Create a new profile with a centered SVG badge and the approval-mode font arrow with the same geometric chevron as Effort. Loading and profile picker now overlap in one fade; the local picker no longer waits on update-network requests (native automatic updates remain independent). Actual screen/crossfade, approval browser, desktop regression and theme checks pass. Owner clarified the long delay is before any window; investigating native protected-file verification separately. Source stays Private. Replacement packages pending.

## Profile-picture/startup follow-ups delivered
All current follow-ups are in replacement source 38fd7d2 / CI 41085855952, delivered through Drive. See profile-pictures.md, startup-performance.md and test-builds.md. Actual previews were delivered before full tests/builds. All native/platform/browser checks and package verification passed. Device-specific before-window startup timing remains unmeasured. Owner must restore source Private; account service stays Public. Older progress entries above are historical.

## Fresh-window startup replay follow-up (2026-10-30)
Replay corrected for fresh locked context; actual account changes retain isolation reload. Intro waits for native ready/visible paint and desktop stays hidden underneath. Owner explicitly chose full preview animations even with Windows effects off. Actual compiled frontend recording delivered via Drive, fresh Linux/native-ready UI checks passed; full replacement platform builds pending. Native dark shell opens before WebView setup, loopback connect limit 150ms; original Windows startup timing unmeasured. Delivered 38fd7d2 ZIPs lack this follow-up. See startup-performance.md.
