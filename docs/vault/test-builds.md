---
title: Test builds and the public-then-private plan

updated: 2026-10-30
---

2026-10-30: online profiles/sign-in, per-profile data and settings/private-skills sync are included in the full verified 1.24.27 test builds. Owner approved the actual rectangular-profile/background design. CI 40989215099 / source 9c175eb passed Windows, universal Mac, Linux and browsers. Production signatures, reviewed source and official archive layouts verified; inner ZIPs delivered. Account API remains Public by explicit approval. Source repo is now PRIVATE, verified after owner restored visibility. Earlier integration visibility attempts were denied HTTP 403. Latest stable remains 1.24.26.

# Test builds

Builds on the private repo are blocked by GitHub billing, so the repo is made **public only while a build or publish runs**, then private again. The owner flips visibility; AIs never do.

## Every time you are ready for a test build
1. Send the owner https://github.com/stoveez/plazcode-source/settings and walk them through the plan again in plain words (resend every time).
2. After they make it public, start the build on `claude/plazcode-dev`.
3. Send them the two lean zips as soon as the run ends, in the same message remind them to set the repo back to Private (Danger Zone, Change visibility, Private).
4. Repeat the reminder in later replies until it is private. Before stopping run `gh api repos/stoveez/plazcode-source --jq '{private,visibility}'`.

## The zips
**Fetching them (2026-10-25):** in the cloud session `gh run download` is refused (the artifact storage host `productionresultssa*.blob.core.windows.net` is blocked by the egress policy, 403). Do not work around it. Use the connected GitHub artifact download tool: it returns a Sediment-backed file URL. Download normally from that supplied URL, verify the artifact digest, extract the wrapper and deliver the INNER archive. The direct CLI storage denial remains; do not bypass it. The download_file helper has a 32 MiB limit, so large archives use the connector-supplied HTTP URL.

From the run's Artifacts: `plazcode-<version>-Windows-test-lean` and `plazcode-<version>-macOS-test-lean`. Send the **inner** zip (`PlazCode-1.24.25-test-lean.zip`, `PlazCode-macOS-1.24.25-test-lean.zip`), not GitHub's wrapper. It must be 1:1 with the real update zip (same files and layout; only `DEVELOPMENT.txt` is left out). It stays named "test". Say plainly which fixes are inside and whether an extension reload is enough.

If the Mac job is cancelled with "job was not acquired by Runner", re-run only that job every 20 minutes (`gh run rerun <id> --failed`).

Option: an AI on the owner's own Windows PC can build the Windows zip locally for free (`docs/HANDOFF.md`, "Option: build the test zip on the owner's own computer").

## 1.24.25 (2026-10-26)
The owner requested a direct release with no separate test build. Full platform/browser validation and the packaged Mac desktop gate passed; validated native bytes were published without rebuilding. No test zips were delivered.

## 1.24.26 (2026-10-28)
Owner requested direct release. Full production validation and packaged Mac desktop lifetime gate passed; validated bytes were published without rebuilding. No separate test zips were delivered.

## 1.24.27 delivered (2026-10-29)
Source `962899c`, full validation [40932400772](https://github.com/stoveez/plazcode-source/actions/runs/40932400772): Windows, Mac, Linux and browser jobs all passed. Inner Windows and universal Mac test ZIPs plus Linux x64 tar.gz delivered; Linux ZIP is also available. Full packages retain app + memory helper + Chromium/Firefox + root extension copies, with no extra development note or decoder maps. Replace/extract the complete folder, reload extensions and refresh AI tabs; the desktop changes require the new app too.

Includes: owner archive DeepSeek shared send queue (8–9.8 second completion-based spacing), accessible effort menus, three persistent approval modes in bar/Settings, composer-relative expanded/collapsed bar placement, Mac same-user stale-port recovery and visible static native Linux startup. Read-only/folder boundaries remain. Linux automatic updates have no published feed; use native x64 downloads. No stable 1.24.27 publication was requested/performed.

Every downloaded archive passed CRC/path/version/production-signature and exact reviewed JS source checks. Windows/Mac lists exactly match 1.24.26; Linux static executable/memory helper, permissions and ZIP/tar contents verified. See [sizes, hashes and full checks](test-build-1.24.27-verification.json). Exact signed Linux frontend also opened locally for the actual final screenshot; settings persistence/reload/reopen/Quit passed. Original user setups and live AI accounts remain untested.

Historical delivery visibility: the integration could not restore Private (HTTP 403). Owner subsequently restored it; source is now verified PRIVATE. PC vault folder is not connected.

## Profile test builds delivered (2026-10-30)
2026-10-30: online profiles/sign-in, per-profile data and settings/private-skills sync are included in the full verified 1.24.27 test builds. Owner approved the actual rectangular-profile/background design. CI 40989215099 / source 9c175eb passed Windows, universal Mac, Linux and browsers. Production signatures, reviewed source and official archive layouts verified; inner ZIPs delivered. Account API remains Public by explicit approval. Source repo is now PRIVATE, verified after owner restored visibility. Earlier integration visibility attempts were denied HTTP 403. Latest stable remains 1.24.26.

Actual remembered-login, separate-data and sync integration passed; owner approved the rectangular profile/gloss/full-background screen. Downloaded archives passed production signatures/source/layout checks; the actual signed Linux app passed bootstrap/profile-gate/reopen/Quit. [Full verification](test-build-1.24.27-profiles-verification.json). Quit/replace the desktop and extension before testing. Windows unsigned/Mac not notarized. Original user devices and live AI accounts remain untested.

## Working Drive downloads (2026-10-30)
Workspace links were not downloadable in the owner's client. Exact verified INNER ZIPs uploaded to the connected Google Drive; readback confirms names, MIME types and exact byte sizes. No rebuild, wrapper ZIP, new public sharing permission or stable release. Use Drive's Download action (the connected account owns the uploads).

- [Windows — 50,461,047 bytes](https://drive.google.com/file/d/1_7hBb-hxMA8ylgugYMz9xWvLIuSLjB0X/view?usp=drivesdk)
- [Mac — 51,989,456 bytes](https://drive.google.com/file/d/1DGNrZcK9KIoPDqKv2gbgX_31iaF3SKQS/view?usp=drivesdk)
- [Linux — 49,561,126 bytes](https://drive.google.com/file/d/1rakPW0e7kCBLJnWcEMoCX4OErlGEZBv2/view?usp=drivesdk)

Source is now confirmed Private. Keep the separately authorized account API Public.

## Startup/icon follow-up
2026-10-30 follow-up (not in the delivered ZIPs): replaced the font plus beside Create a new profile with a centered SVG badge and the approval-mode font arrow with the same geometric chevron as Effort. Loading and profile picker now overlap in one fade; the local picker no longer waits on update-network requests (native automatic updates remain independent). Actual screen/crossfade, approval browser, desktop regression and theme checks pass. Owner clarified the long delay is before any window; investigating native protected-file verification separately. Source stays Private. Replacement packages pending.
