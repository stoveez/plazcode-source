---
title: Open work and known bugs
updated: 2026-10-24
---
# Open work

## Needs a test or build
- A new test build to carry the 2026-10-24 desktop changes. See [test-builds](test-builds.md).
- Firefox checks run only in CI. Not live-tested: Ultra on real Studio and AI sites, Vani Co-work, Firefox appearance, Windows/Mac desktop apps.

- Include the merged vault live note (`claude/vault-live-note`) in the next test build. Pictures pasted directly into an AI site's composer are not captured yet.

- Merged into `claude/plazcode-dev` but NOT proven on real sites or in any test build: hang recovery (Claude stops mid-task), Claude send fixes, Effort chevron, ChatGPT old-chat fix, one-step checklist. Test with the 15-tool-call job on Claude. Hang recovery cases 2 (reply cut inside a command) and 3 (message not delivered) are not wired yet.

## Bugs
- "Response changed - run paused" banner: needs a debug report from a tester (high effort).
- Notion startup in new workspaces; commands sometimes shown "not run".
- Claude randomly stops mid-task while the bar says working (owner report 2026-10-24): fixed in the unmerged branches above, untested on the real site.
- ChatGPT AgentScript sometimes pauses; Claude sometimes stuck; tool chip sometimes still "in progress". All fixture-tested only.

## Not started / optional
- Lean startup phases 2 and 3 (`development/1.24.21/overlay/core/lean-startup.js`, unwired, off).
- Next update (1.25.0): login/license server, Skill Workshop, Brickwire list, hang recovery, keep-awake. See `development/1.25.0/` and `docs/TASK-BOARD.md`.
- Website: `PlazCode-website.zip`, to deploy on Cloudflare Pages once the owner has a domain.
- Lawyer review of licence notices; GitHub Support request about the locked `v1.24.20` tag; delete the `cleanup-public` branch.

Release: see [releasing](releasing.md).
