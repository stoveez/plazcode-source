# PlazCode 1.24.3

Desktop refreshes skip unchanged Tools, recent activity and terminal DOM. Logs append or roll forward while preserving reading position; replacing and clearing logs still work. Inactive pages defer rendering. MCP catalogue requests share an in-flight promise and a five-second cache, retaining live connection state. Opening MCP forces a fresh request; toggling invalidates the cache. Duplicate update polling is removed, hidden windows poll at five-second intervals and returning to the window refreshes immediately.

Chromium/Firefox local comparison: 40 unchanged refreshes, 350 tools and 2,500 log lines reduced from 892/1,170 ms and 120 mutations to 4/4 ms and zero mutations. This measures refresh work in synthetic fixtures, not overall task speed or provider response time. Cache invalidation, focused expanded tool cards, appended/rolling/replaced/cleared/deferred logs and MCP request freshness are checked using production functions.

Collapsed icons are centered; navigation follows the requested eleven-page order. Updates is accessible from Settings. Explorer has theme-aware hierarchy, search, editor, properties and empty states, preserving Studio checks, drafts and edits. Desktop/sidebar and browser-bar effort indicators use theme accent for Default, yellow-to-red for Low–Max and purple for Ultracode. Selected navigation retains theme fill/glow and gains only a purple outline.

Windows packaging excludes the Mac app and Mac launchers, which remain in the separate Mac download. All Windows runtime, extension and starter skill files remain. ZIPs use explicit level-nine standard Deflate with exact byte/path/mode round trips. The prior Windows package shrinks from 39,140,996 to 15,651,956 bytes in the packaging fixture; final release sizes may differ. No executable packing is used.

Notion startup now tries bounded 600-character / 12-line clipboard transactions after rejected native bulk writes. Each prefix and the entire startup/catalogue must survive render verification. This path is limited to locked startup messages up to 128 KiB, with a bounded sixty-second paste deadline, retains exact text, refuses foreign attachments and changed/remounted drafts, and never submits partial or repeated messages. Co-work no longer captures idle messages due to soft generation grace or an old queue; disconnected Studio retains native chat. These are fixture-verified paths, not live-account verification.

Notion response completion now recognizes localized final-response controls and the previously missed Helpful control, plus the German ready acknowledgement. Current-response scope, 700 ms stability, native Stop and workflow-progress guards remain. This avoids up to roughly eight seconds of soft generation tail on confirmed complete responses; actual provider thinking/network time is unchanged.

Per-tab engine restoration now keeps a newer explicit choice if an older storage read finishes later. A delayed RobloxScript restore is regression-tested against an AgentScript selection.

Windows binds free bridge ports immediately instead of launching netstat/tasklist for every port. Occupied-port recovery uses native IPv4/IPv6 listener tables and process image queries without localized text parsing. Recovery runs on a blocking worker and still only closes an identified old PlazCode process; unrelated owners are preserved. Live Windows listener/image checks, table validation and existing occupied/exiting-port tests run in platform CI. This addresses an identified startup bottleneck and stale-agent failure path, not every possible installation or permission error.

Validation: all exact-source platform CI jobs passed. See release-validation-1.24.3.

Live signed-in providers and Studio/Blender sessions remain untested. No overall speed or AI benchmark gain is claimed.
