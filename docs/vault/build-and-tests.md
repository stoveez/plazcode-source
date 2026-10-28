---
title: Build and tests
updated: 2026-10-28
---
# Build and tests

- **Edit only the overlay** (`development/1.24.26/overlay`). Never edit `build-src-1.24.26/` (regenerated). A file not in the overlay is first copied there from `build-src-1.24.26/PlazCode/`.
- Build: `python3 development/1.24.26/prepare.py`. Do not run it while the full suite runs.
- Feature guide: `test-feature-guide.js` reads the real menu and bar in `core/main.js` and fails for any control with no entry in `core/feature-guide.js`. After editing the guide, regenerate nothing: the JSON in that file is the source. Startup text changes need `node test-startup-sections.js --update-golden` and new pins for `core/config.js` and `core/main.js`.
- One JS test: from `build-src-1.24.26/PlazCode`, `NODE_PATH=release-tools/node_modules node test-<name>.js`.
- Full JS suite (10 to 15 minutes): from the build folder, `NODE_PATH=release-tools/node_modules PLAZCODE_TEST_BROWSER=chromium python3 release-tools/test-javascript.py`.
- Rust: `cargo test --manifest-path build-src-1.24.26/PlazCode/agent/Cargo.toml` (about 180 tests).
- Desktop tests: `node release-tools/test-*.cjs` (Chromium works in the sandbox; Firefox halves run only in CI).

## Hash pins
Protected files (`core/main.js`, `core/config.js`, `providers/vani.js`, `claude.js`, `chatgpt.js`, `notion.js`) have pins in the overlay's `test-desktop-regression.js`. After editing one: run `prepare.py`, then `git hash-object build-src-1.24.26/PlazCode/<file>` and update the pin. Redo after every merge touching them.

## CI
`.github/workflows/validate-1.24.26.yml` (jobs `browsers` and `native` on Windows, macOS, Ubuntu). Start with `gh workflow run validate-1.24.26.yml --ref <branch>`. The `browsers` job stops at the first failing step. Builds need the public window, see [test-builds](test-builds.md).

## Sandbox limits
Cannot download GitHub artifacts, cannot install Firefox, no real Windows/Mac app, cannot flip repo visibility.

## Gotchas
- Themed `.settingcard` has `backdrop-filter`, which traps open dropdown lists (fixed with a lift class in `core/effort-picker.js`).
- `:has()` selectors are slow on big re-rendering pages; use a JS-set class.
- Do not `pkill -f` patterns that can match your own shell.
- Windows exe antivirus check (since 1.24.23): `python test-exe-av-signals.py PlazCode.exe` runs in the Windows CI job right after the release build; it fails if the exe contains -EncodedCommand, ExecutionPolicy Bypass or rundll32 url.dll,FileProtocolHandler, or lacks the manifest/company details. Windows-only Rust code cannot be compiled in the cloud session (the Windows std download is blocked), so CI is the first compile of it.
