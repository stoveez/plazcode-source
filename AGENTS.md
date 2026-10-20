# AGENTS.md - instructions for Codex and other AI helpers

This is the private source repo for PlazCode (`stoveez/plazcode-source`). **Read `docs/MAINTAINER-GUIDE.md` completely before you change anything**, then `docs/TASK-BOARD.md`, then `development/1.25.0/NEXT-UPDATE-PLAN.md`. This page is only the short version of the rules; the guide has the details, commands and procedures.

## Rules that never bend
1. Never break the auto-updater (the feed addresses and format in `latest.json` / `latest-macos.json` must keep working for every installed copy).
2. Commits go under the owner's name (stoveez, freetwoomy@gmail.com). Never add Co-Authored-By, session links, "Generated with" or any AI credit.
3. Never push, publish, deploy or buy anything without the owner's clear "yes" for that exact action. Committing locally is fine.
4. Publish only through the private-repo publish workflow, never by hand.
5. Talk to the owner and write release notes in plain, non-coder language.
6. A test build always contains the Windows and Mac apps and the extension, never the extension alone.
7. Respect licences. Do not copy code from Multi-Script. Keep credits for UltraLab (SyphoDev), Brickwire (MIT) and the other third parties.
8. No secrets in files, commits or chat.
9. Say honestly what was tested and what was not.
10. An extension fix must take effect when the owner reloads the extension (and refreshes the AI tab) on a test build, with no app update needed. Prefer extension-only fixes, and say plainly in one line whether a reload is enough or the app must be replaced too. The test build still contains the apps.

## Where to edit
Edit files in `development/<version>/overlay/`, never in `build-src-<version>/` (it is rebuilt by `python3 development/<version>/prepare.py`). After editing a protected file, update its hash pin in `test-desktop-regression.js`.

## Running two AIs at once
The owner may run Claude Code and you at the same time. Claim a task on `docs/TASK-BOARD.md`, work in your own branch and git worktree (`git worktree add ../plazcode-<task> -b codex/<task> release/1.24.21`), stay inside your claimed files, start CI for your branch with `gh workflow run validate-1.24.21.yml --ref <branch>`, and leave a short handoff note when you finish. Section 11 of the guide has the full protocol.

## Effort
Use maximum care (high reasoning effort) for the license and login server, the Luau helper library and build self-checks, hard bug hunts (for example the Notion send problem) and the planning of big features.

## Quick commands
- Build the source tree: `python3 development/1.24.21/prepare.py`
- All JavaScript tests: `cd build-src-1.24.21/PlazCode && NODE_PATH=release-tools/node_modules PLAZCODE_TEST_BROWSER=chromium python3 release-tools/test-javascript.py`
- App tests: `cargo test --manifest-path agent/Cargo.toml`
- Validation in CI: `gh workflow run validate-1.24.21.yml --ref <branch>` (about 30 minutes; all four jobs must pass)

## Next-update work
The Brickwire-inspired items are specified in detail in `development/1.25.0/BRICKWIRE-ITEMS-SPEC.md`; claim them on `docs/TASK-BOARD.md`.
