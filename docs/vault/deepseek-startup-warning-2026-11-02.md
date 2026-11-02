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
- Pacing, provider DOM guards, 974-body preservation and desktop pins passed. Full JS first sweep: ONLY test-v112 stale old beacon expectation failed. Beacon expectation updated; final full sweep pending. Final download-link refinement covered in both browsers; focused final checks next after safe prepare.

## Scope and delivery
Source only, on claude/plazcode-dev. Previous guest test ZIPs from 52b9d19 / 41492949796 do NOT include this fix. No new test build or stable publish requested/launched for this report. Future stable must use a NEW version after published 1.24.30, with exact notes shown first. Use standard full Windows/Mac signed test packages if owner requests builds; never distribute loose unsigned source patches. No live DeepSeek traffic or ban-prevention guarantee. PC vault copy unavailable; repo notes updated.
