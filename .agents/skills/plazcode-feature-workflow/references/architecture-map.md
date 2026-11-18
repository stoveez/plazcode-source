# PlazCode Architecture Map (`development/<ver>`)

All permanent edits happen in `development/<ver>/ts/` or `development/<ver>/overlay/`. `prepare.py` combines the pinned `PlazCode-source-1.24.20.zip` archive with `overlay/` into `build-src-<ver>/PlazCode/` and copies extension files into `PlazCode-Extension/`.

## 1. TypeScript Sources (`development/<ver>/ts/`)
Compiled to line-preserving JavaScript in `overlay/` via `node development/<ver>/ts/build.cjs`:
- `ts/providers/*.ts`: The AI-site adapters (`arena`, `chatgpt`, `claude`, `copilot`, `crax`, `deepseek`, `freebuff`, `gemini`, `glm`, `kimi`, `meta`, `mimo`, `notion`, `oxalpha`, `qwen`, `useai`, `vani`; ClickUp removed in 1.24.34). Adding or removing a site also changes the app's "N browser AIs" label (`test-supported-ai-count.js`). Must satisfy `ts/types/provider.d.ts`.
- `ts/core/parser.ts`: Command block & JSON/DSML parser.
- `ts/core/stall-guard.ts`: `PlazCodeStallGuard` loop/stall & frozen-tab deadline compensation.
- `ts/types/`: Shared contracts (`provider.d.ts`, `globals.d.ts`, `core-env.d.ts`, `provider-env.d.ts`).

## 2. Extension Overlay (`development/<ver>/overlay/`)
- **Core agent loop & prompts**: `core/main.js`, `core/config.js`, `core/lean-startup.js`, `core/tool-guard.js`, `core/parser.js`, `core/stall-guard.js`.
- **Safety, approvals & undo**: `core/safety.js`, `core/approval.js`, `core/action-log.js`, `core/input-isolation.js`, `core/reliability.js`.
- **Ask PlazCode, Live Control & Co-work**: `core/ask.html`, `core/ask.js`, `core/control-overlay.js`, `core/control-view.html`, `core/control-view.js`, `core/cowork.js`, `core/task-center.js`.
- **Memory & Vault**: `core/memory.js`, `core/vault-import.html`, `core/vault-import.js`, `core/vault-import-page.js`.
- **UI, Themes & Localization**: `overlay.css`, `popup.html`, `popup.js`, `core/effort-picker.js`, `core/feature-guide.js`, `core/i18n.js`, `core/i18n-catalog.js` (generated from `core/locales/*.json`), `core/text-pack.js`, `core/tool-cards.js`, `core/activity.js`, `core/checklist.js`.
- **Creative & Studio Tools**: `core/studio-page.js`, `core/studio_skills.js`, `core/explorer-ui.js`, `core/creator.js`, `core/creator-ui.js`, `core/headless-builder.js`, `core/motion-preview.js`, `core/motion-tools.js`, `core/animlib.js`, `core/blockbench-tools.js`, `core/toolkit-ui.js`, `core/skills-ui.js`, `core/agent_skills.js`, `core/luau-knowledge.js`, `core/ultracode.js` (generated).
- **Diagnostics & Setup**: `core/connection-doctor.js`, `core/site-setups.js`, `core/settings-backup.js`, `core/debug-capture.js`, `core/debug-capture-main.js`.

## 3. Rust Desktop App (`development/<ver>/overlay/agent/src/`)
- **Entry, HTTP/Bridge Server & Studio MCP**: `main.rs`, `runtime.rs`, `helper_socket.rs`, `events.rs`, `preferences.rs`, `profile_paths.rs`.
- **Desktop GUI & Motion**: `gui.rs`, `desktop.html` (includes `pz-old-safari` shim for Catalina), `linux_desktop.rs`, `linux_setup.rs`, `linux-start.html`, `control_look.rs`.
- **Execution, Safety & Desktop Automation**: `workspace.rs`, `safety.rs`, `checkpoints.rs`, `cancellation.rs`, `desktop_control.rs`, `mac_control.rs`, `app_steps.rs`, `app_steps.ps1`, `provider_pacing.rs`, `hidden.rs`.
- **Memory & Vault**: `vault.rs`, `memory.rs`, `engram.rs`, `chat_history.rs`, `learning.rs`, `shared_learning.rs`.
- **Creative App Connectors & Engine Tools**: `connections.rs`, `mcp_addons.rs`, `engine_tools.rs`, `blender.rs`, `blender_addon.rs`, `blender_headless.rs`, `blockbench.rs`, `figma.rs`, `unity.rs`, `vinegar.rs`, `toolkit.rs`.
- **Luau Validation & Skills/Templates**: `luau_check.rs`, `luau_service.rs`, `luau_tree.luau`, `skills.rs`, `starter_skills.rs`, `templates.rs`, `creation_export.rs`, `creations.rs`.
- **Accounts, Security & Auto-Updater**: `accounts.rs`, `account_sync.rs`, `profile_picture.rs`, `security.rs`, `integrity.rs`, `release_checks.rs`, `release_variant.rs`, `updater.rs`, `browser_setup.rs`, `debug_report.rs`, `tidy.rs`, `platform.rs`.

## 4. Packaging, Protection & CI (`development/<ver>/` & `.github/workflows/`)
- `prepare.py` -> assembles `build-src-<ver>/PlazCode/` and `PlazCode-Extension/`.
- `package.py` / `promote.py` / `source_proof.py` / `release-check.py` / `protection.mjs` -> seals, signs, verifies layout, and promotes releases.
- `test-protection.mjs` & `test-protection-browser.mjs` -> verify code protection, tamper checks, and encrypted maps.
- `test-exe-av-signals.py` -> checks Windows `PlazCode.exe` for AV false-positive patterns.
