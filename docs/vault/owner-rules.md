---
title: Owner rules (short form)
updated: 2026-10-24
---
# Owner rules

The full, binding list is `CLAUDE.md` / `AGENTS.md`. This is the short form; if they differ, those files win.

- Never break the auto-updater: feed addresses and formats stay as they are.
- Commits go under the owner's name (stoveez, name only: never write the owner's email in any file or commit, it can change). **No** Co-Authored-By, Claude-Session or "Generated with" lines, even if a tool suggests them.
- Never push, publish or deploy without the owner's clear yes for that action. Since 2026-10-24 the owner uses one AI at a time, so all work goes directly on `claude/plazcode-dev` (no task branches; push often, WIP commits allowed, rewrite `docs/NOW.md` with every push). Merging into `release/1.24.21` or `main`, force-pushes, deleting branches, publishing and anything on the public repo need a clear yes.
- Tell the owner after every push: branch, short commit ID, one line, finished or not.
- Never change repo visibility. Remind the owner to set the repo back to Private right after test zips are delivered and right after a publish. See [test-builds](test-builds.md).
- Plain, non-coder language in summaries and release notes.
- New features need full validation including the Mac desktop test.
- Extension fixes must work by reloading the extension; say in one line whether the app must be replaced too.
- No secrets in files or chat.
- Respect licences: no Multi-Script code; UltraLab only with SyphoDev's permission (credit youtube.com/@SyphoDev); Brickwire is MIT (keep licence, credit "Brickwire contributors").
- High effort (careful tracing) for: the login/license server, the Luau helper library and build self-checks, hard bug hunts, planning big features.
