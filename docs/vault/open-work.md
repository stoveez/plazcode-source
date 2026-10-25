---
title: Open work and known bugs
updated: 2026-10-24
---
# Open work

## Needs a test or build
- A new test build to carry the 2026-10-24 desktop changes. See [test-builds](test-builds.md).
- Firefox checks run only in CI. Not live-tested: Ultra on real Studio and AI sites, Vani Co-work, Firefox appearance, Windows/Mac desktop apps.

- Merge `claude/vault-live-note` into `claude/plazcode-dev` (needs the owner's yes), then include it in the next test build. Pictures pasted directly into an AI site's composer are not captured yet.

## Bugs
- "Response changed - run paused" banner: needs a debug report from a tester (high effort).
- Notion startup in new workspaces; commands sometimes shown "not run".
- ChatGPT AgentScript sometimes pauses; Claude sometimes stuck; tool chip sometimes still "in progress". All fixture-tested only.

## Not started / optional
- Lean startup phases 2 and 3 (`development/1.24.21/overlay/core/lean-startup.js`, unwired, off).
- Next update (1.25.0): login/license server, Skill Workshop, Brickwire list, hang recovery, keep-awake. See `development/1.25.0/` and `docs/TASK-BOARD.md`.
- Website: `PlazCode-website.zip`, to deploy on Cloudflare Pages once the owner has a domain.
- Lawyer review of licence notices; GitHub Support request about the locked `v1.24.20` tag; delete the `cleanup-public` branch.

Release: see [releasing](releasing.md).
