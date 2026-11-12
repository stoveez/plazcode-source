# Linux and Mac startup fixes
Updated: 2026-10-29. Unreleased 1.24.27; final platform CI/packages pending.

Mac screenshot: 127.0.0.1:17613 address already in use. Found reclaim_port was a no-op outside Windows. Mac now queries the listener PID with lsof, checks proc_pidpath and the owning UID before signaling only a same-user PlazCode process. Graceful exit precedes bounded escalation; process identity is rechecked before forcing exit. Other programs remain running with an actionable error. New real Mac process regression starts a native orphan on another API port, verifies takeover, then verifies an unrelated listener survives. Hosted Mac verification remains.

Linux previously compiled only a headless bridge; GUI always returned an error. Windows EXEs do not run natively on Linux. New Linux native GUI entry opens the same real desktop frontend in the default browser. Browser launch uses a random single-use 60-second ticket in a fragment, clears it immediately, exchanges it only on the same localhost origin and keeps bootstrap state in tab sessionStorage. Permanent pairing keys never enter URLs/logs. API authentication and all signed program checks remain. Reopening requests Show; explicit Quit stops the process. Closing the browser tab leaves the bridge running.

Linux packaging builds a statically linked x86-64 musl executable, preserves executable permissions in ZIP and tar.gz, bundles verified official Engram 3.0.0 (archive SHA256 22bbfd81ee9071a04d446f653842c383a3101b594e8829519a63a7c747602e69), both extension variants and the root extension. No macOS app or Windows EXE is presented as Linux-compatible. Linux automatic updates are not published yet; the UI states this and never tries installing Windows/Mac packages. A desktop browser/default opener is required; no WebKit or version-specific glibc dependency is introduced. Linux ARM builds are not provided in this update.

Verified locally: 216 native tests plus 4 build tests (2 ignored); actual native Linux frontend launch/save/reload/reopen/Quit and ticket replay/wrong-origin/auth rejection. Hosted signed static package verification and affected users' devices remain.

Hosted run 40911856672: signed static Linux package and actual protected frontend test passed. Mac native takeover passed, but expected unrelated-port failure opened a modal even under --headless. Headless startup errors now use stderr/exit only; ordinary GUI failures retain the alert. Full final rerun remains.

Final verified build: 962899c / 40932400772; all hosted jobs passed. Real Mac takeover/unrelated-listener regression, universal Mac packaging and app/update handoff passed. Signed static Linux package and actual frontend passed in CI and locally. Windows/Mac/Linux downloads delivered; original devices remain untested.

## Oldest Mac supported: macOS 10.15 Catalina (since 1.24.33, owner 2026-11-12)
- `package.py` writes `LSMinimumSystemVersion 10.15` (the 1.23.0 baseline said 11.0, which is what refused Catalina) and checks the built program with `development/1.24.33/macos_floor.py`: Intel half at most 10.15, Apple Silicon half at most 11.0. The CI build sets `MACOSX_DEPLOYMENT_TARGET=10.15` for the Intel half. Test `test-macos-floor.py`.
- The memory helper (official Engram 3.0.0, Go 1.25) needs macOS 12. `engram.rs` switches memory search off below 12 with a plain reason and skips the download. A newer Engram built with Go 1.27 would need macOS 13: check the floor (`macos_floor.minimum_versions`) whenever the pinned Engram changes.
- The Mac window is the system Safari engine (Catalina: Safari 15.6 at best). `desktop.html`'s head script `pz-old-safari` covers color-mix() and crypto.randomUUID there; checked by `test-old-safari.js` and the old-Safari pass in `release-tools/test-linux-desktop.cjs`. Before using newer CSS or JS in the app window (for example CSS nesting, `@container`, regex lookbehind, `Promise.withResolvers`), add a fallback or extend that script.
- Catalina browsers: Chrome, Edge and Brave stopped at 128; Firefox still supports 10.15 and is what the Mac README recommends there.
- Never verified on a real Catalina Mac (see the field-test list in [open work](open-work.md)).

## Linux install, updates and setup (1.24.33, owner 2026-11-12)
- One-line install: `curl -fsSL https://raw.githubusercontent.com/stoveez/PlazCode/main/install-linux.sh | sh` (source `overlay/install-linux.sh`, published to the public repo root by `promote.py`/`publish_public.py`). Installs to `~/PlazCode` (visible on purpose: Snap browsers cannot read hidden folders), adds the app-menu entry through `PlazCode --linux-setup menu`; `--uninstall`, `--remove-data`, `--no-start`. Official HTTPS addresses only.
- Updates: feed `latest-linux.json` (signed, platform `linux`), download `PlazCode-Linux-<v>.tar.gz` (tar, not zip: unzip is missing on some distros), helper `Update-PlazCode-Linux.sh` (embedded in the program and shipped in the package; also used by the installer to update an existing install). The Windows and Mac feeds are unchanged and pinned by a test. Until the first Linux release the feed is missing and the app says so quietly.
- In-app setup: Get started cards on Apps & servers (`browser_setup.rs` for every system, `linux_setup.rs` for Linux) and a Home reminder. Moving to `~/PlazCode` starts the copy with `PLAZCODE_WAIT_FOR_PID`.
- App window: `--app` with the first Chromium-family browser found (`PLAZCODE_LINUX_WINDOW=tab` keeps a tab).
- Roblox Studio: through Vinegar, experimental (`vinegar.rs`); `PLAZCODE_MCP_COMMAND` still overrides the start command.
- Tests: `test-linux-update.py`, `test-install-linux.py`, the live Linux app test, Rust unit tests. Plan and full log: `development/1.24.33/LINUX-REWORK-PLAN.md`, `LINUX-REWORK-PROGRESS.md`.
