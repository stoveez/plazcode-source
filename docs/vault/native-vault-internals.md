---
title: Native vault internals (for the AIs building PlazCode)
updated: 2026-10-24
---
# Native vault internals

Overview for humans: [vault-memory](vault-memory.md).

## Code
- `agent/src/vault.rs`: storage, search, graph, audit, pictures, safety, Rust tests. Route `/api/vault`.
- `core/memory.js`: startup prompt (`vaultContext`), learning instructions (`vaultLearningText`), the `plazcode_vault` tool, the settings card, the Obsidian-style viewer window, the critic loop.
- `core/main.js` (hash-pinned): tool dispatch, `rememberImages` for attached pictures, `plazcode_screenshot`. `background.js`: bridge to the app.

## The `plazcode_vault` tool
Actions: `index`, `search`, `read`, `write` (modes create, append, replace, section), `backlinks`, `archive`, `add_image`, `read_image`, `map`, `audit`, `verify`. The app also has `graph`, `tree`, `save_raw`, `delete` for the viewer. Notes carry `tags`, optional `aliases`, `project`, `status`, and `source`, `confidence`, `verified` for facts that can go stale.

## Rules built in
- All paths stay inside the vault (no `..`, no symlink escapes); only `.md` and picture files; atomic writes.
- Secrets (keys, tokens, passwords) are refused. The AI archives, never deletes; only the user deletes.
- Caps: 60,000 characters per note, Home 3,500, Now 1,500, 5,000 notes, 12 MB per picture.
- Learning switch off means the AI may read but not write.
- `audit` lists notes that point into the Roblox place or are low confidence or unchecked for 30 days; `verify` marks one checked.
- The compact startup prompt (small sites) must stay under about 4,500 characters (`test-vault-memory.js`).

## Chat notes
Built in `core/reliability.js` (`chatNote`, `chatNotePath`, `tasksSection`, `trackTimes`, `redact`, `continuationScene`), written by `core/memory.js` (`chatNoteSave`, `chatNoteLatest`, `withoutChatNotes`), hooked in `core/main.js` (`saveChatNote`, `noteChatSoon`, the continue popup). Writes use plain `write` without `ai:true`, so they work when learning is off. `redact` mirrors the vault's secret patterns so a write is never refused. Per-chat state is in `chrome.storage` keys `rsChatNotes` and `rsLatestChatNote`. Task changes save within about 10 s, plain text at most every 2 minutes (each write adds a Log line).

## Tests
Rust: `cargo test vault` (18 tests, includes `live_note_is_seeded_sent_and_capped`). JS: `test-vault-memory.js`, `test-vault-brain.js`, `test-vault-graph.js`, `test-vault-live-note.js`, `test-chat-note.js`, `test-chat-note-wiring.js`, `test-continuation-gate.js`, `test-critic-chat.js`, `test-bar-and-vault-controls.js`.

## Gotchas
- `memory.js` strings are single-quoted: an apostrophe inside breaks the whole file (it happened once).
- `vaultRefresh` caches by project name; tests that refresh twice need different project names.
