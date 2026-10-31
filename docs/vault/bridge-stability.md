---
title: Bridge drops (extension ↔ app link)
updated: 2026-10-30
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
