# Linux rework plan (owner, 2026-11-12)

Owner's request: "Rework linux support to make it much more easier and beginner friendly with the installation similar
to how you did with the mcp/connection things."

## Owner's answers (2026-11-12)
- **Roblox Studio on Linux:** try Studio through Vinegar, marked *experimental* until a Linux tester confirms it.
- **Install:** a one-line Terminal command **and** setup inside the app (Add to app menu, Start when I log in, with a
  checklist that ticks itself off). No AppImage, no .deb/.rpm for now.
- **Publishing:** publish Linux with 1.24.33 **and** give Linux automatic updates through its own new feed
  `latest-linux.json`. The Windows (`latest.json`) and Mac (`latest-macos.json`) feeds and their formats stay exactly as
  they are (CLAUDE.md rule 1). Publishing still needs the owner's yes for the exact update.
- **App window:** open PlazCode in its own window (Chrome/Chromium/Edge/Brave `--app`), falling back to a browser tab.
- **Browser extension setup:** a guided checklist that ticks itself off when the extension connects, on **all three
  systems** (Windows, Mac, Linux).
- **Test machine:** none. Everything ships marked "not tried on a real Linux desktop".
- **Chips:** x86-64 only (as now; covers the Steam Deck).

## Where Linux stands before the rework
- The Linux download is a zip/tar.gz with a static x86-64 `PlazCode` program, the memory helper and both extension
  folders. It is only a CI test artifact: `promote.py` publishes Windows, Mac and Firefox, not Linux.
- Starting it: most file managers (GNOME Files) will not run a downloaded program on double-click, so a beginner needs
  the Terminal. The app opens as a tab in the default browser (`linux_desktop.rs`, `xdg-open`). No app-menu entry, icon
  or start-at-login.
- Updates: `updater.rs` says "Linux automatic updates are not published yet".
- Data: `~/.config/PlazCode` (profiles, memory) plus settings files in the install folder (as on Windows).
- Roblox Studio: the Studio connection (Roblox's own StudioMCP) is only looked for on Windows and Mac, so Linux cannot
  connect to Studio at all.

## Design decisions (AI, from the answers)
- **Install folder `~/PlazCode`** (visible, not hidden): Ubuntu's Snap Firefox and Snap Chromium cannot read hidden
  folders, so the extension folders must be outside dot-folders for "Load unpacked" / "Load temporary add-on".
- Menu entry `~/.local/share/applications/plazcode.desktop`, icon `~/.local/share/icons/hicolor/256x256/apps/plazcode.png`,
  start-at-login `~/.config/autostart/plazcode.desktop`. No admin password anywhere.
- Uninstall removes the menu entry, start-at-login and the program folder; it keeps `~/.config/PlazCode` (your data)
  unless asked to remove it too.
- The one-line command lives in the public repo (`install-linux.sh`, published with the release): it checks x86-64,
  reads `latest-linux.json`, downloads the package, checks its SHA-256, installs or updates `~/PlazCode` keeping user
  files, adds the menu entry and opens PlazCode. The app's own signed-file checks still run on start.

## Steps (each ends tested, committed and pushed to `claude/plazcode-dev`)
1. **Plan and progress files** (this file, `LINUX-REWORK-PROGRESS.md`).
2. **Own app window** — `linux_desktop.rs` opens the launch link with the first of Chrome, Chromium, Brave, Edge
   (normal or Flatpak) as `--app=`; otherwise `xdg-open`/`gio`. Unit test of the choice; live test keeps its stand-in.
3. **Setup inside the app (Linux)** — new `linux_setup.rs` + `/api/linux-setup`: status (where PlazCode runs, menu entry,
   start at login), actions (move to `~/PlazCode` and relaunch from there, add/remove menu entry, start at login on/off,
   uninstall). Desktop page: a "Get started" window with a checklist that ticks itself off (same look as Apps & servers).
4. **Guided browser extension setup (all systems)** — the same "Get started" window: pick your browser (installed ones
   are found), "Open the extensions page" (the app opens `chrome://extensions` / `edge://extensions` /
   `about:debugging#/runtime/this-firefox` in that browser), Developer mode explained, "Copy folder path" with the
   right folder for that browser, a tip for pasting the path into the folder picker on each system, and a row that
   ticks when the extension connects. Firefox: a note that temporary add-ons are removed when Firefox closes.
5. **One-line installer** — `install-linux.sh` (install, update, `--uninstall`), tested in this Linux container with a
   local stand-in feed; `PlazCode --linux-setup <action>` used by the script so the app and the script share one code path.
6. **Linux automatic updates** — `updater.rs` Linux branch with a Linux update helper (like the Mac `.command`):
   download, SHA-256, signed-package check, replace files keeping user files, relaunch. `promote.py` and
   `publish-1.24.33.yml` add the Linux package, `latest-linux.json` (signed like the others) and `install-linux.sh`.
   CI runs the update hand-off test on Linux.
7. **Roblox Studio through Vinegar (experimental)** — find Vinegar (Flatpak `org.vinegarhq.Vinegar` or a normal install),
   its Studio and Roblox's `StudioMCP.exe`, start it through Vinegar's Wine; the Studio tile on Linux says
   "Experimental (Vinegar)" with a checklist (Vinegar found, Studio installed, Studio MCP enabled, connected).
8. **Finish** — translations (14 languages), Linux README, release notes, vault notes, full tests, test build, field-test
   list (everything "not tried on a real Linux desktop").

## Not doing
AppImage, Flatpak/Snap/.deb/.rpm packages, ARM builds, changing the Windows or Mac feeds.
