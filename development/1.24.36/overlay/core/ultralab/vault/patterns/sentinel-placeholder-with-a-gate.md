---
title: Sentinel placeholder with a gate
type: pattern
status: verified
source: none
date: 2026-10-16
tags: [ui, labels, gate]
---

A dynamic label shows <unbound> until a value is set. The value can never be a real output of the code. verify_labels.py fails the build if no controller names the label. UIBind.luau is the runtime side, so binding and the gate agree.

