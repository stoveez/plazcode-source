---
title: Desktop app layout, guides and website
updated: 2026-10-24
---
# Desktop app, guides and website

- **New layout:** top area bar, bold area name over its pages in the sidebar, Overview cards, Account placeholder, Appearance page (themes and custom look), startup intro that checks for updates. It lives in `agent/src/desktop.html` (CSS/JS blocks marked `nx`). The Discord link is `open:discord` in `agent/src/gui.rs`. Not yet tried in the real app on Windows or Mac.
- **Guides and Troubleshooting:** a top-bar area with search, picture cards, a reader and images. Guides are written in `guides/` (see `guides/README.md`) and posted to the public repo `guides/` folder only by the workflow `publish-guides.yml` (owner only; test first). The app reads `https://raw.githubusercontent.com/stoveez/PlazCode/main/guides/index.json`. An in-app posting editor is not built; the owner chose chat posting first, editor later with the login system.
- **Feature guide (in-chat help):** `development/1.24.25/overlay/core/feature-guide.js` is the single list of every PlazCode feature. The AI reads it (command `plazcode_features`), `guides/build_guides.py` writes it to `features.json` next to the guides, and the desktop app will show it later (not wired yet). Add an entry whenever you add a menu item; `test-feature-guide.js` enforces it.
- **Website:** `PlazCode-website.zip` (single `index.html`), not deployed. The owner will get a domain and host it on Cloudflare Pages.
- **Validation apps:** CI artifacts `plazcode-1.24.25-Windows-validation` (about 53 MB) and `plazcode-1.24.25-macOS-validation` (about 65 MB; most of it is the memory helper `engram`). Owners get the smaller `-test-lean` zips instead, see [test-builds](test-builds.md).
- Related: [vault-memory](vault-memory.md), [open-work](open-work.md).

## Effort menu clipping (2026-10-29; 1.24.27, unreleased)
The owner recording showed lower effort options obscured by the next Instructions card. Desktop embedded an older picker lacking the shared `.pc-effort-lift` behavior; card backdrop filtering trapped the menu in a lower stacking context. The desktop inline function now matches `core/effort-picker.js`, raises its card while open, restores stacking on close and caps the menu to available space above/below inside its scroll container. All six choices remain available by scrolling when necessary. `release-tools/test-effort-picker-browser.cjs` uses actual desktop styles/cards and checks hit-testing/clicks for every effort at 1914×1028, 900×560 and 560×420, keyboard selection and Escape cleanup; it reproduced the old bug before passing after the fix. Shared/inline function parity prevents future drift. Tested in local Chromium, not yet on a live Windows/Mac app. Rebuild/replace the desktop app; an extension reload alone cannot update embedded desktop HTML.
