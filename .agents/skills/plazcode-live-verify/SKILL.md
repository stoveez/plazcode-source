---
name: plazcode-live-verify
description: >-
  Visually inspect, interact with, and verify the real PlazCode desktop app, unpacked Chrome
  extension on live AI sites, and Roblox Studio using the desktop-control, chrome-devtools,
  and roblox-studio MCP servers. Use when testing UI changes, capturing real previews for the
  owner, or reproducing live browser/desktop/Studio issues.
---

# PlazCode Live Verification

Use the live MCP tools to verify real behavior instead of guessing or relying solely on unit fixtures.

## 1. Non-Negotiable Preview & Honesty Rules

- **Never fake previews (`2026-10-25` owner rule)**: Never open `desktop.html`, `popup.html`, or an extension page standalone in a browser tab and present that as a preview (standalone pages show placeholders, wrong colors, and broken spacing).
- Always show either:
  1. The **real running `PlazCode` desktop app**, or
  2. The **real unpacked extension** (`build-src-<ver>/PlazCode/PlazCode-Extension`) loaded in Chrome on a live AI site.
- If a live site or OS target (e.g., macOS Catalina or a site requiring the owner's paid session) is unavailable, say plainly what was fixture-tested vs. live-tested.

## 2. Live Chrome Extension Testing (`chrome-devtools` MCP)

1. Rebuild `build-src-<ver>/PlazCode/PlazCode-Extension` first using `plazcode-debug-and-fix`'s `pc-rebuild-and-check.ps1` / `.sh`.
2. Verify `chrome-devtools` MCP is running with `--categoryExtensions` (already configured in `~/.gemini/config/mcp_config.json`).
3. Install/reload the unpacked extension:
   - Call `install_extension` with path `C:\Users\plazm\plazcode-source\build-src-<ver>\PlazCode\PlazCode-Extension` (or `list_extensions` + `reload_extension` if already loaded).
4. Inspect extension & AI site behavior:
   - Check the background worker using `evaluate_script` with `serviceWorkerId` (omitting `pageId`).
   - Open or select a live AI tab (`list_pages` / `navigate_page` / `new_page`), wait for load (`wait_for`), and use `take_snapshot` / `take_screenshot` / `get_css_styles` to inspect:
     - PlazCode bar alignment, responsive single-row icons on narrow chat widths, and `#rs-root` contrast/theming.
     - Dropdown layers (confirm open lists render above adjacent `.settingcard` sections).
     - Command cards and reply parsing.
     - Console errors (`list_console_messages`) — confirm AI site page errors are not attributed to PlazCode.

## 3. Live Desktop App Testing (`desktop-control` MCP)

- **Always call `desktop-control` via MCP (`call_mcp_tool`), never from inside shell `run_command`**: On Windows, shell commands can run inside an isolated sandbox desktop (`exebox-*`) that cannot see the user's real desktop windows, whereas the `desktop-control` MCP server runs on the real interactive desktop.
- Typical flow:
  1. `desktop_list_windows` -> locate `PlazCode` or target app window.
  2. `desktop_focus_window` -> bring it to the front.
  3. `desktop_ui_elements` -> read interactive Windows UI Automation control names, types, and exact `(centerX, centerY)` coordinates before clicking.
  4. `desktop_click` / `desktop_type` / `desktop_hotkey` -> interact cleanly.
  5. `desktop_screenshot` -> capture the actual running window for inspection or delivery.
- **Mouse-move fail-safe**: If the user moves the physical mouse more than 25px away within 10s of an AI cursor action, `desktop-control` pauses automatically so the user stays in control. Ask the user before calling `desktop_resume`.

## 4. Live Roblox Studio Testing (`roblox-studio` MCP)

- Use `list_roblox_studios` first to get the active `studio_id`, then `get_studio_state`, `search_game_tree`, `inspect_instance`, `script_read`, `get_console_output`, etc.
- **Critical `StudioMCP.exe` bridge handoff rule**:
  - `roblox-studio` auto-closes its `StudioMCP.exe` bridge after 15 seconds of idle time so it won't block PlazCode.
  - Whenever switching from `roblox-studio` MCP tools back to testing **PlazCode's own Roblox Studio connection**, **always call `roblox_studio_release_bridge` first** so no competing `StudioMCP.exe` helper holds Studio's MCP slot.
