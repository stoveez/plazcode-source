---
name: plazcode-handoff-and-build
description: >-
  Commit, push, sync docs/NOW.md and the owner's local Obsidian vault, trigger or monitor
  public-then-private GitHub Actions test builds, and prepare plain-language release notes
  for PlazCode. Use at the end of a PlazCode work session or whenever shipping/delivering builds.
---

# PlazCode Handoff, Vault Sync & Build Delivery

Follow these rules whenever committing, updating notes, triggering CI builds, or delivering test ZIPs/releases in `stoveez/plazcode-source`.

## 1. Git & Commit Rules (Never Bend)

- **Branch**: Work directly on `claude/plazcode-dev` (unless the owner explicitly says two AIs are working in parallel, in which case claim a task on `docs/TASK-BOARD.md` and work in `<ai-name>/<task>`).
- **Author identity**: Commits go under `stoveez` name only (`git -c user.name="stoveez" -c user.email="" ...`). Never write the owner's email in any file or commit.
- **No AI trailers**: Never add `Co-Authored-By`, `Claude-Session`, or `"Generated with"` lines.
- **Permission & CI queue guard**:
  - **NEVER push to `claude/plazcode-dev` while a `validate-<ver>.yml` run is active on GitHub Actions** — pushing cancels the running build! Check `gh run list -R stoveez/plazcode-source --limit 3` first.
  - Never push, merge to `main`/`release/*`, force-push, delete branches, publish, or change repo visibility without the owner's explicit `"yes"` for that exact action.
  - No secrets (tokens, keys, passwords) in any file, commit, or chat reply.
- **Required push report**: After every push (including `WIP:` pushes), tell the owner in plain words: **branch**, **short commit SHA**, **one-line summary**, and **whether it is finished or unfinished**.

## 2. Keep `docs/NOW.md`, Repo Vault & PC Obsidian Vault in Sync

1. Rewrite `docs/NOW.md` (short, newest first) with current branch, commit, tested status, open issues, and next step.
2. File permanent knowledge in `docs/vault/` (link from `docs/vault/Home.md`, move finished items to `milestones.md`, record design choices in `decisions.md`, update `open-work.md` and `test-builds.md`).
3. `git grep` any version number, branch name, or feature name you changed and fix stale lines in the same commit.
4. On the owner's PC, sync the repo vault to `C:\Users\plazm\Downloads\PlazCode-Vault\vault`:
   `powershell -ExecutionPolicy Bypass -File .\.agents\skills\plazcode-handoff-and-build\scripts\pc-vault-sync.ps1`
   (It checks `.pc-sync.json` first so local Obsidian edits are never silently overwritten, rewrites `../NOW.md` -> `NOW.md` in `Home.md` and `how-we-work.md`, and verifies `0` SHA-256 mismatches.)

## 3. Public-Then-Private CI Test Builds & Visibility Rules

Private repo Actions minutes are billing-blocked, so the owner flips visibility temporarily for builds:

1. Walk the owner through https://github.com/stoveez/plazcode-source/settings (**Danger Zone > Change visibility > Public**). Never change repo visibility yourself.
2. Check visibility (`gh api repos/stoveez/plazcode-source --jq '{private,visibility}'`) and run `gh workflow run validate-<ver>.yml --ref claude/plazcode-dev` (or push when no run is active).
3. **Immediate Windows ZIP alert (`2026-11-08` rule)**: As soon as `plazcode-<ver>-Windows-test-lean` appears in `gh api repos/stoveez/plazcode-source/actions/runs/<id>/artifacts`, tell the owner right away with the run link and note that Mac/Linux and the final result are still running. Send a second final message when all jobs complete.
4. **Inner ZIP layout**: Always deliver/point to the inner `PlazCode-<ver>-test-lean.zip` / `PlazCode-macOS-<ver>-test-lean.zip` (1:1 with the real release layout), not GitHub's outer wrapper ZIP, and state in one plain line whether an **extension reload is enough** or **the desktop app must be replaced too**.
5. **Private reminder timing (`2026-10-23` rule)**:
   - Remind the owner to switch `stoveez/plazcode-source` back to **Private** (`https://github.com/stoveez/plazcode-source/settings` -> **Danger Zone > Change visibility > Private**) **ONLY** right after test ZIPs are delivered or right after a publish finishes — **never while a build is still running**.
   - Before ending any session, check `gh api repos/stoveez/plazcode-source --jq '{private,visibility}'` and state plainly if the repo is still public (repeating the Private reminder if past delivery/publish).

## 4. Publishing a Real Release

1. Follow `docs/vault/new-version-checklist.md` when bumping versions, and `docs/vault/releasing.md` for `promote.py` and `publish-<ver>.yml`.
2. **Show exact release notes first (`2026-11-02` rule)**: Draft plain, non-coder Discord-formatted release notes (`< 2,000` UTF-16 chars matching `docs/vault/release-format.md`) and show the exact text for approval before publishing.
3. Require a fully green validation run on the exact commit, run dry-run validation if applicable, get a fresh clear `"yes"` for that exact update, publish via the private workflow (never hand-edit `stoveez/PlazCode`), verify live `latest.json` / `latest-macos.json` / `latest-linux.json` + download SHA-256, and remind the owner to switch `stoveez/plazcode-source` back to **Private**.
