---
title: Build and tests
updated: 2026-11-01
---
# Build and tests

- **Edit only the overlay** (`development/1.24.36/overlay`). Never edit `build-src-1.24.36/` (regenerated). A file not in the overlay is first copied there from `build-src-1.24.36/PlazCode/`.
- **Keep test and info files out of `development/1.24.36/`:** tests (`test-*`, `preferences-test/`, `test-support/`, test fixtures) live in `tests/1.24.36/` (with overlay tests in `tests/1.24.36/overlay/`) and design/plan/info `.md` files live in `docs/version-notes/1.24.36/`. `prepare.py` automatically mirrors `tests/1.24.36/overlay/` into `build-src-1.24.36/PlazCode` for running tests while keeping `development/1.24.36/` lean.
- Build: `python3 development/1.24.36/prepare.py`. Do not run it while the full suite runs.
- Feature guide: `test-feature-guide.js` reads the real menu and bar in `core/main.js` and fails for any control with no entry in `core/feature-guide.js`. After editing the guide, regenerate nothing: the JSON in that file is the source. Startup text changes need `node test-startup-sections.js --update-golden` and new pins for `core/config.js` and `core/main.js`.
- One JS test: from `build-src-1.24.36/PlazCode`, `NODE_PATH=release-tools/node_modules node test-<name>.js`.
- Full JS suite (10 to 15 minutes): from the build folder, `NODE_PATH=release-tools/node_modules PLAZCODE_TEST_BROWSER=chromium python3 release-tools/test-javascript.py`.
- Rust: `cargo test --manifest-path build-src-1.24.36/PlazCode/agent/Cargo.toml` (268 + 5 Linux tests passing on 1.24.33, plus 2 ignored; run the full suite).
- Desktop tests: `node release-tools/test-*.cjs` (Chromium works in the sandbox; Firefox halves run only in CI).

## TypeScript files (since 2026-11-15)
Some extension files are written in TypeScript in `development/1.24.36/ts/` (now: `providers/kimi.ts`, `providers/freebuff.ts`, `providers/gemini.ts`, `core/parser.ts`). **Edit the `.ts`, never the matching `overlay/.../*.js`.** Then run `NODE_PATH=build-src-1.24.36/PlazCode/release-tools/node_modules node development/1.24.36/ts/build.cjs` (needs `npm ci --prefix release-tools` in the assembled tree). It erases the types into spaces (ts-blank-space), so the `.js` keeps the same lines and columns and everything after it (prepare.py, tests, protection, hash pins, the release) still works on plain JavaScript; commit both files. `build.cjs --types` runs TypeScript's checker; `types/provider.d.ts` is the contract every site file must keep (a missing or misspelled member is an error). `test-typescript-sources.js` (part of the normal test run, so CI) fails when a `.js` is out of date or a type error appears. To convert another file: copy its `.js` to `ts/<same path>.ts`, add the "Built from" line after the SPDX line, add types until `--types` passes, run `build.cjs`. The TypeScript checker over plain JavaScript (step 1) is `development/1.24.33/typecheck/check.py`; `test-main-scope.js` catches helpers called where they are not reachable.

### Split as you go (owner decision, 2026-11-15)
`core/main.js` (about 13,700 lines) and `background.js` are NOT rewritten in one go. Instead:
1. When a bug fix or feature touches a part of `core/main.js` (for example Ask PlazCode, the bar, the command runner, the screenshot preview), move that part into its own TypeScript file under `development/1.24.36/ts/` in the same job, with the same behaviour. Untouched parts stay as they are.
2. When a part moves out, first write down the messages and data it shares with the rest (a type in `ts/types/`), because typed boundaries catch the most mistakes for the least work.
3. A move is finished only when every existing test, `test-typescript-sources.js`, `test-main-scope.js`, the hash pins and the provider checks pass; behaviour does not change as part of a move (fixes are their own commit).
4. A new file loaded on AI pages must be added to the manifest's content-script lists (and to the page bundle the typecheck uses) in the right order, before the code that uses it.

## Hash pins
Protected files (`core/main.js`, `core/config.js`, `providers/vani.js`, `claude.js`, `chatgpt.js`, `notion.js`) have pins in the overlay's `test-desktop-regression.js`. After editing one: run `prepare.py`, then `git hash-object build-src-1.24.30/PlazCode/<file>` and update the pin. Redo after every merge touching them.

## Code protection checks
- `node development/1.24.30/test-protection.mjs`: signatures, file tampering, encrypted maps, obfuscation and old-browser recovery.
- `node development/1.24.30/test-protection-browser.mjs`: real protected Chromium extension and browser cryptography. The explicit local `PLAZCODE_PROTECTION_BROWSER_MODE=crypto` subset does not cover extension loading; CI requires the full check.
- Optimized Linux proof: `PLAZCODE_SIGNING_KEY_FILE=<temporary-validation-key> node development/1.24.30/test-release-verifier.mjs`; the binary must be compiled for that validation key.
- Never publish validation-key packages. Production needs the pinned public key and private Actions secret; see [code-protection](code-protection.md).

## CI
`.github/workflows/validate-1.24.30.yml` (jobs `browsers` and `native` on Windows, macOS, Ubuntu). Start with `gh workflow run validate-1.24.30.yml --ref <branch>`. The `browsers` job stops at the first failing step. Builds need the public window, see [test-builds](test-builds.md).

## Sandbox limits
The connected GitHub artifact tool can download artifacts through its returned Sediment URL; direct CLI blob-storage requests remain denied. Native Windows/Mac UI checks run on hosted runners. Integration cannot change repository visibility (403). A temporary local Rust toolchain was installed for Linux verification.

## Gotchas
- Themed `.settingcard` has `backdrop-filter`, which traps open dropdown lists (fixed with a lift class in `core/effort-picker.js`).
- `:has()` selectors are slow on big re-rendering pages; use a JS-set class.
- Do not `pkill -f` patterns that can match your own shell.
- Windows exe antivirus check (since 1.24.23): `python test-exe-av-signals.py PlazCode.exe` runs in the Windows CI job right after the release build; it fails if the exe contains -EncodedCommand, ExecutionPolicy Bypass or rundll32 url.dll,FileProtocolHandler, or lacks the manifest/company details. Windows-only Rust code cannot be compiled in the cloud session (the Windows std download is blocked), so CI is the first compile of it.

- Luau integration tests require PLAZCODE_LUAU_LSP and PLAZCODE_LUAU_DEFINITIONS pointing at the pinned official 1.70.1 tools. Without them real-LSP tests return early; do not describe that as live LSP verification. CI fetches/validates them for all native jobs. Linux also sets PLAZCODE_LUAU for the fixed place snippet VM test.
