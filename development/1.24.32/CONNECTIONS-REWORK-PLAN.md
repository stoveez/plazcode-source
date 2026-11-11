# Connections rework plan (owner request, 2026-11-11)

Status: PLAN v2 (second review, 2026-11-11, checked against the code and the owner's answer screenshots). Owner answers below are decided. Where "Review v2 corrections" below disagrees with the original text further down, the corrections win. Build order is at the end (revised).

## Review v2 corrections (read this first)
The nine owner decisions all stand. The code review found these things the first draft missed or got wrong:

1. **Blender's tools live in the extension, not in PlazCode's app.** `background.js` maps every `blender_*` tool to `blender_ops.py`, wraps it as Python and sends it to Blender's addon socket as `execute_code` through the app's `/api/blender` (`{type, params}`; `get_scene_info` and `execute_code` are the two verbs, screenshots are an `execute_code` that writes a file). So headless Blender is **a second transport behind the same `/api/blender` contract**, not a second toolset. The extension's tool layer, tool names and prompts stay as they are. This is also why "Tools come from `blender_ops.py`" is right but incomplete.
2. **Safe mode must be enforced where the code runs, and the app cannot tell a structured op from free Python today** (both arrive as `execute_code`). Fix: structured ops travel as `{type:"plazcode_op", cmd, args}`; the headless controller loads `blender_ops.py` from the install folder itself (covered by the integrity check) and runs only those. Raw `execute_code` / `execute_blender_code` is refused while safe mode is on. Old app + new extension (or the reverse) must fail with the usual capability message, never fall back to raw Python silently.
3. **Headless start-up needs its own deadline and status.** Blender cold start takes several seconds (longer with antivirus). Today `get_scene_info` has an 8 s limit and the busy-lock gives 2 s. First tool call must show "Starting Blender..." with a 60 s start-up limit, then normal limits. `blender.rs` error text currently tells people "not headless / -b"; rewrite per mode.
4. **Screenshots in headless mode.** The existing viewport-shot code (`blenderShotCode`) renders from the live scene and writes a file relative to Blender's working directory. The controller gets a per-session temp folder as its working directory, and the same file-read path returns the picture. Preview engine: Workbench first; if Blender cannot make a GPU context (headless Linux CI, remote desktops), fall back to Cycles CPU at low samples. CI must prove both. Test on Blender 4.2 LTS and the newest (the owner's screenshot shows Blender 5.2): `blender_ops.py` already carries EEVEE name shims, keep them tested.
5. **Mac runtime is a launch blocker, not a last-step polish item.** The automatic Node/uv download is Windows only (`Setup-Mcp-Runtime.ps1`). On Mac, `command()` just runs `npx` / `uvx` and the app only searches `/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`; a Finder-launched app does not see a shell PATH, and a beginner has no Node or uv. Godot (npx), Unity (uvx), the old Figma entry and Blender window mode (uvx) all fail there. Because "Windows and Mac at launch" is decided, the pinned, hash-checked Mac Node and uv bootstrap (user-level cache folder, same pins as Windows) moves to step 2 and is tested in the Mac CI job before any connector depends on it. Blender **background** mode needs neither Node nor uv, which is another reason it is the default.
6. **Godot:** the server takes `projectPath` per tool call and needs no addon, so "remember the choice" means PlazCode stores the chosen project and puts its path in the AI's context for that session. Recent projects come from Godot's own `projects.cfg` (Godot 4 editor-data folder; Windows `%APPDATA%\Godot`, Mac `~/Library/Application Support/Godot`; confirm on a real install, fall back to "Browse..."). Mac detection already handles `Godot.app`; keep its test.
7. **Unity install method.** Upstream installs the package by a Package Manager git URL (`https://github.com/CoplayDev/unity-mcp.git?path=/MCPForUnity#<tag>`; tags exist), and also offers OpenUPM and the Asset Store. A git-URL package needs Git on the person's computer (to verify on a real Unity; I believe Unity's package manager shells out to git). That is a beginner trap. So: pin the tag to the same release as the server pin (10.3.0), prefer an OpenUPM scoped-registry entry (no Git needed) if that exact version is on OpenUPM, use the git URL only when Git is found, and otherwise say plainly "Unity needs Git for this; Download Git" with the official link. Upstream also starts its own setup window on first import and defaults to a local HTTP transport; PlazCode's catalog uses stdio. Whether the Unity side starts its bridge by itself stays an open point to verify on a real Unity before building step 6.
8. **Figma is mostly settled.** Figma plugin manifests support `networkAccess.devAllowedDomains` (with a `reasoning` text) for `ws://localhost:<port>`, and a published Community plugin already does this, so a PlazCode plugin can talk to the app. A development plugin is imported once in the Figma **desktop** app (Plugins > Development > Import plugin from manifest); I could not confirm browser Figma can run a development plugin, so assume desktop only. A person still has to start the plugin from the Plugins menu each Figma session (Figma remembers the last-run plugin, so it is two keystrokes); the setup window must say so in one line. Community publishing needs the owner's Figma account and is a post-launch polish step, not a launch blocker.
9. **Blockbench: one toolset, two thin transports.** Blockbench plugins are a single `[plugin-id].js` file using `Plugin.register` with `variant: 'both'` (desktop and web). Write the toolset once as one module. Web: the extension injects that module into `web.blockbench.net` and relays calls (no manual plugin step; also avoids an https page opening `ws://localhost`). Desktop: the same module ships as the plugin file and dials out to the app. Open: whether a file placed in Blockbench's plugins folder is picked up without using "Load plugin from file" (the plugin id must equal the file name); if not, PlazCode opens the folder and the checklist ticks when the plugin connects.
10. **One shared local socket for the helpers (Figma, Blockbench desktop).** The app listens on 127.0.0.1 only, one port, per-install token written into each helper file. Origin checks are weak for plugin iframes (Figma's origin is opaque), so the token is the real gate; reject any connection without it, rate-limit, and log connects and drops (reuse the bridge diagnostics style). High-effort review area per the owner's effort rule.
11. **The page must be built from the existing "Studio look" pieces** (gradient buttons, glass cards, serif page titles, motion Full/Reduced/Off, `Pzturn` page turns, the skill-editor window pattern) and keep `test-desktop-studio.js` / `test-design-upgrade.js` green. No second design language.
12. **Languages.** Desktop and extension text goes through the 15 language catalogs and `test-locales.py` requires every catalog to have the same keys. New strings get English keys first (the compiler fills the other 14 with the English text), and a translation pass is a listed step, so beginners on other languages are not left with a half-English page without anyone noticing.
13. **Licences and pins.** unity-mcp, godot-mcp and mcp-for-blender are MIT: keep their notices (`THIRD-PARTY-NOTICES.txt`, dependency notices) current. Moving the Blender pin reruns the hash-pin and first-use tests. No Blockbench code from the GPL-3.0 plugin is read or copied.
14. **Version and delivery rules that apply.** This ships as 1.24.33 (the 1.24.32 overlay is the working tree until the number moves; follow `new-version-checklist.md` at the end). It needs a full app replacement plus extension reload (rule 9: say so in one line), a Windows and Mac test build with both zips (rule 6), the Mac desktop test (rule 5), release notes shown to the owner before any release, and plain wording. Rust and real-app checks cannot run in this session (no crates offline, no Blender/Figma/Unity/Godot/Blockbench, no Windows or Mac): they run in CI, and what CI cannot prove goes on the owner's field-test list and is called "not verified" until done.

Defaults I will use unless the owner says otherwise (none of them blocks step 1):
- **Blender window mode helper:** PlazCode's own small addon that speaks the same socket protocol, built from the same executor as the headless controller (one code path, no `uvx`, no third-party addon version drift). The third-party `mcp-for-blender` stays only as an optional "More tools" entry.
- **Figma:** development import first; Community publishing after launch.
- **Unity:** OpenUPM first, git URL only when Git exists.

## Goal (owner's words)
"An entire rework on the MCP server feature. Specifically Blender, Figma, Godot and Unity, along with Blockbench support (web and app). SIGNIFICANTLY EASIER and BEGINNER FRIENDLY to connect things." Also: "easy to navigate, non compact layout, extremely beginner friendly", and a headless Blender mode with easy setup.

The test for every screen: someone who has never heard the word "MCP" can connect an app without reading a paragraph.

## What the owner decided
1. PlazCode does the setup itself after one "Allow" click, and only guides the steps it truly cannot do, ticking each step off live as it detects it.
2. Blockbench web works through the PlazCode browser extension. Blockbench desktop uses a small PlazCode-written plugin. Same toolset for both. No third-party Blockbench plugin (the popular one is GPL-3.0 and cannot go into closed-source PlazCode; rule 7).
3. Everything stays on the MCP Servers page, reworked (not a new page).
4. All apps ship together in one update, Windows and Mac.
5. App not installed: say so plainly, button to the official download page, keep watching and continue by itself when the app appears.
6. Godot and Unity: list recent projects found from the editors' own recent-project lists, plus "Browse...", and remember the choice.
7. The AI gets full control; changes go through PlazCode's existing approval modes.
8. Figma: PlazCode's own Figma plugin talking to the PlazCode app. Works on free plans, reads and edits. (Today's connection needs a paid Dev or Full seat and is read-only; Figma's online connector only admits approved apps and has paused approvals.)
9. Headless Blender: one Blender card with two modes, "Background (no window)" as the default and "My open Blender window". Preview pictures in PlazCode plus an "Open in Blender" button. Safe mode on by default (only PlazCode's built-in Blender actions), with a labelled switch to allow free Python.

## What exists today (inspected 2026-11-11)
- `agent/src/mcp_addons.rs`: catalog of 10 servers (Blender, Figma, Unity, Godot, Browser, Context7, Fetch, Git, Memory, Sequential Thinking), each a pinned `uvx`/`npx` command; runtime that starts them over stdio; `find_godot()`; automatic uv setup on Windows (`Setup-Mcp-Runtime.ps1`).
- `agent/src/blender.rs`: talks to the Blender addon socket on 127.0.0.1:9876; `/api/blender`.
- MCP page (`agent/src/desktop.html`, `Loadcatalog`): one small card per server with a paragraph of instructions, the raw command line, Enable/Disable, and for Blender a "Test Blender connection" button.
- Routes: `/api/mcp/catalog`, `/api/mcp/toggle`, `/api/blender`.
- `blender_ops.py` (94 KB, PlazCode's own): structured Blender actions (primitives, mesh edits, groups, import/export FBX/OBJ, ...). This is the base for headless safe mode.
- Extension already has host access to every https site, so driving a Blockbench web tab needs no new browser permission.

## Connector facts checked on the web (2026-11-11)
- Blender: `mcp-for-blender` (MIT, ahujasid). PlazCode pins 2.1.9; latest 2.2.7. Newer versions have `install-addon`, `addon-paths` and `setup` commands, and the addon starts its server when Blender opens. `DISABLE_TELEMETRY=true` opts out. Blender 3.0+.
- Unity: CoplayDev `unity-mcp` (MIT), v10.3.0, Unity 2021.3 LTS to 6.x, on OpenUPM as `com.coplaydev.unity-mcp`. Not confirmed yet: exact `Packages/manifest.json` entry, whether the Unity side starts by itself, Mac support. Check before building.
- Godot: `@coding-solo/godot-mcp` (MIT). Needs only the Godot program and a folder with `project.godot`; no addon in the project. Node 18+.
- Figma desktop server: 127.0.0.1:3845, paid Dev/Full seat, cannot write to the canvas. Remote server: allowlisted clients only.
- Blockbench: existing plugins are desktop-only; jasonjgardner's is GPL-3.0.
Not verified in this session: package contents (downloads are blocked here), anything on Windows or Mac.

## Design

### The page
- Page keeps its place under Connections but is titled "Apps & servers" in plain words ("Connect PlazCode to the apps you create with").
- Top: "Creative apps", large roomy tiles, one per app: Roblox Studio (built in), Blender, Blockbench, Figma, Godot, Unity. Each tile: app logo mark, name, one plain sentence of what the AI can do there, a status pill (Not set up / Setting up / Ready / Needs attention) and one main button (Connect / Open / Fix).
- Below, collapsed by default: "More tools" (Browser, Context7, Fetch, Git, Memory, Sequential Thinking) with a one-line description and a simple on/off switch each. The raw command line moves behind "Technical details".
- No paragraph instructions on tiles. No command lines unless asked for.

### The setup window (same pattern as the skill editor window)
Clicking Connect opens a centred window:
- Title "Connect Blender", one sentence on what happens.
- A short checklist, 3 to 5 steps, each with a state (waiting, working, done, needs you). PlazCode runs every step it can; a step that needs the person shows exactly one instruction, with a picture where it helps, and ticks itself off when PlazCode detects it.
- One consent line before PlazCode touches another app's files: "PlazCode will add its helper to Blender. Allow".
- Ends on "Connected" with a real check (the app answered a real request), then "Try it" with two example prompts to copy.
- If something fails: one plain sentence saying what and one button that fixes it. Technical detail behind "Show details".

### Per app
- Blender, Background mode (default): find Blender (usual install places, Steam, Microsoft Store, Mac /Applications; "Browse..." fallback). On first use start `blender --background` with PlazCode's controller script, speaking JSON over stdin/stdout (no network port, so no "port already in use" failure like in the owner's screenshot). Scene stays in memory until PlazCode stops it. Tools come from `blender_ops.py`. Safe mode refuses free Python; switch to allow. After changes a small preview render (Workbench/EEVEE, low resolution) is shown on the card and in chat. "Open in Blender" saves a .blend and opens it in normal Blender. Steps: Find Blender, Start in background, Test.
- Blender, My open window: PlazCode installs and enables the addon itself (move the pin to a version with `install-addon`, or copy the addon file into each detected Blender addons folder and enable it with a one-off `blender --background --python-expr`). Addon auto-starts its server. Steps: Find Blender, Add helper, Open Blender, Test.
- Blockbench: PlazCode toolset written from scratch against Blockbench's public plugin API (project, cubes, groups, meshes, textures, animations, screenshot, export). Web: extension content script on web.blockbench.net injects a page script and relays tool calls from the app. Desktop: PlazCode plugin file installed into Blockbench's plugins folder, connects out to the PlazCode app over a local WebSocket (the app listens, so Blockbench needs no "host a server" permission; confirm what permission prompt, if any, an outgoing connection needs). Steps: Open Blockbench (web or app), Add helper, Test.
- Figma: PlazCode Figma plugin (manifest + code + UI) connecting to the PlazCode app on localhost. Until it is published to the Figma Community the person imports it once in the Figma desktop app (Plugins, Development, Import plugin from manifest); PlazCode writes the plugin folder and opens it for them. Tools: read selection/page/frames/styles, export image, create and edit frames, text, shapes, auto layout, components. Confirm before building: localhost access from a plugin UI (`networkAccess` in the manifest), and whether a development plugin can be imported in the browser version.
- Godot: no addon needed. Find Godot (already done), list recent projects from Godot's `projects.cfg`/editor settings, remember the choice, pass it to the server. Steps: Find Godot, Pick project, Test.
- Unity: list projects from Unity Hub's recent list, add the package by editing `Packages/manifest.json` (keep a backup, exact entry to be confirmed), wait for Unity to import it, test. Steps: Find Unity, Pick project, Add package, Open project, Test.

### App side (Rust)
- New `connections.rs`: per-app detection (installed? where? running? helper present?), setup steps as resumable actions, status for the page. Routes `/api/connections` (status), `/api/connections/setup` (run a step), `/api/connections/projects`.
- New `blender_headless.rs`: process manager for background Blender, request queue, preview render, save and open.
- New local WebSocket endpoint for the Blockbench and Figma helpers, paired with a per-install token written into the helper file so other local programs cannot use it.
- `mcp_addons.rs`: catalog entries get plain-language fields (tagline, group, steps). Old Figma entry stays available under "More tools" as "Figma Dev Mode (paid seat)".
- Mac: detection paths and helper install for each app; uv/Node setup on Mac (today's automatic setup script is Windows only).

### Security
- High effort area: the local helper socket and anything that writes into other apps' folders. Token pairing, 127.0.0.1 only, origin check, consent recorded per app, backup before any file is changed, uninstall ("Disconnect and remove helper") for every helper.
- Safe mode is enforced in the controller, not just in the prompt.

## Tests
- Chromium tests for the page and setup window (states, wording, keyboard, roomy layout).
- Rust unit tests for detection (fake install trees for Windows and Mac paths), manifest edits with backup, token pairing, headless queue with a fake Blender process.
- Blockbench toolset against a Blockbench web page fixture in Chromium and Firefox.
- CI: real Blender in background on Linux (already downloaded in CI), plus the Windows and Mac jobs.
- Real-app checks that cannot run in CI (Figma, Unity, Blockbench desktop, Godot with a real project): owner field test list, stated plainly as not verified until done.

## Build order (ships together as 1.24.33; pushed to claude/plazcode-dev step by step, each step with its own tests)
Revised in review v2. Each step ends with the tests it adds, a NOW.md line and a push.
1. **Page and setup window** on the Studio look, driven by a status model (`/api/connections` shape fixed now, filled with test data until step 2). Catalog keys for all new text. Chromium tests for states, wording, keyboard, roomy layout, motion settings. Preview: actual running PlazCode page if the real app can run here, otherwise say plainly and ask for a screenshot from the test build (owner's preview rule).
2. **Runtime and detection foundation:** `connections.rs` (installed? where? running? helper present?), pinned hash-checked Mac Node and uv bootstrap, Windows runtime reuse, then **Godot end to end** (smallest real connector: find, recent projects, remembered choice, test).
3. **Headless Blender:** `blender_headless.rs` plus the controller script (stdin/stdout JSON, `plazcode_op` verb, safe mode enforced in the controller, start-up status, preview render, "Open in Blender"), behind the existing `/api/blender` contract; extension sends `plazcode_op` for structured tools. Real Blender in CI (Linux), plus fake-process queue tests.
4. **Blender window mode:** PlazCode's own addon (same executor), auto-install into each detected Blender addons folder, enable with a one-off background Blender, one Blender card with both modes.
5. **Shared helper socket + Blockbench:** token-paired local socket, one toolset module, web through the extension, then the desktop plugin.
6. **Figma plugin** (manifest, code, UI) on the shared socket.
7. **Unity** (after verifying the bridge start-up and the install method on a real Unity, or marking them field-test items).
8. **Wording and translation pass, Mac pass, full local and CI tests, `new-version-checklist.md` (1.24.33), test build with both zips, owner field-test list.** Release notes go to the owner before any release.

Stop rules: if a step's own tests do not pass, it is pushed as `WIP:` and NOW.md says so. Nothing is published, merged to main or release branches, or made public without the owner's yes.

## Open points to confirm while building (updated in review v2)
- Unity: install method (OpenUPM version available? does Package Manager need Git?), whether the Unity side starts its bridge by itself, Mac support. Field-test items if no real Unity is reachable.
- Blockbench desktop: plugin folder location (Windows `%APPDATA%`, Mac `Application Support`, to confirm), whether a dropped-in file is loaded without "Load plugin from file", and any permission prompt for an outgoing connection.
- Figma: browser (not desktop) import of a development plugin is unconfirmed, assume desktop only. Localhost from the plugin UI is settled (`devAllowedDomains`). Community publishing needs the owner's account (post-launch).
- Godot: exact `projects.cfg` location per OS on a real install.
- Headless Blender: Workbench versus Cycles CPU preview fallback on the CI Linux box; Blender 4.2 LTS and 5.x both.
- Blender window mode: PlazCode's own addon replaces the pin question (no more moving the `mcp-for-blender` pin for the main path); the pinned server stays an optional extra.
