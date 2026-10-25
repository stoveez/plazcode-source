---
title: Desktop app layout, guides and website
updated: 2026-10-24
---
# Desktop app, guides and website

- **New layout:** top area bar, bold area name over its pages in the sidebar, Overview cards, Account placeholder, Appearance page (themes and custom look), startup intro that checks for updates. It lives in `agent/src/desktop.html` (CSS/JS blocks marked `nx`). The Discord link is `open:discord` in `agent/src/gui.rs`. Not yet tried in the real app on Windows or Mac.
- **Guides and Troubleshooting:** a top-bar area with search, picture cards, a reader and images. Guides are written in `guides/` (see `guides/README.md`) and posted to the public repo `guides/` folder only by the workflow `publish-guides.yml` (owner only; test first). The app reads `https://raw.githubusercontent.com/stoveez/PlazCode/main/guides/index.json`. An in-app posting editor is not built; the owner chose chat posting first, editor later with the login system.
- **Website:** `PlazCode-website.zip` (single `index.html`), not deployed. The owner will get a domain and host it on Cloudflare Pages.
- **Validation apps:** CI artifacts `plazcode-1.24.21-Windows-validation` (about 53 MB) and `plazcode-1.24.21-macOS-validation` (about 65 MB; most of it is the memory helper `engram`). Owners get the smaller `-test-lean` zips instead, see [test-builds](test-builds.md).
- Related: [vault-memory](vault-memory.md), [open-work](open-work.md).
