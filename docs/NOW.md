# NOW
Updated: 2026-10-28. Work directly on `claude/plazcode-dev`; no helper agents.

**Latest: authorized publication pinned.** Release branch `release/1.24.26-publish` pins successful validation 40765879729 on 6891f46, with quick mode disabled. Publish only through the workflow; packaged Mac lifetime, immutable promotion and signed feeds remain required.

**All four exact-source release gates passed.** Validation 40765879729 completed successfully on `6891f461d09be0832d92c52c12ee71e57958962c`: Windows, universal Mac, Linux and browsers. Both platform updater handoff checks and protected packaging passed. Next: pin this run for the authorized 1.24.26 publication, run packaged Mac lifetime gate, publish and verify live downloads, then restore Private. No separate test-build delivery.

**Complete browser gate passed on preceding source.** Run 40762506114 on `2f775f0` passed all browser checks including protected workers and languages. Three native jobs continue; updater handoff, packaging and packaged Mac lifetime still must pass. No publication.

**Protected-browser fixture race diagnosed and fixed.** Browser-only run 40761757580 exposed `setTimeout is not defined` because Playwright announces worker contexts before browser timer globals exist. Readiness polling now runs in Node; actual extension initialization/signature verification stays mandatory. Full exact-source validation reruns with this fix and the updater debug-fixture correction. Nothing published yet.

**Updater-handoff fixture corrected.** Validation 40715893481 passed browser/Linux and compiled Windows/universal Mac, but both platform handoff fixtures tried feeding released 1.24.25 to unreleased 1.24.26. The new production anti-downgrade guard correctly refused it. The separately compiled debug fixture now uses the current published version; real release binaries, production guards and sources are restored unchanged. Full validation must rerun.

**Scope:** 1.24.26 signed file/update checks, browser obfuscation, durable encrypted private decoder maps and permanent per-tool approvals across tasks/chats/AI sites. No app signing, required login, extra user setup or separate test-build delivery. User data/offline use retained. Production integrity secret and public key configured; never ask for the key.

**Release:** not published. Final notes use the owner format (1,250 characters). Publication pins remain unset until exact-source validation passes; packaged Mac lifetime gate also required.

**Visibility:** source remains PUBLIC during the authorized build window. Restore Private after publication; owner authorized automatic restore, but administration API previously returned 403. PC vault is not linked. See [open work](vault/open-work.md) and [code protection](vault/code-protection.md).
