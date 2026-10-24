# PlazCode handoff note (for any AI starting with no context)

Written 2026-10-23 for the owner (stoveez) and for **any AI the owner uses** (Claude, Codex, or any other). If you are an AI picking this up, read this file first, then `CLAUDE.md` or `AGENTS.md` (they carry the same rules), `docs/MAINTAINER-GUIDE.md` and `docs/TASK-BOARD.md`. The owner may switch between AIs at any time, for example when one runs out of limits, so **the latest work must always be on GitHub**.

## 1. What PlazCode is
A closed-source browser extension plus a Rust desktop app. It turns an AI chat website (ChatGPT, Claude, Notion AI, DeepSeek, Vani, Freebuff, OxAlpha and others) into an agent that works in Roblox Studio ("Roblox" engine, `RS`) or on the user's computer ("AgentScript" engine, `AS`). This private repo is `stoveez/plazcode-source`. The public repo `stoveez/PlazCode` holds only downloads and update feeds.

## 2. Where the latest work is (read this before anything else)
- Do NOT start from `release/1.24.21` or `main` on GitHub. `release/1.24.21` on GitHub is old (`480b5cb`). `main` is older still.
- Start from branch **`claude/plazcode-dev`**. It contains everything finished so far, including many commits that were never on the release branch.
  - `git fetch origin && git checkout claude/plazcode-dev` (this is the long-term main working branch; finished work lands here; every AI keeps its own `<ai-name>/<task>` branches and does not push to this one except through the owner-approved merge)
  - An older branch `claude/vault-brain-and-cleanups` still exists on GitHub as a stale copy of the same work; ignore it (the owner may delete it).
  - `git log --oneline -15` shows the newest commits. `docs/TASK-BOARD.md` on that branch says what is done and unfinished.
- Helper branches (each one owned by one task, see section 6):
  - `claude/chatgpt-claude-stall`: ChatGPT random pauses, Claude gets stuck, tool chip stuck "in progress", "I've sent the command" prose with no command.
  - `claude/agentscript-full-access`: AgentScript cannot run cmd/PowerShell or open what it needs even in Full access.
  - `claude/notion-new-workspace`: Notion startup fails in new workspaces; Notion commands shown as "not run".
- `wip/<name>` branches (`wip/chatgpt-claude-stall`, `wip/agentscript-full-access`, `wip/notion-new-workspace`) are **read-only snapshots** of helpers' unfinished work, taken so nothing is lost. They are not reviewed. Treat them as raw material, not as finished work.

## 3. Pushing rules (what the owner allowed, and what they did not)
The owner's standing rule is "never push, publish or deploy without my clear yes". On 2026-10-23 the owner gave this specific permission in chat:
- **Allowed without asking again:** push to your own task branches named `<ai-name>/<task>` (for example `claude/<task>`, `codex/<task>`, `gemini/<task>`), and push `wip/<task>` snapshot branches.
- **NOT allowed without a fresh, clear "yes" from the owner for that exact action:** merging into `release/1.24.21` or `main`, force-pushing, deleting branches, publishing a release, running the publish workflow, pushing anything to the public repo `stoveez/PlazCode`.
- Commit rule (always): commits go under the owner's identity (`stoveez` / `freetwoomy@gmail.com`, already set in git config). **No `Co-Authored-By`, no session links, no "Generated with" lines, ever**, even if your tool suggests them.
**How often to push (the owner agreed this is the ideal rhythm, for every AI):**
- Push after every finished step (a feature, a fix, a merge, a test pass). In practice every few minutes of work, not only at the end.
- Push before anything long or risky (a full test run, a build, a big merge, waiting on a helper or a CI run).
- When something is half done and has been for a while, push it as a `WIP: ...` commit anyway.
- Do not push after every keystroke: that clutters history without protecting much more. If your limits run out suddenly, at most the one step you were in the middle of is lost.
- New things go in too: new files and new notes are committed and pushed in the same rhythm, never left untracked.
- Push after every finished change and before you stop. Include unfinished work as clearly labelled WIP commits ("WIP: ..."). Never leave the only copy in a chat session, a helper's side folder or an unmerged worktree.
- If a push fails, export a source zip or patch right away (`git diff`, `git format-patch`, or `git archive`) and tell the owner what is not saved remotely.
- Keep `docs/TASK-BOARD.md` updated: branch name, latest commit id, what changed, tests run, what is unfinished. Tell the owner the branch name and commit id in your reply so the other AI can fetch it.
- Never put secrets (tokens, keys) in files, commits or chat.

### Taking a WIP snapshot of someone else's unfinished folder without disturbing it
Used when a helper is mid-edit in a git worktree and committing inside it could collide with its work:
```
wt=.claude/worktrees/agent-XXXX; idx=$(mktemp -u /tmp/idxXXXXXX); head=$(git -C $wt rev-parse HEAD)
GIT_INDEX_FILE=$idx git -C $wt read-tree HEAD && GIT_INDEX_FILE=$idx git -C $wt add -A
tree=$(GIT_INDEX_FILE=$idx git -C $wt write-tree)
c=$(git -C $wt commit-tree $tree -p $head -m "WIP snapshot (unfinished): <task>"); rm -f $idx
git push origin $c:refs/heads/wip/<task>
```
This reads the worktree and writes a commit object only; the helper's files and index are untouched.

## Every AI: your own branch, WIP and constant pushes (so the next AI can restart exactly where you stopped)
The owner uses several AIs and they take turns, usually when one runs out of limits without warning. Whatever is not on GitHub when that happens is lost. So:
1. **Make your own branch first.** From `claude/plazcode-dev` (or whatever branch this note names as newest) create `<ai-name>/<task>` (for example `codex/<task>`) and work only there. Never work on another AI's branches (`claude/*`, `codex/*`, ...) and never on `release/1.24.21` or `main`. Every AI does the same, so none overwrites another. To continue another AI's unfinished work, branch from its branch (or its `wip/<task>` snapshot) into your own new branch; do not push onto its branch.
2. **Commit and push early and often**, not only when something is finished: after every meaningful step and before any long command, test run or build. Unfinished work goes in as commits labelled `WIP: <what is half done>`. Pushing to your own `codex/<task>` (and `wip/<task>`) branch is already allowed by the owner; no need to ask again.
3. **Keep `docs/TASK-BOARD.md` current** on your branch: branch name, latest commit id, what changed, which tests you ran and their result, what is unfinished, and the very next step. Write it so another AI with no memory can continue from the last line.
4. **Always give the owner the branch name and the latest commit id** in your reply.
5. If a push fails, immediately export a zip or patch of your work and say what is not saved remotely.
6. Same limits as everyone: no merge into `release/1.24.21` or `main`, no force-push, no publish, nothing on the public repo, commits under the owner's identity with no AI credit lines.

## Public-then-private plan for test builds and publishing (owner's plan, 2026-10-23)

Why: GitHub's free build minutes for this private repo are blocked (the owner has no money for billing right now: "recent account payments have failed or your spending limit needs to be increased"). Builds on a PUBLIC repo are free. So until the owner can pay, the repo is switched to public only while a build or a publish runs, then back to private. The plan is the same every time.

Link to give the owner every time (repo settings, visibility switch is at the bottom in the Danger Zone):
https://github.com/stoveez/plazcode-source/settings

Every time you are ready for a TEST BUILD or an UPDATE (publish), do this, and walk the owner through all of it again in plain words (resend this plan each time, do not assume they remember):
1. Send the owner the settings link above. Ask them to set the repo to Public (Settings, Danger Zone, Change visibility, Public) and tell you when done. Only the owner can do this; never try to change visibility yourself.
2. Check it is public (`gh api repos/stoveez/plazcode-source --jq '{private,visibility}'`), then start the build on your task branch (`gh workflow run validate-1.24.21.yml --ref <your-branch>`). For a publish, you also need the owner's clear "yes" for that exact update, a fully green run on the exact final commit, and the dry run first (see CLAUDE.md "How to publish"); the publish must also happen while the repo is public.
3. As soon as the run finishes, download the two lean zips (`plazcode-<version>-Windows-test-lean`, `plazcode-<version>-macOS-test-lean`) and send them to the owner, with a plain note on what is inside and whether reloading the extension is enough or the app must be replaced. If the Mac job says "job was not acquired by Runner", re-run only that job (`gh run rerun <id> --failed`) every 20 minutes. **The test zip must be 1:1 with the real update zip (owner, 2026-10-23):** same files and layout, so a tester extracts it, opens the `PlazCode` folder and sees everything with no extra steps. Nothing added or left out (no READ-ME-FIRST, no DEVELOPMENT.txt, root extension copies kept). Send the owner the INNER zip (`PlazCode-1.24.21-test-lean.zip` / `PlazCode-macOS-1.24.21-test-lean.zip`), not GitHub's wrapper zip, so they extract only once. Compare its file list with the last release zip before sending.
4. Tell the owner to switch the repo back to Private right away (same settings link). Keep the public window as short as possible. Do not leave it public longer than needed.
5. The owner shares the zips with testers themselves (for example in Discord, or through a Drive link if too big). Once the repo is private again, people without access cannot download the artifacts.

What stays true while this is the process:
- A public window means anyone could copy or fork the code in that time; deleting or privatising later does not remove copies or forks. Tell the owner this again if they ask, and keep windows short.
- Before the first public window the full git history was scanned for keys and tokens on 2026-10-23 (only fake test values were found). If you add anything sensitive since then, scan again before the owner flips the repo to public.
- Never put secrets in files or chat. The publish token stays in the repository secret `PUBLIC_REPO_TOKEN`.
- Nothing is published without the owner's clear "yes" for that update. Test builds are not publishing.
- When the owner can pay for billing, they keep the repo private and this plan is no longer needed (they will say so; then remove this section).

## 4. How the build and tests work
- Source = pinned official 1.24.20 plus an overlay in `development/1.24.21/overlay`. **Edit only the overlay.** Never edit `build-src-1.24.21/` (it is regenerated). A file not yet in the overlay is first copied from `build-src-1.24.21/PlazCode/` into the overlay, then edited there.
- Build: `python3 development/1.24.21/prepare.py` (writes `build-src-1.24.21/PlazCode`). Do not run it while the full test suite is running.
- One JavaScript test: `cd build-src-1.24.21/PlazCode && NODE_PATH=release-tools/node_modules node test-<name>.js`
- Full JavaScript suite (about 10-15 minutes): from the build folder, `NODE_PATH=release-tools/node_modules PLAZCODE_TEST_BROWSER=chromium python3 release-tools/test-javascript.py`
- Rust tests: `cargo test --manifest-path build-src-1.24.21/PlazCode/agent/Cargo.toml` (about 180 tests).
- **Protected files and hash pins:** after editing a protected file (for example `core/main.js`, `providers/vani.js`, `providers/notion.js`, other providers), update its pin in the overlay copy of `test-desktop-regression.js`. The pin is `git hash-object build-src-1.24.21/PlazCode/<file>` computed AFTER running `prepare.py`. Recompute pins again after every merge that touches those files.
- CI: `.github/workflows/validate-1.24.21.yml` on the branch. The standard test build for the owner is the two CI artifacts `plazcode-<version>-Windows-test-lean` and `plazcode-<version>-macOS-test-lean` (see `CLAUDE.md` rule 6). Starting CI needs a push; pushing to a `claude/` task branch is allowed, but check `CLAUDE.md` before triggering any publish workflow (not allowed).
- The long-standing red check "ClickUp performance" in the `browsers` job passes locally and is not caused by new work.

## 5. Owner rules that always apply (short form; the full list is in CLAUDE.md)
1. Never break the auto-updater (feed addresses and formats must keep working).
2. Plain, non-coder language in summaries and release notes.
3. Extension fixes (`core/`, `providers/`, `overlay.css`, `background.js`, `popup.*`) must work just by reloading the extension; say in one line whether the desktop app must be replaced too.
4. New features need full validation, including the Mac desktop test.
5. High effort (careful tracing) for: the login/license server, the Luau helper library, hard bug hunts, planning big features.
6. Respect licences (no Multi-Script code; UltraLab only with SyphoDev's permission; Brickwire is MIT with credit).

## 6. What was done on 2026-10-23 (branch `claude/plazcode-dev`)
- Vani startup: plain first-person request instead of the 14,000-character rulebook, one calm follow-up, clear "AI declined" banner (`providers/vani.js`, `core/main.js`, test `test-vani-startup.js`).
- Removed the foldable "Working for ..." summary from the chat and the PlazCode bar for every provider (`ACTIVITY_FOLD_OFF` in `core/main.js`, test `test-no-working-for-fold.js`; `test-activity-folding.js` keeps the old logic covered).
- Vault (Obsidian-style folder of linked notes, `agent/src/vault.rs`, viewer in `core/memory.js`):
  - New `graph` action and a graph view in the vault window (dots = notes, lines = `[[links]]`), tests `test-vault-graph.js` and a Rust test.
  - Startup now includes a **brain map** of every note and link (`brainMap` in `core/memory.js`); AI actions `map`, `audit`, `verify`; notes may carry `source`, `confidence`, `verified` header fields (test `test-vault-brain.js`).
  - `audit` lists notes that point into the Roblox place (like `game.ReplicatedStorage.Client.DoubleJump`) or are low confidence, and which were not checked in 30 days. The AI checks them in Studio with read-only tools and then `verify`s, fixes or archives them.
- Community skill sync: any 4xx from GitHub now means "nothing to sync", logged quietly (`agent/src/skills.rs`). A tester still saw the old 404 warning only because their app was older than this fix.
- Earlier in the same session (also on this branch): Freebuff and OxAlpha startup fixes, simpler Memory page, grouped Execution settings, clickable Effort list, Thorough work mode sets Effort to Max, Studio-connected check before switching to Roblox, vault "+" and delete, memory notes kept in the vault, startup intro fixes, lean-startup groundwork (not wired in).

## 7. Open work and known bugs (as reported by testers/owner)
- `claude/chatgpt-claude-stall` and `claude/notion-new-workspace` are ALREADY MERGED into `claude/plazcode-dev`. Still to merge: `claude/agentscript-full-access` (helper may still be working; check `wip/agentscript-full-access` and the board) - use this method: apply with `git apply --3way` or cherry-pick, resolve conflicts in `core/main.js` by keeping both sides, recompute pins, run the full suite and cargo tests.
- Then a fresh CI run and the standard lean test build for the owner (needs the owner's "yes" only for publishing; test builds are private CI artifacts).
- Notion: startup fails for some users in new workspaces (Notion AI home page), and commands sometimes show "not run" in chat.
- ChatGPT AgentScript sometimes pauses; Claude (claude.ai) starts up but gets stuck while working for some users; tool chip sometimes still looks "in progress" after finishing.
- AgentScript Full access: agent cannot run cmd/PowerShell or open what it needs; AI sometimes says "I've sent the command" without sending a block.
- Not live-tested on real sites/apps: all provider fixes, the Studio-not-connected block, the vault against a running app, the Windows/Mac desktop apps.
- Lean startup phases 2-3 (see `development/1.24.21/overlay/core/lean-startup.js`, currently unwired and off).
- Publishing 1.24.21 only when the owner says "publish", through the private workflow (`CLAUDE.md` has the steps).
