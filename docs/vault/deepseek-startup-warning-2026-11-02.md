# DeepSeek startup “Send paused” warning — 2026-11-02

## Reproduced cause
On a fresh chat, DeepSeek can assign its address after the one actual Send click and before React shows the sent message. The provider compared this address against the original empty address, threw DEEPSEEK_CANCELLED, and the core showed every guarded-send exception in a warning modal. The real request can already have reached DeepSeek, explaining why it can keep replying and working after that popup.

The URL-before-row fixture failed with the exact cancellation error before the fix, then passed after it. This is offline reproduction, not a live user-account claim.

## Fix, not yet packaged
Only an already committed fresh-chat send may provisionally acquire ONE address while waiting. It must find a NEW user row matching the text actually sent before adopting that address. A second route, Stop/epoch or session change still cancels; one actual click and no automatic replay retained. Trusted in-tab links and browser history cancel explicitly; new-tab/download links are not navigation. Shared native cooldowns/leases, jitter, images, manual-send observations and no-fallback policy unchanged.

Only typed expected owner cancellation is quiet: it still throws SendAbortedError and records send.cancelled. Real draft, uncertain-delivery, bridge/rate/pacing errors still show the warning. No native code changes; updated signed extension + tab refresh sufficient when packaged.

## Tests
- Deterministic actual guard: URL before DOM row; own-message proof; unrelated row cannot confirm; Stop/session/second-route after commit; no duplicate click. Existing image/Continue/cancellation/revoked-lease/missing-bridge coverage retained.
- Actual core reporter: expected owner cancellation quiet; draft/uncertain/pacing warnings visible.
- Full provider Chromium AND Firefox: early first URL, paced Continue, queued cancellation, trusted navigation/download distinction, trusted versus automatic Stop.
- Pacing, provider DOM guards, 974-body preservation and desktop pins passed. Full JS first sweep found only a stale test-v112 build-beacon assertion. Updated it; FINAL full sweep passed 0 failures. Final download-link handling also passed Chromium/Firefox and focused guards/preservation/pins.

## Scope and delivery
Source only, on claude/plazcode-dev. Previous guest test ZIPs from 52b9d19 / 41492949796 do NOT include this fix. No new test build or stable publish requested/launched for this report. Future stable must use a NEW version after published 1.24.30, with exact notes shown first. Use standard full Windows/Mac signed test packages if owner requests builds; never distribute loose unsigned source patches. No live DeepSeek traffic or ban-prevention guarantee. PC vault copy unavailable; repo notes updated.

## 2026-11-02 — DeepSeek false startup warning FIXED and verified in source
Final full local JavaScript suite: **0 failures** (/workspace/plazcode-deepseek-startup/javascript-final.log). Full provider Chromium/Firefox tests pass, including new URL before user row, paced Continue, trusted navigation/download distinction and Stop. Actual core reporter keeps expected owner cancellation quiet while draft/uncertain/pacing errors still warn. Existing shared request limits/leases and single-click/no-replay safeguards retained. 974 preserved function bodies, 588 guarded reads and updated pins pass. Initial full run's sole stale beacon assertion fixed, final full rerun green.

Fix is extension-only, NOT yet packaged into a new build; prior guest test links from 52b9d19 / 41492949796 lack it. No native edits or stable publication. Reload updated signed extension + refresh DeepSeek when packaged; current popup can be closed in this reproduced startup case. No live DeepSeek account used. Future stable needs new version after 1.24.30 and exact notes shown first. [Details](deepseek-startup-warning-2026-11-02.md), [verification](deepseek-startup-warning-2026-11-02-verification.json). Source visibility check/reminder before ending; never change it yourself.

