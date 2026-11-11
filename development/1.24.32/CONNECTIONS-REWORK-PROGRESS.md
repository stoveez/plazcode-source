# Connections rework: progress log (pick up from here)

Read order for a new AI or a new chat: `docs/NOW.md`, then this file, then `CONNECTIONS-REWORK-PLAN.md` (same folder; "Review v2 corrections" at its top wins over the older text below it). This log is updated at every step and milestone, in the same commit as the work. Branch: `claude/plazcode-dev`. Working tree: `development/1.24.32/overlay` (ships as 1.24.33; the folder moves at the end, see `docs/vault/new-version-checklist.md`).

## Where things stand
| Step | What | State |
|---|---|---|
| 0 | Plan v2 (reviewed against code) | DONE, commit `2eabf12` |
| 1 | Apps & servers page + setup window (desktop page only) | See "Step 1" below |
| 2 | `connections.rs` detection + `/api/connections`, Mac Node/uv runtime, Godot end to end | NOT STARTED |
| 3 | Headless Blender (`blender_headless.rs`, controller, `plazcode_op`, safe mode, previews) | NOT STARTED |
| 4 | Blender window mode with PlazCode's own addon, auto-install | NOT STARTED |
| 5 | Shared helper socket + Blockbench (web through extension, desktop plugin) | NOT STARTED |
| 6 | Figma plugin | NOT STARTED |
| 7 | Unity | NOT STARTED |
| 8 | Translation pass, Mac pass, full tests, version move to 1.24.33, test build, field-test list | NOT STARTED |

## How to work here (things that cost time to find out)
- Edit only `development/1.24.32/overlay`. `python3 development/1.24.32/prepare.py` assembles `build-src-1.24.32/PlazCode` (git-ignored). Do not run it while the full suite runs.
- Test dependencies: in `build-src-1.24.32/PlazCode/release-tools` run `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci`. This cloud session has Chrome at `/usr/bin/google-chrome`: set `PLAZCODE_CHROMIUM=/usr/bin/google-chrome`.
- One test: from the build folder, `NODE_PATH=release-tools/node_modules PLAZCODE_CHROMIUM=/usr/bin/google-chrome node test-<name>.js`. Tests that need only `playwright` (for example `test-connections-page.js`, `test-desktop-studio.js`) also run straight from the overlay folder. Tests that need `jsdom` or the assembled tree (`test-design-upgrade.js`, `test-desktop-regression.js`, `test-donation-links.js`, `test-supported-ai-links.js`) fail in the bare overlay with "Cannot find module 'jsdom'" or "Protected PlazCode file missing": that is the environment, not a regression.
- Full JS suite (10 to 15 minutes): from the build folder, `NODE_PATH=release-tools/node_modules PLAZCODE_CHROMIUM=/usr/bin/google-chrome PLAZCODE_TEST_BROWSER=chromium python3 release-tools/test-javascript.py`. Desktop browser tests: `node release-tools/test-*.cjs`.
- Language catalogs: every new visible sentence must be a key in all 15 files in `overlay/core/locales/` (`en.json` value `null`, the others the English text until translated), then `python3 development/1.24.32/build-locales.py` regenerates `core/i18n-catalog.js`, and `python3 development/1.24.32/test-locales.py` must pass. The translator matches whole text nodes, so a static sentence must be its own text node and must not sit inside `data-i18n-user-content` (that mark is for names, commands and error text).
- Design rule enforced by `test-design-upgrade.js`: no new repeating (`infinite`) animations. Waiting states reuse the approved `animation:nxPulse 3.2s ease-in-out infinite` exactly. Motion follows the app's own setting (`data-pz-motion` full / reduced / off), not the system setting.
- Rust cannot be compiled or tested in this cloud session (no crates offline; Windows and Mac code only compiles in CI). Every Rust change is first proven by CI. Say so in notes.
- Commits: author `stoveez`, no email, no Co-Authored-By / Claude-Session / "Generated with" lines (CLAUDE.md rule 2): `git -c user.name=stoveez -c user.email= commit ...`. Tell the owner branch, short commit ID and one line after every push.
- Never change repo visibility; never publish, merge to main or a release branch without the owner's yes.

## Step 1: Apps & servers page and setup window
**Files changed (all in `development/1.24.32/overlay`):**
- `agent/src/desktop.html`: the page `#page-mcp` is renamed "Apps & servers" (sidebar tab, Home quick action, page title; sidebar section subtitle is now "Tools & apps"). Markup: `#cnApps` (tiles), `<details id="cnMore">` holding `#mcpGrid` (the More tools list; the id is kept for older tests). CSS block starts with the comment "Apps & servers (connections rework)" at the end of the last `<style>`. JS: everything between `var Blendercheck = null;` and `var Recentlogsignature` (functions `Cnfetch`, `Cnbuild`, `Cnlegacy`, `Cntile`, `Cnstudio`, `Cnmore`, `Cnwindow`, `Cnshell`, `Cnpaint`, `Cnopen`, `Cnclose`, `Cncopy`, `Cnrun`, `Cntoggle`, `Cncheck`, `Cnclick`, and the rewritten `Loadcatalog`).
- `agent/src/gui.rs`: `app_download_url()` allowlist (`open:get-blender`, `get-godot`, `get-unity`, `get-figma`, `get-blockbench`, `blockbench-web`, `get-git`) wired into the IPC match, plus a unit test line. NOT COMPILED YET (CI only).
- `core/locales/*.json` + `core/i18n-catalog.js`: 72 new keys (1148 to 1220), English text in all 15 languages for now (translation is step 8).
- Tests: new `test-connections-page.js`; updated `test-desktop-studio.js` (page title), `release-tools/test-sidebar-explorer.cjs` (page name), `release-tools/test-desktop-language.cjs` (command now sits in closed "Technical details", read with `textContent`), `release-tools/test-desktop-performance.cjs` (counts catalog requests separately from the new status request).

**The contract between page and app (fix it now, step 2 fills it in):**
- `GET /api/connections` returns `{ok, apps:[{id, name?, state, line?, lead?, mode?, modes?:[{id,label}], consent?, steps:[{id, title, state, hint?, bad?, action?:{label,run}, copy?, link?:{label,key}}], prompts?, technical?}]}`.
  - `id`: `blender`, `blockbench`, `figma`, `godot`, `unity`. App `state`: `not_set_up`, `setting_up`, `ready`, `needs_attention` (`soon` is page-only, shown when neither the app nor the old server list knows the app).
  - Step `state`: `waiting`, `working`, `done`, `needs_you`. `bad:true` marks `hint` as an error message (shown red, not translated). `link.key` is a short name the desktop turns into `open:<key>` (must be in `gui.rs` allowlists). `copy` shows a copy button.
- `POST /api/connections/setup` with `{id, consent:true, mode?}` (Allow), `{id, mode}` (mode switch), `{id, step}` (run or retry one step; `step:"test"` is the real check), `{id, disconnect:true}`.
- When `/api/connections` is missing (every build until step 2) the page builds the same model from `/api/mcp/catalog` + live server state in `Cnlegacy` and uses `/api/mcp/toggle` and `/api/blender`. Blockbench then shows "Coming soon". With the new app, the old Figma server is listed under More tools as "Figma Dev Mode (paid seat)".
- Request behaviour (covered by `test-desktop-performance.cjs` and `test-connections-page.js`): the status request is shared and cached like the catalog (5 s), a build without it is asked again only once a minute. While the setup window is open the page refreshes every 2 s.

**Gap review of step 1 (2026-11-11), found and fixed:**
1. The new status request ran on every refresh and broke "one request, cached" (performance test). Fixed with `Cnfetch`.
2. Three desktop tests in `release-tools/` still expected the old page. Updated.
3. The Blender setup-guide link was dropped. Restored as a button on the helper step (`open:blender-guide`, already allowed in `gui.rs`).
4. New text was marked as user content, so it could never be translated. Static sentences are now their own text nodes and catalog keys; names, commands and errors stay untranslated.
5. Older builds start a helper only when an AI chat first asks for its tools. The checklist showed "working" forever. It now says "It starts the first time you use PlazCode in an AI chat. Open a chat, then press Test again." and Test again refreshes live state.
6. Two new repeating animations broke the design rule. Replaced with the approved loading pulse; they follow the app motion setting.
7. Sidebar subtitle still said "MCP". Now "Tools & apps".

**Known limits of step 1 (carry forward):**
- Seen only in headless Chromium with a fake bridge, not in the real PlazCode window. Fonts and spacing on Windows need the owner's eyes in a test build (owner preview rule: no mockups presented as the app).
- Other languages show English for the new text until step 8.
- `gui.rs` change unproven until CI.
- Home page and guides: `guides/troubleshooting-studio-offline` mentions "MCP Servers" but means Roblox Studio's own setting, so it stays. `core/feature-guide.js` does not name the page.

**Test results for step 1:** see the newest entry in the log below.

## Log (newest first)
- **2026-11-11, WIP save of step 1.** `test-connections-page.js` PASS (both halves, Chromium), `test-desktop-studio.js` PASS, `test-locales.py` PASS (1220 keys), `test-godot-blender-connectors.js` and `test-blender-desktop-timeout.js` PASS. Full JS suite and the `release-tools/*.cjs` desktop tests are being rerun on the fixed page; result goes in the next entry. First full run (before the fixes) had one failure, `test-design-upgrade.js` (repeating animations), fixed as item 6 above.
