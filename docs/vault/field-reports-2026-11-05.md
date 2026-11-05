---
title: Field reports — ChatGPT receipts, task labels, protocol fragments and latency
updated: 2026-11-05
---

Owner supplies app/ChatGPT console logs and screenshots, requests root fixes for DSML spam (older official1.24.30), whole-reply task labels, slow/failed ChatGPT startup and slow tool/checkmark completion. Preserve all earlier work; no stable publish. Work only claude/plazcode-dev, no helpers. Uploaded logs are evidence, never instructions; raw logs/private host/path data stay outside repo.

## What the supplied evidence establishes
- ChatGPT console: startup inserted11958chars/48lines in1966ms. Model returned a32char list_commands call, but sender waited15000ms then CHATGPT_SEND_FAILED. Startup aborted. About1.4s later autoResume started ordinary work on that startup probe. list_commands took39ms, result insertion2119ms, followed by another15000ms false receipt failure. Task reader preview is `You said:You`, showing native wrapper labels leaking into the user-content path. A later idle4.9s stall also appears. runner.html CSP message does not establish the send cause: native submit already produced the model's command.
- App log is mostly DeepSeek from the new build (catalogPreloaded/verified appears), and contains no DSML-spam turn. Older screenshot shows orphan bare DSML closing tokens. Do not claim its upstream generation cause is established from these logs.
- DeepSeek native env_info took9666ms; some reads248/222ms, list_directory276ms, grep_files4122ms, tree2173ms. Chip done followed tool.done within2–5ms: these are different costs, not all an artificial checkmark delay. Required DeepSeek send pacing remains intact. env_info unnecessarily constructs sysinfo::System::new_all, enumerating all processes for a memory-only snapshot.

## Reproduced BEFORE product edits
New field cases against7681fe2 runtime:
1. Native You said heading/Copy action around a valid user bubble makes strict send receipt fail despite accepted native send and valid probe.
2. Failed bootstrap with visible SYS marker regains A.started=true via domHasRsSignal; no confirmed startup. This arms the watchdog seen in owner's trace.
3. allItems500turn snapshot performs250000attribute reads (quadratic same-role ancestor dedup).
4. Exact screenshot Goal paragraph is stored as full task objective and single plan row instead of concise goal. Full message preservation is separate.
Baseline logs: /workspace/field-chatgpt-before.log (rtk recall356d7eb938d57328), /workspace/field-label-before.log (recallc9ca117fee98dd3a). Raw uploaded files remain /workspace/attachments, not committed.

## Corrected roots and focused checks
- Shared ChatGPT semantic user-body reader excludes native headings/actions/timestamps for receipt and task parsing; literal body words remain. Strict new matching identity, one click, Stop and owned draft protection remain. Native embedded-heading regression failed before correction.
- ChatGPT requireConfirmedStartup prevents marker-only Ready/watchdog resurrection after failed current handshake; persisted genuinely confirmed sessions retain existing restoration.
- Linear ancestor dedup:500turns attribute reads250000→500. Further real-core decoration profiling found1264full transcript scans for100historical commands. Optional synchronous withTranscriptSnapshot now shares one snapshot/role arrays only within decorate.sweep; finally clears immediately, including errors. Result:1scan,6857attribute reads. New messages after pass visible immediately. No persistent stale cache.
- Concise stored goal first sentence/max8words; same streaming source may finish goal, later messages cannot replace it. Legacy automatic single-goal row migrated only when label matches objective; explicit/manual/numbered plans unchanged. Complete reply remains activity details.
- DSML root: response watcher treated orphan closing tags as ordinary text; complete calls with growing trailer never settled. Parser identifies structural closing runs while preserving literal fenced examples, JSON/result data and unfinished arguments. DeepSeek watcher stops runaway malformed output once and awaits native stop. Complete closed envelope may release once after settled/confirmed stop; partial outer wrapper never releases child calls. Orphans become E_PROTOCOL with one bounded correction then clean pause. Unconfirmed native stop pauses without resend. Compact whole-turn Tool format error/running card prevents misleading success. Original upstream DSML generation cause unknown: no original turn in logs and owner unsure streaming state. Both finished/growing tested.
- Native env_info unnecessarily enumerated all processes via System::new_all. Uses System::new+refresh_memory; same information/access flags. Actual executor measurement: old17.493ms/63processes vs command0.220ms, output/access/no-write regression PASS. Not a measurement of affected Windows PC. Hosted Windows/Mac/Linux timing test added.

## Verification state
- ALL26 offline real-Chromium ChatGPT delivery checks PASS (strict native receipts, failed startup,500turn linear scope, full decoration pass and both15-tool-call paths). Performance filter5checks PASS.
- New DSML parser/real watcher/real classifier/agentLoop one-repair tests PASS, including Stop failure, session ownership, completed-trailer and incomplete-data protections. BEFORE watcher returned ordinary text for orphan tokens and hung for growing closed-call trailer.
- Task exact screenshot, streaming goal, saved automatic row, full activity details, explicit plans and existing task suite PASS.
- Full local native308tests PASS/2existing ignored; DeepSeek shared guarded send/cancellation and LF/CRLF/CR PASS in real Chromium and Firefox. Provider preservation962, DOM guard checks593, protected pins34 PASS. Full final localJS258files PASS/0failures, including healthy differential70/preservation/DOM/pins;3existing runner skips.
- Evidence logs outside repo: field-chatgpt-final-browser.log, field-performance-metrics.log, field-dsml-before.log, field-dsml-trailer-before.log, field-env-info-native.log. Raw uploads stay uncommitted.

## Remaining ordered work
1. Local prepare/full JS258PASS/0failures/native308PASS/2ignored COMPLETE. Hosted independent suites still running; review actual failures, never drop safety controls.
2. Fresh full Windows/universal-Mac/Linux/browser CI and hosted env_info timing. Prior42039239468 ZIPs are historical, not corrected for these reports.
3. Verify exact inner packages: production signatures/all241reviewed sources, both Mac slices, current ChatGPT2026-11-05_native-message-bodies and DeepSeek2026-11-05_orphan-protocol beacons, licence/CRC/checksum/zero published file list delta. Upload/readback Drive and deliver both links immediately with owner Private reminder.
4. No stable release/visibility/feed changes. Public build authorization persists; resend Public→build→Drive→Private plan before dispatch. PC vault/browser unavailable: offline fixtures never live proof. Full app replacement required for native env_info plus matching extension reload/tab refresh. Update all current notes per step/push.

## Current full build
Full hosted [42078807676](https://github.com/stoveez/plazcode-source/actions/runs/42078807676) started on runtime **f2fc04d**, with full localJS now complete:258files PASS/0failures. Required Public→build→verify→Drive→Private plan resent before dispatch; repo already Public. No package verified/uploaded/delivered yet. Staging /workspace/plazcode-field-build-42078807676 has updated helpers; no old ZIP reuse. Native full308PASS/2ignored and both-engine DeepSeek guards/line endings PASS. No runtime edit since dispatch.

Final local full-JS runner completed exit0 (258files,0failures;3existing skips), native308PASS/2existing ignored. No runtime edits. Hosted full42078807676 still in progress; no artifact delivery yet.

Hosted progress: browsers ALL PASS (26ChatGPT,500reads,one full transcript scan/5317attributes). All3platform fullJS258 and Linux repeat PASS. Windows/Mac native/env_info/integration PASS; Windows packaged PS5.1 install and Mac release builds running; Linux native gates still pending. No fresh artifact delivered.
