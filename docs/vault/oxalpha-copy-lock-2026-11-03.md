---
title: Ox Alpha Copy incorrectly starts a new agent loop
updated: 2026-11-03
---
## 2026-11-03 — final packaging gap fixed before delivery
The native app embeds the corrected UV installer, but package.py still inherited the old loose Setup-Mcp-Runtime.ps1 from the published baseline. It now copies the reviewed script and asserts byte equality for Windows/Mac. Prepared source equality and packager syntax/copy checks PASS; file list unchanged. Final ZIP verifier also requires the exact new script and embedded Windows marker. No further native/extension source changes after06aa8e3. Current41696570889 superseded for packaging; fresh full combined CI next. The local final JS51824 continues unchanged.

Shared bar check now tests actual behaviour (PASS), not removed btn.type text. Native300PASS/2ignored, Windows PS5.1 installer fixture41693932272 PASS, actual Blender7,420ms scene preview delivered. Still require real signed Windows app with entirely missing UV, all fullCI jobs green, exact inner Win/universal Mac/source/signatures/layout/Drive readback. No new test ZIP delivered or stable release. Source Public; PC vault folder not connected.

## 2026-11-03 — both source fixes verified locally; combined full build next
Windows installer-only CI41693932272 SUCCESS under PowerShell5.1: first download/cache reuse, wrong-hash rejection/no publication/staging cleanup and successful retry. Original41690772050 reproduced missing Get-FileHash; .NET SHA256 fixed it without weakening pinned checks. Real signed app with entirely missing UV still must run on NEW package because installer is embedded.

Ox Alpha default-submit Copy regression now PASS across ordinary form, raw reply, whole-chat form and nested non-form composer. Actual Send/Enter/Stop preserved, native reply actions never arm a task; code/drafts preserved.70 differential checks,970 preserved functions,325 DOM checks,pins/home-start PASS. Full local native300pass/2ignored. Final full JS and NEW combined Windows/Mac CI next. Prior green41682724896 and its undelivered WinDrive14RQRFm3GNLKz4layMHBt6QqPqJj-ACOB are superseded for final delivery. [Combined record](blender-oxalpha-2026-11-03-verification.json).

# Cause
The owner recording shows a finished chat, then copying a reply raises Agent is working and waiting for Ox Alpha to finish without any new send. Reproduced with actual provider in jsdom: a native reply/code Copy button with no type attribute has browser type=submit. installSendHooks accepted ANY submit button globally, even outside the composer, and called onUserMessage. Core scheduled a new agent loop300ms later, waiting for a reply that Copy never requested. Existing sendButton also searched globally. Copy/Copied/Download labels contaminated assistant text/generation detection.

# Fix in progress
Composer-scoped Send/Stop controls and associated-form buttons, excluding transcript actions even in a wide form; hooks accept only those actual controls. Reply reader excludes native buttons/tooltips/SVG while preserving code/prose. Regression proves old code starts the loop on Copy, with empty or existing draft; covers Copy/Download/Like/unrelated Send, copy text feedback, actual Send/Enter/Stop, verbatim code and draft preservation. Focused/differential/preservation/full JS/native build checks next. Current source changes are local WIP, not in previously built Blender-only ZIPs.

# Related active work
Blender entirely-missing-UV Windows test exposed Get-FileHash unavailable under PowerShell5.1 inherited module environment. Runtime installer now uses .NET SHA256 with the same pinned checksum. Both changes require a new full combined build; do not deliver old c85/41682724896 artifacts as containing them. No source ZIP/publication/visibility changes; PC vault folder not connected. Original uploaded video retained only in task workspace, no private chat text copied into repo.
