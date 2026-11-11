# Connections rework plan (owner request, 2026-11-11)

Status: PLAN ONLY. Nothing built yet. Owner answers below are decided; build order is at the end.

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

## Build order (ships together; pushed to claude/plazcode-dev step by step)
1. Page rework and setup window, driven by fake status, with previews for the owner.
2. `connections.rs` detection and status, Godot end to end (smallest).
3. Headless Blender, then Blender open-window auto install.
4. Blockbench toolset: web through the extension, then the desktop plugin.
5. Figma plugin.
6. Unity.
7. Mac pass, wording pass, full tests, test build.

## Open points to confirm while building
- Unity manifest entry, bridge auto-start, Mac support.
- Blockbench desktop: plugin folder location and permission prompts for an outgoing connection.
- Figma: localhost from plugin UI, browser import of a development plugin, Community publishing (owner's Figma account needed).
- Whether to move the Blender pin from 2.1.9 to a version with `install-addon` (needs the hash-pin and first-use tests rerun).
