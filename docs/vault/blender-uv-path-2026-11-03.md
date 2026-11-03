---
title: Blender first-use UV discovery and connection timeouts
updated: 2026-11-03
---
# Blender startup and scene checks
Owner screenshot: `[blender] MCP request timed out: initialize` plus `signal is aborted without reason`. Owner clarified UV was not on PATH (initially described as missing). This is a new follow-up after delivered full CI 41579556782; those ZIPs lack this fix.

## Findings before implementation
- Windows AddonRuntime scans inherited PATH and a few default UV folders, but does not read the current Windows PATH as its Git detection already does. A UV install after PlazCode starts, or a custom/pip Scripts directory not in the inherited PATH, can be missed. It only accepts uvx.exe, even if uv.exe can run `tool run`. Runtime bundle roots incorrectly come from the active profile config folder instead of the actual installation.
- Missing UV has an existing pinned, checksum-verified first-use installer on Windows. Blender then receives only 20 seconds for initialize, including UV package download/import and upstream addon handshake. Do not confuse an actual missing executable with a subprocess that has already started and is slow.
- AgentScript local_tools wraps the manager refresh in a 6-second timeout that drops the initialization future. Roblox uses a detached background snapshot instead. Interrupted writes can leave request_pending set and must not reuse the stdio stream.
- Desktop Api aborts /api/blender after 7 seconds; native get_scene_info may take 8 seconds AFTER waiting up to 45 seconds for another command. This produces the exact raw AbortError in the screenshot. Background scene checks allow 13 seconds, so align a short read-only scene queue and the desktop deadline with actual server work.

## Plan
Resolve UV from current Windows PATH and normal standalone/pip locations (respect explicit custom PATH), support uv.exe tool run, use actual installation root, retain verified automatic setup. Separate cold initialization allowance from warm requests. Use the background snapshot for AgentScript, reset only interrupted stdio, never replay edits. Bound scene-check queuing independently, allow the native reply before the desktop deadline, translate genuine timeouts accurately, and reject addon error responses as failed checks. Reproduce the old failures, then test discovery/missing runtime, slow startup, cancellation, fragmented/late/error responses, busy queues and repeated reconnects. No source ZIPs, stable publication or visibility changes.

## State
Source fix implemented. Full local Rust suite PASS: 300 tests, 2 ignored. Focused JS PASS, and old desktop code reproduced premature AbortError in the new test. Full JS, actual native-app UI and hosted Windows/Mac checks next. Work only claude/plazcode-dev, no helper agents. Repo still Public after previous delivery; owner reminded to restore Private. PC vault folder not connected.

## Implemented and checked locally
Windows runtime roots use the actual install folder, current registry PATH (unless a custom PATH was configured), normal standalone/pip Scripts directories and UV_INSTALL_DIR. uv.exe can run `tool run` when uvx.exe is absent; pinned/checksum-verified first-use setup is retained. Cold initialize gets 120 seconds while ordinary Blender catalogue/scene deadlines stay short. AgentScript uses detached addon_snapshot instead of dropping setup at 6 seconds. Cancelled/partial stdio requests force clean recovery before another call; fully written late replies remain scoped by request ID, and edits are never retried automatically.

Scene probes queue at most 2 seconds behind work, then keep their existing 8-second scene budget. Desktop allows 15 seconds and gives a typed, useful timeout; background allows 12 seconds. Running edits retain their existing queue and execution budgets. An addon error response no longer passes the scene check. Full local native tests exercise 21-second startup, missing/out-of-PATH launchers, partial writes, cancellation, 12 subprocess restarts, 24 TCP disconnect/fragmented Unicode cycles, busy probe and addon errors. Actual affected Windows PC remains untested. [Verification](blender-uv-path-2026-11-03-verification.json).
