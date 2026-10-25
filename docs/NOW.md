# NOW (live handoff, overwrite at the end of every session)
Updated: 2026-10-24 by claude. Keep under about 25 lines. Long-term knowledge is in [`vault/Home.md`](vault/Home.md).

**Latest change (newest first):**
1. Vault live note: the app's vault now has `00 Start Here/Now.md`, sent to the AI at startup and rewritten by it after every job. Pictures attached with PlazCode's media button can be stored with `add_image`. Details: [vault/vault-memory.md](vault/vault-memory.md). Merged into `claude/plazcode-dev` (owner yes, 2026-10-24). Full JS suite 0 failures, cargo 205 passed. Needs the desktop app replaced and the extension reloaded.
2. Handoff system: this file, `docs/vault/`, trimmed `CLAUDE.md` and `AGENTS.md`, and the owner's personal vault repo `stoveez/stoveez` (private; pointer line in both rules files).
3. Desktop app fixes: dropdown lists no longer hide behind cards, Ultra border and glow-off on the active page button, sidebar scrolls on short windows, no Effort/version text in the title bar, five desktop tests updated.

**State:**
- Start from `claude/plazcode-dev` (see `git log`). Work directly on it; no task branches (owner decision 2026-10-24). Rewrite this file with every push.
- NOT in any test build yet: items 1 and 3 (desktop app changes). Latest test zips: CI run 40056181833, commit `9607466`.
- Repo is Private now. A new test build needs the public window ([vault/test-builds.md](vault/test-builds.md)).
- Unfinished: Firefox checks (CI only), real Windows/Mac app tests, lean startup phases 2 to 3 (offered, owner has not said yes).
- Next step: ask the owner if they want a new test build; if yes, follow the public-then-private plan.
- Open bugs: [vault/open-work.md](vault/open-work.md).
