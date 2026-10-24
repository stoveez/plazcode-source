# AGENTS.md - instructions for any AI working in this repo (Codex, Claude, or others)

> **Start here:** read `docs/NOW.md` first (where the work is, what is unfinished, the next step). Then open only the notes you need from `docs/vault/Home.md`; do not read the whole vault. At the end of a session rewrite `docs/NOW.md`, file anything permanent in the vault, push, and tell the owner. How: `docs/vault/how-we-work.md`. The rules below stay binding.

This is the private source repo for PlazCode (`stoveez/plazcode-source`). For anything beyond these rules read `docs/MAINTAINER-GUIDE.md`, `docs/TASK-BOARD.md` and `docs/HANDOFF.md`; build, release and status details are in `docs/vault/`.

## Which branch to use
Start from **`claude/plazcode-dev`** (the newest finished work; the repo's `main` is old and `release/1.24.21` is behind). Make your own `codex/<task>` branch from it. Do not push to `claude/plazcode-dev`, `release/1.24.21` or `main` without the owner's yes. Ignore the old branch `claude/vault-brain-and-cleanups`. If you cannot see `docs/NOW.md`, you are on the wrong branch: `git fetch origin` and switch to `claude/plazcode-dev`.

## Rules that never bend
1. Never break the auto-updater (the feed addresses and format in `latest.json` / `latest-macos.json` must keep working for every installed copy).
2. Commits go under the owner's name (stoveez, freetwoomy@gmail.com). Never add Co-Authored-By, session links, "Generated with" or any AI credit.
3. Never push, publish, deploy or buy anything without the owner's clear "yes" for that exact action. Committing locally is fine.
   **Exception (owner, 2026-10-23):** pushing to your own task branches `<ai-name>/<task>` (for example `codex/<task>` or `claude/<task>`) and `wip/<task>` snapshot branches is allowed without asking again. Merging into `release/1.24.21` or `main`, force-pushes, deleting branches, publishing and anything on the public repo still need the owner's clear "yes". Push after each finished change and before stopping.
4. Publish only through the private-repo publish workflow, never by hand.
5. Talk to the owner and write release notes in plain, non-coder language.
6. A test build always contains the Windows and Mac apps and the extension, never the extension alone. Deliver it as the two small CI artifacts `plazcode-<version>-Windows-test-lean` and `plazcode-<version>-macOS-test-lean` (app + memory helper + Chrome extension + ready-made Firefox extension, no scripts to run). Details: guide section 8. **The test zip must be 1:1 with the real update zip (owner, 2026-10-23):** same files and layout, so a tester extracts it, opens the `PlazCode` folder and sees everything with no extra steps. Nothing added or left out (no READ-ME-FIRST, no DEVELOPMENT.txt, root extension copies kept). Send the owner the INNER zip (`PlazCode-1.24.21-test-lean.zip` / `PlazCode-macOS-1.24.21-test-lean.zip`), not GitHub's wrapper zip, so they extract only once. Compare its file list with the last release zip before sending.
7. Respect licences. Do not copy code from Multi-Script. Keep credits for UltraLab (SyphoDev), Brickwire (MIT) and the other third parties.
8. No secrets in files, commits or chat.
9. Say honestly what was tested and what was not.
10. An extension fix must take effect when the owner reloads the extension (and refreshes the AI tab) on a test build, with no app update needed. Prefer extension-only fixes, and say plainly in one line whether a reload is enough or the app must be replaced too. The test build still contains the apps.

## Where to edit
Edit files in `development/<version>/overlay/`, never in `build-src-<version>/` (it is rebuilt by `python3 development/<version>/prepare.py`). After editing a protected file, update its hash pin in `test-desktop-regression.js`.

## Running two AIs at once
The owner may run Claude Code and you at the same time. Claim a task on `docs/TASK-BOARD.md`, work in your own branch and git worktree (`git worktree add ../plazcode-<task> -b codex/<task> claude/plazcode-dev`), stay inside your claimed files, start CI for your branch with `gh workflow run validate-1.24.21.yml --ref <branch>`, and leave a short handoff note when you finish (`docs/NOW.md`). Section 11 of the guide has the full protocol.

## Public-then-private plan for test builds and publishing (owner's plan, 2026-10-23)
Builds on this private repo are blocked by GitHub billing, so the repo is made PUBLIC only while a build or publish runs, then PRIVATE again. Every time you are ready for a test build or an update: (1) send the owner the settings link https://github.com/stoveez/plazcode-source/settings and walk them through the whole plan again in plain words (resend it each time); (2) after they make it public, start the build on your task branch; (3) send them the two lean zips as soon as the run ends; (4) tell them to set the repo back to Private right away. Publishing still needs their clear "yes" for that exact update. Full steps, risks and rules: `docs/HANDOFF.md` section "Public-then-private plan". Never change repo visibility yourself.

## Tell the owner after every push (owner, 2026-10-23)
Every time you push a WIP or finished change that another AI could pick up, tell the owner in the same reply, in plain words: the branch name, the short commit ID, and one line on what is in it (and whether it is unfinished). Say it even for small pushes, so the owner always knows what another AI can see and work from.

## Remind the owner to set the repo back to Private (owner, 2026-10-23)
The owner does not want to forget this step of the public-then-private plan. Remind them at exactly two moments: (1) right after they have received the test zips from you (say it in the same message that delivers the zips), and (2) right after a publish has finished. Do not remind them before those moments (for example while a build is still running). After one of those moments, repeat the reminder in later replies until the repo is private. Give the settings link each time: https://github.com/stoveez/plazcode-source/settings (Danger Zone, Change visibility, Private). Check `gh api repos/stoveez/plazcode-source --jq '{private,visibility}'` before you stop working and tell the owner plainly if it is still public. If you are about to end a session while it is public, say so in your last message. Never change visibility yourself.

## Where the detail lives (moved out of this file on 2026-10-24 to save tokens)
- Build, tests, hash pins, CI, quick commands: `docs/vault/build-and-tests.md`
- Test builds and the zips: `docs/vault/test-builds.md`
- Publishing a real update, which repo and branch holds releases: `docs/vault/releasing.md` (then read `publish-1.24.21.yml` and `development/1.24.21/promote.py` before the first real publish)
- Open bugs: `docs/vault/open-work.md`; what is in the latest test zips: `docs/HANDOFF.md`
- Local Windows test-zip build with a CLI agent: `docs/HANDOFF.md`, "Option: build the test zip on the owner's own computer"
- Next update (Brickwire items, login/license, Skill Workshop): `development/1.25.0/` (claim items on `docs/TASK-BOARD.md`)

## Effort
Use maximum care (high reasoning effort) for the license and login server, the Luau helper library and build self-checks, hard bug hunts (for example the Notion send problem) and the planning of big features.

## Your own branch and constant pushes (important)
Make your own branch `<ai-name>/<task>` (for example `codex/<task>`) first, from the newest branch named in `docs/HANDOFF.md`, and work only there. Never work on another AI's branches. Commit and push early and often, including unfinished work labelled `WIP: ...`, so the next AI can restart exactly where you stopped if your limits run out. Keep `docs/TASK-BOARD.md` current (branch, latest commit, what changed, tests, unfinished work, next step) and always tell the owner your branch name and commit id. Full details: the "Every AI: your own branch, WIP and constant pushes" section of `docs/HANDOFF.md`.

## How often to push (the owner's ideal rhythm)
Push after every finished step (a feature, a fix, a merge, a test pass), before anything long or risky (full test run, build, big merge, waiting on a helper or CI), and push half-done work as `WIP: ...` commits. New files and notes are committed and pushed in the same rhythm. Not after every keystroke. Details: `docs/HANDOFF.md`.
