---
title: Windows untouched-installation path failures
updated: 2026-11-03
---
## Active: public 1.24.30 Windows startup false failure (2026-11-03)
Owner supplied Windows startup dialog: generic changed/incomplete message + "cannot find the path specified (os error 3)". Owner confirmed PUBLIC1.24.30 ZIP; affected person retried GitHub download about5 times with same result. Exact extraction method/install location still unknown; question pending. Do not assume edited code or claim a confirmed cause on that PC.

Confirmed independent bug: installation_root_at treats ANY ancestor ending .app as Mac bundle on every OS. An intact Windows install under ordinary .app-named folders resolves the wrong signed root. New unit test reproduces wrong /Downloads versus /Downloads/PlazCode.app (expected FAIL on old code). Product fix NOT applied yet; this is intentional WIP. Full hashes/signatures/path/symlink/version checks must stay mandatory. Another defect: missing-manifest IO errors lose the missing file name and look like actual content edits; distinguish actionable missing extraction from tampering without allowing startup.

New narrowly scoped Windows workflow test-windows-installation.yml will download the exact PUBLICv1.24.30 ZIP (pinned archive SHA), run actual native signed checks/startup from ordinary/spaces/Unicode/long/.app folders, then EXE-only/same-size edit/missing file/bad-signature refusal tests. On-push registers baseline reproduction; cancel duplicate .27/.28/.29/.30 validations this registration push starts. New test mode expects old .app failure and uses only test-owned processes/data; reads/closes only own error dialogs for old releases. Current delivered41703669996 ZIPs lack this new fix.

Next: baseline Windows repro, then correct bundle-shape detection (real Contents/MacOS executable only), add useful path-specific startup diagnostics, prove unchanged tamper refusal, full local tests and new Windows/Mac builds as needed. No stable publish/main/release/source ZIP/visibility changes. Repo vault current; PC folder not connected.

