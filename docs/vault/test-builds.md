---
title: Test builds and the public-then-private plan
updated: 2026-10-24
---
# Test builds

Builds on the private repo are blocked by GitHub billing, so the repo is made **public only while a build or publish runs**, then private again. The owner flips visibility; AIs never do.

## Every time you are ready for a test build
1. Send the owner https://github.com/stoveez/plazcode-source/settings and walk them through the plan again in plain words (resend every time).
2. After they make it public, start the build on `claude/plazcode-dev`.
3. Send them the two lean zips as soon as the run ends, in the same message remind them to set the repo back to Private (Danger Zone, Change visibility, Private).
4. Repeat the reminder in later replies until it is private. Before stopping run `gh api repos/stoveez/plazcode-source --jq '{private,visibility}'`.

## The zips
**Fetching them (2026-10-25):** in the cloud session `gh run download` is refused (the artifact storage host `productionresultssa*.blob.core.windows.net` is blocked by the egress policy, 403). Do not work around it. Either the owner downloads the two artifacts from the run page while signed in to GitHub, or fetch them with the PC shell (`device_bash`) when the session is linked, then place them in the owner's test folder.

From the run's Artifacts: `plazcode-<version>-Windows-test-lean` and `plazcode-<version>-macOS-test-lean`. Send the **inner** zip (`PlazCode-1.24.24-test-lean.zip`, `PlazCode-macOS-1.24.24-test-lean.zip`), not GitHub's wrapper. It must be 1:1 with the real update zip (same files and layout; only `DEVELOPMENT.txt` is left out). It stays named "test". Say plainly which fixes are inside and whether an extension reload is enough.

If the Mac job is cancelled with "job was not acquired by Runner", re-run only that job every 20 minutes (`gh run rerun <id> --failed`).

Option: an AI on the owner's own Windows PC can build the Windows zip locally for free (`docs/HANDOFF.md`, "Option: build the test zip on the owner's own computer").
