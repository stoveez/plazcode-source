# PlazCode task board

Read `docs/MAINTAINER-GUIDE.md` section 11 first. Claim a task by adding a line under "In progress" in your own small commit. Move it to "Done" with a handoff note when finished. Do not take a task someone else has claimed.

Format:
`- [task name] | AI: claude, codex or any other AI | branch: <ai>/<task> | files: <the files you will touch> | started: <date> | CI run: <link or none>`

## In progress
- Hang recovery (item 9): one pure decision function for stuck runs, wired into the agent loop | AI: claude | branch: claude/hang-recovery | files: core/stall-guard.js, core/main.js (small wiring only), providers/*.js (pressStop hook only if missing), core/action-log.js, core/locales, new test files | started: 2026-10-24 | CI run: none yet
- Vault graph view + vault as the AI's brain on startup + Vani startup + remove the "Working for" fold | AI: claude | branch: claude/plazcode-dev | files: core/memory.js, core/main.js, core/lean-startup.js, providers/vani.js, agent/src/vault.rs | started: 2026-10-23 | CI run: none yet
  - Latest state: Vani startup merged; "Working for" chat fold and bar button removed for every AI; vault graph view built (new `graph` action in vault.rs, canvas viewer in core/memory.js); startup now carries a brain map of every note and its links; new vault actions map/audit/verify (notes can record source, confidence, verified date); community-skill sync treats any 4xx as nothing to sync and logs quietly. Tests: cargo 182 pass; test-vault-graph, test-vault-brain, test-no-working-for-fold, test-activity-folding, test-vani-startup, test-desktop-regression pass. Helpers running on their own branches: claude/chatgpt-claude-stall (ChatGPT pauses, Claude stuck, stuck tool chip), claude/agentscript-full-access (cmd/PowerShell/open in Full access), claude/notion-new-workspace (Notion new-workspace startup, commands shown 'not run'). MERGED into this branch: claude/chatgpt-claude-stall (stall recovery, unsent-command nudge, stuck chips, Claude turn key) and claude/notion-new-workspace (split Notion replies, handshake failure explains itself). All fixture-tested only; extension reload is enough for both. MERGED too: claude/agentscript-full-access (Windows cmd quoting, PowerShell and cwd in run_command, program opening, Full access staying on, clear refusal reasons). THIS ONE NEEDS THE DESKTOP APP REPLACED (Rust), and its Windows-only code was never compiled or run. Unfinished: full test suite on the merged tree, working CI run (the helper's CI run failed in 3 seconds with no steps; check the GitHub Actions page), Windows + Mac desktop tests, lean startup phases 2-3.
- AgentScript Full access: commands in cmd/PowerShell and opening files/programs do not work on Windows | AI: claude | branch: claude/agentscript-full-access | files: agent/src/workspace.rs, agent/src/safety.rs, agent/src/main.rs (permission handlers only), core/safety.js, core/tool-guard.js (only if needed), core/main.js (tiny comments-marked edits), background.js (Full access sync) | started: 2026-10-23 | CI run: none yet

## Ready to start
The full detailed spec of every Brickwire item (goal, what Brickwire did, what to build, how to improve it, files, tests, what cannot be tested offline) is `development/1.25.0/BRICKWIRE-ITEMS-SPEC.md`. Read it before claiming one.
Full details for every item are in `development/1.25.0/NEXT-UPDATE-PLAN.md` (section C = the owner's final Brickwire list, A = license/login, B = Skill Workshop). Read the item there before claiming it. The owner wants each item ADDED and IMPROVED, not copied. Brickwire is MIT: write our own versions, keep the licence text and credit "Brickwire contributors" in `THIRD-PARTY-NOTICES.txt` for anything derived. All of this is for the NEXT update, not 1.24.21. Suggested order: 9 and 10, then 1+2+3, then 7, 12, 14, then 11 and 13; 17 and the Workshop in parallel on the server track.

| # | Task | Main files | Effort |
|---|---|---|---|
| 9 | Hang recovery (Stop + "continue", resend cut-off block, retry undelivered, wrong Studio mode, Studio not answering) | `core/stall-guard.js`, `core/main.js` | normal |
| 10 | Keep-awake and tab/reload recovery | `background.js`, `core/main.js`, app power code | normal |
| 1 | Luau helper library (own code, error lines point to the AI's lines, agrees with Ultra names) | new files, Ultra generator | HIGH |
| 2 | Building helpers (rooms, roofs, stairs, fences, trees, furnish, style palettes, numeric plan check) | new files | normal |
| 3 | Automatic build self-checks (floating, sunk, overlapping, unanchored, UI/effects) reported in What happened | new files, `core/action-log.js` | HIGH |
| 7 | Effects module (4 layers max, part cap, animation-marker triggers, budget check) | new files | normal |
| 12 | History and rollback app, report/replay export, library of selections/prompts/recipes | `core/action-log.js`, `agent/src/checkpoints.rs` | normal |
| 14 | Notion Dev log, generalised to a project-log switch | `providers/notion.js`, app file log | normal |
| 11 | Studio plugin chat (image attach, send selection; follows safety settings) | new plugin, `agent/src` | normal |
| 13 | Blender and Figma previews in chat (respect Read-only) | `agent/src/connectors`, UI | normal |
| 17 / A | License key and login server (Cloudflare Workers + D1) | own folder, no extension files | HIGH |
| B | Skill Workshop (owner-approved moderation, seed content) | own folder | HIGH |

Other ready tasks:
- Release notes lines for 1.24.21 tester fixes (`release-entry.json`) - single owner of this file at a time.
- Website: deploy `PlazCode-website.zip` to Cloudflare Pages once the owner has a domain.
- "Response changed - run paused" fix once a tester sends a debug report (HIGH).
- Mac app opens then closes: needs the tester's app version or crash report.

## Done (handoff notes)
- (none yet)
