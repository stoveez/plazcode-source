---
title: Ox Alpha Copy incorrectly starts a new agent loop
updated: 2026-11-03
---
## 2026-11-03 — combined final full CI41695245836 RUNNING
[Run](https://github.com/stoveez/plazcode-source/actions/runs/41695245836), source/head **06aa8e3**: includes Blender UV discovery/cold startup/scene deadline fixes, NEW embedded .NET checksum installer fix, and Ox Alpha composer-only Copy controls. Installer-only Windows41693932272 PASS; old installer failed under PS5.1 in41690772050. Final local JS runner active, log `/workspace/plazcode-blender-audit-2026-11-03/javascript-combined.log`, terminal50683. Full native300PASS/2ignored, Ox Alpha focused/differential70/preservation970/DOM325/pins/home-start PASS.

Once Windows package ready: run `test-blender-first-use.yml` on current branch with build_run41695245836 and installer_only=false. Must prove production app automatically downloads/executes UV and initializes real MCP tools from empty cache/no UV on PATH. Require that PLUS all fullCI jobs green. Then exact inner Win/Mac verification/new embedded .NET marker/241 sources/both Mac slices/zero official layout and Drive readback before immediate delivery + Private reminder. Staging `/workspace/plazcode-combined-build-41695245836`. Previous41682724896 packages including undelivered WinDrive14RQRFm3GNLKz4layMHBt6QqPqJj-ACOB are superseded. No source ZIP/publish/visibility changes; PC vault folder not connected.

## 2026-11-03 — both source fixes verified locally; combined full build next
Windows installer-only CI41693932272 SUCCESS under PowerShell5.1: first download/cache reuse, wrong-hash rejection/no publication/staging cleanup and successful retry. Original41690772050 reproduced missing Get-FileHash; .NET SHA256 fixed it without weakening pinned checks. Real signed app with entirely missing UV still must run on NEW package because installer is embedded.

Ox Alpha default-submit Copy regression now PASS across ordinary form, raw reply, whole-chat form and nested non-form composer. Actual Send/Enter/Stop preserved, native reply actions never arm a task; code/drafts preserved.70 differential checks,970 preserved functions,325 DOM checks,pins/home-start PASS. Full local native300pass/2ignored. Final full JS and NEW combined Windows/Mac CI next. Prior green41682724896 and its undelivered WinDrive14RQRFm3GNLKz4layMHBt6QqPqJj-ACOB are superseded for final delivery. [Combined record](blender-oxalpha-2026-11-03-verification.json).

# Cause
The owner recording shows a finished chat, then copying a reply raises Agent is working and waiting for Ox Alpha to finish without any new send. Reproduced with actual provider in jsdom: a native reply/code Copy button with no type attribute has browser type=submit. installSendHooks accepted ANY submit button globally, even outside the composer, and called onUserMessage. Core scheduled a new agent loop300ms later, waiting for a reply that Copy never requested. Existing sendButton also searched globally. Copy/Copied/Download labels contaminated assistant text/generation detection.

# Fix in progress
Composer-scoped Send/Stop controls and associated-form buttons, excluding transcript actions even in a wide form; hooks accept only those actual controls. Reply reader excludes native buttons/tooltips/SVG while preserving code/prose. Regression proves old code starts the loop on Copy, with empty or existing draft; covers Copy/Download/Like/unrelated Send, copy text feedback, actual Send/Enter/Stop, verbatim code and draft preservation. Focused/differential/preservation/full JS/native build checks next. Current source changes are local WIP, not in previously built Blender-only ZIPs.

# Related active work
Blender entirely-missing-UV Windows test exposed Get-FileHash unavailable under PowerShell5.1 inherited module environment. Runtime installer now uses .NET SHA256 with the same pinned checksum. Both changes require a new full combined build; do not deliver old c85/41682724896 artifacts as containing them. No source ZIP/publication/visibility changes; PC vault folder not connected. Original uploaded video retained only in task workspace, no private chat text copied into repo.
