---
title: Ox Alpha Copy incorrectly starts a new agent loop
updated: 2026-11-03
---
## 2026-11-03 — final corrected-layout fullCI41703669996 RUNNING
FullCI41697238170 ALL GREEN onfd24ded, all four platform/browser jobs plus release-check. Supplemental real signed Windows app41701224201 ALL GREEN: from empty cache/no UV on PATH it installed and executed pinned UV0.12.21 and initialized9 real Blender MCP tools; no scene edited. Exact Windows ZIP verified (source241/signatures/CRC/SHA/layout); Drive upload/readback verified but NOT delivered.

Final Mac layout comparison caught one extra Windows-only Setup-Mcp-Runtime.ps1 introduced by the packager change. Corrected copy/assert to Windows only; explicit Mac absence assertion prevents recurrence. Both official platform layouts checked. No native/extension source changes after06aa8e3; local251JS/300native remain PASS. Final corrected-layout fullCI41703669996 ond3a88c2 RUNNING: https://github.com/stoveez/plazcode-source/actions/runs/41703669996 . New staging /workspace/plazcode-combined-build-41703669996; require new native/package/source/zero-layout checks and Drive delivery.41697238170 and Windows Drive1ELBbenNuK6iLwAS-6byOAOeyhNwKMT11 superseded for final delivery; do not link as final. No new ZIP delivered/publish/visibility change. PC vault not connected.

# Cause
The owner recording shows a finished chat. Copying its output opens Agent is working without a new send. Actual provider regression reproduced it: a reply/code Copy button with no type has browser type=submit. The global click hook accepted every submit button and called onUserMessage. Core then scheduled an agent loop waiting for a reply Copy never requested. Send selection also searched globally; Copy/Copied labels polluted assistant output and streaming detection.

# Fix and checks
Product source06aa8e3 scopes Send/Stop to the composer and explicitly associated form buttons, excludes transcript actions even inside a whole-chat form, and ignores native reply button/tooltip/SVG text. Verbatim code and drafts remain intact. Regression PASS for normal form, raw reply, whole-chat form and nested non-form composer: Copy/Download/Like/unrelated Send do not start tasks; feedback is not generation; real Send/Enter/Stop still work.70 healthy differential checks,970 preserved function bodies,325 DOM resilience checks,pins/home-start PASS.

Shared test-vani-provider.js formerly required the removed btn.type source expression. It now clicks real bar controls/Send and checks task/stop counts and draft preservation on Vani,Freebuff,Ox Alpha,UseAI (PASS). First full JS250PASS/1 stale assertion; corrected full JS251PASS/0failures, exit0. No live user browser/js tool available, so original chat is not live-verified and no fixture screenshot is presented as a real preview.

# Build and delivery
Final combined full CI41697238170 onfd24ded includes this extension fix plus Blender native/installer/packaging fixes: https://github.com/stoveez/plazcode-source/actions/runs/41697238170 . Earlier41682724896/41695245836/41696570889 are superseded; no new ZIP delivered. Require full CI + signed Windows app with UV completely absent, exact signed Win/universal Mac source/layout checks and Drive metadata readback. [Combined proof](blender-oxalpha-2026-11-03-verification.json). Staging /workspace/plazcode-combined-build-41697238170.

Ox Alpha alone needs extension reload + AI-tab refresh. Combined Blender fix requires replacing the whole app folder too. No source ZIP/stable publish/visibility changes. Restore Private after delivery; PC vault folder not connected. Original recording retained only in task workspace, no private chat text in repo.
