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

## Current correction / checks
- Shared user-body reader selects native semantic text surfaces; native headings/actions are not receipt/task data. Literal message text remains. Used by itemText/classifyText, preserving strict NEW matching identity and no replay.
- ChatGPT requireConfirmedStartup uses existing confirmed handshake cleanup and excludes marker-only DOM restoration. Persisted genuinely started chats still use existing session keys; failed current startup removes its key.
- Same-role ancestor dedup walks ancestors once instead of comparing every pair; no stale transcript cache. Role/identity order and mixed-role behavior retained.
- CaptureGoal enforces one sentence/max8words in the stored objective/automatic row. Complete reply stays in activity details; user-written numbered plans/manual checklists remain.
All3new real-Chromium field regressions PASS after correction; exact task-label regression + existing task-checklist/memory-activity checks PASS. Broad provider/browser/full JS checks still required. Pins/preservation exception changes explicitly cover the revised user readers.

## Remaining ordered work
1. Run whole ChatGPT/browser and provider guard/preservation/healthy/startup checks; fix actual failures, never drop old protections.
2. Audit DSML orphan/repeated closing tokens structurally, add before/after parser and response-watcher regressions. Accept valid complete DSML, never execute partial calls or code/result examples; malformed/runaway protocol must not look like ordinary completed work. Bound any correction and retain DeepSeek pacing/Stop. No upstream cause claim without original turn.
3. Remove env_info's unrelated process refresh, preserve info/permissions, measure native before/after and add meaningful output regression. Investigate other demonstrated timings separately, not blanket timer reductions.
4. Full JS/native as affected, exact new full Windows/universal-Mac CI/Drive delivery and verification.42039239468 artifacts are now superseded for these NEW reports; keep historical proof, do not re-send as fixed. Immediate actual preview if real app/browser available; local browser tool absent, offline fixtures are not live proof.
5. Update all notes/push per step; no stable publish/visibility changes. Source still Public after earlier delivery; repeat owner Private reminder at delivery/final until restored. PC vault not connected.
