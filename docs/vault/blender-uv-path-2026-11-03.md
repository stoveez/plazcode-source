---
title: Blender runtime discovery, first-use installer and scene deadlines
updated: 2026-11-03
---
## 2026-11-03 — Blender and Ox Alpha fixes verified; test ZIP links delivered
FullCI **41703669996** on **d3a88c2** ALL GREEN: Windows,Mac,Linux,browsers,release-check; official report130 checks/0 failures. Actual signed Windows first-use **41707625110 PASS**: empty cache/no UV on PATH, pinned UV0.12.21 automatically installed/executed and9 real Blender MCP tools initialized; no scene edited. Local251JS/300native PASS.

Exact inner Windows **51,145,862B**, SHA2569450c04f74f7e4b0a62b1859a6216de036eec116672838e88f1da19bdf00866a: https://drive.google.com/file/d/1p8cBF5WuXmt9FERO-_pLTxzhsWOluXQa/view . Universal Mac **52,928,955B**, SHA2563a21c9ba41356b72a3e1584eabe5aa4b9c0b7880217cd6b6592a4d2bc836de6c: https://drive.google.com/file/d/1kRhEDBia5MW5arhcq0z6PRHOGKqMWFUn/view . Report: https://drive.google.com/file/d/1ws69fAIKVFMxndY89XK_vih-C1j3k6iS/view . Drive name/MIME/size readback verified. Both ZIPs CRC/SHA/signatures/source241/licences/new native markers/both Mac slices/zero published layout delta PASS. Windows installer current; Mac excludes Windows-only installer. Links delivered together.

Ox Alpha Copy no longer counts as Send or new model output; drafts/code/real Send/Enter/Stop preserved across four layouts. Blender fixes cover Windows runtime discovery/automatic installer, cold initialization/cancellation, bounded scene queue and useful desktop timeout. Actual native+Blender GUI scene7,420ms and Drive preview already delivered. Original affected PC/live Ox Alpha chat unavailable, so field retest remains. Close app, replace all included files together in existing folder preserving saved data, reload included extension and refresh AI tabs. Blender needs app replacement; Ox Alpha alone only extension reload.

[Canonical verification](blender-oxalpha-2026-11-03-verification.json). Old41682724896/41695245836/41696570889/41697238170 packages/Drive14RQ... and1EL... superseded, DO NOT deliver. Repo still Public at delivery; owner told restore Private at https://github.com/stoveez/plazcode-source/settings (Danger Zone→Change visibility→Private); never change it yourself. No stable publish authorized; future stable needs new version and exact approved notes. Repo vault updated; PC folder not connected. Historical entries below describe their state at the time; this section and NOW are current.

# Report and confirmed causes
Owner saw initialize timeout and signal is aborted without reason; clarified UV may be entirely absent. Original affected PC/OS was not available. Multiple independently reproduced paths matched these symptoms:
- Windows discovery missed current registry PATH after installation, pip Scripts/custom UV folders and uv.exe-only installs. Runtime bundle roots incorrectly used the selected profile folder.
- initialize had20s including cold package setup; AgentScript local_tools dropped the initialization future at6s.
- Desktop scene request aborted at7s although native scene could wait45s in queue plus8s for Blender. Addon error responses could be shown as successful checks.
- Actual Windows PowerShell5.1 installer fixtures41690772050 failed because inherited module paths hid Get-FileHash. This can break automatic setup when UV is absent.
- Packager inherited the old loose installer from baseline even after native embedded copy was fixed. Corrected before delivery.

# Implemented
Runtime source06aa8e3: actual installation root, current Windows registry PATH (respect explicit server PATH), normal standalone/pip folders,UV_INSTALL_DIR and uv.exe tool run fallback. Embedded installer uses built-in .NET SHA256 with the identical pinned checksum, staging/cache/mutex/cleanup guarantees. package.py now explicitly copies and byte-checks the reviewed loose installer on Windows/Mac (fd24ded); file layout unchanged.

Cold Blender initialize120s, ordinary catalogue/scene budgets stay short. AgentScript uses detached background snapshot. Interrupted partial stdio resets before next explicit request; late complete replies remain ID-scoped. No automatic edit replay. Scene-only queue2s/native8s/desktop15s; edits retain prior queue budget. Busy probes do not interrupt edits; useful typed timeout replaces AbortError; addon errors fail the scene check.

# Evidence
- Local native300PASS/2ignored, including21s initialization/warm reuse, launcher discovery, cancellation,2MB backpressure/recovery,12 subprocess restart cycles,24 fragmented Unicode TCP/reconnect cycles,busy lock and addon errors.
- Desktop virtual-clock regression reproduces old7s abort and accepts10s queued reply; real timeout/timer cleanup/repeated recovery pass.
- Actual new native app plus Blender4.3.2 GUI and official protocol13 addon: real scene check7,420ms PASS beyond old7s cutoff. No scene edits. Preview processes cleaned up.
- Actual screenshot343,278bytes: https://drive.google.com/file/d/1MRgfoEwvNQ4VW-uqSp_-gmJiDLk_XOzB/view?usp=drivesdk . Video1,426,335bytes: https://drive.google.com/file/d/17VJucRqRV1SLdA-x30FixUN8_01ogbvo/view?usp=drivesdk . Both metadata read back and already delivered immediately.
- Actual Windows PS5.1 installer fixture41693932272 PASS: initial download/extraction,cache reuse without network,bad checksum rejects publication,staging cleaned,retry succeeds. Real signed Windows41701224201 PASS: automatic pinned UV0.12.21 install/execute and9 MCP tools with no UV present.
- Original full local JS250PASS/1 stale shared source-text assertion; replacement actual behaviour PASS. Corrected full JS251PASS/0failures, exit0.

# Final build and remaining gate
Full CI41697238170 onfd24ded PASS, superseded for final Mac packaging: https://github.com/stoveez/plazcode-source/actions/runs/41697238170 . Includes Ox Alpha Copy fix. When Windows artifact exists, dispatch test-blender-first-use.yml on current branch with build_run41697238170 and installer_only=false. Requires actual signed app to install/execute pinned UV from empty cache/no UV on PATH and initialize real MCP tools; no scene/addon required or modified. This does not replace separate real Blender scene proof.

Require all full CI jobs plus first-use test green; exact inner Windows/universal Mac ZIPs,production signatures,241 reviewed sources,installer equality/new embedded Windows marker,new scene message in both Mac slices,CRC/SHA and zero published-layout delta. Upload/read back Drive then deliver both immediately with Private reminder. [Combined record](blender-oxalpha-2026-11-03-verification.json); staging /workspace/plazcode-combined-build-41697238170.

# Superseded and limits
41682724896/c85 was all green but lacks latest installer/Ox Alpha; its undelivered Windows Drive14RQRFm3GNLKz4layMHBt6QqPqJj-ACOB is not final.41695245836 hit the stale shared test;41696570889 lacks final loose-installer packaging. No new ZIP delivered. Original affected PC remains untested; do not promise every possible Blender/network failure is eliminated. Full app folder replacement required, then extension reload/tab refresh. Source Public only for build, no visibility changes/source ZIPs/stable publishing. Repo vault current; PC folder not connected.
