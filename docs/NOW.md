# NOW
Updated: 2026-10-26. Branch: `claude/plazcode-dev`.

**Latest change: removed the superseded .js screenshot fixture so native jobs use unit tests only; the browser job runs its .cjs replacement on both engines.

**Previous change: screenshot browser fixtures run only in the browser job (Chromium and Firefox), not in native jobs without browser binaries.

**Previous change: validation workflow now runs on pushes to claude/plazcode-dev so new version workflows register without touching main.

**Previous change: 1.24.25 reliability fixes implemented; validation pending.** Canvas screenshot display avoids site image-URL blocks; corrupt captures report an error. Plan Mode honors per-command task approvals. Creator response handling distinguishes missing endpoint, size limits and invalid replies. Desktop reports active browser extension versions and EXE-only/old-folder mismatches; known outdated versions stay red after failed/stale checks.

**Checks:** approval, creator response and version unit tests pass; actual Chromium screenshot pixels passed with img-src none, including corrupt-image error and cleanup. Rust is unavailable locally; required platform/browser checks run in CI. Full regression run is next. No affected user account or real Studio capture tested.

**Publishing authorized by owner:** source repo is public; publish 1.24.25 after required checks pass, with release notes in the owner's format. Do not change visibility. Remind the owner to restore Private after publication.

**Latest published remains 1.24.24** (validation 40340881855; publish 40344067698). 1.24.25 is not published yet.

**Deferred work:** all prior feature plans remain in 1.24.26 (accounts, code protection, Skill Workshop, Brickwire and carried-over work).

**Next:** finish local regressions, run validate-1.24.25.yml on the exact final commit; publish through publish-1.24.25.yml only after full validation and Mac desktop check.

**Rules:** no task branches or helpers; update NOW/open-work/vault with each push. PC vault sync unavailable (no PC connection). More: [Home](vault/Home.md), [open work](vault/open-work.md).
