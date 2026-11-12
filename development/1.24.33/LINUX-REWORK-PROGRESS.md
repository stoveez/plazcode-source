# Linux rework progress

>>> PICK UP HERE: read `LINUX-REWORK-PLAN.md` (owner's answers and steps), then the table and the newest log entry.
Edit only `development/1.24.33/overlay` (and `development/1.24.33/*.py`, workflows). Rebuild with `python3
development/1.24.33/prepare.py` (never while the full JS suite runs).

| Step | What | State |
|---|---|---|
| 1 | Plan and progress files | done |
| 2 | Own app window (`--app`) | done |
| 3 | Setup inside the app (Linux) | not started |
| 4 | Guided browser extension setup (all systems) | not started |
| 5 | One-line installer | not started |
| 6 | Linux automatic updates + publishing | not started |
| 7 | Roblox Studio through Vinegar (experimental) | not started |
| 8 | Translations, README, notes, test build | not started |

## Log (newest first)
- **2026-11-12, step 2 done.** `linux_desktop.rs`: the launch link opens with the first of Chrome, Chromium, Brave, Edge, Vivaldi found on PATH as `--app=` (an app window with no tabs or address bar), else a Flatpak one of those through `flatpak run`, else `xdg-open`/`gio` as before. `PLAZCODE_LINUX_WINDOW=tab` keeps the old tab. Links the app opens (download pages) still use the default browser. Tests: unit test `opens_an_app_window_when_a_chromium_browser_is_installed`; the live Linux app test puts a stand-in Chrome first on PATH and checks the window was opened through it. Not seen on a real Linux desktop. Needs the new app.
- **2026-11-12 (seventh chat), step 1.** Owner asked for the rework and answered the questions (see the plan). Nothing
  in the product changed yet.
