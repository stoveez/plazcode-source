# NOW (live handoff, overwrite at the end of every session)
Updated: 2026-10-24 by claude. Keep under about 25 lines. Long-term knowledge is in [`vault/Home.md`](vault/Home.md).

**Latest change (newest first):**
0. Saved memory (the Memory page notes) no longer has the 500,000-character limit: no per-note or total cap in the app, the Memory page, imports or backups. Needs the desktop app replaced (memory.rs) plus an extension reload. Unfinished and next in line: chat-to-vault notes feature (popup only after "PlazCode is ready.", every chat auto-saved as a note with a "Current tasks:" section, Yes reads the latest chat note). Plan: PlazCode writes the summaries itself (not the AI); `Now.md` stays; chat notes are kept forever; steps 1 to 6 not started in code yet.
1. Hang and Effort-arrow fixes are now merged into `claude/plazcode-dev`. (a) Claude no longer sits "working" forever: after 90 s with the Stop button showing and no new reply text, PlazCode presses Stop once and asks Claude to continue (also asks the owner if a question is stuck, pings Studio after a 2-minute silent command, retries the connection with waits). Claude sending also waits for the old reply to end and keeps retyping. (b) The Effort arrow is now a clean centred chevron. Needs the extension reloaded only (the new native-vault bits need the desktop app replaced). NOT proven on the real Claude site yet: needs a test build.
   Not wired yet from hang recovery: case 2 (reply cut inside a command) and case 3 (message not delivered; mostly covered by existing send retries).
2. Native vault docs: [vault/vault-memory.md](vault/vault-memory.md) (how the owner uses the app's Memory feature) and [vault/native-vault-internals.md](vault/native-vault-internals.md) (for AIs). "PlazCode vault" = `docs/vault`; "native vault" = the app's feature.
3. Vault live note: the app's vault now has `00 Start Here/Now.md`, sent to the AI at startup and rewritten by it after every job. Pictures attached with PlazCode's media button can be stored with `add_image`. Details: [vault/vault-memory.md](vault/vault-memory.md). Merged into `claude/plazcode-dev` (owner yes, 2026-10-24). Full JS suite 0 failures, cargo 205 passed. Needs the desktop app replaced and the extension reloaded.
4. Handoff system: this file, `docs/vault/`, trimmed `CLAUDE.md` and `AGENTS.md`, and the owner's personal vault repo `stoveez/stoveez` (private; pointer line in both rules files).
5. Desktop app fixes: dropdown lists no longer hide behind cards, Ultra border and glow-off on the active page button, sidebar scrolls on short windows, no Effort/version text in the title bar, five desktop tests updated.

**State:**
- Start from `claude/plazcode-dev` (see `git log`). Work directly on it; no task branches (owner decision 2026-10-24). Rewrite this file with every push.
- Latest test zips: CI run 40152156785 (all jobs green), commit `d169eb1`. They hold items 1 to 3 and 5 (hang recovery, Effort arrow, vault live note, desktop app changes). Not yet tried on real sites or the real apps; the owner downloads the zips from the run's Artifacts (the cloud session cannot download them).
- Repo is Private now. A new test build needs the public window ([vault/test-builds.md](vault/test-builds.md)).
- Unfinished: Firefox checks (CI only), real Windows/Mac app tests, lean startup phases 2 to 3 (offered, owner has not said yes).
- Next step: ask the owner if they want a new test build (try hang recovery with the 15-tool test, Effort arrow, vault live note); if yes, follow the public-then-private plan.
- Open bugs: [vault/open-work.md](vault/open-work.md).
