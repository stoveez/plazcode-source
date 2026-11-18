---
title: Theme text fails WCAG contrast
type: lesson
status: verified
source: none
date: 2026-10-16
tags: [theme, contrast, accessibility]
---

Measured with skills/ul-ui-builder/scripts/check_contrast.py on skills/ul-ui-builder/references/theme.json: 8 of 15 declared text-on-surface pairs are below 4.5:1 (white text on green, gold, grey and blue; inkSoft on panelAlt and slot). Button labels rely on a dark stroke the gate does not count, so measure in Studio before changing the colours.

