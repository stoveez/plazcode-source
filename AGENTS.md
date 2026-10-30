# AGENTS.md - instructions for any AI working in this repo (Codex, Claude, or others)

**Current development: 1.24.27 — full profile/sign-in/sync test builds verified and delivered; owner-approved rectangular profile/background design. Latest published remains 1.24.26.** See `docs/NOW.md`.
> **Start here:** read `docs/NOW.md` first (where the work is, what is unfinished, the next step). Then open only the notes you need from `docs/vault/Home.md`; do not read the whole vault. At the end of a session rewrite `docs/NOW.md`, file anything permanent in the vault, push, and tell the owner. How: `docs/vault/how-we-work.md`. The rules below stay binding.
>
> Personal vault (owner's universal notes): if the private repo `stoveez/stoveez` is attached to the session or cloned at `~/stoveez-vault`, also read its `about-me.md` (short). Never copy anything from it into this repo's files, and never put secrets in it.

This is the private source repo for PlazCode (`stoveez/plazcode-source`). For anything beyond these rules read `docs/MAINTAINER-GUIDE.md`, `docs/TASK-BOARD.md` and `docs/HANDOFF.md`; build, release and status details are in `docs/vault/`.

**Owner delivery rule (2026-10-30):** immediately send actual running-PlazCode screenshots/videos through Google Drive when each feature is ready, before the rest of testing/builds finish. Deliver the exact verified inner test ZIPs through Google Drive too, with normal file links and metadata/size readback. No mockups or workspace-only download links. See `docs/vault/how-we-work.md`.

## Which branch to use
Start from **`claude/plazcode-dev`** (the newest finished work; the repo's `main` is old and `release/1.24.25` is behind). Work directly on it (the owner uses one AI at a time): commit and push there, no task branches. Do not push to `release/1.24.25` or `main` without the owner's yes. Ignore the old branch `claude/vault-brain-and-cleanups`. If you cannot see `docs/NOW.md`, you are on the wrong branch: `git fetch origin` and switch to `claude/plazcode-dev`.

## Rules that never bend
1. Never break the auto-updater (the feed addresses and format in `latest.json` / `latest-macos.json` must keep working for every installed copy).
2. Commits go under the owner's name (stoveez, name only: never write the owner's email in any file or commit, it can change). Never add Co-Authored-By, session links, "Generated with" or any AI credit.
3. Never push, publish, deploy or buy anything without the owner's clear "yes" for that exact action. Committing locally is fine.
   **Owner decision (2026-10-24): one branch, `claude/plazcode-dev`.** The owner uses one AI at a time, so work happens directly on `claude/plazcode-dev`: commit and push there after each finished step, and push half-done work as `WIP: ...` commits. Do not create task branches. Still needing the owner's clear "yes": merging into `release/1.24.25` or `main`, force-pushes, deleting branches, publishing and anything on the public repo. Keep the branch healthy: call a step finished only when its own tests pass, and say plainly in the commit and in `docs/NOW.md` when something is unfinished. If the owner ever runs two AIs at once, use own `<ai-name>/<task>` branches for that time. Push after each finished change and before stopping; see `docs/HANDOFF.md`.
4. Publish only through the private-repo publish workflow, never by hand.
5. Talk to the owner and write release notes in plain, non-coder language.
6. A test build always contains the Windows and Mac apps and the extension, never the extension alone. Deliver it as the two small CI artifacts `plazcode-<version>-Windows-test-lean` and `plazcode-<version>-macOS-test-lean` (app + memory helper + Chrome extension + ready-made Firefox extension, no scripts to run). Details: guide section 8. **The test zip must be 1:1 with the real update zip (owner, 2026-10-23):** same files and layout, so a tester extracts it, opens the `PlazCode` folder and sees everything with no extra steps. Nothing added or left out (no READ-ME-FIRST, no DEVELOPMENT.txt, root extension copies kept). Send the owner the INNER zip (`PlazCode-1.24.25-test-lean.zip` / `PlazCode-macOS-1.24.25-test-lean.zip`), not GitHub's wrapper zip, so they extract only once. Compare its file list with the last release zip before sending.
7. Respect licences. Do not copy code from Multi-Script. Keep credits for UltraLab (SyphoDev), Brickwire (MIT) and the other third parties.
8. No secrets in files, commits or chat.
9. Say honestly what was tested and what was not.
10. An extension fix must take effect when the owner reloads the extension (and refreshes the AI tab) on a test build, with no app update needed. Prefer extension-only fixes, and say plainly in one line whether a reload is enough or the app must be replaced too. The test build still contains the apps.

## Where to edit
Edit files in `development/<version>/overlay/`, never in `build-src-<version>/` (it is rebuilt by `python3 development/<version>/prepare.py`). After editing a protected file, update its hash pin in `test-desktop-regression.js`.

## Running two AIs at once
Only if the owner says two AIs run at once (normally they do not): the owner may run Claude Code and you at the same time. Claim a task on `docs/TASK-BOARD.md`, work in your own branch and git worktree (`git worktree add ../plazcode-<task> -b codex/<task> claude/plazcode-dev`), stay inside your claimed files, start CI for your branch with `gh workflow run validate-1.24.27.yml --ref <branch>`, and leave a short handoff note when you finish (`docs/NOW.md`). Section 11 of the guide has the full protocol.
- **Vault folder copies stay in step with GitHub, both ways (owner, 2026-10-24):** a note edited in the owner's PC folder (PlazCode-Vault or Stoveez-Vault) must be applied to its matching file in the repo, and a note changed in the repo must be copied to the PC folder. How: `docs/vault/how-we-work.md`.
- **Keep every vault note and plan file current (owner, 2026-10-24).** When you change something, fix every note that mentions it in the same commit (NOW, open-work, milestones, test-builds, plan files). Stale notes are a bug. How: `docs/vault/how-we-work.md`.
- **Ask deep questions before building a feature (owner, 2026-10-24).** When the owner asks for a new feature, especially a vague one, first ask them in-depth questions that look at it from a fundamental angle: what they are really trying to achieve, who uses it and when, what "great" looks like, edge cases, what to avoid, how it should feel. Offer a recommended answer for each so they can just say yes. The goal is a feature that matches what they were shooting for, not a literal reading of the words. Skip this only for small bug fixes, a request that is already fully specific, or unattended runs. How: `docs/vault/how-we-work.md`.

## Public-then-private plan for test builds and publishing (owner's plan, 2026-10-23)
Builds on this private repo are blocked by GitHub billing, so the repo is made PUBLIC only while a build or publish runs, then PRIVATE again. Every time you are ready for a test build or an update: (1) send the owner the settings link https://github.com/stoveez/plazcode-source/settings and walk them through the whole plan again in plain words (resend it each time); (2) after they make it public, start the build on `claude/plazcode-dev`; (3) send them the two lean zips as soon as the run ends; (4) tell them to set the repo back to Private right away. Publishing still needs their clear "yes" for that exact update. Full steps, risks and rules: `docs/HANDOFF.md` section "Public-then-private plan". Never change repo visibility yourself.

## Tell the owner after every push (owner, 2026-10-23)
Every time you push a WIP or finished change that another AI could pick up, tell the owner in the same reply, in plain words: the branch name, the short commit ID, and one line on what is in it (and whether it is unfinished). Say it even for small pushes, so the owner always knows what another AI can see and work from.

## Remind the owner to set the repo back to Private (owner, 2026-10-23)
The owner does not want to forget this step of the public-then-private plan. Remind them at exactly two moments: (1) right after they have received the test zips from you (say it in the same message that delivers the zips), and (2) right after a publish has finished. Do not remind them before those moments (for example while a build is still running). After one of those moments, repeat the reminder in later replies until the repo is private. Give the settings link each time: https://github.com/stoveez/plazcode-source/settings (Danger Zone, Change visibility, Private). Check `gh api repos/stoveez/plazcode-source --jq '{private,visibility}'` before you stop working and tell the owner plainly if it is still public. If you are about to end a session while it is public, say so in your last message. Never change visibility yourself.

## Where the detail lives (moved out of this file on 2026-10-24 to save tokens)
- When the version number changes (1.24.26, ...): `docs/vault/new-version-checklist.md` (every note naming 1.24.25 must be updated)
- Build, tests, hash pins, CI, quick commands: `docs/vault/build-and-tests.md`
- Test builds and the zips: `docs/vault/test-builds.md`
- Publishing a real update, which repo and branch holds releases: `docs/vault/releasing.md` (then read `publish-1.24.27.yml` and `development/1.24.27/promote.py` before the first real publish); release description wording and format: `docs/vault/release-format.md` (non-coder words, bold marks, under 2,000 characters)
- Open bugs: `docs/vault/open-work.md`; what is in the latest test zips: `docs/HANDOFF.md`
- Local Windows test-zip build with a CLI agent: `docs/HANDOFF.md`, "Option: build the test zip on the owner's own computer"
- Remaining deferred plans (accounts, Skill Workshop, Brickwire; code protection shipped in 1.24.26): `development/1.24.26/`. Latest published: 1.24.26 (signed program/update checks and permanent approvals; see `docs/NOW.md`)

## Effort
Use maximum care (high reasoning effort) for the license and login server, the Luau helper library and build self-checks, hard bug hunts (for example the Notion send problem) and the planning of big features. Do this work yourself; never hand it to a helper agent or subagent (owner, 2026-10-25).

## One branch and constant pushes (important)
Work on `claude/plazcode-dev` and push there early and often, including unfinished work labelled `WIP: ...`, so the next AI can restart exactly where you stopped if your limits run out. Rewrite `docs/NOW.md` in the same commit as every push (newest change first) and always tell the owner the branch name and commit id. Do not leave `claude/plazcode-dev` broken: say plainly in the commit message and in `docs/NOW.md` when something is unfinished. Full details: `docs/HANDOFF.md`.

## How often to push (the owner's ideal rhythm)
Push after every finished step (a feature, a fix, a merge, a test pass), before anything long or risky (full test run, build, big merge, waiting on CI), and push half-done work as `WIP: ...` commits. New files and notes are committed and pushed in the same rhythm. Not after every keystroke. Details: `docs/HANDOFF.md`.
