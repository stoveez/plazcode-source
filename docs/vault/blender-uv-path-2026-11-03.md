---
title: Blender runtime discovery, first-use installer and scene deadlines
updated: 2026-11-03
---
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
- Actual Windows PS5.1 installer fixture41693932272 PASS: initial download/extraction,cache reuse without network,bad checksum rejects publication,staging cleaned,retry succeeds. Real signed app with entirely absent UV still pending final Windows package.
- Original full local JS250PASS/1 stale shared source-text assertion; replacement actual behaviour PASS. Corrected full JS51824 running; no prepare during it/Cargo.

# Final build and remaining gate
Full CI41697238170 onfd24ded RUNNING: https://github.com/stoveez/plazcode-source/actions/runs/41697238170 . Includes Ox Alpha Copy fix. When Windows artifact exists, dispatch test-blender-first-use.yml on current branch with build_run41697238170 and installer_only=false. Requires actual signed app to install/execute pinned UV from empty cache/no UV on PATH and initialize real MCP tools; no scene/addon required or modified. This does not replace separate real Blender scene proof.

Require all full CI jobs plus first-use test green; exact inner Windows/universal Mac ZIPs,production signatures,241 reviewed sources,installer equality/new embedded Windows marker,new scene message in both Mac slices,CRC/SHA and zero published-layout delta. Upload/read back Drive then deliver both immediately with Private reminder. [Combined record](blender-oxalpha-2026-11-03-verification.json); staging /workspace/plazcode-combined-build-41697238170.

# Superseded and limits
41682724896/c85 was all green but lacks latest installer/Ox Alpha; its undelivered Windows Drive14RQRFm3GNLKz4layMHBt6QqPqJj-ACOB is not final.41695245836 hit the stale shared test;41696570889 lacks final loose-installer packaging. No new ZIP delivered. Original affected PC remains untested; do not promise every possible Blender/network failure is eliminated. Full app folder replacement required, then extension reload/tab refresh. Source Public only for build, no visibility changes/source ZIPs/stable publishing. Repo vault current; PC folder not connected.
