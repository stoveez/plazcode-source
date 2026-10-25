# NOW (live handoff, overwrite at the end of every session)
Updated: 2026-10-24 by claude. Keep under about 25 lines. Long-term knowledge is in [`vault/Home.md`](vault/Home.md).

**Latest change (newest first):**
1. Chat notes (done, fixture-tested only): every chat is saved by PlazCode into the vault at `11 Chats/` (Summary, Key points, a section titled "Current tasks:"), updated when tasks start/change/finish, every 10 s if tasks changed, and when the tab is hidden. The continue popup now shows only after "PlazCode is ready." and Yes makes the AI read the newest chat note (fallback: old excerpt). Owner choices: PlazCode writes the summary, `Now.md` stays, notes kept forever. Details: [vault/vault-memory.md](vault/vault-memory.md), [vault/native-vault-internals.md](vault/native-vault-internals.md). Needs the new desktop app (writes into the vault) plus an extension reload.
2. Saved memory (Memory page notes) has no 500,000-character limit any more (`memory.rs` plus the Memory page, imports, backups). Needs the desktop app replaced.
3. Hang recovery, Effort chevron, Claude send fixes, vault live note `Now.md`, picture storage and the desktop fixes are in the test zips of CI run 40152156785 (commit `d169eb1`); not yet tried on real sites. Hang cases 2 and 3 are not wired.
4. Handoff system: this file, `docs/vault/`, trimmed `CLAUDE.md` and `AGENTS.md`, the owner's personal vault repo `stoveez/stoveez`. The owner keeps plain copies of both vaults on their PC and wants them kept in step ([vault/how-we-work.md](vault/how-we-work.md)).

**State:**
- Work directly on `claude/plazcode-dev`; no task branches. Rewrite this file with every push.
- NOT in any test build yet: items 1 and 2. A new test build needs the public window ([vault/test-builds.md](vault/test-builds.md)); the repo is Private now.
- Queued by the owner, each needs its own high-effort plan first: (a) several vaults with a switcher like Obsidian's, (b) importing a whole folder of notes into the vault when asked.
- Unfinished: real Windows/Mac app tests, Firefox checks (CI only), lean startup phases 2 to 3 (owner has not said yes).
- Next step: ask the owner whether to start a new test build for items 1 and 2, or plan (a) and (b).
- Open bugs: [vault/open-work.md](vault/open-work.md).
