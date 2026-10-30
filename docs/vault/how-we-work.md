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
- **Keep every note current (owner, 2026-10-24).** An out-of-date note is worse than none (the 1.25.0 plan went stale and said things that were no longer true). Whenever you finish or change anything, update every note that mentions it in the same commit: `docs/NOW.md`, [open-work](open-work.md), [milestones](milestones.md), [test-builds](test-builds.md), and any plan file such as `development/1.25.0/NEXT-UPDATE-PLAN.md`. Before you stop, `git grep` the names of what you changed (branch names, feature names, version numbers, "not merged", "not built") and fix every line that is now wrong. Put the date on a note when you change it. The owner's PC copies must follow ([vault folder rule](#during-a-session) below).
- **Ask deep questions before building a feature (owner, 2026-10-24).** A new feature request, above all a non-specific one, is not ready to build. First ask (AskUserQuestion, up to 4 questions per round, each with a recommended answer first) questions that dig to the root: (1) the real goal and the problem behind the request; (2) who uses it, when, how often, what they do just before and after; (3) what the best possible version looks like and what would make the owner say "that is exactly it"; (4) edge cases and failure moments (offline, wrong site, nothing to show, huge input); (5) what it must NOT do or change (safety, speed, the updater, other sites); (6) how it should look and feel, and how the owner will check it works. Reflect the answers back in two or three plain sentences before building. Ask a second round if an answer opened a new question. Do not ask what the code or notes already answer. Skip for small bug fixes, requests that are already specific, and unattended runs (then state the reading you took). Record the answers in `docs/vault/decisions.md`.
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
- **Previews (owner, 2026-10-25):** show the change in the real app or the real extension on the AI site, as the owner would see it. Do not open `desktop.html` or an extension page on its own in a browser and call that a preview. If the real thing is out of reach, say so and ask for a screenshot.

## Feature previews and test ZIP delivery (owner, 2026-10-30)
- As soon as each requested feature is ready, immediately show an actual screenshot or video of it running in PlazCode through Google Drive. Do not wait until every other feature, check or build is finished. No generated mockups or recreated preview pages.
- Upload the screenshot/video to the connected Google Drive, read back its metadata, and give the normal Drive file link so the owner can open/download it. This is the exact delivery method the owner approved. Workspace-only file links do not work in this client.
- Deliver test builds through Google Drive too: upload the exact verified INNER Windows/Mac/Linux ZIPs (app, memory helper and extensions; official layout), verify metadata/sizes, then give normal Drive file links and tell the owner to click Download. Do not substitute GitHub's artifact wrapper ZIP or silently change sharing permissions.
- Keep the source public-build/private-after-delivery rule. Keep the separately approved account API Public. No stable publishing is implied by a test-build request.
