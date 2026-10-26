---
title: Project overview
updated: 2026-10-24
---
# What PlazCode is

A closed-source browser extension plus a Rust desktop app. It turns an AI chat website (ChatGPT, Claude, Notion AI, DeepSeek, Vani, Freebuff, OxAlpha and others) into an agent that works in Roblox Studio (engine "Roblox", `RS`) or on the user's computer (engine "AgentScript", `AS`).

## Where things live
- Private repo `stoveez/plazcode-source`: source overlay, build scripts, tests, release tooling.
- Public repo `stoveez/PlazCode`: only downloads and the update feeds (`latest.json`, `latest-macos.json`). Never edit it by hand.
- Working branch: `claude/plazcode-dev`. Release branch: `release/1.24.24`. See [releasing](releasing.md).

## Parts
- Extension: `core/`, `providers/`, `overlay.css`, `background.js`, `popup.*`. A fix here works by reloading the extension.
- Desktop app: `agent/` (Rust). Its screen is `agent/src/desktop.html`. A fix here needs the app replaced.
- Vault memory: [vault-memory](vault-memory.md).

## Version
1.24.24 = pinned official 1.24.20 source plus the overlay in `development/1.24.24/overlay` (carries 1.24.21 to 1.24.23). Latest published: 1.24.24 (2026-10-26, input-limit error and usage fix). Next: 1.24.25 (accounts, code protection, Skill Workshop, Brickwire).
