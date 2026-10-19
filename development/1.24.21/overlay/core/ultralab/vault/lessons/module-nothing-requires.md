---
title: Module nothing requires
type: lesson
status: verified
source: none
date: 2026-10-16
tags: [check-ui, require, dead-code]
---

Symptom: CheckUIController was never required, and CheckUIComponents called bindButtonAnimations on a table that never defined it. The nil check skipped the feature without an error. Rule: check every require() path, and fail loudly at load time (assert) when a feature a caller relies on is missing.

