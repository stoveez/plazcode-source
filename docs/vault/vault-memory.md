---
title: Vault memory (the in-app feature)
updated: 2026-10-24
---
# Vault memory

An Obsidian-style folder of linked notes that the AI inside PlazCode reads and updates, with an Obsidian-looking viewer window opened from Memory settings.

- Code: `agent/src/vault.rs`, `core/memory.js`, tool wiring in `core/main.js` and `background.js`. Design: `development/1.24.21/VAULT-MEMORY-DESIGN.md`.
- Startup carries a brain map of every note and link. AI actions: `map`, `audit`, `verify`, `graph`. Notes may carry `source`, `confidence` and `verified` header fields.
- `audit` lists notes that point into the Roblox place or are low confidence or unchecked for 30 days; the AI checks them with read-only tools and then verifies, fixes or archives them.
- A score-and-redo reference loop is judged by a separate critic chat (`plazcode_critic`). It is not yet tried on real AI sites. Each redo and each critic message costs extra usage on the AI site, so it should be off unless wanted.

This vault (`docs/vault`) is separate: it is for the AIs that build PlazCode, not for the app's users. See [how-we-work](how-we-work.md).
