---
title: UI generation upgrade (planned for 1.24.31)
updated: 2026-10-31
---
# UI generation upgrade (1.24.31)

Why: a community "GUI Testing Benchmark" scored TotalScript 80, ChickenFD 78, MultiScript 76, PlazCode 74 for UI made by asking the AI (not an in-app builder). Owner wants PlazCode to beat it.

What TotalScript does (studied 2026-10-31, zip supplied by the owner): (1) a large UI rulebook (core rules, a design system, ~25 visual styles, components) where a short brief is attached automatically to every UI request and the rest loads by trigger words; (2) design tokens (one palette/font/radius/spacing set) applied to every screen; (3) a `ui_audit` that reads the built UI back from Studio (contrast, phone touch sizes, overlaps, cut-off text, scaling, palette drift) plus phone/desktop previews. PlazCode only has UI rules at Ultra effort (UltraLab Check-UI); normal effort gets none.

Licence: TotalScript is GPL-3.0 and its rulebook is itself ported from Multi-Script (GPL). Rule 7: copy nothing, not even reworded. Write PlazCode's own standard and Luau from scratch; ideas only.

Owner's choices (2026-10-31): ship as 1.24.31 right after 1.24.30; include the auto-attached UI standard, the `ui_audit` self-check tool (errors must be fixed before done) and per-game design tokens; no preview captures for now; success is judged by the owner on test builds. The new text goes into the app-held text pack like other prompts.
