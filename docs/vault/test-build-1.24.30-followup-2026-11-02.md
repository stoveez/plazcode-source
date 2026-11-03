---
title: Full follow-up test ZIPs after guest delivery
updated: 2026-11-02
---
## 2026-11-02 — Windows follow-up package verified and uploaded; Mac/gate pending
Current full CI **41579556782**: Windows and browsers SUCCESS. Windows inner ZIP **51,141,450 bytes**, SHA256 **8ff2ed45fb482ae40e95244f1ed7835a508e76449a4a8056d850dd7625162a2f**. Production signatures/all 241 reviewed JS sources/native guest checks/SHA256SUMS/CRC/zero official layout delta PASS; Defender scan found no threats. Uploaded Drive ID **1_g8XQe3PZqNuVDITQrB9GcCjlty0Isdp**, name/MIME/exact bytes read back. NOT delivered yet; do not upload a duplicate. Record has actual link and hashes.

Mac is building Intel+Apple silicon; Linux passed BOTH full JS passes and is packaging. Wait ALL jobs and final gate green, verify Mac inner ZIP identically (both CPU slices), upload/readback, immediately deliver both links + Private reminder. No stable publication/visibility changes. Local staging: `/workspace/plazcode-followup-build-41579556782`. Product still 5870a11; run head c3d60e0 (test/notes only).

## 2026-11-02 — fresh full CI 41579556782 started
[Current full run](https://github.com/stoveez/plazcode-source/actions/runs/41579556782), head **c3d60e0**, runtime **5870a11** (only test/notes differ). Supersedes 41577920780; cancellation followed by force-cancel to release waiting capacity. Corrected performance measurement passes with five deliberate bounded sweeps; full-history negative control fails as required. All Windows/Mac/Linux/browser/release-check jobs still required; exact inner package verification and Drive delivery pending. No stable publication or visibility changes.

## 2026-11-02 — browser performance measurement corrected; replacement full build next
CI 41577920780 failed only the browser warm-sweep budget so far; reproduced locally: the measurement collected five bounded 120-turn sweeps (600 classifications) but compared them with a four-sweep allowance (512). Scheduled observer work remained active during the heartbeat window. Test now records EVERY actual sweep and requires each to classify at most 128 turns; deliberately schedules a fifth pass to exercise this interleaving. No product source changed from 5870a11.

Final local corrected check PASS at 64/512 turns (five 64/five 120 passes), all semantic/cache/Stop/no-replay checks retained. Negative control with full-history warm sweeps correctly FAILS: five 512-turn passes. Do not deliver 41577920780 artifacts; supersede it with a fresh full CI on this test correction. Require Windows/Mac/Linux/browser/release gate green, then verify exact inner signed packages and Drive readback before delivery. No stable publication/visibility changes. Product scope fix and earlier fixes preserved; prior e1236e0 verification stays superseded.

## 2026-11-02 — replacement full CI 41577920780 RUNNING
[Current run](https://github.com/stoveez/plazcode-source/actions/runs/41577920780), final runtime/head **5870a11**. All local whole-core Chromium/Firefox startup/refusal/Stop/multipart and exact retained-result paging checks PASS, including new-chat address assignment, disconnected-bridge cleanup and once-only operation dispatch. AST guard proves all startup helpers share startSession's scope. First run 41574442126 is cancelled/superseded; no artifacts from it may be delivered. Prior e1236e0 source verification marked superseded after whole-browser scope failure.

Wait for ALL required jobs green, then exact inner production-signed Windows/Mac ZIP source/signature/CRC/SHA/native/official-layout verification and Drive name/MIME/size readback. No stable release/visibility/native-source changes. [Build verification](test-build-1.24.30-followup-2026-11-02-verification.json).

# Windows and universal Mac follow-up test ZIPs
Owner explicitly asked to build the test ZIPs. Earlier attempt could not launch because the execution workspace went offline; no run was started. Workspace is now connected again, clean branch claude/plazcode-dev at 3292a09, final runtime source e1236e0 (overlay diff empty).

Build full validate-1.24.30.yml on this branch, no browser-only/key-bootstrap inputs. All required Windows/Mac/Linux/browser/release gate jobs must pass. All 249 JS checks will run in CI with the corrected fixtures. No stable publication/version/feed changes. Source stays Public only for the build window; never change visibility yourself; remind Private immediately after delivering both ZIPs.

Include guest/signup recovery, DeepSeek startup-warning fix, cross-site continuation and latest live readiness/instruction loading/ChatGPT retained-result and compact startup fixes. Existing guest ZIPs from 52b9d19 do not contain those later fixes.

When green: download exact inner Windows/macOS test-lean ZIPs; verify wrapper SHA/size/CRC/paths, production signatures, current reviewed source hashes in all extension copies, guest native presence/both Mac CPU slices, SHA256SUMS and zero file-list delta against actual published 1.24.30 ZIPs. No source ZIPs or unsigned extension patch. Upload through Drive and read back name/MIME/size before delivery. Runtime source unchanged, tests only; no live original PC/account or startup timing claim. PC vault folder not connected.

## Replacement after whole-browser startup regression
## 2026-11-02 — replacement build required: real-browser startup scope fix
Run **41574442126** on 7390d06 was cancelled/superseded (Mac cancellation needed force-cancel). Local full-core Chromium reproduced "startupFeedbackStages is not defined": the new helper and the older startup-memory readers were inside runToolImpl, invisible to startSession. Isolated extraction tests had hidden that real scoping fault. Relocated all three helpers into the shared startup scope; added AST owner-scope regression and retained failure banners in new-chat test diagnostics. Updated shared ClickUp simulated live-status/fresh catalogue fields and empty read-only startup-memory probes; Notion clipboard fixture now loads actual startup/health helpers and checks bridge-offline cleanup.

Focused scope/live-health/memory/combined-stage/full-access/pin checks PASS; whole-core new-chat ID test PASS, Notion startup in BOTH Chromium/Firefox (including disconnected bridge) PASS, full ClickUp core/browser matrix PASS. ClickUp full startup/refusal/Stop/lossless-context checks PASS in both engines. Final ClickUp result-paging check is running with corrected healthy status-poll fields; dispatch replacement full CI in parallel. Do not deliver cancelled run artifacts. Product runtime now changes from e1236e0; older source-only verification is explicitly superseded. Native code unchanged. No stable publication or visibility changes. [Build record](test-build-1.24.30-followup-2026-11-02.md).
