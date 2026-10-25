# NOW (live handoff, overwrite at the end of every session)
Updated: 2026-10-24 by claude. Keep under about 25 lines. Long-term knowledge is in [`vault/Home.md`](vault/Home.md).

**In progress (unfinished, not merged):** branch `claude/hang-recovery-finish` (commit `4f37dca` and later). Owner reported two bugs: (a) Claude randomly stops mid-task (15-tool test) while the bar still says working, (b) the arrow next to Effort on the PlazCode bar is tiny and off-centre. Findings: both were already fixed today by other sessions in UNMERGED branches, so they are not in the test zips. (a) hang recovery (press Stop and ask the AI to continue after 90 s of no text while Stop shows) is on `claude/hang-recovery` (owner told me to take it over, so I continue it on `claude/hang-recovery-finish`); Claude send fixes (wait for the reply to end, keep retyping the result into the composer) are on `claude/new-chat-state-effort-arrow`. (b) the clean Effort chevron is commit `ec2852d` on that same branch. Plan: combine both on my own branch, run the full suite, then ask the owner's yes to merge into `claude/plazcode-dev`. Not wired yet from hang recovery: cases 2 (reply cut inside a command) and 3 (message not delivered; mostly covered by existing send retries).

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
