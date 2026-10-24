---
title: How we work (the handoff protocol)
updated: 2026-10-24
---
# How we work

Two layers, so a new AI starts fast and spends few tokens.

1. **Short-term bridge: [`docs/NOW.md`](../NOW.md).** About 20 lines: branch, newest commit, what is done, what is unfinished, the next step, open bugs. Every AI **overwrites** it at the end of a session. A new AI reads it first.
2. **Long-term anchor: this vault.** Permanent knowledge: how things work, why decisions were made, finished milestones. Notes are short, one topic each, and link to each other.

## Start of a session
1. `git fetch origin` and check out `claude/plazcode-dev` (or your own `<ai>/<task>` branch from it).
2. Read `docs/NOW.md`. Read `CLAUDE.md` (or `AGENTS.md`) for the owner's rules.
3. Open only the vault notes the task needs. Follow links; do not load everything.

## During a session
- Work on your own `<ai>/<task>` branch, claim the task on `docs/TASK-BOARD.md`, push after every finished step (see [owner-rules](owner-rules.md)).
- If you learn something permanent (a gotcha, a decision, how a part works), write or update a vault note right away.

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
