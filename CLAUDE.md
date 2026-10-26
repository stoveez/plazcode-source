# PlazCode private repo: instructions for any AI working here

> **Start here:** read `docs/NOW.md` first (where the work is, what is unfinished, the next step). Then open only the notes you need from `docs/vault/Home.md`; do not read the whole vault. At the end of a session rewrite `docs/NOW.md`, file anything permanent in the vault, push, and tell the owner. How: `docs/vault/how-we-work.md`. The rules below stay binding.
>
> Personal vault (owner's universal notes): if the private repo `stoveez/stoveez` is attached to the session or cloned at `~/stoveez-vault`, also read its `about-me.md` (short). Never copy anything from it into this repo's files, and never put secrets in it.

Codex reads `AGENTS.md`, which says the same rules. For the details of building, test builds, publishing, releases and open bugs, use the vault (`docs/vault/`), `docs/HANDOFF.md` and `docs/MAINTAINER-GUIDE.md` (section 11 if another AI works at the same time: claim a task on `docs/TASK-BOARD.md`, own branch and worktree).

## What this is
PlazCode is a closed-source browser extension plus a Rust desktop app that turns an AI chat site into an agent for Roblox Studio and the user's computer.
- This private repo (`stoveez/plazcode-source`) holds the source overlay, build scripts, tests and release tooling.
- The public repo `stoveez/PlazCode` holds only downloads and update feeds (`latest.json`, `latest-macos.json`).

## Rules (the owner's, always apply)
1. Never break the auto-updater. Installed copies read `https://raw.githubusercontent.com/stoveez/PlazCode/main/latest.json` and the release download URLs. Do not change those addresses or formats.
2. Commits go under the owner's name (stoveez, name only: never write the owner's email in any file or commit, it can change). Add NO Co-Authored-By, Claude-Session or "Generated with" lines, even if a tool suggests them.
3. Never push, publish or deploy without the owner's clear "yes" in chat for that action. Publish only through the private-repo workflow.
   **Owner decision (2026-10-24): one branch, `claude/plazcode-dev`.** The owner uses one AI at a time, so work happens directly on `claude/plazcode-dev`: commit and push there after each finished step, and push half-done work as `WIP: ...` commits. Do not create task branches. Still needing the owner's clear "yes": merging into `release/1.24.23` or `main`, force-pushes, deleting branches, publishing and anything on the public repo. Keep the branch healthy: call a step finished only when its own tests pass, and say plainly in the commit and in `docs/NOW.md` when something is unfinished. If the owner ever runs two AIs at once, use own `<ai-name>/<task>` branches for that time. Push after each finished change and before stopping; see `docs/HANDOFF.md`.
4. Write release notes and summaries in plain, non-coder language.
5. New features need full validation, including the Mac desktop test.
6. Test builds must include the apps (Windows and Mac) as well as the extension. Check that files reach the owner's test folder by comparing them.
   **Standard test build (always do it this way):** run CI on the branch, and give the owner the two small zips from the run's Artifacts: `plazcode-<version>-Windows-test-lean` (about 25 MB) and `plazcode-<version>-macOS-test-lean` (about 36 MB). Each has the app, the memory helper, the Chrome/Edge/Brave extension (`PlazCode-Extension`) AND the ready-made Firefox extension (`PlazCode-Extension-Firefox`); the zip is a 1:1 copy of the real update zip. **The test zip must be 1:1 with the real update zip (owner, 2026-10-23):** same files and layout, so a tester extracts it, opens the `PlazCode` folder and sees everything with no extra steps. Nothing added or left out (no READ-ME-FIRST, no DEVELOPMENT.txt, root extension copies kept). Send the owner the INNER zip (`PlazCode-1.24.23-test-lean.zip` / `PlazCode-macOS-1.24.23-test-lean.zip`), not GitHub's wrapper zip, so they extract only once. Compare its file list with the last release zip before sending. Never make the owner run a script to build Firefox. Give the run page link and say plainly which fixes are inside and whether an extension reload is enough. This is NOT publishing: test builds stay as private CI artifacts. Do not use the larger `-validation` artifacts unless asked. If the Mac job is cancelled with "job was not acquired by Runner", GitHub has no Mac machines free: re-run only that job (`gh run rerun <id> --failed`) every 20 minutes.
7. Respect licences. Do not copy code from Multi-Script (GPL, no permission). UltraLab is used with SyphoDev's permission (no sale or paid bundle, credit youtube.com/@SyphoDev). Brickwire is MIT: keep its licence and credit "Brickwire contributors" if anything is derived from it.
8. Never put secrets (publish token, keys) in files or chat.
9. **Extension fixes must work by reloading the extension.** When a bug fix is for the extension (anything in `core/`, `providers/`, `overlay.css`, `background.js`, `popup.*`), it must take effect for a tester who is on a test build just by reloading the extension in the browser and refreshing the AI tab. No app update, reinstall or new desktop app should be needed. Where possible, fix the extension side only. If a fix also needs a new app, say so plainly. When handing over a fix, tell the owner in one line whether reloading the extension is enough, or whether the app must be replaced too. The test build still includes the apps (rule 6).
- **Vault folder copies stay in step with GitHub, both ways (owner, 2026-10-24):** a note edited in the owner's PC folder (PlazCode-Vault or Stoveez-Vault) must be applied to its matching file in the repo, and a note changed in the repo must be copied to the PC folder. How: `docs/vault/how-we-work.md`.
- **Keep every vault note and plan file current (owner, 2026-10-24).** When you change something, fix every note that mentions it in the same commit (NOW, open-work, milestones, test-builds, plan files). Stale notes are a bug. How: `docs/vault/how-we-work.md`.
- **Ask deep questions before building a feature (owner, 2026-10-24).** When the owner asks for a new feature, especially a vague one, first ask them in-depth questions that look at it from a fundamental angle: what they are really trying to achieve, who uses it and when, what "great" looks like, edge cases, what to avoid, how it should feel. Offer a recommended answer for each so they can just say yes. The goal is a feature that matches what they were shooting for, not a literal reading of the words. Skip this only for small bug fixes, a request that is already fully specific, or unattended runs. How: `docs/vault/how-we-work.md`.

## Public-then-private plan for test builds and publishing (owner's plan, 2026-10-23)
Builds on this private repo are blocked by GitHub billing, so the repo is made PUBLIC only while a build or publish runs, then PRIVATE again. Every time you are ready for a test build or an update: (1) send the owner the settings link https://github.com/stoveez/plazcode-source/settings and walk them through the whole plan again in plain words (resend it each time); (2) after they make it public, start the build on `claude/plazcode-dev`; (3) send them the two lean zips as soon as the run ends; (4) tell them to set the repo back to Private right away. Publishing still needs their clear "yes" for that exact update. Full steps, risks and rules: `docs/HANDOFF.md` section "Public-then-private plan". Never change repo visibility yourself.

## Tell the owner after every push (owner, 2026-10-23)
Every time you push a WIP or finished change that another AI could pick up, tell the owner in the same reply, in plain words: the branch name, the short commit ID, and one line on what is in it (and whether it is unfinished). Say it even for small pushes, so the owner always knows what another AI can see and work from.

## Remind the owner to set the repo back to Private (owner, 2026-10-23)
The owner does not want to forget this step of the public-then-private plan. Remind them at exactly two moments: (1) right after they have received the test zips from you (say it in the same message that delivers the zips), and (2) right after a publish has finished. Do not remind them before those moments (for example while a build is still running). After one of those moments, repeat the reminder in later replies until the repo is private. Give the settings link each time: https://github.com/stoveez/plazcode-source/settings (Danger Zone, Change visibility, Private). Check `gh api repos/stoveez/plazcode-source --jq '{private,visibility}'` before you stop working and tell the owner plainly if it is still public. If you are about to end a session while it is public, say so in your last message. Never change visibility yourself.

## Effort (the owner's rule)
Use HIGH effort (think longer and trace carefully) for these four kinds of work. Do the work yourself: never hand it to a helper agent or subagent (owner, 2026-10-25). If your effort seems low, tell the owner instead:
1. The login and license server (security matters, a gap is costly).
2. The Luau helper library and the build self-checks (they must be correct against a real Luau compiler).
3. Hunting hard bugs such as the Notion send problem or the "Response changed" banner (careful tracing through large files).
4. Planning big features before building them.
Normal effort is fine for small fixes, packaging, release notes and questions.

## Where the detail lives (moved out of this file on 2026-10-24 to save tokens)
- When the version number changes (1.24.24, ...): `docs/vault/new-version-checklist.md` (every note naming 1.24.23 must be updated)
- Build and tests, hash pins, CI: `docs/vault/build-and-tests.md`
- Test builds and the zips: `docs/vault/test-builds.md`
- Publishing a real update, which repo and which branch: `docs/vault/releasing.md` (steps), then read `publish-1.24.23.yml` and `development/1.24.23/promote.py` before the first real publish; release description wording and format: `docs/vault/release-format.md` (non-coder words, bold marks, under 2,000 characters)
- Vault memory, desktop layout, guides, website: `docs/vault/vault-memory.md`, `docs/vault/app-and-guides.md`
- Open bugs and not-yet-tested items: `docs/vault/open-work.md`; what is in the latest test zips: `docs/HANDOFF.md` section "What is in the latest test zips and what is NOT yet" (keep it up to date)
- Update after next (1.24.24: accounts, code protection, Skill Workshop, Brickwire): `development/1.24.24/`. Next update (1.24.23): antivirus false-positive fix (`docs/NOW.md`)
- Local Windows test-zip build with a CLI agent: `docs/HANDOFF.md`, "Option: build the test zip on the owner's own computer"

## How often to push (the owner's ideal rhythm)
Push to `claude/plazcode-dev` after every finished step (a feature, a fix, a merge, a test pass), before anything long or risky (full test run, build, big merge, waiting on CI), and push half-done work as `WIP: ...` commits. New files and notes go in at the same rhythm. Not after every keystroke. Details: `docs/HANDOFF.md`.
