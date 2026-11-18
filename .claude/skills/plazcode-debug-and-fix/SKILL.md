---
name: plazcode-debug-and-fix
description: >-
  Debug and fix bugs in PlazCode safely across its TypeScript provider/core sources,
  overlay JavaScript, and Rust desktop app. Use whenever investigating a PlazCode bug,
  AI-site provider breakage, extension runtime issue, desktop app regression, or running
  PlazCode rebuilds, hash-pin updates, and regression tests.
---

# PlazCode Debug and Fix

Follow this workflow whenever diagnosing or fixing a bug in `stoveez/plazcode-source`.

## 1. Read First & Inspect Before Editing

1. Read `docs/NOW.md` and `AGENTS.md` (or `CLAUDE.md`) first, then only the relevant `docs/vault/` notes linked from `docs/vault/Home.md`.
2. **Plan mode first (`2026-10-31` owner rule)**: Before touching code, inspect the actual files, logs (`agent.log`), and callers. Trace the real root cause and check what else calls the same helper. Form a concrete fix plan, then edit.
3. Do the analysis and planning yourself — never delegate core bug diagnosis or big-feature planning to helper subagents.

## 2. Edit the Right Source File (Never `build-src-*`)

`build-src-<ver>/PlazCode/` is deleted and regenerated on every `prepare.py` run. Never edit files inside it.

1. **Check `development/<ver>/ts/` first**:
   - All 18 site providers (`ts/providers/*.ts`), `ts/core/parser.ts`, and `ts/core/stall-guard.ts` (plus any newly split core modules) live in TypeScript.
   - If a `.ts` file exists for what you are changing, edit **only the `.ts` file** — never its generated `.js` in `overlay/`.
   - Erase types into `overlay/` with `node development/<ver>/ts/build.cjs` (using `ts-blank-space` so line/column numbers match) and typecheck with `--types`. Commit both `.ts` and `.js`.
2. **Otherwise edit `development/<ver>/overlay/`**:
   - If the file lives only inside the pinned `PlazCode-source-1.24.20.zip` archive and is not in `overlay/` yet, copy it from `build-src-<ver>/PlazCode/<relpath>` into `development/<ver>/overlay/<relpath>` and edit the overlay copy.
3. **Split as you go (`2026-11-15` owner rule)**:
   - Do not rewrite `core/main.js` or `background.js` all at once.
   - When a bug fix touches a self-contained section of `core/main.js` or `background.js`, extract that section into `development/<ver>/ts/core/<module>.ts` with typed boundaries in `development/<ver>/ts/types/` in a **behavior-preserving move commit** (updating `manifest.json` content-script order + `typecheck/check.py` bundle order before any code that uses it), then apply the bug fix in its own commit.

## 3. Non-Negotiable Code Guardrails

### AI-Site Providers (`ts/providers/*.ts`) & Extension Scripts
- **Protect `#rs-root` from click/submit hooks**: Every click or submit listener MUST ignore PlazCode's own UI (`safeClosest(target, "#rs-root")`). Otherwise clicking "Fix connection" or bar buttons triggers a phantom send.
- **Single-click Send + receipt proof**: Never blindly click Send twice. Prove whether the site accepted the draft (matching new user turn / message row / chip) before retrying. Respect provisional URL swaps on new chats (ClickUp, DeepSeek, Kimi).
- **Use guarded DOM reads**: Wrap fragile page DOM reads with PlazCode's guarded helpers (`safeRead`, `safeQuery`, `safeQueryAll`, `safeClosest`, `safeRect`, `safeStyle`) so CI DOM-guard checks pass.
- **Keep helpers reachable**: `core/main.js` uses deeply nested functions; verify with `test-main-scope.js` so no helper is called from an unreachable scope (`try/catch` silently swallows `ReferenceError`).
- **Prefer extension-only fixes**: Whenever a bug can be solved in `core/`, `providers/`, `overlay.css`, `background.js`, or `popup.*`, keep it extension-only so reloading the unpacked extension + refreshing AI tabs applies it without replacing the app. State in one plain line whether an extension reload is enough or the app must be replaced too.
- Check site-specific pitfalls in [references/provider-gotchas.md](./references/provider-gotchas.md) before modifying any provider.

### Desktop App (`overlay/agent/src/*.rs` & `desktop.html`)
- **macOS 10.15 Catalina (`pz-old-safari`)**: Keep `desktop.html` compatible with older WebKit engines that lack `Element.prototype.replaceChildren`, CSS `inset`, `:is()`, `:focus-visible`, and `dvh`.
- **Windows antivirus cleanliness (`test-exe-av-signals.py`)**: Never add `-EncodedCommand`, `-ExecutionPolicy Bypass`, `rundll32 url.dll,FileProtocolHandler` (use `ShellExecuteW`), or low-level global keyboard/mouse hooks (`GetLastInputInfo` is used instead).
- **Windows/Mac compile note**: Windows-only and macOS-only Rust modules do not compile natively on Linux hosts; CI (`validate-<ver>.yml`) is where those targets compile and link.
- **Safety parity**: Any permission or safety logic changed in `core/safety.js` / `core/approval.js` must agree with `agent/src/safety.rs` / `agent/src/workspace.rs`.

## 4. Rebuild, Update Pins & Verify

Run the automated helper script after edits (PowerShell on Windows, Bash on Linux/macOS):

- Windows:
  `powershell -ExecutionPolicy Bypass -File .\.agents\skills\plazcode-debug-and-fix\scripts\pc-rebuild-and-check.ps1`
  (pass extra tests such as `-Tests test-gemini-typing.js,test-stall-guard.js`)
- Linux/macOS:
  `bash .agents/skills/plazcode-debug-and-fix/scripts/pc-rebuild-and-check.sh test-gemini-typing.js`

What the script automates:
1. Detects the active `development/<ver>` directory automatically.
2. Runs `ts/build.cjs` and `ts/build.cjs --types` (with `NODE_PATH` pointed at `build-src-<ver>/PlazCode/release-tools/node_modules`).
3. Runs `prepare.py` to assemble `build-src-<ver>/PlazCode/`.
4. Recomputes LF-normalized git blob SHA-1 hashes for protected files listed in `overlay/test-desktop-regression.js`, updates `baseline` when `-UpdatePins` / `--update-pins` is active, and re-runs `prepare.py` if pins changed.
5. Runs `test-typescript-sources.js`, `test-main-scope.js`, `test-desktop-regression.js`, `test-provider-preservation.js`, plus any test files you specify.
6. If you changed any provider's healthy control flow deliberately (not just guarded DOM reads), document why and add an explicit exception entry in `overlay/test-provider-preservation.js`.
7. Add a new `test-*.js` regression test (or Rust `#[test]`) for every bug fixed, and run the full JS/Rust suite before declaring the fix complete.
