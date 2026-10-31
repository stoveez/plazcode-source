# PlazCode maintainer guide

**Current, 2026-10-31:** 1.24.28 published. Validation 41214837106 on `b288203`; publish run 41216688966. Start with `docs/NOW.md`. Older entries below are historical.

For any AI (Codex, Claude Code or another) or person who works on PlazCode. Read this whole file before changing anything. The short rules are in `AGENTS.md` / `CLAUDE.md`; this file explains everything behind them.

The owner is not a programmer. Talk to them in plain words. Ask before anything that cannot be undone.

---

**Branch note:** current work is on `release/1.24.25`; the default branch `main` is old and lacks this guide. Always start from `release/1.24.25` and branch from it (`codex/<task>` or `claude/<task>`).

## 1. What PlazCode is

PlazCode turns the AI chat sites people already use (ChatGPT, Claude, Gemini, DeepSeek, Notion AI, ClickUp, Vani and more) into an agent that can build in Roblox Studio and work on the user's computer. It has two parts that talk to each other:

1. **A browser extension** (Chrome, Edge, Brave and other Chromium browsers, plus a Firefox build). It puts a PlazCode bar above the chat box, sends instructions to the AI, reads the AI's replies, finds tool calls in them, runs them and pastes the results back into the chat.
2. **A desktop app** (Rust; Windows and Mac). It does the real work on the computer: runs tools, talks to Roblox Studio and other programs, keeps memory, checks safety rules, updates itself, and shows the PlazCode window.

PlazCode is **closed source**. The public repo `stoveez/PlazCode` holds only downloads and the update feeds. All source lives in the private repo `stoveez/plazcode-source`.

### Features (as of 1.24.21)
Everything below ships today. Do not break any of it.
- **Roblox Studio control** through Studio's built-in MCP server (read the game, create and edit objects and scripts, playtest, read errors). Also an AgentScript mode for other tools.
- **Full PC access** (optional): files, commands, mouse and keyboard, screenshots, screen recording (Windows).
- **Safety settings**: Read-only mode, Confirm before deleting (on by default), Allowed folders. Checked in the browser and again in the app (`core/safety.js` and `agent/src/safety.rs` must agree).
- **What happened**: a plain list of everything the AI did, with Undo for changed files and scripts (`core/action-log.js`, `agent/src/checkpoints.rs`).
- **Fix connection** button and the connection doctor (`core/connection-doctor.js`).
- **Setup for this site**, saved per site (`core/site-setups.js`). **Settings backup** (`core/settings-backup.js`).
- **Skills**: starter skills, user skills, share by pack, code or link, import from GitHub, Gist, Pastebin or Discord (`core/skills-ui.js`, `agent/src/skills.rs`, `agent/src/starter_skills.rs`).
- **Ultra effort**: the UltraLab pack by SyphoDev (53 skills, 7 agents, 18 notes) read with the `ultralab_read` tool and the `roblox_docs` tool. Generated from `development/1.24.25/ultralab/build_ultralab.py`.
- **Vault memory** (new in 1.24.21): an Obsidian-compatible folder of linked Markdown notes (`agent/src/vault.rs`, `core/memory.js`, tool `plazcode_vault`). The AI reads a short start note each chat, searches and reads notes on demand, and updates them itself (switch in Memory settings). Notes are never deleted (archived), secrets are refused, writes stay inside the vault and are allowed in Read-only mode. Includes the reference-and-critic loop (`09 How To/Reference Critic Loop.md` inside the vault). Older flat notes (`memory.json`) are copied in once and the file is kept. The layout copies a hand-made Obsidian vault: numbered folders (`00 Start Here` with Home, Glossary, Index, Log; `01 About You` ... `10 Inbox`, `_Archive`, `_Templates`), notes with `tags`/`aliases`/`updated` properties, `> [!info]` header boxes, pictures in `08 References/refs`. Note headers are kept line for line when the AI edits a note, so a user's own Obsidian vault can be used as the vault (a folder that already has notes is adopted without adding folders). The viewer window (`openVault` in `core/memory.js`, opened by Open vault in Memory settings) is a safe Markdown reader and editor built to look like Obsidian; tests are `test-vault-viewer.js`, `test-vault-memory.js` and the Rust tests in `vault.rs`. **Independent critic chat** (`plazcode_critic`): `criticTool` in `core/memory.js` sends the reference picture(s) from the vault, the latest screenshot and the rubric to a SEPARATE chat. The background worker (`runCritic` in `background.js`) opens a small unfocused window with a fresh chat on the same AI site (supported: ChatGPT, Claude, Gemini, DeepSeek, Kimi, Qwen, GLM; others such as Notion fall back), and that tab's content script (`criticRun` in `core/main.js`, messages `rs-critic-ping` / `rs-critic-run`) types the message with pictures, waits for the reply and returns it. Max 5 rounds, pass mark 80 percent. Any failure returns text telling the AI to use the same-chat critic role. It never runs in a tab that has its own PlazCode session. Extension only: reloading the extension is enough (the vault itself still needs the new app). Not yet tried on real AI sites. Test: `test-critic-chat.js`.
- **Stuck command card fix** (1.24.21): the restart check (`autoResume` watchdog in `core/main.js`) now also acts when a site's soft "still generating" signal is stuck on (no real Stop button, reply text frozen for the provider's STABLE_MS, no open command block); it logs `resume.genStuck` / `resume.blocked`. A loop error settles a spinning command card as an error. Test: `test-1.24.21-stuck-generation.js`.
- **Memory** (Engram, a helper program) with a per-project database; chat history; checklists; templates.
- **Connectors**: Blender, Figma, Unity, Godot, Browser (own browser window), plus add-on MCP servers (`agent/src/mcp_addons.rs`).
- **17 engine file tools** that work on Godot, Unity, Roblox place and Blender files without the editor (`agent/src/engine_tools.rs`).
- **Co-work**: queue follow-up messages; Ctrl+Enter sends them now (`core/cowork.js`).
- **Model Builder and UI Builder**, creation previews, Explorer sidebar, animation tools, Studio vision.
- **Loop guard** (`core/stall-guard.js`) that stops the AI repeating itself.
- **Argument repair** for badly formed tool calls (`core/tool-guard.js`, `core/parser.js`).
- **Themes**, 15 interface languages, a debug report (Settings > Copy debug report).
- **Auto-updater** (`agent/src/updater.rs`, `Update-PlazCode.ps1`).
- **Supported AI sites** are the files in `providers/` (arena, chatgpt, claude, clickup, copilot, crax, deepseek, freebuff, gemini, glm, kimi, meta, notion, oxalpha, qwen, useai, vani).

---

## 2. Rules that never bend

1. **Never break the auto-updater.** Installed copies read `https://raw.githubusercontent.com/stoveez/PlazCode/main/latest.json` (Windows) and `latest-macos.json` (Mac) and download from `https://github.com/stoveez/PlazCode/releases/download/vX/...`. Those addresses and the feed format must work forever. Feeds must stay under 64 KiB.
2. **Commits go under the owner's name** (stoveez, name only: never write the owner's email in any file or commit, it can change). Never add `Co-Authored-By`, `Claude-Session`, "Generated with" or any AI credit line, even if a tool suggests one.
3. **Never push, publish, deploy or buy anything without the owner's clear "yes" for that exact action.** Committing locally is fine.
4. **Publish only through the private-repo workflow** (section 9). Never copy files into the public repo by hand.
5. **Plain language** in release notes and in everything the owner reads.
6. **Test builds always contain the apps** (Windows and Mac) as well as the extension (section 8). Never hand over an extension-only zip as "the build".
7. **Respect licences.** Do not copy code from Multi-Script (GPL, no permission). UltraLab is used with SyphoDev's permission (no sale, no paid bundle, credit youtube.com/@SyphoDev). Brickwire is MIT: keep its licence and credit "Brickwire contributors" for anything derived from it. Keep `THIRD-PARTY-NOTICES.txt` up to date.
8. **No secrets** (publish token, keys, passwords) in files, commits or chat.
9. **New features need full validation**, including the Mac desktop test, before a release.
10. **Extension fixes must work by reloading the extension.** A fix in `core/`, `providers/`, `overlay.css`, `background.js` or `popup.*` has to take effect on a test build when the tester reloads the extension and refreshes the AI tab, with no app update. Keep fixes on the extension side when you can. Say in one line which it is: "reload extension is enough" or "the app must be replaced too". Never make an extension fix depend on a new app without telling the owner.
11. **Be honest about what was and was not tested.** Say "not tested on live X" when it is true.

---

## 3. How the source is organised (important)

PlazCode is NOT stored as a normal source tree. A release is built like this:

```
PlazCode-source-1.24.20.zip  (the pinned official 1.24.20 source, hash-checked)
        +
development/1.24.27/overlay/  (every file we changed or added for 1.24.21)
        =
build-src-1.24.27/PlazCode/   (the built source tree, made by prepare.py)
```

- Run `python3 development/1.24.27/prepare.py` to rebuild `build-src-1.24.27/PlazCode`. It deletes and recreates that folder.
- **Edit files in `development/1.24.27/overlay/`, never in `build-src-1.24.27/`.** The build folder is thrown away every time prepare.py runs. If a file you need to change is not in the overlay yet, copy it from the build folder into the same path in the overlay, then edit the overlay copy.
- `prepare.py` also copies `core/`, `providers/` and the main files into `PlazCode-Extension/` (the folder users load into the browser) and removes some old files.
- For a new version number, copy `development/1.24.24` to `development/<new>`, change the version and the base archive name inside the scripts, and copy the two workflows in `.github/workflows/`.
- Generated files must be regenerated, not edited: Ultra (`development/1.24.25/ultralab/build_ultralab.py` writes `core/ultracode.js`, `core/ultralab-pack.json`, `core/ultralab/INDEX.json`; test with `test-ultralab-generated.py`) and language files (`development/1.24.25/build-locales.py`; test with `test-locales.py`).
- **Hash pins.** `test-desktop-regression.js` pins the exact git hash of protected files such as `providers/*.js` and `core/main.js`. After you edit a protected file, run `git hash-object <overlay file>` and update the pin in `development/1.24.27/overlay/test-desktop-regression.js`. If that test fails with a hash message, this is why.
- `test-provider-preservation.js` guards each AI-site provider's control flow. A deliberate change to a provider's send logic needs an exception entry with a comment explaining why.

### Where things live
| Area | Files |
|---|---|
| Agent loop, sending, reading replies | `core/main.js` (very large), `core/parser.js`, `core/config.js` |
| One adapter per AI site | `providers/<site>.js` (typeAndSend, userCount, assistantCount, lastAssistant and more) |
| Browser background worker | `background.js`, `popup.html`, `popup.js` |
| Look and themes | `overlay.css` and the `core/*-ui.js` files |
| Safety | `core/safety.js`, `agent/src/safety.rs` |
| Undo and What happened | `core/action-log.js`, `agent/src/checkpoints.rs` |
| Loop guard and tool fixing | `core/stall-guard.js`, `core/tool-guard.js` |
| Studio tools and builders | `core/studio_*.js`, `core/creator*.js`, `core/headless-builder.js`, `core/motion-*.js`, `core/animlib.js` |
| Ultra | `core/ultracode.js`, `core/ultralab/` (generated) |
| Desktop app (Rust) | `agent/src/*.rs`; `main.rs` starts it, `workspace.rs` runs tools, `gui.rs` and `desktop.html` are the window, `updater.rs` updates |
| Packaging | `development/<version>/package.py`, `promote.py` |
| Update feeds and notes | `latest.json`, `latest-macos.json`, `release-notes.json`, `release_feed.py`, `publish_release.py` |

---

## 4. Everyday workflow

1. **Branch.** Never work directly on a shared branch when someone else may be working. See section 11 for working in parallel.
2. **Build the source:** `python3 development/1.24.27/prepare.py`.
3. **Edit the overlay**, then run prepare.py again to see the result in the build folder.
4. **Run the tests** from `build-src-1.24.27/PlazCode`:
   - JavaScript, everything: `NODE_PATH=release-tools/node_modules PLAZCODE_TEST_BROWSER=chromium python3 release-tools/test-javascript.py` (about 12 minutes; runs every `test-*.js`).
   - One JavaScript test: `NODE_PATH=release-tools/node_modules node test-<name>.js`. First run `npm ci --prefix release-tools --ignore-scripts` (and `node release-tools/node_modules/playwright/cli.js install --with-deps chromium firefox` for the browser tests in `release-tools/*.cjs`).
   - App: `cargo test --manifest-path agent/Cargo.toml` (add `--offline` if there is no network).
   - Overlay and packaging checks: `python3 development/1.24.25/test-prepare-overlay.py`, `test-locales.py`, `test-ultralab-generated.py`.
   - **Lesson learned:** tests that need `jsdom` fail with "Cannot find module 'jsdom'" unless `NODE_PATH` points at `release-tools/node_modules`. This broke CI once.
5. **Add a test for every fix.** A fix with no test comes back.
6. **Interface text** goes through the translation system. New visible text needs entries in all 15 languages (see `build-locales.py`) or the locale test fails.
7. **Commit** with a clear plain message under the owner's name, no AI credit. Do not push until the owner says yes.

### Writing provider (AI-site) code safely
Chat sites change their pages and are hard to test live. Rules that were learned the hard way:
- A click hook must ignore PlazCode's own buttons (check `safeClosest(target, "#rs-root")`), or Fix connection starts a phantom run that waits 5 minutes.
- Never click Send twice. After a click, prove whether the site took the message before retrying; only retry when it is provably not taken (the draft or file is still in the box).
- Every site has quirks (Notion shows files as chips, ClickUp renames the address of a new chat, Vani rewrites the page root). Read the provider's existing comments before touching it.
- Test on the fake pages in the test suite, and say clearly that live sites were or were not tried.

---

## 5. Continuous integration (GitHub Actions)

Workflow `.github/workflows/validate-1.24.27.yml` ("Validate PlazCode 1.24.21 development"):
- It runs on a push to `release/1.24.25`, on pull requests that touch `development/1.24.25/**`, and **by hand on any branch** (`gh workflow run validate-1.24.27.yml --ref <branch>`).
- Concurrency is per branch, so a push cancels the older run on the SAME branch only.
- Jobs: `browsers` (Linux; unit tests and real-Chromium/Firefox tests) and `native` on Windows, macOS and Ubuntu (Rust tests, builds the apps, runs the updater tests, packages the downloads).
- It takes about 30 minutes. A run is "green" only when all four jobs succeed.

Reading results:
- `gh run list`, `gh run view <id>`, and with a normal login `gh run view <id> --log-failed` shows the failing step's log.
- In the owner's cloud-session setup the raw logs and the artifact download host are blocked. There, read the failing step name with `gh api repos/stoveez/plazcode-source/actions/runs/<id>/jobs` and reproduce the step on your own machine.
- When a CI step fails, first check whether it is a real failure or a CI difference (missing library path, slow machine). Reproduce it with the same Node version (24) and the same package versions as CI before changing code.
- Never mark something fixed on the strength of "it should work". Wait for green.

---

## 6. The desktop app (Rust)

- Build: `cargo build --release --manifest-path agent/Cargo.toml`. Release profile is size-optimised (`opt-level = "z"`, LTO, strip).
- Local web server (axum) for the extension, a WebView window (wry/tao) on Windows and Mac, a system tray.
- Windows executable is unsigned and the Mac app is ad-hoc signed and not notarized; users may be asked to confirm opening them.
- The memory helper Engram 3.0.0 (MIT, from `github.com/Gentleman-Programming/engram`) is a separate program shipped in `runtime/engram/` (Windows) or inside `PlazCode.app/Contents/Resources/engram/` (Mac). If it is missing, the app downloads the official release once and checks it against a pinned SHA-256 (`agent/src/engram.rs`).
- **Changing the app means a new app build.** Extension-only fixes do not need testers to update the app. App changes must be built by CI (the Windows `.exe` and the Mac app cannot be built from a Linux cloud session).

---

## 7. Bugs from testers

- Testers report: browser, AI site, what happened, how often, a recording if possible. Ask for the **debug report** (Settings in the desktop app > Copy debug report) for anything that is not obvious. It removes keys, tokens, cookies and chat text.
- Reproduce on a fake page or a unit test first. Fix. Add a test. Say plainly what was verified.
- Typical suspects: the site changed its page, the app is older than the extension (the What happened list is then missing commands and reads and now says so), a timeout (Notion turns can take longer than 90 seconds).
- Known open items are in `CLAUDE.md` and `development/1.24.26/NEXT-UPDATE-PLAN.md`.

---

## 8. Test builds (what to hand to testers)

**The standard way (the owner's choice, always use it):** push or run CI for the branch, then give the owner the two small zips from the run's Artifacts page: `plazcode-<version>-Windows-test-lean` (about 25 MB) and `plazcode-<version>-macOS-test-lean` (about 36 MB). Each contains the app, the memory helper, `PlazCode-Extension` (Chrome/Edge/Brave) and the ready-made `PlazCode-Extension-Firefox`. The owner must never need to run a script to get Firefox. Always give the run link, list the fixes inside, and say if reloading the extension is enough. Test builds are private CI artifacts, not a publish. The bigger `-validation` artifacts are for the release process only. If the Mac job says "The job was not acquired by Runner of type hosted", GitHub is out of Mac machines: re-run just that job every 20 minutes (`gh run rerun <id> --failed`); it took about 7 tries one afternoon. Rebuilding the same commit gives the same code, so an earlier green Mac `-validation` artifact of identical code is an acceptable stand-in if the owner agrees.

More detail follows.

A "test build" for the owner or testers is always:
1. **The full Windows zip** and **the full Mac zip**, each containing the desktop app AND the extension (Chrome-family) AND the Firefox extension. They come from CI (workflow `validate`, job `native`), as the artifacts `plazcode-<version>-Windows-validation` and `plazcode-<version>-macOS-validation`. Each artifact holds `PlazCode-<version>-development.zip` (Windows) or `PlazCode-macOS-<version>-development.zip` (Mac), plus the source zip and a Firefox zip.
2. **Small test zips** (under about 20 MB on Windows) built by the `lean` block in `development/<version>/package.py`: the same package with the duplicate extension copies removed. The Firefox extension is made with one click from `Make-Firefox-Extension` (`.bat` on Windows, `.command` on Mac). Mac is about 31 MB because it ships the memory helper for both chips.
3. **Never** only an extension zip. If a fix only changes the extension, still give the full builds; say which files changed.

Before telling the owner a build is ready:
- CI is fully green on the exact commit.
- Open the zip and confirm: the app file is there, `PlazCode-Extension/manifest.json` has the right version, and the files you changed are inside (search for a marker string from the change).
- Check sizes. Do not claim a size you have not measured.
- Deliver the zips to the owner's test folder on their computer (`C:\Users\plazm\Downloads\PlazCode-Power-Features-Test\PlazCode-Extension-FixTest`) if a link to their computer is available, then read the files back from that folder and compare checksums to prove they arrived. Use a fresh staging folder each time because the transfer tool caches by path.
- Write a plain `READ-ME-FIRST.txt` explaining how to install over an existing copy (copy the contents in, choose Replace; the Mac app must be copied so the memory helper is not lost).
- Testers load the extension in the browser's extension page with Developer mode > Load unpacked > the `PlazCode-Extension` folder, remove the older copy first, reload the AI tab, and keep the existing desktop app unless the app changed.

---

## 9. Releasing to everyone (only when the owner says "publish")

Publishing is done by the workflow `.github/workflows/publish-1.24.25.yml`, never by hand.
1. The exact final commit must have a fully green validation run.
2. Put its full commit id in `VALIDATED_SHA` and the run number in `VALIDATION_RUN` in the publish workflow's `env:` and commit.
3. Make sure `development/1.24.25/release-entry.json` has the final plain-language notes (fields: `version`, `title`, `summary`, `added`, `improved`, `fixed`, `notes`, and a shorter `github` block). Rules in `RELEASE_RULES.md`: GitHub release description under 2,000 characters, feeds under 64 KiB, at most five recent entries in the feed, the full history stays in `release-notes.json`, published archives are immutable.
4. **Dry run first** against the throwaway repo `stoveez/plazcode-publish-test` (set `PUBLIC_REPO` to it). Check the two feeds, zip checksums and the release page.
5. Ask the owner for a clear "yes". Then set `PUBLIC_REPO` back to `stoveez/PlazCode` and run it (push to branch `release/1.24.25-publish`, or run by hand). It uses the secret `PUBLIC_REPO_TOKEN` and runs the real Mac desktop lifetime test unless `PLAZCODE_QUICK` is `1` (only for small fixes the owner approves).
6. Afterwards fetch the public `latest.json` and `latest-macos.json` and one download; confirm version, link and sha256. An older installed copy must still find and install the new version.
7. Never delete or rewrite published releases. Never force-push. There is an open request to GitHub Support about the locked `v1.24.20` tag.

---

## 10. Maintenance routine

Every release:
- [ ] Rebuild from the pinned base with `prepare.py`; no hand edits in the build folder.
- [ ] All JavaScript tests, all Rust tests, all browser tests green locally and in CI.
- [ ] Hash pins updated; locale test green; Ultra generated files up to date.
- [ ] `THIRD-PARTY-NOTICES.txt` and credits current (SyphoDev, Brickwire if used, fonts, engram).
- [ ] Release notes in plain language, all 15 languages build.
- [ ] Full Windows and Mac test builds delivered and verified; testers' reports collected.
- [ ] Mac desktop lifetime test passed (not skipped) before a normal release.
- [ ] Update feed tested with an older installed copy after publishing.

Regularly:
- Watch for AI sites changing their pages (a provider that suddenly says "Message was not confirmed" or "Not connected to this chat yet").
- Keep the pinned third-party versions (Engram, Blender add-on, Luau test VM used by CI) deliberate: update on purpose, with the hash, never by accident.
- Keep `CLAUDE.md`, `AGENTS.md` and `development/1.24.26/NEXT-UPDATE-PLAN.md` current when decisions change.

---

## 11. Working in parallel (two AIs at once)

The owner may run Claude Code and Codex at the same time. To avoid overwriting each other:

1. **One task board:** `docs/TASK-BOARD.md`. Before starting, read it. Add a line claiming your task (name, branch, files you will touch). Do not start a task someone else has claimed. Update the line when you finish. Keep the board changes in their own small commit.
2. **One branch and one worktree per task.** Do not share a working folder.
   ```
   git fetch origin
   git worktree add ../plazcode-<task> -b <ai>/<task> release/1.24.25    # <ai> = codex or claude
   cd ../plazcode-<task>
   python3 development/1.24.27/prepare.py
   ```
   Each worktree has its own `build-src-1.24.24` folder, so builds never collide.
3. **Stay inside your files.** The claim says which files you touch. If you must change a file someone else claimed (very common: `core/main.js`, `test-desktop-regression.js`), stop and tell the owner, or keep your change tiny and rebase often.
4. **Shared hot spots** that cause merge conflicts: `core/main.js`, `agent/src/workspace.rs`, `agent/src/main.rs`, `test-desktop-regression.js` (hash pins), `release-entry.json`, `.github/workflows/*`. After merging, recompute the hash pins with `git hash-object`.
5. **CI per branch.** Start validation for your branch with `gh workflow run validate-1.24.27.yml --ref <branch>`. Runs on different branches do not cancel each other.
6. **Only one AI at a time touches** `.github/workflows/publish-*.yml`, `promote.py`, `package.py` and the release feed files. Say so on the board.
7. **Merging is the owner's decision.** Open a pull request into `release/1.24.25` (or ask the owner), with a plain summary and the test results. Never push directly to the shared release branch without the owner's yes.
8. **Handoff log:** at the end of a task, add 3-5 plain lines to the board: what changed, what was tested, what was not, what is next. A new chat with no memory must be able to continue from this file alone.

Good tasks to run in parallel: the license server and website (no extension files) versus extension and app fixes; hang recovery versus the Luau helper library; documentation versus code.

---

## 12. Things to remember about the owner's setup
- Platform of the owner: Windows PC; testers use Windows and Mac, mostly Chrome-family browsers (Brave, Helium) and some Firefox.
- The owner's test folder: `C:\Users\plazm\Downloads\PlazCode-Power-Features-Test\PlazCode-Extension-FixTest`.
- A friend will buy the owner a domain for a simple website (Cloudflare Pages). The login and license system and the Skill Workshop run on Cloudflare Workers + D1 (designs in `development/1.24.26/`). The site files are in `PlazCode-website.zip`/`index.html` (not deployed yet).
- Brickwire ideas deferred to 1.24.26 (1.24.25 is reserved for a new issue): items 1, 2, 3, 7, 9, 10, 11, 12, 13, 14, 17. Each is described, with the improvement the owner wants, in `development/1.24.26/NEXT-UPDATE-PLAN.md` section C, in full detail in `development/1.24.26/BRICKWIRE-ITEMS-SPEC.md`, and listed as a task in `docs/TASK-BOARD.md`. They stay out of 1.24.21.
- High effort (careful tracing) is expected for: the license server, the Luau helper library and build self-checks, hard bug hunts and planning big features.
