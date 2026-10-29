# NOW
Updated: 2026-10-29. Branch `claude/plazcode-dev`; no helper agents.

**Latest: WIP Linux visible startup and Mac stale-port recovery implemented; integration verification next.** Linux uses the real desktop frontend in the installed browser, authenticated with a short-lived one-use launch ticket; the permanent bridge key never enters a URL. Native Linux packaging/signing added. Mac now detects/reclaims same-user stale PlazCode port owners instead of its previous no-op. New real-process/browser integration tests added; local/hosted checks remain.

**Approval menus, persistence and composer placement verified in real frontends.** Ask prompts for every editing command; Approve for me prompts for detected deletions; Bypass skips command/plan prompts. Read-only and allowed-folder limits remain. The native preferences tests (11) and real compiled desktop backend verified all three modes persist to disk and survive reload. Actual app Settings and extension-bar screenshots captured. Bar browser tests cover resize, moving/remounted composers, persistent selection, external sync and failed saves. Desktop effort/browser regressions passed. All 15 language catalogs include new approval text. Full final CI remains.

**New owner report: Linux opens nothing.** Confirmed native Linux `run_gui` unconditionally errors and continues headless. Windows EXE is not a Linux executable. Next implement a visible Linux frontend and native Linux test package, keeping authentication/integrity protection. This is additional scope for the requested test build.

**Active build:** 1.24.27 includes owner archive DeepSeek pacing, clipped effort fix, three approval modes and bar alignment. Source PUBLIC for the already authorized build window. Deliver verified Windows/Mac inner lean ZIPs and native Linux package after full CI, then restore Private immediately. Integration visibility changes denied 403 previously. No stable publication or feeds changed. No PC vault connection.

**Next:** run Linux native/browser tests and hosted Mac recovery test; final full platform/browser CI; validate package layout/signatures and deliver downloads/screenshots. Latest stable remains 1.24.26.
