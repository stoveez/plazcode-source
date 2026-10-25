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

## Live note and attached pictures (2026-10-24, branch `claude/vault-live-note`, not merged yet)
- The vault now has a live note, `00 Start Here/Now.md` (where the work stands). It is created on first start, sent to the AI at startup, and the AI is told to rewrite it at the end of every job (capped at 1,500 characters; an existing one is never overwritten).
- Pictures the user attaches with PlazCode's media button are kept in the recent-pictures list, so "add this picture to your memory" works through `add_image` (`from: last_screenshot` = the newest picture). Pictures pasted straight into the AI site's own composer are not seen. The picture hint is only in the full startup prompt, so small sites stay small.
- Needs the desktop app replaced (Rust change) and an extension reload. Tests: Rust `live_note_is_seeded_sent_and_capped`, JS `test-vault-live-note.js`; full JS suite 0 failures, cargo 205 passed. Not tried in the real app.
