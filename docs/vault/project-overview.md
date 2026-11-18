---
title: Project overview
updated: 2026-10-26
---

**Current, 2026-11-18:** 1.24.33 is published. **1.24.34** is being released from `development/1.24.34` on `claude/plazcode-dev` (workflows `validate-1.24.34.yml` / `publish-1.24.34.yml`). See [../NOW.md](../NOW.md).

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
