---
title: Luau validation plan (all three stages in 1.24.30)
updated: 2026-10-31
---
# Luau validation: automatic validate -> repair -> revalidate (owner, 2026-10-31)

**Status (2026-11-01): all three stages built and tested locally (Rust 266 pass incl. real luau-lsp and the real place-outline snippet in the official Luau VM); not yet run in CI or with real Studio. See NOW.md.** Owner confirmed all three stages ship in 1.24.30. Inspect the real edit path in plan mode before coding (which commands change scripts today, e.g. Studio skills, `multi_edit`/`execute_luau` script writes, `read_scripts` readers; find them with grep in `overlay/core/main.js`, `overlay/core/studio_skills.js`, `agent/src/workspace.rs`, `checkpoints.rs`). Do not invent command names.

## Hard constraints (owner)
- Use the local bridge (the desktop app); the extension only exposes commands and shows results.
- **Never execute AI-generated code just to validate it.** Static analysis only.
- **Do not embed the Luau VM/C++ in the extension.** Analysis runs in the app (child process or service).
- No startup slowdown, no updater change, Stop always available, user data untouched. Binaries must not add antivirus signals (see `test-exe-av-signals.py`); prefer shipping pinned official tool binaries as separate files verified like other runtime files (see `runtime/engram` handling in `integrity.rs`/`promote.py`).
- CI already compiles Studio Skills with the official `luau-compile` built from a pinned luau commit (`test-luau-library-compiles.js`); reuse that pin for `luau-analyze`.

## Policy (owner-approved, keep unless the owner changes it)
- **DECIDED by the owner (2026-10-31, latest): validation is ADVISORY by default; blocking syntax errors is a setting (off at first), turned on by default only after the backward-compatibility tests prove it safe.** (This replaces the earlier "syntax errors always block" approval.) When blocking is on: syntax errors block, type/lint stay advisory.
- **Type errors and lint warnings are ADVISORY**: reported to the AI, never block.
- Owner's newer design text says "validation fails: keep original, report errors"; read it as applying to blocking (syntax) errors. Advisory results are returned with the successful apply. **If the owner wants new type errors to block too, ask first** (AskUserQuestion) before changing this.
- Respect each script's `--!strict`, `--!nonstrict`, `--!nocheck`; never force strict. A `--!nocheck` script gets syntax check only.

## Owner's improved architecture
AI proposes a script change -> PlazCode STAGES it (original preserved, nothing committed) -> incremental validation (syntax, types, lint, dependencies, Roblox API) -> if new errors: return compact diagnostics to the AI to repair, **max 2-3 attempts, never loop forever** -> pass: apply; blocking failure after the attempts: keep the original and report the errors.

Six improvements to build:
1. **Incremental analysis**: re-check the changed script and the scripts that depend on it, not the whole game.
2. **DataModel awareness**: `ReplicatedStorage`, `ServerScriptService`, ModuleScripts, instance paths. Use luau-lsp **sourcemap** support; PlazCode generates the sourcemap from its existing Studio bridge (actual project hierarchy), not from a Rojo project file.
3. **Dependency graph** of `require` edges so a changed module re-checks its dependents.
4. **Automatic error correction loop** using precise diagnostics.
5. **Transactional editing**: original kept until validation passes; failed change leaves the script as it was (works with the existing undo/checkpoints: `checkpoints.rs`).
6. **Smart diagnostic filtering**: report only NEW errors/warnings introduced by the change (diff against the pre-change baseline), not existing ones.

Compact diagnostics for the AI (benchmark token savings before claiming any):
`{"file":"InventoryService.luau","status":"failed","newErrors":1,"diagnostics":[{"line":42,"severity":"error","message":"Expected number, got string"}]}`

## Stages (all in 1.24.30)
1. `analyze_luau` command: structured diagnostics via official `luau-analyze` (independent fallback and the CI reference).
2. Roblox-aware **luau-lsp** persistent local service: sourcemap from the Studio hierarchy, completion, signatures, definitions, references.
3. **Automatic validation before script edits are applied**: the staged edit + bounded repair loop above, so the AI does not have to remember to call `analyze_luau`.
Technology: luau-lsp (main engine, Roblox API intelligence, dependency-aware diagnostics); official `luau-analyze` (fallback + CI tests); PlazCode local bridge manages processes and talks to Studio; extension exposes AI commands and shows results. Do NOT bundle Luau C++ source into PlazCode.

## Work order
1. Plan mode: map every place PlazCode writes a script today; decide staging format, process lifecycle (start lazily, stop on quit, timeouts, one process per workspace), and how sourcemaps are produced from Studio (`execute_luau` read-only walk, never running user code).
2. Stage 1 (`analyze_luau`) with tests, then stage 2 (LSP service + sourcemap), then stage 3 (staging, repair loop, diagnostics filter).
3. Tests: Rust unit tests, JS tests for the command and loop (max attempts, Stop mid-loop, original preserved on failure), real `luau-analyze`/luau-lsp in CI on Linux/Windows/Mac, a negative test that generated code is never executed. Update `docs/vault/build-and-tests.md`.
4. Docs for the AI: add the new commands to the startup prompts (these now live in the sealed text pack: `core/config.js`, `lean-startup.js`; re-run `test-text-pack.mjs`) and to `plazcode_help`.
5. Release notes in plain words in `development/1.24.30/release-entry.json` (GitHub body stays under 2,000 characters).

## Safety rules added by the owner (2026-10-31, second message)
Validation must never make PlazCode's existing tools worse. Risks and the prevention for each:
| Risk | Prevention |
|---|---|
| Slower tool calls | Analysis runs asynchronously with a hard timeout; a timeout or analyzer crash never fails the edit |
| AI tool-call loops | At most 2-3 automatic repair attempts |
| Existing tools stop working | Existing tool names and JSON schemas stay unchanged (new fields only if optional); the dispatcher is not rewired |
| Excess tokens | Compact diagnostics only, never raw analyzer output |
| Edit commands fail unexpectedly | Validation is advisory first; blocking is a switch |
| Several AI agents edit at once | Per-script locks and revision checks (refuse to apply if the script changed since it was staged) |
Do NOT make every `edit_file`, `execute_luau` or Studio command wait on the analyzer. Backward compatibility is a strict requirement and gets its own tests before automatic validation is on by default.
Owner's suggested rollout: (1) `analyze_luau` as an optional new tool; (2) background validation after edits that never blocks a successful call; (3) transactional editing and automatic repair as opt-in once proven. This sits alongside the earlier approval that syntax errors block: see the open decision recorded in NOW.md.

## Settings and result rules (owner, 2026-10-31, third message; confirms advisory default)
Setting "Luau Validation Mode": an Enabled switch plus a choice of **Advisory** (default, recommended) or **Blocking**.
- Advisory: edits apply normally, validation runs in the background, NEW errors are reported to the AI, tool calls still succeed. Example result: "Edit applied with warning" plus the diagnostic so the AI can fix it afterwards.
- Blocking (opt-in, stricter): applies only to NEWLY introduced errors, never to errors that already existed in the project.
- Warnings (lint) never block by default, in either mode.
- Analyzer crash, timeout or missing binary returns a distinct **validation-unavailable** result: never silently "passed", never "failed". The edit then follows the mode (advisory applies it; blocking does not treat unavailable as an error).
- The mode changes live, with no PlazCode restart (read the setting per edit, do not cache it at startup).
- Existing tool names, arguments and response contracts stay compatible; any new response fields are optional additions. AI agents call PlazCode tools exactly as before.
The settings UI preview the owner showed was only a design preview, not an implemented change; build the real switch in the existing settings page (find it first in plan mode).

## Implementation map (inspected 2026-10-31; plan mode result)
**Where script edits happen today.** Studio script writes from the AI go `multi_edit` / `script_set_source` -> app `checkpoint_tool_inner` (`agent/src/main.rs`, around the `source_path` block). For a task with an id, the app ALREADY reads the script before and after the edit with a read-only `execute_luau` snapshot (`checkpoints::script_snapshot` / `parse_snapshot`) and stores both in the task journal (`record_script`, used by Undo). So the old and new source are already in hand at the exact moment the edit result goes back to the AI. No new Studio round trip is needed.
**Hook (one place, no tool rewiring).** After `outcome` and the after-snapshot in `checkpoint_tool_inner`: if Luau validation is enabled and both snapshots exist, run `luau_check::compare(before, after, path)` with a hard timeout (about 3 s) on a blocking thread. It analyses BOTH sources, keeps only diagnostics that are new in `after` (match on code+message, line shifted by the edit), and appends ONE compact optional block to the existing result text. The tool name, arguments and success/failure of the call do not change.
- Advisory (default): result text + `[Luau check] 1 new error ... {compact json}`.
- Blocking (setting): only if a NEW syntax error is found, restore `before` with the same restore path Undo uses (`checkpoints` script restore via execute_luau) and return the original result plus "change not kept: new syntax error" with the diagnostics. Existing errors never block; warnings never block.
- Analyzer missing/crash/timeout: `[Luau check] validation-unavailable (reason)`; edit follows the mode, never counted as pass or fail.
- Per-script lock: a mutex keyed by studio_id+path around snapshot/edit/check/restore; the restore checks the script still equals `after` (revision check) before writing, else it reports and does nothing.
- Edits without a task id, `execute_luau` that sets `.Source`, and Play-mode edits: not validated automatically (AI can call `analyze_luau`).
**Repair loop.** The AI repairs from the diagnostics in its next turn; the app counts consecutive new-error results per script per task and after 3 adds "stop retrying, tell the user" to the block. No hidden auto-loop inside the app.
**New code.** `agent/src/luau_check.rs` (process runner, parser of `luau-analyze --formatter=plain`, diff, compact JSON, tests); `analyze_luau` read-only Roblox-side command handled by the app (source or Studio path; reads via the read-only snapshot, never runs user code); setting `luau_validation: {enabled, mode:"advisory"|"blocking"}` in `preferences.rs` (read per edit, so it switches live) and a switch in the existing desktop settings page.
**Analyzer binaries (as built).** luau-lsp's own `analyze` command is the engine for stages 1 and 3 (it is luau-analyze plus Roblox types, offline). Official prebuilt release 1.70.1, pinned by SHA-256, shipped in the zips and fetched once if missing; one-shot analysis takes about 2.5 s because the Roblox type list loads each time, which is why stage 2's persistent service matters. luau-analyze from the pinned Luau commit stays the CI reference for the skills library. Stage 2 luau-lsp (MIT, JohnnyMorganz) pinned release + SHA-256, also a runtime file. Size cost: roughly +3 to +5 MB (analyze) and +10 MB (lsp) per platform zip; owner approved both (2026-10-31): ship luau-analyze AND luau-lsp. Run `test-exe-av-signals.py` on both.
**Stage 2 sourcemap.** Generated from Studio with a read-only `execute_luau` tree walk (names, class names, script paths only) into a Rojo-format `sourcemap.json` in the app's cache; luau-lsp started lazily, one per Studio, stopped on quit/idle.
**Tests.** Rust: parser, new-only diff with shifted lines, timeout -> unavailable, blocking restore + revision check, setting read live. JS: tool result contract unchanged when disabled/unavailable. CI: real `luau-analyze` on all three platforms. Negative test: no code from the edited script is ever passed to `execute_luau` (only the fixed snapshot/restore snippets).

## Stage 2 as built (2026-11-01)
- `agent/src/luau_service.rs`: one `luau-lsp lsp --stdio` per open Studio place, started on first use, stopped after 10 idle minutes (it also exits when PlazCode closes, because its input closes). JSON-RPC client answers `workspace/configuration` (Roblox platform, sourcemap on, autogenerate off).
- Place mirror: `agent/src/luau_tree.luau` is a fixed read-only snippet run with `execute_luau` (modes summary/tree/sources). It returns a fingerprint of the instance tree (all scripts and their ancestors, other instances up to 12,000) and of each script; long scripts come in UTF-8-safe slices. The app writes `sourcemap.json` + `src/<Name>-<hash>.luau` under the profile's `cache/luau-place/`. Later syncs (at most every 4 s, on use) read only what changed. A later same-named sibling is shown as `Name@2`.
- AI command `luau_lookup` {path, line, symbol | column, what: definition | references | hover | signature | complete}; locations come back as Studio paths + line text ("Roblox API" for built-ins).
- `analyze_luau` with `path` now uses the place context; `path` + `source` checks proposed text without applying it.
- Edit checks use the service first (fast once running) and also re-check scripts that `require` an edited ModuleScript (dependency graph from the mirrored text; luau-lsp resolves the requires); one-shot CLI is the fallback.
- Tests: tree to sourcemap, duplicates, dependents, UTF-16 positions, real luau-lsp (definition across scripts, references, hover with doc comment, completion, signature, Roblox API types, a module change breaking a dependent = advisory type error, new syntax error = blocked), real snippet in the Luau VM through the real sync (paging, slices, UTF-8, change detection). CI Linux builds the Luau VM for that test.

**Download size (owner, 2026-11-01):** luau-lsp and the Roblox type list are no longer shipped in the zips (they added about 5.5 MB on Windows and 7.7 MB on Mac). The app downloads them once on the first Luau check from the pinned official release and checks the SHA-256 (the macOS arm64 slice is already signed by the toolchain, so no extra signing step is needed). Only `runtime/luau/LICENSE` ships. `package.py` now prints size per folder and the 15 largest files of each test zip so growth between builds is visible in the CI log.

## Lifecycle audit (2026-11-01, validation pending)
Interrupted compare/proposed-text operations invalidate sync so a later request reads actual Studio text. Pending JSON-RPC slots have drop cleanup. Background edit checks listen for task cancellation; profile changes clear the service, delayed notices and repair streaks, with profile-session isolation in the service key.

**Scope limits:** the implementation checks after an existing edit and can conditionally restore it; this is not a true pre-apply staging transaction. The dependency filter scans direct require/name mentions (up to 12), not a complete transitive graph; aliases/dynamic requires can be missed. The three-attempt limit instructs the AI rather than enforcing a hidden repair loop. These preserve existing tools and the advisory-first policy; do not claim the larger original architecture is fully delivered. `luau-lsp analyze` is the fallback engine, not a separately shipped luau-analyze executable. Actual Studio integration still needs user testing.

**Actual Drive preview delivered (2026-11-01):** [Luau Settings](https://drive.google.com/file/d/1rbUnl6a1_yvHWqoslgic0UFr4wBG_-z1/view?usp=drivesdk). Actual running Linux debug native/frontend and temporary local account; zero page errors; Advisory default. Drive PNG metadata/name/MIME/236,394-byte size verified. This previews the real control, not real Studio analysis.
