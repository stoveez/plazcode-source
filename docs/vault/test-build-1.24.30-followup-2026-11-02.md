---
title: Full follow-up test ZIPs after guest delivery
updated: 2026-11-02
---
# Windows and universal Mac follow-up test ZIPs
Owner explicitly asked to build the test ZIPs. Earlier attempt could not launch because the execution workspace went offline; no run was started. Workspace is now connected again, clean branch claude/plazcode-dev at 3292a09, final runtime source e1236e0 (overlay diff empty).

Build full validate-1.24.30.yml on this branch, no browser-only/key-bootstrap inputs. All required Windows/Mac/Linux/browser/release gate jobs must pass. All 249 JS checks will run in CI with the corrected fixtures. No stable publication/version/feed changes. Source stays Public only for the build window; never change visibility yourself; remind Private immediately after delivering both ZIPs.

Include guest/signup recovery, DeepSeek startup-warning fix, cross-site continuation and latest live readiness/instruction loading/ChatGPT retained-result and compact startup fixes. Existing guest ZIPs from 52b9d19 do not contain those later fixes.

When green: download exact inner Windows/macOS test-lean ZIPs; verify wrapper SHA/size/CRC/paths, production signatures, current reviewed source hashes in all extension copies, guest native presence/both Mac CPU slices, SHA256SUMS and zero file-list delta against actual published 1.24.30 ZIPs. No source ZIPs or unsigned extension patch. Upload through Drive and read back name/MIME/size before delivery. Runtime source unchanged, tests only; no live original PC/account or startup timing claim. PC vault folder not connected.
