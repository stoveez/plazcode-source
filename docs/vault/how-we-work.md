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
- **Edits made in the PC folders go back to GitHub (owner, 2026-10-24).** Each PC folder holds `.pc-sync.json`, a `sha256sum` list of every file as it was last copied there. At the start of a session, and whenever the owner says "sync", if the session is linked to the PC, hash the PC files and compare. A file whose hash differs was edited on the PC. If the repo copy has not changed since the last copy, apply the edit to the repo: `Home.md` and `how-we-work.md` get `NOW.md` turned back into `../NOW.md`; the PC `NOW.md` goes to `docs/NOW.md`; the PC `CLAUDE.md` and `AGENTS.md` go to the repo root. Commit under the owner's name, push to `claude/plazcode-dev`, and tell the owner which notes changed. If the repo copy changed too, show both and ask. The personal vault works the same way, but ask the owner before pushing to `stoveez/stoveez` (its own rule). After every copy to the PC, refresh that file's line in `.pc-sync.json`.
- **Keep the owner's Obsidian copies in step (owner, 2026-10-24).** The owner has plain copies of the notes on their Windows PC: `C:\Users\plazm\Downloads\PlazCode-Vault\vault` (this vault, `docs/vault`) plus `docs/NOW.md`, `CLAUDE.md` and `AGENTS.md` (the binding rules) placed inside that same `vault` folder so Obsidian shows them. In the PC copy only, change `../NOW.md` to `NOW.md` in links and `C:\Users\plazm\Downloads\Stoveez-Vault` (the personal vault `stoveez/stoveez`). Whenever you change a note in either vault, copy that changed note to the same place in the PC folder too (send the file with SendUserFile, then write it with `device_commit_files`; git over the folder link is too slow). If the session is not linked to the PC, say so in your last message so the owner knows the copy is behind.

## End of a session (do all four)
1. Rewrite `docs/NOW.md` (keep it under about 25 lines).
2. File anything permanent as a vault note; add the link to [Home](Home.md). Move finished work into [milestones](milestones.md), new reasons into [decisions](decisions.md).
3. Update [open-work](open-work.md) if bugs were found or fixed.
4. Push to your branch and tell the owner the branch name, short commit ID and one line on what is in it.
5. End your last message with a checklist: each step above marked done, then the short commit ID and one line on what is in it.

## Starting a session from a copy of this folder
The owner may hand an AI only this folder. Read `NOW.md` first, then [Home](Home.md), then `CLAUDE.md` or `AGENTS.md` (the binding rules). Continue from the "Next step" in `NOW.md`. Work on branch `claude/plazcode-dev` of the private repo `stoveez/plazcode-source` if the repo is attached; if it is not attached you cannot push, so say so and give the owner the notes to apply. Follow the same end-of-session steps.

## Note format
- A short title, then `updated: YYYY-MM-DD` in the header.
- One topic per note, plain language, no pasted logs.
- Link with relative Markdown links, for example `[releasing](releasing.md)`, so links work on GitHub and in Obsidian.
- Never put secrets (tokens, keys) in any note.
