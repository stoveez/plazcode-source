---
title: UI generation upgrade (built 2026-11-19 for 1.24.35)
updated: 2026-11-19
---
# UI generation upgrade (1.24.31)

Why: a community "GUI Testing Benchmark" scored TotalScript 80, ChickenFD 78, MultiScript 76, PlazCode 74 for UI made by asking the AI (not an in-app builder). Owner wants PlazCode to beat it.

What TotalScript does (studied 2026-10-31, zip supplied by the owner): (1) a large UI rulebook (core rules, a design system, ~25 visual styles, components) where a short brief is attached automatically to every UI request and the rest loads by trigger words; (2) design tokens (one palette/font/radius/spacing set) applied to every screen; (3) a `ui_audit` that reads the built UI back from Studio (contrast, phone touch sizes, overlaps, cut-off text, scaling, palette drift) plus phone/desktop previews. PlazCode only has UI rules at Ultra effort (UltraLab Check-UI); normal effort gets none.

Licence: TotalScript is GPL-3.0 and its rulebook is itself ported from Multi-Script (GPL). Rule 7: copy nothing, not even reworded. Write PlazCode's own standard and Luau from scratch; ideas only.

Owner's choices (2026-10-31): ship as 1.24.31 right after 1.24.30; include the auto-attached UI standard, the `ui_audit` self-check tool (errors must be fixed before done) and per-game design tokens; no preview captures for now; success is judged by the owner on test builds. The new text goes into the app-held text pack like other prompts.

**Built 2026-11-19 (for 1.24.35; owner re-approved):** the plan above never shipped in 1.24.31. Now in `development/1.24.34`: the UI standard is `UI_STANDARD` in `core/lean-startup.js` (sent with the studio-gui topic, every effort level); `ui_audit`, `ui_tokens`, `ui_tokens_set` are studio skills in `core/studio_skills.js` (own Luau: lays each ScreenGui out again for phone and desktop with UIListLayout/UIGridLayout/UIPadding/constraints/ScrollingFrame clipping, measures text with TextService); the automatic check before done is `ts/core/ui-check.ts` (only errors new in the task, 2 rounds). Tests: `test-ui-check.js` (runs the real Luau on stand-in screens in the Luau VM, `release-tools/ui-audit-mock.luau`). Not yet tried in real Studio.

