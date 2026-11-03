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
Analysis/plan complete; implementation and tests next. Work only claude/plazcode-dev, no helper agents. Repo still Public after previous delivery; owner reminded to restore Private. PC vault folder not connected.
