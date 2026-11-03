---
title: Open work and known bugs
updated: 2026-11-02
---
## 2026-11-02 — full follow-up Windows/Mac test ZIPs VERIFIED and uploaded for delivery
Full CI [41579556782](https://github.com/stoveez/plazcode-source/actions/runs/41579556782) ALL GREEN: Windows, universal Mac, Linux, browsers, final release-check. Run head **c3d60e0**; product **5870a11**. Later commits are notes only. Bootstrap intentionally skipped. Browser measurement fix preserves <=128 classifications for EVERY warm sweep, includes a fifth asynchronous pass, and rejects full-history negative control.

Exact INNER ZIPs: CRC/safe paths, production-key signatures, all **241 reviewed JS sources**, all three packaged extension copies, licences, native guest isolation markers (BOTH Mac slices), SHA256SUMS and **ZERO official file-list delta** verified. Windows Defender scan found no threats. Cross-platform release variant matches. Drive name/MIME/exact byte counts read back:
- [Windows](https://drive.google.com/file/d/1_g8XQe3PZqNuVDITQrB9GcCjlty0Isdp/view?usp=drivesdk): **51,141,450 bytes**, SHA256 **8ff2ed45fb482ae40e95244f1ed7835a508e76449a4a8056d850dd7625162a2f**.
- [Mac (Intel + Apple silicon)](https://drive.google.com/file/d/1tjswZxhqmpfczdjL1nSbVQFVHdak9k06/view?usp=drivesdk): **52,926,212 bytes**, SHA256 **42c7916784c2fbd2c4062e44a20ebf6ffb238f3b533487776b9b2c0c7da9a2cc**.

Includes guest/signup recovery plus later DeepSeek startup-warning, cross-site continuation, live readiness/loader/ChatGPT result/startup fixes and shared startup scope correction. Earlier anti-copy/Luau/Arena/selective learning/batches/jobs retained. No new native source changes in this follow-up. Quit app; replace all included files in existing PlazCode folder, preserve saved data/settings; reload included extension and refresh AI tabs. No live original account/PC timing claims. No stable publish/feed/main/release/visibility changes. Source still PUBLIC; delivery message must immediately remind Private at https://github.com/stoveez/plazcode-source/settings (Danger Zone, Change visibility, Private), repeat until private. Repo vault updated; PC vault folder not connected. [Machine-readable verification](test-build-1.24.30-followup-2026-11-02-verification.json). Previous 41574442126/41577920780 artifacts superseded; earlier guest ZIP links lack these newer fixes.

## 2026-11-02 — Windows follow-up package verified and uploaded; Mac/gate pending
Current full CI **41579556782**: Windows and browsers SUCCESS. Windows inner ZIP **51,141,450 bytes**, SHA256 **8ff2ed45fb482ae40e95244f1ed7835a508e76449a4a8056d850dd7625162a2f**. Production signatures/all 241 reviewed JS sources/native guest checks/SHA256SUMS/CRC/zero official layout delta PASS; Defender scan found no threats. Uploaded Drive ID **1_g8XQe3PZqNuVDITQrB9GcCjlty0Isdp**, name/MIME/exact bytes read back. NOT delivered yet; do not upload a duplicate. Record has actual link and hashes.

Mac is building Intel+Apple silicon; Linux passed BOTH full JS passes and is packaging. Wait ALL jobs and final gate green, verify Mac inner ZIP identically (both CPU slices), upload/readback, immediately deliver both links + Private reminder. No stable publication/visibility changes. Local staging: `/workspace/plazcode-followup-build-41579556782`. Product still 5870a11; run head c3d60e0 (test/notes only).

## 2026-11-02 — fresh full CI 41579556782 started
[Current full run](https://github.com/stoveez/plazcode-source/actions/runs/41579556782), head **c3d60e0**, runtime **5870a11** (only test/notes differ). Supersedes 41577920780; cancellation followed by force-cancel to release waiting capacity. Corrected performance measurement passes with five deliberate bounded sweeps; full-history negative control fails as required. All Windows/Mac/Linux/browser/release-check jobs still required; exact inner package verification and Drive delivery pending. No stable publication or visibility changes.

## 2026-11-02 — browser performance measurement corrected; replacement full build next
CI 41577920780 failed only the browser warm-sweep budget so far; reproduced locally: the measurement collected five bounded 120-turn sweeps (600 classifications) but compared them with a four-sweep allowance (512). Scheduled observer work remained active during the heartbeat window. Test now records EVERY actual sweep and requires each to classify at most 128 turns; deliberately schedules a fifth pass to exercise this interleaving. No product source changed from 5870a11.

Final local corrected check PASS at 64/512 turns (five 64/five 120 passes), all semantic/cache/Stop/no-replay checks retained. Negative control with full-history warm sweeps correctly FAILS: five 512-turn passes. Do not deliver 41577920780 artifacts; supersede it with a fresh full CI on this test correction. Require Windows/Mac/Linux/browser/release gate green, then verify exact inner signed packages and Drive readback before delivery. No stable publication/visibility changes. Product scope fix and earlier fixes preserved; prior e1236e0 verification stays superseded.

## 2026-11-02 — replacement build required: real-browser startup scope fix
Run **41574442126** on 7390d06 was cancelled/superseded (Mac cancellation needed force-cancel). Local full-core Chromium reproduced "startupFeedbackStages is not defined": the new helper and the older startup-memory readers were inside runToolImpl, invisible to startSession. Isolated extraction tests had hidden that real scoping fault. Relocated all three helpers into the shared startup scope; added AST owner-scope regression and retained failure banners in new-chat test diagnostics. Updated shared ClickUp simulated live-status/fresh catalogue fields and empty read-only startup-memory probes; Notion clipboard fixture now loads actual startup/health helpers and checks bridge-offline cleanup.

Focused scope/live-health/memory/combined-stage/full-access/pin checks PASS; whole-core new-chat ID test PASS, Notion startup in BOTH Chromium/Firefox (including disconnected bridge) PASS, full ClickUp core/browser matrix PASS. ClickUp full startup/refusal/Stop/lossless-context checks PASS in both engines. Final ClickUp result-paging check is running with corrected healthy status-poll fields; dispatch replacement full CI in parallel. Do not deliver cancelled run artifacts. Product runtime now changes from e1236e0; older source-only verification is explicitly superseded. Native code unchanged. No stable publication or visibility changes. [Build record](test-build-1.24.30-followup-2026-11-02.md).

## 2026-11-02 — owner requested fresh Windows/Mac test ZIPs
Workspace recovered with clean branch HEAD 3292a09. Product source **e1236e0**, unchanged in overlay. Owner explicitly requested new test ZIPs containing ALL later DeepSeek startup-warning, cross-site continuation, live-readiness/instruction-loader/ChatGPT result and startup fixes, plus existing guest/signup work. Full validation next on claude/plazcode-dev; production integrity-signed complete inner Windows + universal Mac lean ZIPs, exact published layout, Drive metadata readback required. No stable publication or visibility change. Source already Public; owner was given the Public-during-build / Private-after-delivery steps again. [Build record](test-build-1.24.30-followup-2026-11-02.md).

## 2026-11-02 — startup/bridge and ChatGPT fixes VERIFIED in source
249 local checks covered, **0 unresolved failures**: full sweep passed 246; three isolated VM tests missing the new helper were corrected and passed separately. Final fresh prepare + all three fixtures/protocol/learning/live-health/pins batch PASS (exit 0). Final product refinement only marks the correction as internal System note, excluded from user requests/learning; no second full sweep claimed. Sealed text: 1,066 identical outputs; 973 provider bodies, 588 guarded reads preserved. [Details](startup-bridge-and-results-2026-11-02.md), [verification](startup-bridge-and-results-2026-11-02-verification.json).

Live app/profile/engine/transport gate Ready; cached tools cannot fake health; instruction-loader errors have accurate recovery and bounded waits; reader schema/real JSON/bounded correction; duplicate memory refresh removed and small complete ChatGPT memory shares the list-result acknowledgement (30k/220-line/input bounds). Large memory, other providers and real Stop preserved. Native code unchanged, no new ZIP or stable publication, original affected PC trigger/live timing unconfirmed. Existing guest ZIPs lack all newer source fixes; reload updated signed extension + refresh tabs when packaged. Guest preview re-shown inline + Drive, PNG/849,416-byte metadata rechecked; guest still opens without login and persists separate local data. Repo vault updated, PC folder not connected. Source visibility/Private reminder before ending.

## 2026-11-02 — live readiness, instruction-loader and ChatGPT result/startup fixes WIP
Owner reports app-needed/unknown-message with app running, readiness without a connected agent, ChatGPT tool/result names as prose and a slow second command-list/startup step. Source changes drafted and focused tests PASS: live app/profile/engine/transport checks at startup boundaries; failed catalogue refresh explicitly marked cached and refused for startup; counts no longer prove engine health. Instruction loader has a deadline, one bounded read-only transient retry and accurate extension-worker recovery for unknown request, preserving integrity failures. Retained-result reader is advertised with schema/complete JSON and one bounded correction for a scoped exact bare reader name. Cached catalogue use skips duplicate memory refresh. Small complete ChatGPT memory combines with list result (one acknowledgement); large memory and other sites preserve acknowledged pages. ChatGPT own completed row actions work without optional outer article, real Stop stays authoritative.

Actual startup/loader/context/compact-provider/result/pagination/old provider startup/pin checks pass; 973 original provider function bodies preserved. Sealed-text proof: 1,066 prompt/help/skill outputs identical, 44 moved texts. Actual background-handler regression PASS; full JS pending. No native edits, live affected account/device tests, new build or publication. Original old-worker/mixed-folder trigger on user PCs unconfirmed. [Details](startup-bridge-and-results-2026-11-02.md). Current delivered guest ZIPs lack these and previous DeepSeek/continuation source fixes. Guest screen re-shown directly in chat and [Drive](https://drive.google.com/file/d/1SsFG3USw4BJMdpLtmX2zppbbhmDBERJV/view?usp=drivesdk); guest still opens instantly, persistent isolated local data, no password/cloud sync.

## 2026-11-02 — cross-site Continue project FIXED in source; full regression PASS
Reproduced three failures with real content scripts: an intervening startup-only chat vetoed the saved real work, leaving a tab before the 10-second save retained an older provider because focus was already lost, and a fresh-looking chat could offer its own handoff. All three now pass after the extension-only fix. Same-tab pagehide also captures before navigation; local publication is not blocked by a pending archive write. Startup-only visits no longer block actual saved work. Selected-source notes only, active-vault scoping, live note-state updates and new-project tombstone prevent unrelated or discarded context returning.

Targeted cross-site (both directions), pagehide, pending-save, self-exclusion, startup/opt-out/real-request/no-history, desktop restore/new-project and selected-note tests all PASS. Full local JS suite PASS, **0 failures**; /workspace/plazcode-continuation-followup/javascript.log. [Verification](continuation-cross-site-2026-11-02-verification.json). No live AI accounts tested. [Details](continuation-cross-site-2026-11-02.md). Current delivered guest ZIPs (52b9d19 / CI 41492949796) contain NEITHER this fix NOR the prior DeepSeek startup-warning fix. No new build or stable publication. Reload updated signed extension + refresh AI tabs when packaged; native app code unchanged.

## 2026-11-02 — DeepSeek false startup warning FIXED and verified in source
Final full local JavaScript suite: **0 failures** (/workspace/plazcode-deepseek-startup/javascript-final.log). Full provider Chromium/Firefox tests pass, including new URL before user row, paced Continue, trusted navigation/download distinction and Stop. Actual core reporter keeps expected owner cancellation quiet while draft/uncertain/pacing errors still warn. Existing shared request limits/leases and single-click/no-replay safeguards retained. 974 preserved function bodies, 588 guarded reads and updated pins pass. Initial full run's sole stale beacon assertion fixed, final full rerun green.

Fix is extension-only, NOT yet packaged into a new build; prior guest test links from 52b9d19 / 41492949796 lack it. No native edits or stable publication. Reload updated signed extension + refresh DeepSeek when packaged; current popup can be closed in this reproduced startup case. No live DeepSeek account used. Future stable needs new version after 1.24.30 and exact notes shown first. [Details](deepseek-startup-warning-2026-11-02.md), [verification](deepseek-startup-warning-2026-11-02-verification.json). Source visibility check/reminder before ending; never change it yourself.

## DeepSeek startup-warning final verification — 2026-11-02
Chromium/Firefox full provider tests pass on final navigation/download handling. Focused queue/pacing/DOM/preservation/pins pass. Full JS first sweep found ONLY test-v112 expecting the old beacon; updated it to the deliberately bumped startup-chat-id beacon. Final safe prepare/focused checks/full JS rerun next. No native edits, new builds or stable publication. Details: [startup warning](deepseek-startup-warning-2026-11-02.md). Prior guest test links do not contain this fix.

## 2026-11-02 — DeepSeek false startup warning WIP
Owner sees “Send paused / The send was cancelled because Stop was pressed or the chat/session changed” immediately after startup, while normal work continues. Reproduced with actual provider guard: first send changes the fresh chat URL before the user-message row arrives; waitSend treated that legitimate first identity as navigation and raised DEEPSEEK_CANCELLED after the one real click.

Overlay fix drafted: only after a single committed fresh-chat send, allow its first provisional route while waiting; require a NEW user row matching the actual sent text before adopting it. No second click/retry or pacing relaxation. Session/Stop/epoch changes and a second route still cancel; trusted in-tab navigation/back cancels explicitly. Expected owner cancellation gets a typed flag, remains a SendAbortedError/diagnostic and no longer shows the misleading error modal. Draft/uncertain/pacing errors still warn. Guard version beacon bumped. Added deterministic route-before-row, unrelated-row, post-commit Stop/session/second-route and actual core reporter tests; source-level checks pass. Chromium/Firefox earlier-route tests pass; newest trusted-navigation browser assertion and full JS pass pending. Protected main/deepseek pins updated.

No native changes, stable publication or new test build requested/launched for this report. Existing delivered guest ZIPs (52b9d19/41492949796) do NOT include this new extension fix. Reload updated signed extension + refresh DeepSeek when packaged; no native code update needed. Need focused browser/preservation/pacing checks then full local JS, update notes/push. Source remains subject to owner Private reminder after prior delivery; never change visibility yourself.

## 2026-11-02 — guest/signup full test builds VERIFIED and DELIVERED
Full CI [41492949796](https://github.com/stoveez/plazcode-source/actions/runs/41492949796), product source **52b9d19**, attempt 2: Windows, universal Mac, Linux, browsers and final cross-platform release gate ALL SUCCESS. Bootstrap intentionally skipped. Targeted Mac retry acquired ARM host after infrastructure capacity failure; app code unchanged. Intel host fallback is saved for future CI but not used by this successful run.

Exact INNER production-key Windows/Mac ZIPs verified: wrapper SHA/bytes, CRC/paths, signatures, all 241 reviewed JS sources, native formats, Guest UI AND native guard inside Windows executable and BOTH Mac CPU slices, all SHA256SUMS, legal notices, ZERO file-list differences against actual published 1.24.30. Drive names/MIME/exact sizes read back before immediate delivery. [Windows](https://drive.google.com/file/d/1r6WeDH-l-HpF1PZl9IdBwieFmJz6dmCp/view?usp=drivesdk): 51,130,687 bytes, SHA256 3595ca05f3cfd57f8804c0eace079699710fe3caf5e19d5b3bd5c0c0ca0e3031. [Mac](https://drive.google.com/file/d/173LbQ3vWPSxnNnYznUXi8GyNqauvPiep/view?usp=drivesdk): 52,881,981 bytes, SHA256 bd1960c526e7c59aca99ed311c44c567cece3b3a636e1ab0663a5c216087817b. Quit old app; replace all included files in existing PlazCode folder; reload extension/AI tabs. [Full verification](profile-creation-guest-2026-11-02-verification.json).

Persistent themed guest mode and reproduced signup/login recovery bugs fixed; valid remembered profiles retain local access on busy/offline service errors. Guest data stays local/separate and does not consume first-online legacy data. Actual running-app Drive previews were delivered immediately before full builds. Live public fresh synthetic signup/login/session passed, test sessions revoked. Owner confirms affected users ran PUBLISHED 1.24.30; cannot get their Logs, so the original host trigger remains unconfirmed. Need real-user confirmation, not more unrequested features. Earlier logs/version inference was corrected.

Source PUBLIC at delivery; owner reminded immediately to restore Private (settings → Danger Zone → Change visibility → Private). Never change visibility yourself; recheck before ending. Public account API stays Public separately. NO stable publication/main/release/feed changes by this task. Existing stable is 1.24.30, published earlier by existing workflow; future stable needs NEW version and exact revised release notes shown first. Existing 1.24.30 draft includes guest/recovery but must not overwrite the published version. Repo vault/handoff updated; no connected PC vault folder, no PC sync claim. Previous 69a4f8c ZIPs lack guest; these are the replacement links.

## 2026-11-02 — workspace restored; targeted Mac retry finishing original full run
Execution workspace disconnected after 13b7003 was pushed; provider reported running but tools had no usable connection. Owner reconnected it and files are intact. Through connected GitHub, retried Mac job 125441718492 after the full run ended. Attempt 2 of **41492949796** acquired an ARM Mac runner and passed app/profile/UI/authentication checks, now building both architectures. Windows, Linux and browsers passed. Runtime source is **52b9d19**, byte-for-byte unchanged in overlay at current HEAD; 13b7003 only changes future CI host selection/docs. Finish this same full run and use its verified packages if final gate passes; no new Intel full run is needed. Intel host fallback remains saved for future builds, unexercised by this retry.

Windows exact inner ZIP now verified: production signatures, 241 reviewed JS sources, SHA/CRC, Guest UI AND native sync guard present in executable, no layout differences against actual published 1.24.30 (3,084 files). Inner SHA256 3595ca05f3cfd57f8804c0eace079699710fe3caf5e19d5b3bd5c0c0ca0e3031, 51,130,687 bytes; not delivered pending Mac/final gate. Wrapper ID 13165794608, digest 441ce689201a88ca03110f602a609c04ec8b8090c17ee7ef189d555a1050509a / 51,131,492 bytes verified. Removed only the first failed release-check report artifact (13165859701) to prevent v4 upload name collision on successful retry; old job logs/summary remain. Next: full green, fetch/verify Mac including Guest presence in BOTH slices, upload both inner ZIPs via Drive, read metadata, deliver and remind Private. No stable release.

## 2026-11-02 — GitHub Mac runner capacity failure; Intel fallback
CI 41492949796 Mac job 125441718492 never acquired a runner (zero steps, runner_name empty). GitHub annotation: “The job was not acquired by Runner of type hosted even after multiple attempts”; three arm64 capacity notices. This is infrastructure, not a failing app check. Specific-job retry refused while run remains active (HTTP 403). Windows is installing/scanning its package, Linux near app packaging; let those finish/save caches.

Switched only validation workflow runs-on for the macos-latest matrix item to the officially documented macos-15-intel label (actions/runner-images README verified). Matrix name/conditions preserved; existing explicit x86_64 AND aarch64 builds/lipo packaging remain. YAML parsed and both target build commands asserted. Runtime source unchanged from 52b9d19, all local checks still valid. Push this workflow/doc change, then NEW full CI after active jobs finish; require all jobs green in new run and verify/deliver its exact Windows/Mac inner ZIPs. Do not deliver partial 41492949796. Stable already 1.24.30; no assistant publication.

## 2026-11-02 — final source 52b9d19; replacement full CI 41492949796 running
Final source **52b9d19**, full run [41492949796](https://github.com/stoveez/plazcode-source/actions/runs/41492949796). Full local Rust 5 library + 288 agent passed, 2 ignored; full JS 0 and final focused UI/storage/pin checks passed. Published 1.24.30 Windows AND Mac executables match prior 69a4f8c tests; exact official archive layouts are the new verification baselines (no file additions/removals expected). Public fresh signup/login/session succeeded; synthetic sessions revoked. Owner cannot get affected-PC Logs, so the original host trigger remains unconfirmed; no further log questions pending. Guest/persistent data and reproduced client failure paths fixed. Superseded 41488995618 cancelled/force-cancelled after Mac cancellation lingered; do not deliver its artifacts. All new platform jobs run on 52b9d19. Next: full green, exact inner ZIP signature/source/SHA/native/layout verification, Drive name/MIME/size readback and Private reminder. No stable publishing; existing stable is 1.24.30. Future stable release requires a NEW version.

## 2026-11-02 — published version corrected; final remembered-login preservation
Owner confirmed affected users run the RELEASED 1.24.30, during signup/login. Verified GitHub v1.24.30 published 15:27 UTC by existing workflow 41469911201 on release/1.24.30-publish / 69434ca; downloaded official Windows ZIP (51,145,646 bytes, SHA256 e76879ba98b1ff37575be73b024e2b9bfaa66c336572b3baa99476d24ec40d08). Its executable SHA256 919a2651f58ecbc00d3e56c9322a588a1c2ff5339aa6020697e545a2870de477 matches earlier 69a4f8c test executable exactly. Published accounts overlay has the same unsafe reuse-of-proof retry. Earlier assumption of an older app based only on screenshot wording was too strong and corrected with owner.

Live Public API fresh synthetic signup 201, fresh login/session 200, both test sessions revoked 200; no real user data touched. Historical host trigger remains unproven; asked for account.service Log lines from affected 1.24.30. New remembered-login review preserves valid cached local access for busy/rate/transport failures, without clearing token; new real-HTTP test added. This last Rust-only refinement needs final native rerun and supersedes CI 41488995618, which must be cancelled/replaced. All earlier local tests/actual guest preview passed; no more feature scope added. Current test ZIP version stays 1.24.30 for direct replacement; any FUTURE stable publication must use a NEW version, never overwrite released 1.24.30. No assistant publish/main/release/feed/visibility changes.

## 2026-11-02 — local guest/signup verification complete; final CI running
Program source **014b79d**, full CI [41488995618](https://github.com/stoveez/plazcode-source/actions/runs/41488995618). No duplicate push runs. All final local native tests pass (5 library + 287 agent, 2 ignored); full JS 0 failures, plus final CSS/UI/storage/extension checks. Exact screenshot wording maps to 1.24.29's non-JSON parser failure; old app did not log the host status. Current public API health/challenges/logins work. Historical reason for the host's unreadable reply remains unproven; affected version/time asked. Fresh-proof/recovery/rate-limit handling fixed without bypassing authentication. Guest works offline and persists separate data, preserving first-online original data. Actual app screenshot already delivered via Drive immediately. Require hosted CI green, then verify and deliver NEW inner Windows/Mac ZIPs through Drive; earlier 69a4f8c ZIPs lack guest. No stable publishing/API deployment/visibility changes. [Verification](profile-creation-guest-2026-11-02-verification.json).

## 2026-11-02 — final recovery review before fresh test build
Temporary single-hash busy replies renew proofs; exhausted quotas and host HTTP 429 now stop immediately instead of retrying. Non-JSON host access refusals retain their real HTTP status, and a host refusal cannot silently erase a valid remembered token. Added a fifth native regression for JSON/HTML rate-limit stop behavior. Final UI check including hidden guest/removal confirmation passed against overlay. Full native pass above predates this small last recovery refinement; rerun after active full JS completes and prepare is safe. Actual native guest/restart/isolation and earlier recovery cases passed. Source is Public for the owner-authorized new Windows/Mac test build; skip-ci push then explicit dispatch, never stable publish.

## 2026-11-02 — guest/signup follow-up implemented, final tests/build next
Guest settings/skills/memory persist locally, separate from online accounts; themed exact-text fallback works with account service unavailable and makes no cloud calls. Safe signup recovery uses fresh proofs and password-verified login after ambiguous replies. All native tests (5 library + 286 agent, 2 ignored), actual native+Worker account/guest restart/isolation and account service tests passed. Actual native UI preview already delivered through Drive immediately. Full JS running; focused final UI hidden-control CSS check pending; next fresh full platform CI and verified Windows/Mac Drive ZIPs. Historical tester outage not conclusively identified: current public API checks pass; asked for version/time. Details: [profile follow-up](profile-creation-guest-2026-11-02.md). No stable publish or API deployment.

## Profile creation and guest follow-up — WIP, 2026-11-02
Native client now preserves service-busy errors, renews single-use proof before retry, and authenticates with the same password to recover a registration whose response was lost. A duplicate username never grants access without the password. Current public API health/challenges and two nonexistent-account logins succeeded; historical screenshot outage not proven by available logs. The server's deliberately single-hash guard does return 429 under local overlapping work; the client previously collapsed that into generic unavailable. Do not call this proof of the original user's specific outage. No production account data accessed, no accounts created.

Persistent guest identity/UI drafted: dedicated UUID/root, fresh session epoch, no first-owner/legacy migration, no cloud sync, normal profile switching/permissions. Exact themed guest-card text is in creation and picker screens. Native/unit/browser/persistence tests and actual running-app Drive screenshot still required. No account API deployment or stable publication. Full earlier test ZIPs remain delivered; new follow-up not included there.

## 2026-11-02 — replacement builds delivered; profile follow-up started
Full CI [41449512168](https://github.com/stoveez/plazcode-source/actions/runs/41449512168) on **69a4f8c** (program fix e068a0a) passed every required job. Exact inner Windows/Mac ZIPs verified for production integrity signatures, reviewed sources, SHA/CRC/native formats and official layout; Drive names/MIME/sizes read back. [Windows](https://drive.google.com/file/d/1HHaShdR5yxIfJRFwQYPg6TuTGFUkTfTc/view?usp=drivesdk), [Mac](https://drive.google.com/file/d/1CwVf62R3_c08xJA6Ta785AoRSpxo65BV/view?usp=drivesdk). Details/hashes: [verification](deepseek-workflow-1.24.30-2026-11-02-verification.json). Both app and extension replacement required. No stable publication. Original user devices/live AI/Studio not tested.

**New owner request:** find root cause of profile creation failures; add a themed guest fallback saying exactly “Can't create a profile right now? Use PlazCode as a guest.” Owner chose persistent local guest settings/skills/memory, separate from online profiles, no cloud sync. Inspect server logs and native request handling first; implement isolated guest sessions through normal profile safety and show actual running-app screenshot through Drive immediately when ready. No code changes for this follow-up yet. Account API confirmed active/Public; source repo still Public after ZIP delivery, owner reminded to restore Private. Never change visibility yourself. PC vault folder not connected.

**Current 2026-11-02:** DeepSeek safeguards, selective learning, ordered batches and managed background jobs implemented. Local Rust 287 passed, 2 ignored; focused browser/provider/learning checks passed. Full local JS passed. CI 41445770394 exposed real result-page whitespace loss; fixed and Chromium/Firefox verified, new full CI 41449512168 on 69a4f8c running/pending; NEW verified Windows/Mac Drive delivery still pending. No stable publish. Exact release-note preview must be shown before every future release. [Follow-up plan](deepseek-safety-followup-2026-11-02.md). Older completed build 642207c/41367670135 is delivered; its ZIPs do not contain this follow-up. Historical entries below remain for reference.

**Newest, 2026-10-30:** tool-call consistency fixes (DeepSeek DSML calls, extras' result names, `env_info`/`list_dir`, unknown-command suggestions, desktop size units) and the shorter gap between tool calls (all sites except DeepSeek; not measured live). Bridge drops: the trigger is unconfirmed; diagnostics are in, and the tester's next Terminal lines are needed ([bridge-stability](bridge-stability.md)). See [tool-call-consistency](tool-call-consistency.md). Not in any test zip; live DeepSeek not tested.

**Latest, 2026-10-30:** replacement full 1.24.27 test ZIPs delivered through Google Drive. CI [41085855952](https://github.com/stoveez/plazcode-source/actions/runs/41085855952), source `38fd7d2`, passed Windows, universal Mac, Linux and browsers. Includes profile pictures, bold Up to date, plus/approval icons, splash fade, parallel protected-file checks and ahead-of-stable update fix. Production signatures, all 235 reviewed JS sources and release layouts verified; actual downloaded Linux startup passed. Source remains Public at delivery; owner reminded to restore Private. Account API stays Public independently. Stable remains 1.24.26. [Verification](test-build-1.24.27-followups-verification.json).

# Open work

**Newest 2026-11-01 (Claude):** CI 41342349857 on 936a302 PASSED on every platform and release-check (mark `31ff5250ca8f5bbe` matching on all three). Package download/verify-delivery/Drive upload not possible from the cloud workspace; owner downloads from the run page. See [verification](test-build-1.24.30-verification.json).

**Handoff 2026-11-01:** final source 936a302, full CI 41342349857 (then running). Coding/targeted checks complete, final archive verification + Drive test ZIP delivery unfinished. See [exact handoff](handoff-1.24.30-2026-11-01.md). Source remains Public during build; owner restores Private after delivery.

**Latest 2026-11-01:** first-party 1.24.30 proprietary terms implemented by owner confirmation; no source ZIP distribution; current notices and dependency licences retained. Full local JS 0 failures, replacement CI 41338413340 / 3c73298 running, browsers passed. Actual Luau Settings Drive preview delivered; verified test ZIPs pending. Older dated entries below are historical.

**Current 1.24.30 audit (2026-11-01):** full JS passed; anti-copy configured native and signed integration passed before final fixes. Interrupted Luau checks/profile isolation fixes pass native 268 + 5 with real LSP. Zero-variant/boolean-layout promotion refusal passes negative tests. Optimized/hosted validation and packages pending. Release notes cover Luau/MiMo/Arena. See [gap review](1.24.30-gap-review.md) for confirmed fixes and remaining scope/device/licence gaps. Older dated entries below are historical; stable is 1.24.29.

- 2026-10-31: a tester's Microsoft Defender blocked the published PlazCode-1.24.29.zip as "Trojan ... executes commands from an attacker" (cloud machine-learning verdict; our offline CI Defender scan of the same package found nothing). Found: the package carried `starter-skills/syphodev/install.ps1` (-ExecutionPolicy Bypass, never used by PlazCode), the updater script compiles C# at runtime (Updater-Progress.cs via Add-Type), and PlazCode.exe holds its full command list (process_kill, key_type, mouse_click, screen_record, download_file, launch_app) as plain text, which reads like a remote-access tool. 1.24.30: installers removed from downloads; CI Defender now scans with cloud checks (no sample upload) on the dev zip, the test zip and every file, and fails with the detection name. Owner chose no Microsoft false-positive report. Next: act on what the cloud scan names. Also in 1.24.30 (owner said yes): the app's command names, descriptions and taskkill/PowerShell lines are stored scrambled (`agent/src/hidden.rs`); names only compared are stored as fingerprints. The CI cloud scan of 1.24.29 and of the 1.24.30 builds found nothing, so the fix cannot be proven before testers download it.

- 2026-10-31 (1.24.30, unverified live): random "Desktop bridge disconnected" notices. Four causes fixed (see [bridge-stability.md](bridge-stability.md)); needs a tester's PC to confirm the notices stop. If one still appears, ask for the Logs page lines around `bridge.quiet` / `bridge.socket_closed`.
- 2026-10-31 (1.24.30, unverified live): Mac fresh-download start fix needs a real quarantined download on a Mac (CI cannot open a quarantined unsigned app). Official-extension pairing needs a check on Edge/Brave and on a Mac Chrome install (Windows Chrome IDs verified). Folder clean-up needs one real old install to confirm only leftovers go.

**Current profile delivery:** 2026-10-30: online profiles/sign-in, per-profile data and settings/private-skills sync are included in the full verified 1.24.27 test builds. Owner approved the actual rectangular-profile/background design. CI 40989215099 / source 9c175eb passed Windows, universal Mac, Linux and browsers. Production signatures, reviewed source and official archive layouts verified; inner ZIPs delivered. Account API remains Public by explicit approval. Source repo is now PRIVATE, verified after owner restored visibility. Earlier integration visibility attempts were denied HTTP 403. Latest stable remains 1.24.26. See [profile feature](desktop-profile-sign-in.md) and [archive verification](test-build-1.24.27-profiles-verification.json).

**Current 2026-10-29:** 1.24.27 full test builds delivered. CI 40932400772 / 962899c passed Windows, Mac, Linux and browsers. Archive/signature/source/version/layout verification complete; Windows/Mac exact current release file lists. See [verification](test-build-1.24.27-verification.json). DeepSeek pacing, effort clipping, approval controls, bar alignment and Mac/Linux startup fixes are in these test packages. Original user devices and live AI accounts remain untested. Release-note metadata records completed test delivery; the stable feed stays at 1.24.26.

**Visibility resolved:** source is now PRIVATE, verified after owner restored it. Account API stays Public independently. PC vault folder is not connected.

The dated progress entries below record earlier stages and are superseded by this delivery status.


- 2026-10-29: owner requested full 1.24.27 test builds. Source is PUBLIC for the owner-authorized build window; final scope includes approval menus, composer alignment, effort clipping and Linux visible startup. Visibility API denied (403); request sent. Deliver both verified inner lean ZIPs with apps and Chromium/Firefox, then restore Private. No public release authorized by this test-build request.

- 2026-10-29: 1.24.27 initialized, incorporating the actual owner-uploaded DeepSeek guard. Fast follow-ups observe an 8–9.8 second completion-based cooldown, sliced waits and forwarded options. Local targeted/version/package checks passed, including three-copy parity, provider preservation, locales, Ultra and promotion guards; full production CI and live DeepSeek remain. Historical 1.24.26 overlay restored to its released provider baseline. Source is now PUBLIC for the authorized build window.

- 2026-10-29: DeepSeek shared send queue implemented and locally verified; unreleased. Covers direct UI sends, completion-based eight-second pause plus jitter for fast replies, diagnostics and failure recovery. See [DeepSeek pacing](deepseek-send-pacing.md). Next signed version/build and live DeepSeek verification remain. Source is now PUBLIC for the authorized build window.

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

## Anti-copy implementation authorized (2026-10-31)
Owner requested implementing anti-copy-plan.md. Inspected existing protection, packaging, CI and promotion. Planned compatibility: signed core variant record, unchanged manifest schema and updaters; derived per-version variant from existing release key. No code implemented yet. Luau analysis request is additional; stage/policy/version answers pending.

- Anti-copy WIP: variant-compatible Node/Rust text-pack format and seeded hidden text written; three-layout/foreign-variant/tamper Node tests pass. Native tests running; packaging/canaries/CI and all three requested Luau stages remain. Not shippable.

- 2026-11-01: anti-copy resumed; independent checks, CI/native/packager descriptor checks, cross-platform promotion guard and private-function mangling implemented. Node checks pass; full native/signed/hosted validation and licence/takedown documents pending. Current Luau/MiMo/Arena changes retained.

## Anti-copy validation status (2026-11-01)
Native configured-variant 268 + 5 tests and optimized signed-app end-to-end pass. Node protection/variant and 1,066 byte-identical prompt/help/skill outputs pass. Promotion fixture updated to include descriptors and reject cross-platform mismatches. Licence/branding and takedown documents complete. Full JS passed; final Mac path compatibility and broader Luau lifecycle fixes need fresh native/hosted validation and test ZIP delivery. Public release not authorized.

## 2026-11-01 source-archive and promotion audit
Owner explicitly does not want source ZIP distribution. Run 41335729270 cancelled before source upload. Packaging/promotion now generate no source ZIP; hash-only prepared-source proofs retain source/platform validation and CI excludes source ZIPs defensively. Sealed text uses a content-derived nonce under a separate key domain so identical packs match across platforms; changed contents use different nonces. Focused proof/sealing/promotion tests pass; full replacement CI/delivery pending. Existing GPL rights/obligations and old releases unchanged.

**Latest licensing decision (2026-11-01, supersedes earlier GPL-gap status):** owner confirmed ownership of all first-party code and rejected future GPL terms. First-party 1.24.30 is now proprietary (LICENSE / LicenseRef-PlazCode-Proprietary); current headers/Rust metadata/root/browser notices updated, normal user content/use retained. Old GPL releases and third-party licences remain. Root package notices now come from current source; dependency notices ship in runtime. No source ZIP distribution; no Luraph. See license-and-branding-review.md. Full replacement validation/test ZIPs pending.

- Platform dependency-notice collection passes for Linux/Windows/both Mac architectures; replacement full CI is next. First-party terms are proprietary by owner confirmation, older GPL rights and third-party notices retained.

- Browser CI caught the Ultra adapter template retaining the old first-party SPDX header after output changed; template fixed and pinned as an input. No UltraLab third-party content changed. Replacement validation required.

- Final local JS suite after the first-party licensing changes: 0 failures. Replacement full CI 41338413340 / source 3c73298 is running; archive and Drive-delivery gates remain.

**2026-11-01 final sealing audit:** zlib writes an OS-specific gzip header byte (10 Windows, 19 Mac, 3 Linux). Normalize it to 255 before content-based nonce derivation, so matching source produces identical sealed packages across systems. CI now compares public sealed-content SHA256 reports for all three platforms, in addition to matching variant descriptors. Divergent/missing/malformed proofs are tested and refuse readiness. Node layout/text-parity and optimized signed native integration pass; final corrected-source full build next.

- Corrected source 18fc3e2 is running in full CI 41340463730. Local validation-key package build and real Linux desktop checks pass (49,994,881 bytes; 3,075 files), no source ZIP created. Only production-key CI inner ZIPs may be delivered.

**Final first-party header sweep:** expanded from selected extensions/exact first-line prefix to all file headers, including BOMs, CSS comments and later header lines. Corrected residual animation/CSS/build-tool/test headers and the old maintainer-source README. Third-party and historical snapshots remain unchanged. Licence/protection/desktop/source-preparation checks pass; final exact-source platform build still required.

- Codex resumed 4f0b060: investigate three JS failures before fresh CI, then Luau timeout and Arena tool recognition/flat arguments/latency. Owner supplied another raw-Lua screenshot. See evening handoff and NOW for current state; previous build-delivery entries are historical.

- Follow-up step 1: full local JS suite 0 failures (both Notion tests pass unchanged); v115 has 7 identical legacy failures on 936a302/current and remains intentionally excluded. No runtime regression reproduced. Fresh CI and Luau/Arena fixes next.

- 2026-11-02 follow-up: Luau timeout/setup/fallback fix passed 9 targeted and full native tests (5 + 271 passed, 2 ignored). Arena stall, raw code, accidental recovery-as-user-stop and tool argument/latency fixes in progress; final CI/test ZIPs still pending.

- 2026-11-02 Arena follow-up: recovery clicks now preserve the task; long/open command masking, history read caching and one-time owned-chip repair passed real provider/core fixtures. Live Arena profiling remains unverified. Flat argument/schema repair and final full build next.

- 2026-11-02 C2: schema-aware flat/path argument repair, explicit conflict rejection, compact Arena structural catalogue/full targeted reference and phase timing diagnostics passed targeted tests. Full JS/final CI and verified Windows/Mac delivery pending.

- 2026-11-02 final Arena edges: old command text cannot trigger recovery for a new thinking reply, and flat JSON special keys stay plain data. Targeted regressions plus real Chromium/Firefox Stop/masking/cache fixtures pass. Superseded CI 41366559677 cancelled; refreshed full CI/delivery next.

- Current checkpoint 2026-11-02: program source 6421eab, full CI 41367055432 running; all requested code/targeted tests passed. Local full sweep still on 15803a5; prepare latest after it ends before package verification. Verified inner Windows/Mac Drive delivery remains; no stable publishing authorized.

- Post-change full JS found six failures; fixed one flat-server safety regression, new Arena guarded reads and missing dependencies in four extracted-handler fixtures. All six/new Arena/preservation/pin checks pass; full rerun/fresh CI/delivery next. 41367055432 cancelled.

- 2026-11-02 verification: corrected full JS suite 0 failures on program source 642207c; both original Notion tests and six intermediate failures pass. CI 41367670135 browsers green, native/package/release-proof gates pending. Drive delivery next.

- **Completed 2026-11-02:** program source 642207c, full CI 41367670135 all required jobs green; corrected full local JS 0 failures. Luau timeout + Arena Stop/raw text/history/argument/latency fixes verified. Exact inner Windows/Mac ZIPs verified and delivered through Drive with metadata readback; evidence/links/hashes in followup-1.24.30-2026-11-02-verification.json and NOW. Owner live Arena/Studio test next. Source still Public at delivery; owner reminder to restore Private. No stable publication or assistant visibility change.

## 2026-11-02 workflow follow-up (WIP)
DeepSeek shared pacing and selective learning guards: native suite and focused JS passed, full checks pending. Owner added batching/background terminal jobs and slow non-DeepSeek workflows before replacement test builds. Implementation and focused corrections pass, including full local Rust and Chromium/Firefox fixtures; final full JS/CI/build delivery pending. Not delivered or published. Track docs/NOW.md and deepseek-safety-followup-2026-11-02.md.
