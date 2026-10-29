---
title: DeepSeek send pacing
updated: 2026-10-29
---
# DeepSeek send pacing

Owner requested one guard for all programmatic DeepSeek sends, including direct UI Creator/library calls, because the core five-second pause missed those paths and measured from send start.

Implemented in the active `development/1.24.27/overlay/providers/deepseek.js`, for the next signed release 1.24.27. The exported `typeAndSend` serializes calls; `typeAndSendRaw` retains the original send body. Each page/provider instance remembers the previous send completion, including failure. The first call has no added pause. The owner archive samples a cooldown of eight seconds plus 0–1,800 ms jitter from completion. The next call waits only the unelapsed remainder, in slices of at most 250 ms. A reply at 8.1 seconds can still wait for remaining jitter; replies that outlast the sampled cooldown add no wait. This replaces the earlier approximation that skipped all jitter once eight seconds had elapsed. Diagnostics report actual waits as `send.pace` with `waitMs`. Rejections propagate to callers while the queue recovers for the next call. Images, optional arguments and return values pass through unchanged.

No core changes. Existing core user cooldowns and DeepSeek notice remain. Manually typed site messages are untouched. This is per provider/page, not a browser-wide or cross-tab rate limiter, and is not evidence that automated use cannot lead to bans.

Edit only the canonical overlay. `prepare.py` regenerates root/Chromium provider copies; `release-tools/build-firefox.py` copies that provider into Firefox before signing. Do not hand-edit generated or published signed copies.

Verification: `test-deepseek-pacing.js` exercises real queue code with a fake clock, concurrent calls, slow raw sends, jitter bounds, long replies, images, rejection propagation and recovery. `test-provider-preservation.js` verifies the raw sender AST still equals the original sender body. `test-desktop-regression.js` pins the changed provider. Generated root/Chromium/Firefox syntax, exact definition counts and byte identity passed. Merged guard was the only difference in the uploaded provider; its raw sending body matches the preserved baseline. No code from unrelated archive files was imported. Not live-tested on DeepSeek.

2026-10-29 delivery: included in full 1.24.27 Windows/Mac/Linux test packages from 962899c / CI 40932400772. All hosted jobs passed; all three shipped provider copies match reviewed source hashes and each other. Live DeepSeek account behavior remains untested; no ban-prevention guarantee.
