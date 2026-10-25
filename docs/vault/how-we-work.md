---
title: How we work (the handoff protocol)
updated: 2026-10-24
---
# How we work

Two layers, so a new AI starts fast and spends few tokens.

1. **Short-term bridge: [`docs/NOW.md`](../NOW.md).** About 20 lines: branch, newest commit, what is done, what is unfinished, the next step, open bugs. Every AI **overwrites** it at the end of a session. A new AI reads it first.
2. **Long-term anchor: this vault.** Permanent knowledge: how things work, why decisions were made, finished milestones. Notes are short, one topic each, and link to each other.

## Start of a session
1. `git fetch origin` and check out `claude/plazcode-dev`.
2. Read `docs/NOW.md`. Read `CLAUDE.md` (or `AGENTS.md`) for the owner's rules.
3. Open only the vault notes the task needs. Follow links; do not load everything.

## During a session
- Work directly on `claude/plazcode-dev` (one AI at a time; no task branches). Push after every finished step and push `WIP:` commits before anything long or risky. Rewrite `docs/NOW.md` in the same commit as every push (see [owner-rules](owner-rules.md)).
- If you learn something permanent (a gotcha, a decision, how a part works), write or update a vault note right away.
- **Keep the owner's Obsidian copies in step (owner, 2026-10-24).** The owner has plain copies of the notes on their Windows PC: `C:\Users\plazm\Downloads\PlazCode-Vault\vault` (this vault, `docs/vault`) plus `docs/NOW.md`, `CLAUDE.md` and `AGENTS.md` (the binding rules) in the folder `C:\Users\plazm\Downloads\PlazCode-Vault\` next to `vault` and `C:\Users\plazm\Downloads\Stoveez-Vault` (the personal vault `stoveez/stoveez`). Whenever you change a note in either vault, copy that changed note to the same place in the PC folder too (send the file with SendUserFile, then write it with `device_commit_files`; git over the folder link is too slow). If the session is not linked to the PC, say so in your last message so the owner knows the copy is behind.

## End of a session (do all four)
1. Rewrite `docs/NOW.md` (keep it under about 25 lines).
2. File anything permanent as a vault note; add the link to [Home](Home.md). Move finished work into [milestones](milestones.md), new reasons into [decisions](decisions.md).
3. Update [open-work](open-work.md) if bugs were found or fixed.
4. Push to your branch and tell the owner the branch name, short commit ID and one line on what is in it.

## Note format
- A short title, then `updated: YYYY-MM-DD` in the header.
- One topic per note, plain language, no pasted logs.
- Link with relative Markdown links, for example `[releasing](releasing.md)`, so links work on GitHub and in Obsidian.
- Never put secrets (tokens, keys) in any note.
