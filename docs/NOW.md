# NOW
Updated: 2026-10-31. Branch `claude/plazcode-dev`; no helper agents.

**WIP: owner authorized implementing the anti-copy plan for 1.24.30.** Initial release-variant/text-pack and seeded-scrambling code written; Node negative/layout tests passed, native compile/tests running. Packaging/CI/canaries not wired yet; do not ship this WIP. Work order: release variant/text pack, seeded text scrambling, independent canaries, release mark, packaging/CI/promotion, licence/takedown documents, full local/hosted checks and verified Drive test ZIPs. Stable remains 1.24.29; no stable publication authorized.

**Compatibility decisions:** derive the per-version variant from the existing signing key, so Windows/Mac/Linux match without a new secret. Store only hash/mark in reports. Existing update verifiers reject unknown signed-manifest fields, so put the mark in a separately signed program file inside core instead of changing the manifest schema. Keep updater scripts, feed URLs, user-data boundaries and Stop access unchanged.

**Existing source publication setting:** publish-1.24.30.yml already has PLAZCODE_PUBLISH_SOURCE=0 and SOURCE.txt says source is not published. Preserve this existing configuration; review/document licensing before any new change. The plan's separate source-publication decision is not authority to rewrite licences or retract prior GPL releases.

**Separate WIP c87bea2:** extension fail-closed review is already in the tree; owner has not decided to keep it. Do not silently claim it as completed anti-copy scope. Full suites remain required.

**Additional owner request (full design now in [vault/luau-validation-plan.md](vault/luau-validation-plan.md): staged edits, validate -> repair -> revalidate, max 2-3 repairs, syntax blocks, types/lint advisory, sourcemap from the Studio bridge):** Luau analysis through the local bridge (official luau-analyze, later luau-lsp/project sourcemaps, automatic validation). Owner confirmed all three stages in 1.24.30, with recommended syntax-blocking/type-and-lint-advisory policy. Do not execute AI-generated code for static checking. Existing CI already compiles Studio Skills with official luau-compile.

**Current 1.24.30 scope retained:** official Chromium installation pairing, Mac SecTranslocate startup fix, folder tidy, unchanged Ro-Engineer starter pack (MIT), JSONL logs/Logs page/plazcode_logs, bridge continuity/shared integrity passes, sealed prompt/Studio Skills text and antivirus-signal fixes. Previous full CI 41264335495 on 03a68a9 passed; its old ZIPs are not the new anti-copy build. See vault/anti-copy-plan.md, bridge-stability.md, code-protection.md and ui-upgrade-plan.md (UI work planned for 1.24.31).

**Delivery/rules:** actual feature previews immediately via Drive when applicable; full verified inner app/helper/browser test ZIPs via Drive. Work directly on this branch, push finished/WIP steps with NOW rewritten. Source Public only for build window, owner restores Private after delivery; account API stays Public separately. Current source Public status needs recheck before CI. No app signing, server dependency or end-user setup added. PC PlazCode-Vault is not connected.
