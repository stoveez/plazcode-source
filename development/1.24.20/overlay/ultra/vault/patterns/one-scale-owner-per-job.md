---
title: One scale owner per job
type: pattern
status: verified
source: none
date: 2026-10-16
tags: [ui, scale, animation]
---

Give each job its own UIScale: WindowScale for the device fit, ButtonScale or MotionScale for hover and press, PageScale for the pop. Two tweens on one UIScale fight, and a hover reset can wipe a device fit.

