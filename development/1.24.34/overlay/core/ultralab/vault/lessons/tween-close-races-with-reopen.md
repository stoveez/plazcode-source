---
title: Tween close races with reopen
type: lesson
status: verified
source: none
date: 2026-10-16
tags: [tween, ui, race]
---

Symptom: closing then reopening within the fade-out hid the page. Cause: the old tween's Completed handler set Enabled = false after the new open. Rule: store each tween on its owner, cancel the old one before starting a new one, and have Completed act only if it is still the current tween. Toggle must read the logical state, not the visual one.

