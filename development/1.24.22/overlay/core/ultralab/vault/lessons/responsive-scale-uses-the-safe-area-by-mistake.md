---
title: Responsive scale uses the safe area by mistake
type: lesson
status: verified
source: none
date: 2026-10-16
tags: [ui, responsive, camera]
---

Symptom: UI scaled from Camera.ViewportSize, which excludes notches. Rule: use ScreenGui.AbsoluteSize for a full-screen fit, and say which one you use in the code comment. Found by reading the Camera docs page.

