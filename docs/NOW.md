# NOW
Updated: 2026-10-29. Branch `claude/plazcode-dev`; no helper agents.

**Latest: DeepSeek shared send pacing implemented, unreleased.** The exported provider sender queues every programmatic call, including UI Creator/library cards. First send is immediate. Subsequent calls within eight seconds of the previous send FINISHING wait out the remaining interval plus 0–1.8 seconds jitter and log `send.pace`. Replies taking at least eight seconds add no delay. Failed sends start the same cooldown and cannot poison the queue. Original raw sending logic, existing core cooldown/user settings and one-time notice are preserved; no core changes.

**Checks passed:** fake-clock tests cover concurrency, slow-send completion timing, direct calls/images, fast/long replies, jitter bounds and failure recovery. Provider AST preservation and desktop hash regression passed. Root, generated Chromium and generated Firefox copies are byte-identical, syntax-valid and each define one paced sender and one raw sender. Not tested on a live DeepSeek account; pacing does not establish that account bans are prevented.

**Shipping:** changes are in the active `development/1.24.26/overlay`, pending the next versioned signed release. Do not modify published 1.24.26 archives or install edited files over integrity-protected copies. No new build/release was requested or produced for this task. Latest public release remains 1.24.26 (validation 40772509288 / a74ae17; publication 40781780030). See [DeepSeek pacing](vault/deepseek-send-pacing.md).

**Visibility:** source repository confirmed PRIVATE. The previous post-release visibility action is resolved. GitHub vault notes updated; the separate PC vault folder is not linked.
