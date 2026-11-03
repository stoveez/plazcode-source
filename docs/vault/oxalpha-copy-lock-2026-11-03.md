---
title: Ox Alpha Copy incorrectly starts a new agent loop
updated: 2026-11-03
---
# Cause
The owner recording shows a finished chat, then copying a reply raises Agent is working and waiting for Ox Alpha to finish without any new send. Reproduced with actual provider in jsdom: a native reply/code Copy button with no type attribute has browser type=submit. installSendHooks accepted ANY submit button globally, even outside the composer, and called onUserMessage. Core scheduled a new agent loop300ms later, waiting for a reply that Copy never requested. Existing sendButton also searched globally. Copy/Copied/Download labels contaminated assistant text/generation detection.

# Fix in progress
Composer-scoped Send/Stop controls and associated-form buttons, excluding transcript actions even in a wide form; hooks accept only those actual controls. Reply reader excludes native buttons/tooltips/SVG while preserving code/prose. Regression proves old code starts the loop on Copy, with empty or existing draft; covers Copy/Download/Like/unrelated Send, copy text feedback, actual Send/Enter/Stop, verbatim code and draft preservation. Focused/differential/preservation/full JS/native build checks next. Current source changes are local WIP, not in previously built Blender-only ZIPs.

# Related active work
Blender entirely-missing-UV Windows test exposed Get-FileHash unavailable under PowerShell5.1 inherited module environment. Runtime installer now uses .NET SHA256 with the same pinned checksum. Both changes require a new full combined build; do not deliver old c85/41682724896 artifacts as containing them. No source ZIP/publication/visibility changes; PC vault folder not connected. Original uploaded video retained only in task workspace, no private chat text copied into repo.
