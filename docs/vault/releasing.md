---
title: Releasing an update
updated: 2026-10-28
---
# Releasing

**Current development 1.24.28 (hotfix; 1.24.27 published 2026-10-31):** owner designated the merged DeepSeek guard as the next update. Local source is prepared; full validation and publication are still pending. No new release is published. No app signing. Validate `claude/plazcode-dev`, pin its exact successful SHA/run in `publish-1.24.28.yml`, then publish from `release/1.24.28-publish`. Run the packaged Mac lifetime gate. Both automated source pushes rewrite NOW; after success the workflow attempts the owner-authorized Private restore. A 403 means the owner must restore visibility in GitHub settings. Publishing credentials never enter files/logs.

Official releases live in the public repo `stoveez/PlazCode`, branch `main`: only zips and the feeds. They are prepared and published from the private repo, branch `release/1.24.28-publish`, by the workflow `publish-1.24.28.yml`. Nothing is rebuilt at publish time. Private `main` is the old line and is not used for releases.

## Steps (walk the owner through them in plain words every time)
1. Owner makes the repo public.
2. Full validation (`validate-1.24.28.yml`) green on the exact final commit, on Windows, Mac and Linux, including the Mac desktop test and Firefox checks.
3. Write the plain release notes in `development/1.24.28/release-entry.json` (under 2,000 characters). Put `VALIDATION_RUN` and `VALIDATED_SHA` in `publish-1.24.28.yml`. Dry run into `stoveez/plazcode-publish-test`; check the feeds, checksums and release page.
4. Ask the owner for a clear yes to publish THAT exact update. Then set `PUBLIC_REPO` back to `stoveez/PlazCode` and start the workflow (secret `PUBLIC_REPO_TOKEN`; never print it).
5. Verify the live `latest.json`, `latest-macos.json` and one download (version, link, sha256). An older installed copy must still update.
6. Remind the owner to set the repo back to Private.

Read `publish-1.24.28.yml` and `development/1.24.28/promote.py` before the first real publish. Moving work into `release/1.24.28-publish` needs the owner's clear yes. See also [owner-rules](owner-rules.md).

## Extra details
- Release text must stay under 2,000 characters (checked once: about 1,360).
- `PLAZCODE_QUICK` skips the Mac desktop test; only for small fixes the owner approves.
- For a new version number, copy the 1.24.22 workflows and `development/1.24.24` to the new number and update the names inside. One release branch per version. Then update every note that names the version: [new-version-checklist](new-version-checklist.md).
- Practice runs go to the throwaway repo `stoveez/plazcode-publish-test` first. Never push to the public repo by hand; only the publish workflow writes there.
- The private repo's own `main` is the old line (about 105 commits behind `claude/plazcode-dev` on 2026-10-24). Do not use it for a release.
- Release description wording and bold marks: always follow [release-format](release-format.md) (plain words, under 2,000 characters, no role mention).

## The main-ancestry gate (learned 2026-10-25, 1.24.22)
The publish workflow gates on `git merge-base --is-ancestor origin/main HEAD` and later pushes the release commit to `main`. That release commit lives OFF the `claude/plazcode-dev` line, so after one release `main` no longer sits on dev's history and the next publish from dev fails the gate ("Keep the private build record"). Two things fix it, both now done:
1. The workflow fetches the LIVE main first: `git fetch origin main:refs/remotes/origin/main` then `--is-ancestor refs/remotes/origin/main HEAD` (a stale cached `origin/main` made the check look fine locally while CI saw the real, newer main).
2. After each publish, merge `origin/main` back into `claude/plazcode-dev` with `git merge -s ours` (keeps dev's exact source, just records main as a parent) so the next release descends from main. Done for 1.24.22. Do this again after 1.24.23.
If a publish still fails this gate, on the publish branch run `git fetch origin main:refs/remotes/origin/main && git merge -s ours origin/main` (source stays identical) before re-running.

## 1.24.25 publication lessons (2026-10-26)
- A new publication branch's first push did not register its workflow; a follow-up change to the publication file on the existing branch did.
- Use one global single-quoted VALIDATED_SHA/VALIDATION_RUN pair. Double-quoted YAML is valid, but the existing pin-format guard rejects it. Run `python3 development/1.24.25/test-promote-permissions.py` before starting publication.
- Preserve the previous published changelog when dev's root metadata is older than main. Publication-only metadata can change after validation; program/packaging inputs must match the validated commit exactly.
- The owner requested direct release, no separate test build. Full validation and the packaged Mac desktop gate still ran.

## 1.24.26 publication record (2026-10-28)
Published in 40781780030 using exact-source validation 40772509288 / a74ae17, with packaged Mac desktop gate passed. Public commit d514655; signed feeds and downloaded Windows signed tree verified. Canonicalize generated Firefox metadata BEFORE signing; signatures cover bytes. Promotion permits only exact LF/CRLF checkout variants for the directly read protection loader source template, while verifying signed output bytes and pinned key/channel. Encrypted decoder maps and checksum index are retained in the private release record after real decryption checks outside the repo. Both credentials denied automatic source Private restoration (403); owner action is pending.
