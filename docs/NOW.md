# NOW (live handoff, overwrite at the end of every session)
Updated: 2026-10-25 by claude. Keep under about 25 lines. Long-term knowledge is in [`vault/Home.md`](vault/Home.md).

**Notes checklist (do before every push):** (1) rewrite this file; (2) fix every note that mentions what you changed (open-work, milestones, test-builds, decisions, plan files, HANDOFF); (3) copy changed vault notes to the PC folder (or say it is behind); (4) tell the owner branch, short commit ID, one line. Why and how: [vault/how-we-work.md](vault/how-we-work.md).

**Latest change (newest first, all 2026-10-25, extension reload is enough unless noted, official JS suite 0 failures):**
K. Claude kept showing the old plain chip: Claude re-draws older turns and the card was lost. Cards are now kept per call (`cardBook` in `core/main.js`) and come back with their OUTPUT; plain "· result" rows are hidden on Claude (errors stay). Verified live after a refresh: every command shows the new card.
J. Random pauses mid-run on Claude: clearing an empty reply box removed Claude's hidden line break, so typing was refused and nothing was sent. `providers/claude.js` now types over the selection and reports an error instead of a silent pause. Verified live: two 15-call runs finished 15/15. Test `test-claude-empty-box-typing.js`.
I. Claude leftovers: empty "json" frame (icon-font copy button) and empty grey bubble are hidden. Test `test-claude-empty-turn.js`.
H. Bar said "AgentScript is offline" while the app ran: a restored per-chat AS mode now also tells the background page.
G. Palette themes keep a visible gradient and accent glow on cards. F. Desktop Updates page spacing (needs the new app).
D. In-chat feature guide (`plazcode_features`, 55 entries, `test-feature-guide.js`). C. Always approve. B. Navy and gold look.
Earlier (A, 0 to 4): approval/plan cards, per-chat mode, chat notes, memory limit removed (needs the app), hang recovery, handoff system.

**State:**
- Work directly on `claude/plazcode-dev`; no task branches; no helper agents (owner, 2026-10-25). Rewrite this file with every push.
- Latest test zips: CI run 40205091633 (`92ea606`, has A to D and 0 to 4). F to K are NOT in any zip; H to K (and G) were copied by hand into the owner's loaded test extension in `Downloads\PlazCode-1.24.21-test-build-run40205091633\...\PlazCode-Extension`.
- Repo is Private. A new test build needs the public window ([vault/test-builds.md](vault/test-builds.md)).
- Unfinished: real Mac app test, Firefox checks (CI only), desktop-app feature guide, lean startup phases 2 to 3 (owner has not said yes).
- Next step: a new test build when the owner asks (includes F to K).
- Open bugs: [vault/open-work.md](vault/open-work.md).
