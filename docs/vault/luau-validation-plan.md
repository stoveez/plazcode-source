---
title: Luau validation plan (all three stages in 1.24.30)
updated: 2026-10-31
---
# Luau validation: automatic validate -> repair -> revalidate (owner, 2026-10-31)

**Status: PLANNED, NOT STARTED.** Owner confirmed all three stages ship in 1.24.30. Inspect the real edit path in plan mode before coding (which commands change scripts today, e.g. Studio skills, `multi_edit`/`execute_luau` script writes, `read_scripts` readers; find them with grep in `overlay/core/main.js`, `overlay/core/studio_skills.js`, `agent/src/workspace.rs`, `checkpoints.rs`). Do not invent command names.

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
