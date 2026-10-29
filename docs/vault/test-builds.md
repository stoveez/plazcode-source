---
title: Test builds and the public-then-private plan
updated: 2026-10-29
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

From the run's Artifacts: `plazcode-<version>-Windows-test-lean` and `plazcode-<version>-macOS-test-lean`. Send the **inner** zip (`PlazCode-1.24.25-test-lean.zip`, `PlazCode-macOS-1.24.25-test-lean.zip`), not GitHub's wrapper. It must be 1:1 with the real update zip (same files and layout; only `DEVELOPMENT.txt` is left out). It stays named "test". Say plainly which fixes are inside and whether an extension reload is enough.

If the Mac job is cancelled with "job was not acquired by Runner", re-run only that job every 20 minutes (`gh run rerun <id> --failed`).

Option: an AI on the owner's own Windows PC can build the Windows zip locally for free (`docs/HANDOFF.md`, "Option: build the test zip on the owner's own computer").

## 1.24.25 (2026-10-26)
The owner requested a direct release with no separate test build. Full platform/browser validation and the packaged Mac desktop gate passed; validated native bytes were published without rebuilding. No test zips were delivered.

## 1.24.26 (2026-10-28)
Owner requested direct release. Full production validation and packaged Mac desktop lifetime gate passed; validated bytes were published without rebuilding. No separate test zips were delivered.

## 1.24.27 requested (2026-10-29)
DeepSeek shared send guard merged from the owner archive: all programmatic sends queue and wait the remaining 8–9.8 second interval after the previous send completes. First send is immediate; long replies add no extra wait. Generate full Windows and Mac lean ZIPs with both browser extensions through validate-1.24.27 on dev. Keep production integrity signing and exact official update layout; direct edits to an installed protected extension are unsuitable. Update the app/full folder, reload the extension and refresh AI tabs.

Build window pending: source is Private, GitHub billing blocks private builds, and the available integration cannot change visibility (HTTP 403). Owner sent settings instructions. No CI started and no test ZIPs delivered yet. No stable release/feed publication is part of this request. Restore Private immediately after verified delivery.
