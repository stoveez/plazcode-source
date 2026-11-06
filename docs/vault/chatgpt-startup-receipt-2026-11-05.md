---
title: ChatGPT startup receipt follow-up
updated: 2026-11-05
---
# ChatGPT startup receipt follow-up

Status: **active / WIP**, no product change yet. Owner still sees Starting Up then Send paused on delivered sibling-user-bubbles build. Previous full CI42146181204 is historical; its wrapper-bearing regression does not cover this report.

Owner diagnostic confirms current beacon and H4 role metadata beside a masked native user bubble, without article/conversation-turn/message-id ancestors. Native body10226 raw characters versus11998 sent is not proof of truncation: whitespace normalization can change lengths. Ancestor display/mask/body metadata requested and pending. Raw logs/code remain outside Git. Bridge catalog97ms, insertion2465ms, receipt failure15s later. Separate native cache-read errors do not establish the receipt cause.

Real Chromium with full production provider/core reproduces display:contents message shells: two startup fixtures (exact and whitespace-normalized native text) each send once, detect zero users and fail after15s. Hidden previous-conversation fixture correctly rejects old exact text. A normal wrapper-free block shell passes the exploratory control. This independently proves a visibility bug; it does not prove the owner's ancestor styles.

Plan: recognize rendered contents-only roots and PlazCode's own pre-hide masks while rejecting genuinely hidden old conversations. Preserve normalized full-content equality, new message identity, one send click, no automatic replay, Stop/session/navigation/editor ownership. Add bounded content-free failure metrics so missing item versus mismatched text is distinguishable. Rerun real-browser startup/editor/15-tool/recovery tests and full JavaScript/preservation gates before fresh complete Windows/universal Mac CI packages/Drive delivery.

No stable publication. Extension reload+AI-tab refresh should take this extension fix; preserve previous native app replacement requirement for append. No live affected-PC access or real-site preview; PC vault not connected.
