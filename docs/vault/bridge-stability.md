---
title: Bridge drops (extension ↔ app link)
updated: 2026-11-11
---
# Bridge drops: what is known (1.24.27)

**Tester report (2026-10-30, Terminal screenshot).** "legacy WS [roblox] client disconnected" appeared at irregular times (70, 15 and 19 minutes apart). Each time the link came back 18 to 23 s later. That client is the browser extension's background worker, on port 17613 or 17615.

**What the log proves.**
- The extension reconnects 0.5 s after a close it sees (`reconnectDelayFor`). An app-side close, or a failed program check, would show "connected" again within a second, or rapid connect/disconnect pairs.
- One clean drop followed by about 20 s of silence means the extension's background worker was not running. The AI tab revives it with its 5 s status message, and the browser slows that message down while the tab is in the background.
- So the browser stopped the worker. Why is still unconfirmed: possible causes are a browser rule (one request or message taking too long), memory saving, a browser older than Chrome 116 (where WebSocket traffic does not keep workers alive), or the computer sleeping.

**Fixed while tracing (no live repro).**
- The app logs every disconnect with its reason.
- The extension remembers how its last link ended, and whether the browser restarted its worker. It sends that as `client_note` on the next link, so the Terminal shows it, for example "browser [roblox]: the browser stopped and restarted PlazCode's background worker; it was last active 30 s before this restart".
- Status polls (`studio_status`, `mcp_status`, `list_servers`) no longer re-hash the whole installation every 10 s.
- A failed program check is retried once after 0.3 s. If it still fails, the request is refused with the recovery message and the reason is logged. The connection is no longer dropped silently.
- `protection.js`: one failed self-check used to stay failed until the worker restarted, which blocked pairing and every reconnect. It now holds for 10 s and is then re-checked.

**Next.** Ask the tester for the Terminal lines after the next drop, plus their browser and version, and whether the AI tab was in the background. Test: `test-bridge-diagnostics.js`. Needs the new app and extension.

## 1.24.30: "Desktop bridge disconnected" over and over (tester screenshot, 2026-10-31)
Five desktop notices in nine minutes while Studio stayed connected. Causes found, all fixed in 1.24.30:
- **The notice watched only HTTP requests.** `bridge_connected` was true only if the browser made a request in the last 15 s; WebSocket pings did not count. Now an open browser WebSocket that sent anything in the last 45 s counts too (`gui.rs extension_recent`), and the desktop waits 10 more seconds before warning.
- **Every request waited for the extension's own file check.** `protection.js` re-read and hashed the whole extension (about 900 files) every 30 s, and all requests to the app waited (measured 1.0-1.4 s on a fast Linux box; far longer with antivirus, OneDrive or a busy disk). Now, after a pass, requests never wait; files are re-checked in the background every 5 minutes; a failed background check forces one full blocking check (a busy file passes, real edits fail as before).
- **The app hashed the whole installation (3,019 files, 119 MB) for every command**, with parallel commands each doing their own pass. Now commands share the running pass; for 10 s after a pass a command only compares every signed file's size and change time (recorded before the pass) and any difference runs a full pass (`integrity.rs check_work`), so tampering is still refused at once. Failures are never reused.
- **Messages over 5 minutes stop the worker** (Chrome rule). `run_command` (up to 10 min), local-model replies and critic reviews now answer "still-running" every 4 minutes and the AI tab asks again (`job-wait`).
- The desktop report (every 750 ms) could stop for good if the AI tab never answered; it now gives up after 2.5 s.
- Logs page: `bridge.socket_open`, `bridge.socket_closed` (with reason), `bridge.quiet` / `bridge.connected` (with seconds since the last request and frame).

**Still open.** Chrome also stops a worker when one `fetch()` response takes over 30 s: `/api/media/convert` (65 s limit), Toolkit asset insert (120 s) and saving personal memory (30 s) could, when slow. Rare, user-started; not changed. Test: `test-bridge-diagnostics.js` sections 1, 4, 5.

## 2026-11-02 — current source follow-up (verified)
Live readiness now checks actual app/profile/engine/transport rather than cached tool counts; instruction-worker errors have accurate recovery and bounded waits. ChatGPT retained-result schemas/command examples and compact startup memory improve protocol consistency and remove extra exchanges. 246 full-sweep passes plus three corrected isolated fixture reruns and final protocol/learning/health/pins all pass. Not packaged; affected-PC trigger and live timing unconfirmed. [Details](startup-bridge-and-results-2026-11-02.md).

## 2026-11-11 — "commands shouldn't stall on the link" (owner), after 1.24.32, not published
Measured with the real app (Linux debug build, `--headless`) and a WebSocket client that sends what the extension sends. The link itself answers in 1 to 5 ms per command. Three waits sat around it; all three are fixed on `claude/plazcode-dev`.
- **App: every ordinary command waited for a full files check.** `integrity.rs check_work` reused a pass for only 10 s, and an AI needs longer than that to write its next command, so almost every command re-read and hashed the whole installation first (about 3,000 files, 120 MB; a second or more with antivirus or cloud sync). Now, from 10 s to 15 min after a pass, the command goes ahead after the size-and-change-time comparison and one full pass runs behind it (`WorkCheck::Background`); a failed pass clears the record, so the next command runs a full pass itself and is refused. Past 15 min, or with no record, it waits as before. The app also runs the first pass right after it starts, so the first command does not wait.
- **App: results sent close together waited 40 ms (Linux) to 200 ms (Windows).** The app's sockets had no TCP_NODELAY, so the second of two small frames waited for the browser's delayed acknowledgement. Measured: 8 results sent together took 45 ms, now 2 ms; `list_tools` 44 ms, now 4 ms. `set_nodelay(true)` on the 17613/17615 sockets and `tcp_nodelay(true)` on the port-3000 server.
- **Extension: a restarted background worker made its first message wait for the full files check** (about 900 files). `protection.js` now notes a pass in `chrome.storage.session` (pages cannot read it; emptied on extension reload/update and browser close). A restarted worker that finds a pass from the last 12 h lets the message through and re-checks every file at once behind it; a failed check stops work as before and forgets the note.
- Small: `waitForConnection` looks every 25 ms instead of 100 ms.

**Looked at and left alone.** AgentScript commands open their own socket each time (2 to 5 ms, measured). Every app request first reads `/api/status` for the profile (2 to 3 ms). The 10 s heartbeat's Studio check is handled in the socket's read loop, so a command that arrives in the same instant waits for that one Studio round trip. Studio discovery (`list_roblox_studios`) is repeated when the last one is older than 5 s. A silent half-open socket is only dropped after 140 s without any frame (shorter risks dropping a healthy link while a Studio check hangs). None of these could be timed without Roblox Studio.

**Not covered here.** Time spent in Roblox Studio itself, and the AI-tab side (waiting for the reply to finish, pasting the result, the site's own send pacing). Tests: `test-bridge-diagnostics.js` (section 1 restart cases), `integrity::tests::a_command_waits_for_a_full_check_only_without_a_recent_pass`. Needs the new app AND an extension reload. Not tried on Windows or with Studio.
