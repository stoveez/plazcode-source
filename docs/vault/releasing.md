---
title: Releasing an update
updated: 2026-10-24
---
# Releasing

Official releases live in the public repo `stoveez/PlazCode`, branch `main`: only zips and the feeds. They are prepared and published from the private repo, branch `release/1.24.23`, by the workflow `publish-1.24.23.yml`. Nothing is rebuilt at publish time. Private `main` is the old line and is not used for releases.

## Steps (walk the owner through them in plain words every time)
1. Owner makes the repo public.
2. Full validation (`validate-1.24.23.yml`) green on the exact final commit, on Windows, Mac and Linux, including the Mac desktop test and Firefox checks.
3. Write the plain release notes in `development/1.24.23/release-entry.json` (under 2,000 characters). Put `VALIDATION_RUN` and `VALIDATED_SHA` in `publish-1.24.23.yml`. Dry run into `stoveez/plazcode-publish-test`; check the feeds, checksums and release page.
4. Ask the owner for a clear yes to publish THAT exact update. Then set `PUBLIC_REPO` back to `stoveez/PlazCode` and start the workflow (secret `PUBLIC_REPO_TOKEN`; never print it).
5. Verify the live `latest.json`, `latest-macos.json` and one download (version, link, sha256). An older installed copy must still update.
6. Remind the owner to set the repo back to Private.

Read `publish-1.24.23.yml` and `development/1.24.23/promote.py` before the first real publish. Moving work into `release/1.24.23` needs the owner's clear yes. See also [owner-rules](owner-rules.md).

## Extra details
- Release text must stay under 2,000 characters (checked once: about 1,360).
- `PLAZCODE_QUICK` skips the Mac desktop test; only for small fixes the owner approves.
- For a new version number, copy the 1.24.22 workflows and `development/1.24.23` to the new number and update the names inside. One release branch per version. Then update every note that names the version: [new-version-checklist](new-version-checklist.md).
- Practice runs go to the throwaway repo `stoveez/plazcode-publish-test` first. Never push to the public repo by hand; only the publish workflow writes there.
- The private repo's own `main` is the old line (about 105 commits behind `claude/plazcode-dev` on 2026-10-24). Do not use it for a release.
- Release description wording and bold marks: always follow [release-format](release-format.md) (plain words, under 2,000 characters, no role mention).

## The main-ancestry gate (learned 2026-10-25, 1.24.22)
The publish workflow gates on `git merge-base --is-ancestor origin/main HEAD` and later pushes the release commit to `main`. That release commit lives OFF the `claude/plazcode-dev` line, so after one release `main` no longer sits on dev's history and the next publish from dev fails the gate ("Keep the private build record"). Two things fix it, both now done:
1. The workflow fetches the LIVE main first: `git fetch origin main:refs/remotes/origin/main` then `--is-ancestor refs/remotes/origin/main HEAD` (a stale cached `origin/main` made the check look fine locally while CI saw the real, newer main).
2. After each publish, merge `origin/main` back into `claude/plazcode-dev` with `git merge -s ours` (keeps dev's exact source, just records main as a parent) so the next release descends from main. Done for 1.24.22. Do this again after 1.24.23.
If a publish still fails this gate, on the publish branch run `git fetch origin main:refs/remotes/origin/main && git merge -s ours origin/main` (source stays identical) before re-running.
