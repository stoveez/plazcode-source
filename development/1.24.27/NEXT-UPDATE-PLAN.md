# PlazCode 1.24.27

Scope: merge owner-supplied DeepSeek provider pacing from PlazCode-Extension.rar. Preserve the original raw sender, serialize every exported send, and measure an 8–9.8 second cooldown from send completion. First send is immediate; log waits as send.pace. No core send changes.

Additional owner-reported fix: desktop effort options are hidden beneath the following Instructions card. Keep the desktop inline picker synchronized with the shared picker, raise its card while open and size its scrollable menu to available viewport space. Exercise actual desktop CSS/cards at large, short and narrow sizes and keep keyboard/change events intact. This needs the rebuilt desktop app in the test package.

Other feature designs copied alongside this plan are deferred, not part of this update. Local verification and then full production platform/browser plus packaged Mac gates are required before publishing. Latest published stays 1.24.26 until release.

Additional owner scope: persistent Ask/Approve for me/Bypass selectors in the bar and app Settings; strict edit/deletion/no-prompt policy with existing access limits; composer-relative expanded/collapsed bar positioning and actual screenshots. Also fix native Linux headless-only startup and provide a Linux package. Full Windows/Mac test packages remain required; no stable release requested.

Mac screenshot confirmed port 17613 held during startup; implement same-user targeted PlazCode recovery and real Mac process regression. Linux real desktop integration passes; package a signed static x86-64 binary and pinned memory helper. Linux stable auto-update feed remains unavailable; never use Windows/Mac packages there. Full hosted validation and final inner packages remain pending.
