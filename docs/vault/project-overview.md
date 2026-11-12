---
title: Project overview
updated: 2026-10-26
---

**Current, 2026-11-11:** 1.24.32 is published (validation 42712015243, publish 42718408426). The next update, **1.24.33**, is built on `claude/plazcode-dev` from `development/1.24.33` (workflows `validate-1.24.33.yml` and `publish-1.24.33.yml`); not published. Start with `docs/NOW.md`. Version numbers further down are historical unless they say 1.24.33.

# What PlazCode is

A closed-source browser extension plus a Rust desktop app. It turns an AI chat website (ChatGPT, Claude, Notion AI, DeepSeek, Vani, Freebuff, OxAlpha and others) into an agent that works in Roblox Studio (engine "Roblox", `RS`) or on the user's computer (engine "AgentScript", `AS`).

## Where things live
- Private repo `stoveez/plazcode-source`: source overlay, build scripts, tests, release tooling.
- Public repo `stoveez/PlazCode`: only downloads and the update feeds (`latest.json`, `latest-macos.json`). Never edit it by hand.
- Working branch: `claude/plazcode-dev`. Release branch: `release/1.24.25`. See [releasing](releasing.md).

## Parts
- Extension: `core/`, `providers/`, `overlay.css`, `background.js`, `popup.*`. A fix here works by reloading the extension.
- Desktop app: `agent/` (Rust). Its screen is `agent/src/desktop.html`. A fix here needs the app replaced.
- Vault memory: [vault-memory](vault-memory.md).

## Version
1.24.25 = pinned official 1.24.20 source plus `development/1.24.25/overlay` (carries 1.24.21 through 1.24.24). Latest published: 1.24.25 (2026-10-26, screenshot display, task approvals, creator response diagnostics and red outdated/version-mismatch warnings). Next: 1.24.26 (accounts, code protection, Skill Workshop, Brickwire and remaining planned work).
