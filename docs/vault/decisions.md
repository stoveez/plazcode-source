---
title: Decision log
updated: 2026-10-24
---
# Decisions (newest first)

- **2026-10-24: one branch, `claude/plazcode-dev`.** The owner uses one AI at a time and found many task branches confusing. All work, including `WIP:` commits, goes directly on it; `NOW.md` is rewritten with every push. Still needing a clear yes: `release/1.24.21` or `main`, force-pushes, deleting branches, publishing, the public repo. If two AIs ever run at once, use `<ai>/<task>` branches for that time.
- **2026-10-24: the app's vault gets a live note (`00 Start Here/Now.md`).** Same idea as `docs/NOW.md` for the builders: the AI reads where the work stands at startup and rewrites it after every job. Capped at 1,500 characters so small sites stay small; an existing note is never overwritten. Pictures attached with the media button can be stored with `add_image`; pictures pasted straight into an AI site's own box are not seen. See [vault-memory](vault-memory.md).
- **2026-10-24: handoff = short `NOW.md` + linked vault.** The old `HANDOFF.md` grew long; new AIs paid tokens to read all of it. See [how-we-work](how-we-work.md). Old docs are kept, not deleted.
- **2026-10-24: title bar shows no Effort or version text.** Owner tried it back and removed it; the sidebar still shows both.
- **2026-10-24: sidebar scrolls as one column on short windows** (max height 780px).
- **2026-10-23: public-then-private plan.** GitHub billing blocks builds on the private repo, so it is public only during a build or publish. See [test-builds](test-builds.md).
- **2026-10-23: test zip must be 1:1 with the update zip,** still named "test"; send the inner zip.
- **2026-10-23 (replaced on 2026-10-24 by the one-branch decision above): AIs may push to their own `<ai>/<task>` and `wip/<task>` branches** without asking; everything else needs a yes. See [owner-rules](owner-rules.md).
- **Extension fixes must work by reloading the extension;** app changes are called out separately.
- **Brickwire ideas are added and improved, not copied** (MIT, keep credit). No Multi-Script code.

## 2026-10-24: chat notes are written by PlazCode, kept forever, Now.md stays
The owner chose that PlazCode writes the chat summary itself (free, always works, plainer wording) rather than the AI; the global `00 Start Here/Now.md` stays as is; chat notes are never auto-archived. The notes live in `11 Chats` and are hidden from the AI's startup map so they do not crowd out real notes.

## 2026-10-24: approval cards, output cards, several vaults (owner answered)
- After the owner approves a plan, the AI runs freely for that task; deletes still ask.
- An unanswered approval card waits forever. No sound, no automatic deny.
- The approval card is docked above the PlazCode bar (sites redraw chat messages often).
- One active vault for everything (not one per chat). Imported notes go to `10 Inbox/Imported <folder>/`; files with the same name or that look like secrets are skipped and listed in a report.
- Build order and plan: [open-work](open-work.md).

## 2026-10-24: the AI can explain PlazCode's own features (owner answered)
- Wanted: if a user asks the connected AI "what does this feature do" or "how do I use it", it can explain.
- Short index of features in the startup text, plus an on-demand help command the AI calls to read the exact guide (keeps startup light).
- Scope: everything in PlazCode's menus and settings (permission modes, Plan mode, Memory and vault, chat notes, Stop modes, effort, skills, connectors, safety limits). Not the long tool-command list, not the user's current settings, not desktop/website extras (can be added later).
- Answers: short plain steps with where to click, one example, an offer to do it when the AI can.
- One feature guide in the code that the app, the website guides and the AI all read; a test fails if a feature has no entry, so new features cannot ship unexplained.
- 2026-10-25: "Always approve" button on approval cards (not on plans). Remembers the action type everywhere, also for deletes and code running (owner's choice, after being warned). Removed one by one from the Safety list in the PlazCode menu. Stored as `rsAlwaysApprove`.
- 2026-10-25: Feature guide built as decided: one JSON list in `core/feature-guide.js`; AI command is `plazcode_features` (not `plazcode_help`, which lean startup reserves); startup index is ids only, steps are fetched on demand. When you add a menu item, switch or bar button you must add an entry (the test enforces it).
- 2026-10-25: No helper agents or subagents. The AI in the session does all work itself, including the high-effort kinds; the owner sets the effort. The old "hand it to a helper at high effort" rule is removed from CLAUDE.md and AGENTS.md.
