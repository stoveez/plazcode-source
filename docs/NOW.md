# NOW
Updated: 2026-10-27. Work directly on `claude/plazcode-dev`; no helper agents.

**Latest: owner requested restoration of every deleted repository note on `claude/plazcode-dev` and `main`.** Restored all 58 internal note files from before the cleanup, including the documentation vault, agent instructions, handoffs, reviews and 1.24.26 plans. Restored the accompanying release-script and archived-workflow references. File-presence, Python syntax and release-metadata checks passed; no history rewrite or app release.

**Latest: PlazCode 1.24.25 PUBLISHED and verified.** Validation 40362663766 on `810676d`; publish 40368356121. All Windows/Mac/Linux and Chromium/Firefox checks passed, including real small-preview HTTP requests and packaged Mac desktop lifetime/relaunch. Public release, Windows/Mac feeds and asset checksums checked; downloaded Windows ZIP hash, manifests and exact extension code checked.

**Contents:** screenshots decode bytes into canvas (avoids blocked image URLs; corrupt images report an error); Plan Mode honors per-command task approvals; creation HTTP errors explain missing app support, size limits and invalid responses; desktop shows recent browser extension versions/mismatches; known outdated versions stay red through failed/stale checks.

**Install the full update**, then reload the extension and refresh AI tabs. Replacing only an EXE cannot update an extension loaded from another folder. No separate test build was delivered (owner request). Release notes use the owner's format, 1,430 characters.

**Limits:** original affected Studio captures/accounts were not tested live. Keep live confirmation of grey captures and the reported creation error on the open-work list. PC vault sync unavailable (no PC connection).

**Next update: 1.24.26.** Accounts, code protection, Skill Workshop, Brickwire and carried-over work remain in `development/1.24.26/`; see [open work](vault/open-work.md).

**Release gotchas:** new workflow registered only after a follow-up push on its existing publication branch. Validation pins must use the single-quoted form accepted by test-promote-permissions.py; run that script before publishing. No published archive or tag was overwritten.

**Handoff:** continue from the restored notes and 1.24.26 plans. This session can update the GitHub repo but cannot write the separate Windows `PlazCode-Vault` project folder. Source repo was verified public on 2026-10-27; remind owner to restore Private. More: [Home](vault/Home.md).
