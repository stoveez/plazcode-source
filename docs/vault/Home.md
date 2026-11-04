---
title: Home
updated: 2026-11-03
---

2026-11-04: native absolute in-workspace paths, resolved-path echoes, read-only edit/write previews and E_ACCESS/E_MATCH/native E_COMMAND implemented. Full native307 PASS/2existing ignored; preview safety JS PASS. App replacement + extension reload needed. Full JS/hosted builds and remaining result/startup/memory changes pending.



2026-11-04 follow-up: shared batch normalization/stable shape errors, native-granted capability state and formatting-tolerance checks implemented; focused tests PASS. Native in-workspace absolute paths/read-only previews and remaining result/startup/memory audit still pending.



2026-11-04: owner requests ALL confirmed protocol gaps in next test build. Real ProseMirror line-preservation and DeepSeek Windows CRLF draft mismatch fixed/targeted tests PASS; CI41772418802 deliberately cancelled before delivery. Remaining audit/implementation: [shared protocol work](tool-protocol-audit-2026-11-04.md). No new ZIPs yet; full rerun/build pending.



## 2026-11-03 — ChatGPT responsive delivery under verification
Latest: saved-result recovery also fixes the confirmed call-five success → misleading nothing-executed retry → duplicate-read refusal; full-core dropped-handoff test PASS (15tools/16messages), guard unchanged. Runtime insertion/send fix f030f47; recovery follow-up in this commit.
Owner's fifteen-tool test stayed stuck; whole page freezes on startup/tools. Fixed multiline native editing bursts and composer-triggered transcript scans. A disabled-send/full-core fixture reproduced false confirmed delivery with zero sends before fix; ChatGPT now requires a new matching sent user message, clicks once and preserves newer drafts. Ten offline Chromium checks (including full fifteen-tool loop), healthy differential70/preservation967/protected34 PASS. Full suite/fresh CI/Drive test ZIPs still pending; no live ChatGPT preview available. [Current detail](chatgpt-responsive-delivery-2026-11-03.md). Extension reload + tab refresh enough; full apps still accompany delivery. No stable publish.


Latest Windows/Mac test ZIPs DELIVERED, fullCI41759762628 ALL GREEN and signed startup/tamper suite41762409720 PASS: [startup fix and downloads](windows-startup-integrity-2026-11-03.md) · [verification](windows-startup-integrity-2026-11-03-verification.json). Protection intact; owner field retest next.


Previous verified test ZIPs DELIVERED (fullCI41703669996 ALL GREEN; clean missing-UV Windows41707625110 PASS): [Blender + Ox Alpha proof/downloads](blender-oxalpha-2026-11-03-verification.json). [Blender fixes](blender-uv-path-2026-11-03.md) · [Ox Alpha Copy fix](oxalpha-copy-lock-2026-11-03.md).


Actual Blender preview delivered; original affected PC/live Ox Alpha need owner retest. Source still Public at delivery; restore Private reminder remains.

Follow-up test ZIPs verified/uploaded; full CI 41579556782 ALL GREEN: [Windows/Mac delivery and checks](test-build-1.24.30-followup-2026-11-02.md).

Previous delivery: [guest/signup replacement builds VERIFIED and DELIVERED](profile-creation-guest-2026-11-02-verification.json). [Feature and actual previews](profile-creation-guest-2026-11-02.md).

# PlazCode vault: start here

This folder is the long-term memory for every AI that works on PlazCode (Claude, Codex or any other). **Terms:** this folder is the *PlazCode vault* (notes for AIs that build PlazCode). The *native vault* is the app's own Memory feature, see the map. It is plain Markdown, so GitHub shows it and Obsidian can open it (open the folder `docs/vault` as a vault).

**Read order for a new AI:** [`../NOW.md`](../NOW.md) (the live handoff, 20 lines), then only the notes below that your task needs. Do not read the whole vault.
**Newest handoff (read first after NOW):** [handoff-1.24.30-2026-11-01-evening.md](handoff-1.24.30-2026-11-01-evening.md)

## Map
- Live startup readiness, instruction recovery and ChatGPT results (verified source fix): [startup/bridge/results](startup-bridge-and-results-2026-11-02.md)
- Continue project across AI websites (source fixed; full regression passed): [cross-site continuation](continuation-cross-site-2026-11-02.md)
- DeepSeek startup false warning (source fixed; not in current ZIPs): [startup warning](deepseek-startup-warning-2026-11-02.md)
- Bridge drops (extension ↔ app link): [bridge-stability](bridge-stability.md)
- Tool-call consistency and speed (DeepSeek DSML, helper results, sizes, gap between calls): [tool-call-consistency](tool-call-consistency.md)
- Profile pictures: [profile-pictures](profile-pictures.md)
- Native startup and sign-in polish: [startup-performance](startup-performance.md)
- Desktop profile sign-in: [desktop-profile-sign-in](desktop-profile-sign-in.md)
- 1.24.27 build verification: [test-build-1.24.27-verification](test-build-1.24.27-verification.json)
- Approval modes and bar placement: [approval-modes-and-bar](approval-modes-and-bar.md)
- Linux and Mac startup: [linux-and-mac-startup](linux-and-mac-startup.md)
- DeepSeek send pacing: [deepseek-send-pacing](deepseek-send-pacing.md)
- Code protection: [code-protection](code-protection.md)
- Release marks: [release-marks](release-marks.md)
- Licence/branding review: [license-and-branding-review](license-and-branding-review.md)
- Takedown template: [takedown-template](takedown-template.md)
- Luau validation plan (analyze_luau, luau-lsp, automatic validate/repair, planned): [luau-validation-plan](luau-validation-plan.md)
- Anti-copy plan (implemented, final validation pending): [anti-copy-plan](anti-copy-plan.md)
- How we work: [how-we-work](how-we-work.md)
- What PlazCode is: [project-overview](project-overview.md)
- Owner's rules: [owner-rules](owner-rules.md)
- Build and tests: [build-and-tests](build-and-tests.md)
- Test builds for the owner: [test-builds](test-builds.md)
- Publishing an update: [releasing](releasing.md)
- Release description wording and format: [release-format](release-format.md)
- Version number changes (1.24.22, ...): [new-version-checklist](new-version-checklist.md)
- Desktop layout, guides, website: [app-and-guides](app-and-guides.md)
- The app's own Memory feature, the "native vault": [vault-memory](vault-memory.md) and [native-vault-internals](native-vault-internals.md)
- Why things are the way they are: [decisions](decisions.md)
- What is finished: [milestones](milestones.md)
- What is still open: [open-work](open-work.md)

## Deeper documents (outside the vault)
[`../HANDOFF.md`](../HANDOFF.md), [`../MAINTAINER-GUIDE.md`](../MAINTAINER-GUIDE.md), [`../TASK-BOARD.md`](../TASK-BOARD.md), `development/1.24.27/NEXT-UPDATE-PLAN.md`, `development/1.24.25/VAULT-MEMORY-DESIGN.md`.
- [UI generation upgrade plan (1.24.31)](ui-upgrade-plan.md)

- [1.24.30 gap review](1.24.30-gap-review.md): current audit findings, remaining live checks and scope limits.
