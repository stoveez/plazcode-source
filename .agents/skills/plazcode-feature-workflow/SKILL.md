---
name: plazcode-feature-workflow
description: >-
  Plan and build new features for PlazCode following the owner's root-level discovery rules,
  extension-vs-app architecture boundaries, TypeScript split-as-you-go structure, 15-language
  localization, and UltraLab/locale generation checks. Use before designing or implementing any
  new feature or UI change in PlazCode.
---

# PlazCode Feature Workflow

Use this workflow whenever adding a feature or changing user-facing behavior in `stoveez/plazcode-source`.

## 1. Ask Deep Root-Level Questions First (`2026-10-24` owner rule)

Unless the request is already completely specified or an unattended run, **do not start coding a new feature yet**. First ask up to 4 questions per round (offering a `(Recommended)` answer first for each) covering:
1. **Real goal**: What problem or friction is behind the request?
2. **Who & when**: Who uses it, how often, and what happens right before/after?
3. **What "great" looks like & edge cases**: Offline behavior, wrong AI site, huge input / free-plan 12k limits, older macOS 10.15 Catalina, Linux.
4. **Boundaries & verification**: What must NOT change (auto-updater feeds, send pacing, safety checks), how it should feel, and how the owner will verify it.

Do not ask questions the codebase or `docs/vault/` already answers. Once answered:
- Reflect the plan back in 2–3 plain, non-coder sentences before writing code.
- Record permanent choices in `docs/vault/decisions.md`.

## 2. Choose the Right Layer (Extension vs. Desktop App)

See [references/architecture-map.md](./references/architecture-map.md) for the exact file layout.

- **Prefer extension-only implementations (`core/`, `providers/`, `overlay.css`, `background.js`, `popup.*`)** whenever the feature does not need native OS processes, filesystem/process safety enforcement, or window hosting. An extension-only change works by reloading the unpacked extension and refreshing AI tabs.
- **Always state in one plain line** at handoff: *"Reloading the extension is enough"* **or** *"The desktop app must be replaced too (and reload the extension)."*
- **Keep safety aligned**: Any permission, path, command, or approval rule in `core/safety.js` or `core/approval.js` must match `agent/src/safety.rs` and `agent/src/workspace.rs`.
- **Protect free-plan input limits (`1.24.24` lesson)**: Route startup context and command-result extras through `fitExtra` / `inputBudget` in `core/main.js`; never cut command results themselves, and keep startup prompts small (`core/lean-startup.js`).
- **Protect the auto-updater (`latest.json` / `latest-macos.json` / `latest-linux.json`)**: Never break feed URLs, JSON schemas, or `< 64 KiB` feed limits.

## 3. Build Cleanly in TypeScript & Regenerate Packs

1. **New extension modules belong in `development/<ver>/ts/`**:
   - Write TypeScript under `ts/core/` or `ts/providers/` with shared contracts in `ts/types/`.
   - Erase types to `overlay/` via `node development/<ver>/ts/build.cjs` and verify `build.cjs --types`.
   - If adding a new content script loaded on AI sites, add it to `manifest.json` (`content_scripts` in the exact load order before code that calls it) **and** to the page bundle list used by `development/<ver>/typecheck/check.py --page`.
2. **All 15 interface languages are mandatory**:
   - Add every new UI label/message to `development/<ver>/overlay/core/locales/en.json` and all 14 sibling translation files (`es`, `fr`, `ru`, `ar`, `zh-CN`, `zh-TW`, `ja`, `ko`, `de`, `pt-BR`, `it`, `hi`, `tr`, `pl`).
   - Run `python development/<ver>/build-locales.py` to regenerate `overlay/core/i18n-catalog.js`, and verify with `python development/<ver>/test-locales.py`.
3. **Never hand-edit generated UltraLab bundles**:
   - Edit source files under `development/<ver>/ultralab/`, regenerate `core/ultracode.js`, `core/ultralab-pack.json`, and `core/ultralab/INDEX.json` with `python development/<ver>/ultralab/build_ultralab.py`, and test with `python development/<ver>/test-ultralab-generated.py`.
4. **UI & Theme Rules**:
   - Use PlazCode's theme tokens and Feel settings (`theme.js` / `overlay.css` / `desktop.html`).
   - Remember `.settingcard` uses `backdrop-filter`: lift the active section layer when opening a dropdown list so it does not render behind the next card (`test-dropdown-layer.js`).
   - Ensure `desktop.html` changes also pass `test-old-safari.js` (`pz-old-safari` compatibility for macOS 10.15 Catalina).
5. **Respect licenses**: Never copy GPL Multi-Script code. Keep `THIRD-PARTY-NOTICES.txt` current and retain UltraLab (`youtube.com/@SyphoDev`) and Brickwire (MIT, `"Brickwire contributors"`) attributions.

## 4. Validate Before Wrapping Up

- Run `plazcode-debug-and-fix`'s `pc-rebuild-and-check.ps1` / `.sh` script plus `test-locales.py`, `test-prepare-overlay.py`, and feature-specific tests.
- Run `cargo test --manifest-path agent/Cargo.toml` inside `build-src-<ver>/PlazCode` if Rust files changed.
- Verify live visually via the **`plazcode-live-verify`** skill before showing previews to the owner.
