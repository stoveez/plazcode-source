---
title: ChatGPT page freezes and stranded tool results
updated: 2026-11-03
---

Owner reports the WHOLE ChatGPT page freezes at startup and on tool calls. A fifteen-call sequence stayed stuck around call five, with the composer expanded under the working cover. This is separate from Windows startup integrity; retain the signed-app fix.

## Reproduced causes

- The sender allowed up to 220 lines/40,000 characters in one synchronous native edit, despite the provider's existing measurements showing multiline native insertion can freeze ProseMirror. The fallback also processed 25 lines between yields.
- Disabled Send and unconfirmed clicks returned without an error or delivery receipt. The shared core accepted a changing assistant count as success, even with an unsent result still in the composer. A delayed/remounted prior reply can trigger that path. An offline full-core regression reproduced zero sends, a stranded draft and a false confirmed delivery before the fix.
- Composer editing mutations triggered transcript-wide scanning during injection, adding work between native edits.
- Composer textContent drops paragraph/BR boundaries. The new logical reader preserves lines without forcing layout.

## Change

Type at most eight lines or eight milliseconds per slice, then yield; never paste text as an attachment. Check Stop/session/editor ownership between slices. Filter only composer-local injection mutations; mixed/transcript/remount changes still run normal masking and sweeps. Wait for enabled Send, click once, require a new matching user message with a new identity. Old assistant growth, empty composers, Stop and old identical user messages are not receipts. Clear only this injection's unchanged draft in the same editor/chat; preserve newer user drafts. ChatGPT alone opts into the strict core receipt contract. Keep native upload confirmation and the normal startup handshake.

## Verification / next

Nine new real-Chromium OFFLINE browser checks passed, including the complete production parser/core/native-bridge mock loop with fifteen distinct read_file calls, exact-once delivery and an empty final composer. Four old failure paths were reproduced before the changes (typing burst, disabled-send false success, ambiguous click, missing Stop cancellation). Simulated slow native edits test scheduling, not live ChatGPT timing. No access to the owner's live ChatGPT browser; do not label fixtures as a live preview.

Full JavaScript/provider-preservation checks and fresh Windows/universal-Mac signed test build are next. No stable release authorized. Extension reload plus AI-tab refresh applies this change; full app packages still accompany the test delivery. Update this note with the final run, source SHA and verified Drive links.
