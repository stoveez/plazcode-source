---
title: Test builds and the public-then-private plan

updated: 2026-11-02
---
## 2026-11-02 — published version corrected; final remembered-login preservation
Owner confirmed affected users run the RELEASED 1.24.30, during signup/login. Verified GitHub v1.24.30 published 15:27 UTC by existing workflow 41469911201 on release/1.24.30-publish / 69434ca; downloaded official Windows ZIP (51,145,646 bytes, SHA256 e76879ba98b1ff37575be73b024e2b9bfaa66c336572b3baa99476d24ec40d08). Its executable SHA256 919a2651f58ecbc00d3e56c9322a588a1c2ff5339aa6020697e545a2870de477 matches earlier 69a4f8c test executable exactly. Published accounts overlay has the same unsafe reuse-of-proof retry. Earlier assumption of an older app based only on screenshot wording was too strong and corrected with owner.

Live Public API fresh synthetic signup 201, fresh login/session 200, both test sessions revoked 200; no real user data touched. Historical host trigger remains unproven; asked for account.service Log lines from affected 1.24.30. New remembered-login review preserves valid cached local access for busy/rate/transport failures, without clearing token; new real-HTTP test added. This last Rust-only refinement needs final native rerun and supersedes CI 41488995618, which must be cancelled/replaced. All earlier local tests/actual guest preview passed; no more feature scope added. Current test ZIP version stays 1.24.30 for direct replacement; any FUTURE stable publication must use a NEW version, never overwrite released 1.24.30. No assistant publish/main/release/feed/visibility changes.

## 2026-11-02 — local guest/signup verification complete; final CI running
Program source **014b79d**, full CI [41488995618](https://github.com/stoveez/plazcode-source/actions/runs/41488995618). No duplicate push runs. All final local native tests pass (5 library + 287 agent, 2 ignored); full JS 0 failures, plus final CSS/UI/storage/extension checks. Exact screenshot wording maps to 1.24.29's non-JSON parser failure; old app did not log the host status. Current public API health/challenges/logins work. Historical reason for the host's unreadable reply remains unproven; affected version/time asked. Fresh-proof/recovery/rate-limit handling fixed without bypassing authentication. Guest works offline and persists separate data, preserving first-online original data. Actual app screenshot already delivered via Drive immediately. Require hosted CI green, then verify and deliver NEW inner Windows/Mac ZIPs through Drive; earlier 69a4f8c ZIPs lack guest. No stable publishing/API deployment/visibility changes. [Verification](profile-creation-guest-2026-11-02-verification.json).

## 2026-11-02 — guest/signup follow-up implemented, final tests/build next
Guest settings/skills/memory persist locally, separate from online accounts; themed exact-text fallback works with account service unavailable and makes no cloud calls. Safe signup recovery uses fresh proofs and password-verified login after ambiguous replies. All native tests (5 library + 286 agent, 2 ignored), actual native+Worker account/guest restart/isolation and account service tests passed. Actual native UI preview already delivered through Drive immediately. Full JS running; focused final UI hidden-control CSS check pending; next fresh full platform CI and verified Windows/Mac Drive ZIPs. Historical tester outage not conclusively identified: current public API checks pass; asked for version/time. Details: [profile follow-up](profile-creation-guest-2026-11-02.md). No stable publish or API deployment.

## 2026-11-02 — replacement builds delivered; profile follow-up started
Full CI [41449512168](https://github.com/stoveez/plazcode-source/actions/runs/41449512168) on **69a4f8c** (program fix e068a0a) passed every required job. Exact inner Windows/Mac ZIPs verified for production integrity signatures, reviewed sources, SHA/CRC/native formats and official layout; Drive names/MIME/sizes read back. [Windows](https://drive.google.com/file/d/1HHaShdR5yxIfJRFwQYPg6TuTGFUkTfTc/view?usp=drivesdk), [Mac](https://drive.google.com/file/d/1CwVf62R3_c08xJA6Ta785AoRSpxo65BV/view?usp=drivesdk). Details/hashes: [verification](deepseek-workflow-1.24.30-2026-11-02-verification.json). Both app and extension replacement required. No stable publication. Original user devices/live AI/Studio not tested.

**New owner request:** find root cause of profile creation failures; add a themed guest fallback saying exactly “Can't create a profile right now? Use PlazCode as a guest.” Owner chose persistent local guest settings/skills/memory, separate from online profiles, no cloud sync. Inspect server logs and native request handling first; implement isolated guest sessions through normal profile safety and show actual running-app screenshot through Drive immediately when ready. No code changes for this follow-up yet. Account API confirmed active/Public; source repo still Public after ZIP delivery, owner reminded to restore Private. Never change visibility yourself. PC vault folder not connected.


**Latest delivered, 2026-11-02:** 1.24.30 source **642207c**, CI [41367670135](https://github.com/stoveez/plazcode-source/actions/runs/41367670135) ALL GREEN (Windows/universal Mac/Linux/browsers/release-check). Luau timeout and Arena Stop/raw-command/history/flat-argument/reference fixes included with Claude's previous changes. Local full corrected JS: 0 failures. Exact INNER production-key ZIPs verified; Drive metadata names/MIME/sizes read back. Official layout deltas reviewed, all 241 JS sources match, integrity signatures/CRC/SHA256SUMS/licences valid. No source ZIPs. [Verification record](followup-1.24.30-2026-11-02-verification.json).

- [Windows — 51,068,997 bytes](https://drive.google.com/file/d/134caQVizrG2YXVocYMkc7EDyl-bCLbBb/view?usp=drivesdk)
- [Mac (Intel + Apple Silicon) — 52,793,720 bytes](https://drive.google.com/file/d/1zalHngaLBpIneBi5CtjYy5_E1BcQFQ99/view?usp=drivesdk)

Quit old app, replace complete folder, reload extension and refresh AI tab. New app required. Live Arena/Studio owner confirmation remains. Source Public at delivery; owner reminded to restore Private in repository settings. Account API stays Public separately. No stable publish/feed changes; stable 1.24.29. Historical entries below are superseded by this delivery.

2026-10-30: online profiles/sign-in, per-profile data and settings/private-skills sync are included in the full verified 1.24.27 test builds. Owner approved the actual rectangular-profile/background design. CI 40989215099 / source 9c175eb passed Windows, universal Mac, Linux and browsers. Production signatures, reviewed source and official archive layouts verified; inner ZIPs delivered. Account API remains Public by explicit approval. Source repo is now PRIVATE, verified after owner restored visibility. Earlier integration visibility attempts were denied HTTP 403. Latest stable remains 1.24.26.

**Latest, 2026-10-30:** replacement full 1.24.27 test ZIPs delivered through Google Drive. CI [41085855952](https://github.com/stoveez/plazcode-source/actions/runs/41085855952), source `38fd7d2`, passed Windows, universal Mac, Linux and browsers. Includes profile pictures, bold Up to date, plus/approval icons, splash fade, parallel protected-file checks and ahead-of-stable update fix. Production signatures, all 235 reviewed JS sources and release layouts verified; actual downloaded Linux startup passed. Source remains Public at delivery; owner reminded to restore Private. Account API stays Public independently. Stable remains 1.24.26. [Verification](test-build-1.24.27-followups-verification.json).

## 1.24.27 test builds from `5465c3e` (2026-10-30, evening)
CI run [41157294450](https://github.com/stoveez/plazcode-source/actions/runs/41157294450) green (browsers, Windows, Mac, Linux). Earlier push-triggered runs failed only because GitHub billing blocked the jobs while the repo was Private. Inner zips (file lists identical to the previous 1.24.27 build, zip integrity tested) are on the owner's PC in `Downloads\x\Windows`, `\macOS`, `\Linux`. Windows 50,521,972 B, Mac 52,069,390 B, Linux 49,616,536 B. **Not on Google Drive:** no Drive connector was available in that session (Chrome upload is capped at 10 MB), so Drive links still need a session with Drive connected. Includes DSML tool calls, helper-name fixes, fast gap between tool calls (extension reload), plus the size-label fix and bridge diagnostics (new app needed).

# Test builds

Builds on the private repo are blocked by GitHub billing, so the repo is made **public only while a build or publish runs**, then private again. The owner flips visibility; AIs never do.

## Every time you are ready for a test build
1. Send the owner https://github.com/stoveez/plazcode-source/settings and walk them through the plan again in plain words (resend every time).
2. After they make it public, start the build on `claude/plazcode-dev`.
3. Send them the two lean zips as soon as the run ends, in the same message remind them to set the repo back to Private (Danger Zone, Change visibility, Private).
4. Repeat the reminder in later replies until it is private. Before stopping run `gh api repos/stoveez/plazcode-source --jq '{private,visibility}'`.

## The zips
**Fetching them (2026-10-25):** in the cloud session `gh run download` is refused (the artifact storage host `productionresultssa*.blob.core.windows.net` is blocked by the egress policy, 403). Do not work around it. Use the connected GitHub artifact download tool: it returns a Sediment-backed file URL. Download normally from that supplied URL, verify the artifact digest, extract the wrapper and deliver the INNER archive. The direct CLI storage denial remains; do not bypass it. The download_file helper has a 32 MiB limit, so large archives use the connector-supplied HTTP URL.

From the run's Artifacts: `plazcode-<version>-Windows-test-lean` and `plazcode-<version>-macOS-test-lean`. Send the **inner** zip (`PlazCode-1.24.25-test-lean.zip`, `PlazCode-macOS-1.24.25-test-lean.zip`), not GitHub's wrapper. It must be 1:1 with the real update zip (same files and layout; only `DEVELOPMENT.txt` is left out). It stays named "test". Say plainly which fixes are inside and whether an extension reload is enough.

If the Mac job is cancelled with "job was not acquired by Runner", re-run only that job every 20 minutes (`gh run rerun <id> --failed`).

Option: an AI on the owner's own Windows PC can build the Windows zip locally for free (`docs/HANDOFF.md`, "Option: build the test zip on the owner's own computer").

## 1.24.25 (2026-10-26)
The owner requested a direct release with no separate test build. Full platform/browser validation and the packaged Mac desktop gate passed; validated native bytes were published without rebuilding. No test zips were delivered.

## 1.24.26 (2026-10-28)
Owner requested direct release. Full production validation and packaged Mac desktop lifetime gate passed; validated bytes were published without rebuilding. No separate test zips were delivered.

## 1.24.27 delivered (2026-10-29)
Source `962899c`, full validation [40932400772](https://github.com/stoveez/plazcode-source/actions/runs/40932400772): Windows, Mac, Linux and browser jobs all passed. Inner Windows and universal Mac test ZIPs plus Linux x64 tar.gz delivered; Linux ZIP is also available. Full packages retain app + memory helper + Chromium/Firefox + root extension copies, with no extra development note or decoder maps. Replace/extract the complete folder, reload extensions and refresh AI tabs; the desktop changes require the new app too.

Includes: owner archive DeepSeek shared send queue (8–9.8 second completion-based spacing), accessible effort menus, three persistent approval modes in bar/Settings, composer-relative expanded/collapsed bar placement, Mac same-user stale-port recovery and visible static native Linux startup. Read-only/folder boundaries remain. Linux automatic updates have no published feed; use native x64 downloads. No stable 1.24.27 publication was requested/performed.

Every downloaded archive passed CRC/path/version/production-signature and exact reviewed JS source checks. Windows/Mac lists exactly match 1.24.26; Linux static executable/memory helper, permissions and ZIP/tar contents verified. See [sizes, hashes and full checks](test-build-1.24.27-verification.json). Exact signed Linux frontend also opened locally for the actual final screenshot; settings persistence/reload/reopen/Quit passed. Original user setups and live AI accounts remain untested.

Historical delivery visibility: the integration could not restore Private (HTTP 403). Owner subsequently restored it; source is now verified PRIVATE. PC vault folder is not connected.

## Profile test builds delivered (2026-10-30)
2026-10-30: online profiles/sign-in, per-profile data and settings/private-skills sync are included in the full verified 1.24.27 test builds. Owner approved the actual rectangular-profile/background design. CI 40989215099 / source 9c175eb passed Windows, universal Mac, Linux and browsers. Production signatures, reviewed source and official archive layouts verified; inner ZIPs delivered. Account API remains Public by explicit approval. Source repo is now PRIVATE, verified after owner restored visibility. Earlier integration visibility attempts were denied HTTP 403. Latest stable remains 1.24.26.

Actual remembered-login, separate-data and sync integration passed; owner approved the rectangular profile/gloss/full-background screen. Downloaded archives passed production signatures/source/layout checks; the actual signed Linux app passed bootstrap/profile-gate/reopen/Quit. [Full verification](test-build-1.24.27-profiles-verification.json). Quit/replace the desktop and extension before testing. Windows unsigned/Mac not notarized. Original user devices and live AI accounts remain untested.

## Working Drive downloads (2026-10-30)
Workspace links were not downloadable in the owner's client. Exact verified INNER ZIPs uploaded to the connected Google Drive; readback confirms names, MIME types and exact byte sizes. No rebuild, wrapper ZIP, new public sharing permission or stable release. Use Drive's Download action (the connected account owns the uploads).

- [Windows — 50,461,047 bytes](https://drive.google.com/file/d/1_7hBb-hxMA8ylgugYMz9xWvLIuSLjB0X/view?usp=drivesdk)
- [Mac — 51,989,456 bytes](https://drive.google.com/file/d/1DGNrZcK9KIoPDqKv2gbgX_31iaF3SKQS/view?usp=drivesdk)
- [Linux — 49,561,126 bytes](https://drive.google.com/file/d/1rakPW0e7kCBLJnWcEMoCX4OErlGEZBv2/view?usp=drivesdk)

Source is now confirmed Private. Keep the separately authorized account API Public.

## Startup/icon follow-up
2026-10-30 follow-up (not in the delivered ZIPs): replaced the font plus beside Create a new profile with a centered SVG badge and the approval-mode font arrow with the same geometric chevron as Effort. Loading and profile picker now overlap in one fade; the local picker no longer waits on update-network requests (native automatic updates remain independent). Actual screen/crossfade, approval browser, desktop regression and theme checks pass. Owner clarified the long delay is before any window; investigating native protected-file verification separately. Source stays Private. Replacement packages pending.

## Feature previews and test ZIP delivery (owner, 2026-10-30)
- As soon as each requested feature is ready, immediately show an actual screenshot or video of it running in PlazCode through Google Drive. Do not wait until every other feature, check or build is finished. No generated mockups or recreated preview pages.
- Upload the screenshot/video to the connected Google Drive, read back its metadata, and give the normal Drive file link so the owner can open/download it. This is the exact delivery method the owner approved. Workspace-only file links do not work in this client.
- Deliver test builds through Google Drive too: upload the exact verified INNER Windows/Mac/Linux ZIPs (app, memory helper and extensions; official layout), verify metadata/sizes, then give normal Drive file links and tell the owner to click Download. Do not substitute GitHub's artifact wrapper ZIP or silently change sharing permissions.
- Keep the source public-build/private-after-delivery rule. Keep the separately approved account API Public. No stable publishing is implied by a test-build request.

## Current follow-up
Plus/approval chevrons and splash crossfade implemented; native startup verification optimized without skipping checks. Ahead-of-stable update error fixed locally with 21 updater tests passing; Windows/Mac integration added to CI. Profile-picture JPEG/PNG/GIF implementation and real preview are complete. No replacement ZIPs yet; delivered Drive archives are still 9c175eb. Immediate actual preview and test ZIP delivery via Google Drive are now binding owner rules. See docs/NOW.md and startup-performance.md.

## Final local profile-picture/startup verification (2026-10-30)
Profile-picture/startup follow-ups now pass local verification: 234 native + 4 library tests, real account/picture two-install sync, actual PNG/JPEG/two-frame GIF upload/removal/rejection, actual i18n all 15 languages, UI/design/storage/approval and Linux startup. Bold sync status is in refreshed real Drive preview. Matching public account service deployed at source 1326d5e; live private picture sync and older-client retention passed. Full replacement Windows/Mac/Linux/browser CI 41085855952 is running after the owner made source Public; existing Drive test ZIPs are old 9c175eb and contain no follow-ups.

## Replacement picture/startup builds delivered (2026-10-30)
**Latest, 2026-10-30:** replacement full 1.24.27 test ZIPs delivered through Google Drive. CI [41085855952](https://github.com/stoveez/plazcode-source/actions/runs/41085855952), source `38fd7d2`, passed Windows, universal Mac, Linux and browsers. Includes profile pictures, bold Up to date, plus/approval icons, splash fade, parallel protected-file checks and ahead-of-stable update fix. Production signatures, all 235 reviewed JS sources and release layouts verified; actual downloaded Linux startup passed. Source remains Public at delivery; owner reminded to restore Private. Account API stays Public independently. Stable remains 1.24.26. [Verification](test-build-1.24.27-followups-verification.json).

- [Windows](https://drive.google.com/file/d/10qaWb1AFLdzU6QED-r0NOXku3NS0NDD_/view?usp=drivesdk)
- [Mac](https://drive.google.com/file/d/1n8DJGdxD1rILW82ONJ4B0i-ysAyfiQ7K/view?usp=drivesdk)
- [Linux](https://drive.google.com/file/d/1VQG_16WelXyyW2dqePdByokn-1BjhD9N/view?usp=drivesdk)

These replace the older 9c175eb Drive test ZIPs. Exact inner archives; Drive names/MIME/sizes verified. Quit the old app, replace the complete folder, reload extensions and refresh AI tabs. Desktop replacement is required. No stable publishing/feed changes.

## Fresh-window intro follow-up awaiting platform builds
Code removes initial locked-context reload, gates intro on native ready/visible paint, keeps desktop hidden underneath and retains full preview motion even with OS effects off by explicit owner choice. Earlier 38fd7d2 ZIPs lack this fix. Local UI/design/fresh Linux/native tests pass; native Windows/Mac GUI changes need full rebuild. Actual frontend preview: https://drive.google.com/file/d/1pcaZwlVlG7L5-SAcPchk8vY3_lEMuL-E/view?usp=drivesdk . Source is still Public from the authorized build window.

## 2026-11-01 source-archive and promotion audit
Owner explicitly does not want source ZIP distribution. Run 41335729270 cancelled before source upload. Packaging/promotion now generate no source ZIP; hash-only prepared-source proofs retain source/platform validation and CI excludes source ZIPs defensively. Sealed text uses a content-derived nonce under a separate key domain so identical packs match across platforms; changed contents use different nonces. Focused proof/sealing/promotion tests pass; full replacement CI/delivery pending. Existing GPL rights/obligations and old releases unchanged.

**Latest licensing decision (2026-11-01, supersedes earlier GPL-gap status):** owner confirmed ownership of all first-party code and rejected future GPL terms. First-party 1.24.30 is now proprietary (LICENSE / LicenseRef-PlazCode-Proprietary); current headers/Rust metadata/root/browser notices updated, normal user content/use retained. Old GPL releases and third-party licences remain. Root package notices now come from current source; dependency notices ship in runtime. No source ZIP distribution; no Luraph. See license-and-branding-review.md. Full replacement validation/test ZIPs pending.

**Current 1.24.30 preview:** actual running Luau Settings delivered via Drive: https://drive.google.com/file/d/1rbUnl6a1_yvHWqoslgic0UFr4wBG_-z1/view?usp=drivesdk . Full platform CI 41338413340 / source 3c73298 is running; browser job passed. Final test ZIPs not delivered yet.

**Current full build:** 41340463730 / 18fc3e2 includes normalized gzip and mandatory cross-platform sealed-content hashes. Local validation-key Linux packaging/desktop proof passes; those local files are not deliverables. Wait for exact verified production-key CI inner ZIPs.

## 2026-11-02 replacement build pending
Owner requested a NEW full Windows/Mac build containing shared DeepSeek protection, learning-noise guards, ordered batches, managed background terminal jobs and reduced optional-diagnostic waits. Previous 642207c ZIPs do not contain them. Final suite/CI/verification/Drive delivery required; stable remains 1.24.29. Read docs/NOW.md.

**2026-11-02 build status:** Windows native job 125278351729 in superseded CI 41445770394 passed all app/native/install/protection checks; Mac is packaging both architectures. Browser failure was the real page-boundary trim bug, now fixed at e068a0a and locally Chromium/Firefox verified. Start the NEW full run after these native caches finish; do not deliver the older packages. Final full local JS on 23e4967 passed 0 failures; framing-specific tests on e068a0a passed, native unchanged. Release-note draft now includes the exact added line: “Long tool results keep spaces and newlines at page joins instead of silently losing characters.” (Show revised final notes before any real release.)

## 2026-11-02 newest — final build dispatched
Final CI 41449512168 on 69a4f8c (program fix e068a0a) is running/pending. Explicitly cancelled superseded 41445770394 after its Windows/Mac native/install/packages passed. Do not deliver old packages: they lack the real result-page trim fix. Current draft release notes (1,619 UTF-16 chars) shown to owner; one subsequent added page-fix line also disclosed. Exact notes before every actual release are now a standing rule. New native/learning/batching features and real browser preview are checked as detailed in docs/NOW.md. Full local JS on 23e4967 passed 0 failures; framing-specific tests passed; final full JS rerun session15470 is running. Next: require final CI green, verify exact inner Windows/Mac packages from 41449512168, upload/readback Drive, update notes and remind owner Private after delivery. No stable publish.


**Final-source local JavaScript suite: 0 failures.** Full regression pass with the page-framing fix is complete (/workspace/plazcode-deepseek-audit/javascript-framing-final.log). CI 41449512168 browser job is GREEN, including new DeepSeek and batch approvals and formerly failing ClickUp paging. Native platform jobs remain in progress; no ZIP delivery yet. No program changes after e068a0a; CI source 69a4f8c.
