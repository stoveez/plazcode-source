---
title: Owner rules (short form)
updated: 2026-10-24
---
# Owner rules

The full, binding list is `CLAUDE.md` / `AGENTS.md`. This is the short form; if they differ, those files win.

- Never break the auto-updater: feed addresses and formats stay as they are.
- Commits go under the owner's name (stoveez, name only: never write the owner's email in any file or commit, it can change). **No** Co-Authored-By, Claude-Session or "Generated with" lines, even if a tool suggests them.
- Never push, publish or deploy without the owner's clear yes for that action. Since 2026-10-24 the owner uses one AI at a time, so all work goes directly on `claude/plazcode-dev` (no task branches; push often, WIP commits allowed, rewrite `docs/NOW.md` with every push). Merging into `release/1.24.25` or `main`, force-pushes, deleting branches, publishing and anything on the public repo need a clear yes.
- Tell the owner after every push: branch, short commit ID, one line, finished or not.
- Never change repo visibility. Remind the owner to set the repo back to Private right after test zips are delivered and right after a publish. See [test-builds](test-builds.md).
- Plain, non-coder language in summaries and release notes.
- New features need full validation including the Mac desktop test.
- Extension fixes must work by reloading the extension; say in one line whether the app must be replaced too.
- No secrets in files or chat.
- Respect licences: no Multi-Script code; UltraLab only with SyphoDev's permission (credit youtube.com/@SyphoDev); Brickwire is MIT (keep licence, credit "Brickwire contributors").
- High effort (careful tracing) for: the login/license server, the Luau helper library and build self-checks, hard bug hunts, planning big features.
- Ask deep, root-level questions before building any new feature, especially a vague one (2026-10-24). Details: [how-we-work](how-we-work.md).
- Release descriptions follow [release-format](release-format.md): non-coder words, Discord bold marks, under 2,000 characters, no role mention (2026-10-25).
- Previews must show what it REALLY looks like (owner, 2026-10-25): the actual desktop app (running, with the owner's settings and theme) or the extension on the real AI site. Never a stand-alone render of a page file: it shows placeholders, the wrong colours, every side link and wrong spacing. If you cannot run the real thing, say so plainly and ask the owner for a screenshot from his app instead of making your own.

## Feature previews and test ZIP delivery (owner, 2026-10-30)
- As soon as each requested feature is ready, immediately show an actual screenshot or video of it running in PlazCode through Google Drive. Do not wait until every other feature, check or build is finished. No generated mockups or recreated preview pages.
- Upload the screenshot/video to the connected Google Drive, read back its metadata, and give the normal Drive file link so the owner can open/download it. This is the exact delivery method the owner approved. Workspace-only file links do not work in this client.
- Deliver test builds through Google Drive too: upload the exact verified INNER Windows/Mac/Linux ZIPs (app, memory helper and extensions; official layout), verify metadata/sizes, then give normal Drive file links and tell the owner to click Download. Do not substitute GitHub's artifact wrapper ZIP or silently change sharing permissions.
- Keep the source public-build/private-after-delivery rule. Keep the separately approved account API Public. No stable publishing is implied by a test-build request.
