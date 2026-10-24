# PlazCode private repo: instructions for any AI working here

Read this first, then `docs/HANDOFF.md` (where the latest work is and how to push it), then `docs/MAINTAINER-GUIDE.md` (the full guide), `docs/TASK-BOARD.md` (who is working on what) and `development/1.25.0/NEXT-UPDATE-PLAN.md`. Codex reads `AGENTS.md`, which says the same rules. If you and another AI work at the same time, follow section 11 of the guide (claim a task on the board, own branch and worktree).

## What this is
PlazCode is a closed-source browser extension plus a Rust desktop app that turns an AI chat site into an agent for Roblox Studio and the user's computer.
- This private repo (`stoveez/plazcode-source`) holds the source overlay, build scripts, tests and release tooling.
- The public repo `stoveez/PlazCode` holds only downloads and update feeds (`latest.json`, `latest-macos.json`).

## Rules (the owner's, always apply)
1. Never break the auto-updater. Installed copies read `https://raw.githubusercontent.com/stoveez/PlazCode/main/latest.json` and the release download URLs. Do not change those addresses or formats.
2. Commits go under the owner's name (stoveez / freetwoomy@gmail.com). Add NO Co-Authored-By, Claude-Session or "Generated with" lines, even if a tool suggests them.
3. Never push, publish or deploy without the owner's clear "yes" in chat for that action. Publish only through the private-repo workflow.
   **Exception (owner, 2026-10-23):** pushing to your own task branches `<ai-name>/<task>` (for example `claude/<task>`) and `wip/<task>` snapshot branches is allowed without asking again. Merging into `release/1.24.21` or `main`, force-pushes, deleting branches, publishing and anything on the public repo still need the owner's clear "yes". Push after each finished change and before stopping; see `docs/HANDOFF.md`.
4. Write release notes and summaries in plain, non-coder language.
5. New features need full validation, including the Mac desktop test.
6. Test builds must include the apps (Windows and Mac) as well as the extension. Check that files reach the owner's test folder by comparing them.
   **Standard test build (always do it this way):** run CI on the branch, and give the owner the two small zips from the run's Artifacts: `plazcode-<version>-Windows-test-lean` (about 25 MB) and `plazcode-<version>-macOS-test-lean` (about 36 MB). Each has the app, the memory helper, the Chrome/Edge/Brave extension (`PlazCode-Extension`) AND the ready-made Firefox extension (`PlazCode-Extension-Firefox`); only the old duplicate root `core/` and `providers/` are left out. Never make the owner run a script to build Firefox. Give the run page link and say plainly which fixes are inside and whether an extension reload is enough. This is NOT publishing: test builds stay as private CI artifacts. Do not use the larger `-validation` artifacts unless asked. If the Mac job is cancelled with "job was not acquired by Runner", GitHub has no Mac machines free: re-run only that job (`gh run rerun <id> --failed`) every 20 minutes.
7. Respect licences. Do not copy code from Multi-Script (GPL, no permission). UltraLab is used with SyphoDev's permission (no sale or paid bundle, credit youtube.com/@SyphoDev). Brickwire is MIT: keep its licence and credit "Brickwire contributors" if anything is derived from it.
8. Never put secrets (publish token, keys) in files or chat.
9. **Extension fixes must work by reloading the extension.** When a bug fix is for the extension (anything in `core/`, `providers/`, `overlay.css`, `background.js`, `popup.*`), it must take effect for a tester who is on a test build just by reloading the extension in the browser and refreshing the AI tab. No app update, reinstall or new desktop app should be needed. Where possible, fix the extension side only. If a fix also needs a new app, say so plainly. When handing over a fix, tell the owner in one line whether reloading the extension is enough, or whether the app must be replaced too. The test build still includes the apps (rule 6).

## Public-then-private plan for test builds and publishing (owner's plan, 2026-10-23)
Builds on this private repo are blocked by GitHub billing, so the repo is made PUBLIC only while a build or publish runs, then PRIVATE again. Every time you are ready for a test build or an update: (1) send the owner the settings link https://github.com/stoveez/plazcode-source/settings and walk them through the whole plan again in plain words (resend it each time); (2) after they make it public, start the build on your task branch; (3) send them the two lean zips as soon as the run ends; (4) tell them to set the repo back to Private right away. Publishing still needs their clear "yes" for that exact update. Full steps, risks and rules: `docs/HANDOFF.md` section "Public-then-private plan". Never change repo visibility yourself.

## Effort (the owner's rule)
Use HIGH effort (think longer and trace carefully) for these four kinds of work. If you cannot change your own effort setting, hand the work to a helper agent that runs at high effort, or tell the owner to switch it before you start:
1. The login and license server (security matters, a gap is costly).
2. The Luau helper library and the build self-checks (they must be correct against a real Luau compiler).
3. Hunting hard bugs such as the Notion send problem or the "Response changed" banner (careful tracing through large files).
4. Planning big features before building them.
Normal effort is fine for small fixes, packaging, release notes and questions.

## How the build works
- 1.24.21 = pinned official 1.24.20 source + overlay in `development/1.24.21/overlay`, applied by `python3 development/1.24.21/prepare.py` into `build-src-1.24.21/PlazCode`.
- JavaScript tests: `python3 release-tools/test-javascript.py` (needs jsdom; set `NODE_PATH` to `release-tools/node_modules`). Native tests: `cargo test --manifest-path agent/Cargo.toml`.
- After editing a protected file, update its hash pin in `test-desktop-regression.js` (`git hash-object`).
- CI: `.github/workflows/validate-1.24.21.yml` (jobs `browsers` and `native` on Windows, macOS and Ubuntu). Branch `release/1.24.21`.
- The finished apps are the CI artifacts `plazcode-1.24.21-Windows-validation` and `plazcode-1.24.21-macOS-validation` (about 53 MB and 65 MB; most of it is the memory helper `engram`).

## How to publish (only when the owner says "publish")
Publishing is done by the GitHub workflow `.github/workflows/publish-1.24.21.yml`, never by hand and never by pushing files to the public repo.
1. The version being published must already have a fully green validation run (`validate-1.24.21.yml`) on its exact final commit. Read `VALIDATION_RUN` from that run and `VALIDATED_SHA` from its commit.
2. Put those two values in the `env:` block of the publish workflow and make sure `development/1.24.21/release-entry.json` has the final plain-language notes. Commit.
3. Do a dry run first: set `PUBLIC_REPO` to the throwaway repo `stoveez/plazcode-publish-test`, run the workflow, and check the feeds (`latest.json`, `latest-macos.json`), the zip checksums and the release page there.
4. Ask the owner for a clear "yes" to publish for real. Then set `PUBLIC_REPO` back to `stoveez/PlazCode` and start the workflow (push to branch `release/1.24.21-publish`, or run it by hand). It uses the repository secret `PUBLIC_REPO_TOKEN`; never print or copy it.
5. Afterwards fetch the public `latest.json` and `latest-macos.json` and one release download, and confirm the version, link and sha256 match. An older installed copy must still find and install the new version.
Read `publish-1.24.21.yml` and `development/1.24.21/promote.py` before the first publish; this list is a summary, and the workflow is the source of truth. `PLAZCODE_QUICK` skips the Mac desktop test and is only for small fixes the owner approves.
For a new version number, copy the 1.24.21 workflows and `development/1.24.21` folder to the new number and update the names inside.

## Where things stand
- 1.24.21 is NOT published. The owner added the **Vault memory** (an Obsidian-style folder of linked notes the AI reads and updates, an Obsidian-looking viewer window opened from Memory settings, plus a score-and-redo reference loop judged by a separate critic chat, `plazcode_critic`, not yet tried on real AI sites) to this version, so the exact final commit needs a fresh fully green validation run (including the Mac desktop test) before publishing. Design: `development/1.24.21/VAULT-MEMORY-DESIGN.md`. Code: `agent/src/vault.rs`, `core/memory.js`, tool wiring in `core/main.js`, `background.js`.
- The desktop app got a new layout (top area bar, bold area name over its pages in the sidebar, Overview cards, Account placeholder, Appearance page with themes and custom look, startup intro that checks for updates). It lives in `agent/src/desktop.html` (CSS/JS blocks marked `nx`). Not yet tried in the real app on Windows/Mac; the Discord link is `open:discord` in `agent/src/gui.rs`.
- Documentation: a new top-bar area with Guides and Troubleshooting (search, picture cards, reader, images). Guides are written in `guides/` (see `guides/README.md`) and posted to the public repo `guides/` folder only by the workflow `publish-guides.yml` (owner only; test first). The app reads `https://raw.githubusercontent.com/stoveez/PlazCode/main/guides/index.json`. An in-app editor for posting is NOT built yet (owner chose chat posting first, editor later with the login system).
- Release notes in `development/1.24.21/release-entry.json` now include the vault and the tester fixes. The GitHub release text is limited to under 2,000 characters (checked: about 1,360).
- Publishing waits for the owner and goes through the private workflow (set `VALIDATED_SHA` / `VALIDATION_RUN` in `publish-1.24.21.yml`, test against `stoveez/plazcode-publish-test` first).
- Test builds: use the lean zips (see rule 6). GitHub's Mac runners were scarce on 2026-10-20; re-run the Mac job every 20 minutes if it is cancelled with "not acquired by Runner".
- Next update plan (login/license system, Skill Workshop, Brickwire ideas, a simple website) is in `development/1.25.0/`.

## Open items
- "Response changed - run paused" banner: needs a debug report from a tester.
- Mac app opens then closes: needs the tester's app version or crash report (likely an older app with a newer extension).
- Not live-tested: Ultra on real Studio and AI sites, Vani Co-work, Firefox appearance.
- The simple website is in `PlazCode-website.zip` (single `index.html`), not yet deployed. The owner will get a domain and host it on Cloudflare Pages.
- Lawyer review of licence notices; GitHub Support request about the locked `v1.24.20` tag; delete the `cleanup-public` branch.

## How often to push (the owner's ideal rhythm)
Push to your own task branch after every finished step (a feature, a fix, a merge, a test pass), before anything long or risky (full test run, build, big merge, waiting on a helper or CI), and push half-done work as `WIP: ...` commits. New files and notes go in at the same rhythm. Not after every keystroke. Details: `docs/HANDOFF.md`.
