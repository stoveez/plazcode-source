# NOW
Updated: 2026-10-29. Branch `claude/plazcode-dev`; no helper agents.

**Latest: WIP approval modes and composer-aligned bar requested.** Owner added three persistent modes beneath Effort in the PlazCode bar and a matching desktop Settings dropdown: Ask for approval (every change), Approve for me (deletion/removal prompts only), Bypass approval (no prompts). Keep file-access/read-only constraints. Provide screenshots rendered from actual PlazCode frontend code, not drawn mockups. Owner also reported collapsed/expanded bars misplaced around ChatGPT composer; cover anchor movement, resize and remount with actual rendered bar tests.

**Active test build:** 1.24.27 must include DeepSeek pacing, fixed desktop effort menu and these new approval/bar fixes. Supersede earlier CI sources; restart full platform/browser CI only after implementation/local regressions. No stable release. Source PUBLIC for the owner-authorized build window; restore Private immediately after test delivery. Integration cannot change visibility (403 previously confirmed); owner assistance may be needed.

**Already done locally:** merged DeepSeek archive guard (serialized 8–9.8 s completion-based cooldown); original raw sender preserved; three-copy syntax/parity tested. Desktop effort cutoff reproduced from owner video and fixed by synchronizing inline/shared picker, card lifting and viewport sizing; actual desktop-style Chromium regression passed all six options at large/short/narrow sizes with keyboard/close cleanup. Wrong-version security fixtures corrected to invalid 0.0.0 in all three rollover cases. No local Rust toolchain; native checks run in CI.

**Next:** implement approval preference synchronization/policy and real UI menus, strengthen composer-relative placement, run policy/browser regressions, capture real frontend previews and push. Then build/verify full Windows + Mac signed test ZIPs with Chromium and Firefox and deliver inner ZIPs, not artifact wrappers. No PC vault connection.

**Latest stable:** 1.24.26, validation 40772509288 / a74ae17, publication 40781780030. Keep stable archives/feeds unchanged. 27 workflows retain signing/public trust and strict validation gates; publication pins unset.
