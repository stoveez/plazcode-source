---
title: Releasing an update
updated: 2026-10-24
---
# Releasing

Official releases live in the public repo `stoveez/PlazCode`, branch `main`: only zips and the feeds. They are prepared and published from the private repo, branch `release/1.24.21`, by the workflow `publish-1.24.21.yml`. Nothing is rebuilt at publish time. Private `main` is the old line and is not used for releases.

## Steps (walk the owner through them in plain words every time)
1. Owner makes the repo public.
2. Full validation (`validate-1.24.21.yml`) green on the exact final commit, on Windows, Mac and Linux, including the Mac desktop test and Firefox checks.
3. Write the plain release notes in `development/1.24.21/release-entry.json` (under 2,000 characters). Put `VALIDATION_RUN` and `VALIDATED_SHA` in `publish-1.24.21.yml`. Dry run into `stoveez/plazcode-publish-test`; check the feeds, checksums and release page.
4. Ask the owner for a clear yes to publish THAT exact update. Then set `PUBLIC_REPO` back to `stoveez/PlazCode` and start the workflow (secret `PUBLIC_REPO_TOKEN`; never print it).
5. Verify the live `latest.json`, `latest-macos.json` and one download (version, link, sha256). An older installed copy must still update.
6. Remind the owner to set the repo back to Private.

Read `publish-1.24.21.yml` and `development/1.24.21/promote.py` before the first real publish. Moving work into `release/1.24.21` needs the owner's clear yes. See also [owner-rules](owner-rules.md).

## Extra details
- Release text must stay under 2,000 characters (checked once: about 1,360).
- `PLAZCODE_QUICK` skips the Mac desktop test; only for small fixes the owner approves.
- For a new version number, copy the 1.24.21 workflows and `development/1.24.21` to the new number and update the names inside. One release branch per version.
- Practice runs go to the throwaway repo `stoveez/plazcode-publish-test` first. Never push to the public repo by hand; only the publish workflow writes there.
- The private repo's own `main` is the old line (about 105 commits behind `claude/plazcode-dev` on 2026-10-24). Do not use it for a release.
