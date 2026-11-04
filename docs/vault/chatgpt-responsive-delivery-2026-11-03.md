---
title: ChatGPT page freezes and stranded tool results
updated: 2026-11-04
---

Owner reports the WHOLE ChatGPT page freezes at startup and on tool calls. A fifteen-call sequence stayed stuck around call five, with the composer expanded under the working cover. This is separate from Windows startup integrity; retain the signed-app fix.

## Reproduced causes

- The sender allowed up to 220 lines/40,000 characters in one synchronous native edit, despite the provider's existing measurements showing multiline native insertion can freeze ProseMirror. The fallback also processed 25 lines between yields.
- Disabled Send and unconfirmed clicks returned without an error or delivery receipt. The shared core accepted a changing assistant count as success, even with an unsent result still in the composer. A delayed/remounted prior reply can trigger that path. An offline full-core regression reproduced zero sends, a stranded draft and a false confirmed delivery before the fix.
- Composer editing mutations triggered transcript-wide scanning during injection, adding work between native edits.
- Composer textContent drops paragraph/BR boundaries. The new logical reader preserves lines without forcing layout.

## Additional confirmed recovery bug

Owner supplied log findings: search_files finished in255ms; an empty reply triggered the inaccurate “Nothing was executed” nudge, then the AI repeated the search and the existing stall guard refused it. Reported insertion-correlated stalls4.5s/startup21s are owner-provided evidence, not measurements made here. The exact expensive live function still requires profiling. A new full-core fixture reproduced the recovery-induced duplicate-read round trip (17messages instead of16) before fixing it.

The generic dead-turn message now preserves execution uncertainty. Within the current loop, empty/timeout recovery re-delivers the saved tool outcome with a clear explanation that it already returned; never reruns the tool. It is scoped to this chat/engine/session, bounded by the existing one-retry budget, respects input/result paging limits and references previously attached images accurately. The duplicate-read guard is unchanged. The fifteen-call fixture now recovers after call five with15actual tools and16messages, then finishes normally.

## Change

Type at most four lines AND2048characters per native chunk (preserve Unicode pairs), then yield; never paste text as an attachment. Check Stop/session/editor ownership between slices. Filter only composer-local injection mutations; mixed/transcript/remount changes still run normal masking and sweeps. Wait for enabled Send, click once, require a new matching user message with a new identity. Old assistant growth, empty composers, Stop and old identical user messages are not receipts. Clear only this injection's unchanged draft in the same editor/chat; preserve newer user drafts. ChatGPT alone opts into the strict core receipt contract. Keep native upload confirmation and the normal startup handshake.

## Verification / next

Twelve new real-Chromium OFFLINE browser checks passed, including the complete production parser/core/native-bridge mock loop with fifteen distinct read_file calls, exact-once delivery and an empty final composer. Four old failure paths were reproduced before the changes (typing burst, disabled-send false success, ambiguous click, missing Stop cancellation). Simulated slow native edits test scheduling, not live ChatGPT timing. No access to the owner's live ChatGPT browser; do not label fixtures as a live preview.

Healthy differential70/provider-preservation967/protected34, recovery wiring5/stall9, reply recovery and13startup golden cases PASS. Full JavaScript checks and fresh Windows/universal-Mac signed test build are next. No stable release authorized. Extension reload plus AI-tab refresh applies this change; full app packages still accompany the test delivery. Update this note with the final run, source SHA and verified Drive links.

2026-11-04 follow-up: real ProseMirror tests found insertLineBreak can flatten lines; native four-line chunks preserve180/450lines exactly and keep the event loop responsive. Pinned dev-only editor model test dependencies added. First full JS pass found4 stale extracted fixtures, corrected with original failure/one-click checks intact; targeted checks pass. CI41772418802 cancelled intentionally; all confirmed protocol gaps now included by owner: [next work](tool-protocol-audit-2026-11-04.md).


2026-11-04 final sender check: native edits are bounded by BOTH four lines and2048characters, preserving surrogate pairs; otherwise a serialized result could still arrive in one unbounded JSON line. New real-ProseMirror long-line case FAILS the previous sender at the character-bound assertion and PASSes the corrected sender. All21 complete browser checks PASS on the candidate (all startup/Safety-context cases,180/450line preservation, exact-once15calls and dropped-result recovery); native307 PASS/2existing ignored after the no-undo-ID Safety fix. Final broad JS is running; no generated-source preparation until it completes. Fresh CI/Drive ZIPs still pending.

2026-11-04 final local checks: all shared-protocol/ChatGPT changes implemented (runtime48029be). Full JS sweep247PASS +9stale fixture failures; all9corrected targeted reruns PASS,256verified/0unresolved. Only subsequent runtime change is the separately tested ChatGPT2048char/Unicode chunk bound. Native307PASS/2existing ignored after Safety no-ID fix. All21 offline ChatGPT editor/core checks and ClickUp startup/exact large-page reconstruction/masking/one-dispatch PASS. Final source/pins/differential/ownership checks PASS. Fresh full CI and exact Drive ZIP/report delivery NEXT; no new ZIPs yet. Requires app replacement+extension reload. Canonical evidence: tool-protocol-2026-11-04-verification.json and tool-protocol-audit-2026-11-04.md. Old dated entries below are historical.
