---
title: DeepSeek send pacing
updated: 2026-10-29
---
# DeepSeek send pacing

Owner requested one guard for all programmatic DeepSeek sends, including direct UI Creator/library calls, because the core five-second pause missed those paths and measured from send start.

Implemented in the active `development/1.24.26/overlay/providers/deepseek.js`, pending the next signed release. The exported `typeAndSend` serializes calls; `typeAndSendRaw` retains the original send body. Each page/provider instance remembers the previous send completion, including failure. The first call has no added pause. If less than eight seconds have elapsed since completion, the next call waits the remaining time plus 0–1,800 ms jitter. Once eight seconds have elapsed no extra wait is added. Diagnostics report actual waits as `send.pace` with `waitMs`. Rejections propagate to callers while the queue recovers for the next call. Images and return values pass through unchanged.

No core changes. Existing core user cooldowns and DeepSeek notice remain. Manually typed site messages are untouched. This is per provider/page, not a browser-wide or cross-tab rate limiter, and is not evidence that automated use cannot lead to bans.

Edit only the canonical overlay. `prepare.py` regenerates root/Chromium provider copies; `release-tools/build-firefox.py` copies that provider into Firefox before signing. Do not hand-edit generated or published signed copies.

Verification: `test-deepseek-pacing.js` exercises real queue code with a fake clock, concurrent calls, slow raw sends, jitter bounds, long replies, images, rejection propagation and recovery. `test-provider-preservation.js` verifies the raw sender AST still equals the original sender body. `test-desktop-regression.js` pins the changed provider. Generated root/Chromium/Firefox syntax, exact definition counts and byte identity passed. Not live-tested on DeepSeek.
