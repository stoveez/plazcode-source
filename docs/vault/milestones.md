---
title: Milestones (finished work)

updated: 2026-10-30
---

2026-10-30: online profiles/sign-in, per-profile data and settings/private-skills sync are included in the full verified 1.24.27 test builds. Owner approved the actual rectangular-profile/background design. CI 40989215099 / source 9c175eb passed Windows, universal Mac, Linux and browsers. Production signatures, reviewed source and official archive layouts verified; inner ZIPs delivered. Account API remains Public by explicit approval. Source repo is now PRIVATE, verified after owner restored visibility. Earlier integration visibility attempts were denied HTTP 403. Latest stable remains 1.24.26.

# Finished work

## 2026-10-31: 1.24.27 published
DeepSeek shared send serialization and completion-based pacing for all programmatic calls. Validation 41157294450 (`5465c3e`), publication 41204935324, packaged Mac lifetime/relaunch passed. No app signing or new end-user setup. User data stays editable; original affected live Studio/account setups were not tested.

## 2026-10-29: 1.24.27 initialized with owner-provided DeepSeek guard (unreleased)
The owner archive guard is merged into 1.24.27: provider-level serialization, optional-argument forwarding, 250 ms sleep slices and a sampled 8–9.8 second completion-based cooldown cover core and direct UI sends. Previous 1.24.26 provider files were restored to their released baseline. Focused timing/concurrency/failure tests, raw-send AST preservation, protected hash pins and root/Chromium/Firefox copy checks passed. Live DeepSeek and release validation remain.

## 2026-10-28: 1.24.26 published
Signed program/update checks, protected Chromium/Firefox code and permanent per-tool Approve all. Validation 40772509288 (`a74ae17`), publication 40781780030, packaged Mac lifetime/relaunch passed. Live feed signatures, Windows archive checksum and full program/browser signed trees verified at public commit d514655. No app signing or new end-user setup. User data stays editable; original affected live Studio/account setups were not tested.

## 2026-10-26: 1.24.25 published
Screenshot display, Plan Mode task approvals, creator response diagnostics and red outdated/version-mismatch warnings shipped. Full Windows/Mac/Linux and both browser engines passed; real three-node preview HTTP save/read passed on all platforms, and the packaged Mac desktop lifetime/relaunch gate passed. Validation 40362663766; publication 40368356121. Windows/Mac feeds and release asset checksums verified; Windows ZIP and exact extension code verified. Original affected account/Studio captures remain untested live.

## 2026-10-26: schedule updated
All work previously planned for 1.24.25 is deferred to 1.24.26. The next update, 1.24.25, is reserved for a new issue the owner will describe. The four plan documents now live in `development/1.24.26/`, and the task board, rules and vault links follow them. No program or updater changes.

## 2026-10-24 (on `claude/plazcode-dev`): hang recovery for Claude, Claude send fixes, Effort chevron, one-step checklist; native-vault notes. Only fixture-tested; not in a test build.

## 2026-10-24 (merged into `claude/plazcode-dev`): vault live note `Now.md` at startup, attached pictures can be stored with add_image. See [vault-memory](vault-memory.md).

## 2026-10-24 (on `claude/plazcode-dev`, not in any test build yet; desktop app must be replaced)
- Dropdown lists no longer open behind the next settings card (`core/effort-picker.js` lift class).
- Ultra purple border and glow-off shadow on the active page button restored.
- Sidebar scrolls on short windows; no Effort/version text in the title bar.
- Five desktop tests updated for the new layout.
- Notes: public-then-private plan, publish walkthrough, where releases live, local-build option, this vault.

## In the latest test zips (CI run 40056181833, commit `9607466`)
- Claude reply-key fix (stable per-turn key), ChatGPT/Claude stall recovery, Notion fixes, AgentScript Full-access fixes.
- Vault graph, brain map, audit/verify; translated memory button names; one-zip test layout.

## 2026-10-23
- Vani startup rewrite; removed the "Working for ..." fold; community-skill sync treats any 4xx as nothing to sync; Freebuff and OxAlpha startup fixes; simpler Memory page; grouped Execution settings; clickable Effort list; lean-startup groundwork (not wired). Details: `docs/HANDOFF.md` section 6.

## 2026-10-29: 1.24.27 local UI/native checks
Persistent command-approval modes and composer-relative bar placement pass real frontend regressions. All effort choices remain accessible. Linux now opens the actual frontend and passes authentication/save/reload/reopen/Quit integration; 216 native and 4 build tests passed (2 ignored). Mac stale-process recovery and final signed platform test builds await hosted validation.

## 2026-10-29: 1.24.27 full test builds delivered
CI 40932400772 / 962899c passed Windows, Mac, Linux and browsers. All downloaded signatures/source hashes/archive versions/layouts verified; Windows/Mac exactly retain official file lists. Actual signed Linux frontend and Mac stale-process recovery passed. Includes approval controls, effort/bar fixes and DeepSeek pacing. Stable remains 1.24.26. Source Private restoration needs owner action after API 403.

## 2026-10-30: online profile test builds delivered
2026-10-30: online profiles/sign-in, per-profile data and settings/private-skills sync are included in the full verified 1.24.27 test builds. Owner approved the actual rectangular-profile/background design. CI 40989215099 / source 9c175eb passed Windows, universal Mac, Linux and browsers. Production signatures, reviewed source and official archive layouts verified; inner ZIPs delivered. Account API remains Public by explicit approval. Source repo is now PRIVATE, verified after owner restored visibility. Earlier integration visibility attempts were denied HTTP 403. Latest stable remains 1.24.26.

Actual remembered-login, separate-data and sync integration passed; owner approved the rectangular profile/gloss/full-background screen. Downloaded archives passed production signatures/source/layout checks; the actual signed Linux app passed bootstrap/profile-gate/reopen/Quit. [Full verification](test-build-1.24.27-profiles-verification.json). Quit/replace the desktop and extension before testing. Windows unsigned/Mac not notarized. Original user devices and live AI accounts remain untested.

## Final local profile-picture/startup verification (2026-10-30)
Profile-picture/startup follow-ups now pass local verification: 234 native + 4 library tests, real account/picture two-install sync, actual PNG/JPEG/two-frame GIF upload/removal/rejection, actual i18n all 15 languages, UI/design/storage/approval and Linux startup. Bold sync status is in refreshed real Drive preview. Matching public account service deployed at source 1326d5e; live private picture sync and older-client retention passed. Full replacement Windows/Mac/Linux/browser build remains pending Public source; existing Drive test ZIPs are old 9c175eb and contain no follow-ups.
