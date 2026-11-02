# NOW
Updated: 2026-11-02. Branch **claude/plazcode-dev** only; no helpers.

**NEW SOURCE FIX, full regression pending:** Continue project across AI websites. Reproduced 3 failures: intervening startup-only visit vetoed saved work; focus-loss capture failed to promote the outgoing chat; self handoffs could prompt. Fixed direct real-work source selection, final hidden/pagehide capture before waiting on native archive, and explicit self exclusion. Selected-source note only, live note-state updates, stale-offer closure and persisted new-project reset prevent wrong context. No native changes.

**Focused verification PASS:** actual full ChatGPT/Claude content scripts in JSDOM, both directions, already-open destination/storage updates, leaving before save, pending archive, pagehide, self/stale/opt-out/startup/real-request/no-history/native-restore/new-project cases; actual Continue handler selected-note/active-vault/fallback tests; existing continuation/chat-note/pins. Full JS suite NEXT; do not prepare while it runs. [Details](vault/continuation-cross-site-2026-11-02.md). No live AI account/device tested or preview available.

**Previous source fix preserved:** DeepSeek false startup Send paused warning, full JS 0 failures and real Chromium/Firefox provider tests passed before this task. [Details](vault/deepseek-startup-warning-2026-11-02.md).

**Delivery scope:** both source fixes are NOT in current delivered ZIPs. Latest full verified guest/signup source **52b9d19** / CI **41492949796** attempt 2: [Windows](https://drive.google.com/file/d/1r6WeDH-l-HpF1PZl9IdBwieFmJz6dmCp/view?usp=drivesdk), [universal Mac](https://drive.google.com/file/d/173LbQ3vWPSxnNnYznUXi8GyNqauvPiep/view?usp=drivesdk). All hosted jobs/inner ZIP signatures/source/native/layout/Drive sizes verified. No new build requested/launched for these reports. Reload updated signed extension + refresh tabs when packaged; native code unchanged.

**Preserve:** persistent isolated local guest, signup fresh-proof/busy/lost-reply recovery, remembered offline access; actual app previews already delivered; prior anti-copy/Luau/Arena/selective learning/batches/background jobs/result-page framing. Original affected profile-service trigger unconfirmed, owner cannot get Logs; do not ask again. Account API remains Public by approval.

**Next:** WIP push before full JS, run it once, inspect/fix real failures, final notes/push/report + source visibility check. Do not publish stable. Stable **1.24.30** published 2026-11-02 15:27 UTC by existing workflow 41469911201; future stable requires NEW version and exact revised notes shown first. Full future test builds must be Windows+universal Mac exact signed inner lean ZIPs via Drive, not loose/source ZIPs.

**Visibility:** source still PUBLIC after guest delivery; repeat Private reminder after checking: https://github.com/stoveez/plazcode-source/settings → Danger Zone → Change visibility → Private. Never change it yourself. Repo vault updated; PC vault folder not connected.
