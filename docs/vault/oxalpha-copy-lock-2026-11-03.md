---
title: Ox Alpha Copy incorrectly starts a new agent loop
updated: 2026-11-03
---
## 2026-11-03 — Blender and Ox Alpha fixes verified; test ZIP links delivered
FullCI **41703669996** on **d3a88c2** ALL GREEN: Windows,Mac,Linux,browsers,release-check; official report130 checks/0 failures. Actual signed Windows first-use **41707625110 PASS**: empty cache/no UV on PATH, pinned UV0.12.21 automatically installed/executed and9 real Blender MCP tools initialized; no scene edited. Local251JS/300native PASS.

Exact inner Windows **51,145,862B**, SHA2569450c04f74f7e4b0a62b1859a6216de036eec116672838e88f1da19bdf00866a: https://drive.google.com/file/d/1p8cBF5WuXmt9FERO-_pLTxzhsWOluXQa/view . Universal Mac **52,928,955B**, SHA2563a21c9ba41356b72a3e1584eabe5aa4b9c0b7880217cd6b6592a4d2bc836de6c: https://drive.google.com/file/d/1kRhEDBia5MW5arhcq0z6PRHOGKqMWFUn/view . Report: https://drive.google.com/file/d/1ws69fAIKVFMxndY89XK_vih-C1j3k6iS/view . Drive name/MIME/size readback verified. Both ZIPs CRC/SHA/signatures/source241/licences/new native markers/both Mac slices/zero published layout delta PASS. Windows installer current; Mac excludes Windows-only installer. Links delivered together.

Ox Alpha Copy no longer counts as Send or new model output; drafts/code/real Send/Enter/Stop preserved across four layouts. Blender fixes cover Windows runtime discovery/automatic installer, cold initialization/cancellation, bounded scene queue and useful desktop timeout. Actual native+Blender GUI scene7,420ms and Drive preview already delivered. Original affected PC/live Ox Alpha chat unavailable, so field retest remains. Close app, replace all included files together in existing folder preserving saved data, reload included extension and refresh AI tabs. Blender needs app replacement; Ox Alpha alone only extension reload.

[Canonical verification](blender-oxalpha-2026-11-03-verification.json). Old41682724896/41695245836/41696570889/41697238170 packages/Drive14RQ... and1EL... superseded, DO NOT deliver. Repo still Public at delivery; owner told restore Private at https://github.com/stoveez/plazcode-source/settings (Danger Zone→Change visibility→Private); never change it yourself. No stable publish authorized; future stable needs new version and exact approved notes. Repo vault updated; PC folder not connected. Historical entries below describe their state at the time; this section and NOW are current.

# Cause
The owner recording shows a finished chat. Copying its output opens Agent is working without a new send. Actual provider regression reproduced it: a reply/code Copy button with no type has browser type=submit. The global click hook accepted every submit button and called onUserMessage. Core then scheduled an agent loop waiting for a reply Copy never requested. Send selection also searched globally; Copy/Copied labels polluted assistant output and streaming detection.

# Fix and checks
Product source06aa8e3 scopes Send/Stop to the composer and explicitly associated form buttons, excludes transcript actions even inside a whole-chat form, and ignores native reply button/tooltip/SVG text. Verbatim code and drafts remain intact. Regression PASS for normal form, raw reply, whole-chat form and nested non-form composer: Copy/Download/Like/unrelated Send do not start tasks; feedback is not generation; real Send/Enter/Stop still work.70 healthy differential checks,970 preserved function bodies,325 DOM resilience checks,pins/home-start PASS.

Shared test-vani-provider.js formerly required the removed btn.type source expression. It now clicks real bar controls/Send and checks task/stop counts and draft preservation on Vani,Freebuff,Ox Alpha,UseAI (PASS). First full JS250PASS/1 stale assertion; corrected full JS251PASS/0failures, exit0. No live user browser/js tool available, so original chat is not live-verified and no fixture screenshot is presented as a real preview.

# Build and delivery
Final combined full CI41697238170 onfd24ded includes this extension fix plus Blender native/installer/packaging fixes: https://github.com/stoveez/plazcode-source/actions/runs/41697238170 . Earlier41682724896/41695245836/41696570889 are superseded; no new ZIP delivered. Require full CI + signed Windows app with UV completely absent, exact signed Win/universal Mac source/layout checks and Drive metadata readback. [Combined proof](blender-oxalpha-2026-11-03-verification.json). Staging /workspace/plazcode-combined-build-41697238170.

Ox Alpha alone needs extension reload + AI-tab refresh. Combined Blender fix requires replacing the whole app folder too. No source ZIP/stable publish/visibility changes. Restore Private after delivery; PC vault folder not connected. Original recording retained only in task workspace, no private chat text in repo.
