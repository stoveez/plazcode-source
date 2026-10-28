# NOW
Updated: 2026-10-28. Work directly on `claude/plazcode-dev`; no helper agents.

**Latest: updater-handoff fixture corrected.** Validation 40715893481 passed browser/Linux and compiled Windows/universal Mac, but both platform handoff fixtures tried feeding released 1.24.25 to unreleased 1.24.26. The new production anti-downgrade guard correctly refused it. The separately compiled debug fixture now uses the current published version; real release binaries, production guards and sources are restored unchanged. Full validation must rerun.

**Scope:** 1.24.26 signed file/update checks, browser obfuscation, durable encrypted private decoder maps and permanent per-tool approvals across tasks/chats/AI sites. No app signing, required login, extra user setup or separate test-build delivery. User data/offline use retained. Production integrity secret and public key configured; never ask for the key.

**Release:** not published. Final notes use the owner format (1,250 characters). Publication pins remain unset until exact-source validation passes; packaged Mac lifetime gate also required.

**Visibility:** source remains PUBLIC during the authorized build window. Restore Private after publication; owner authorized automatic restore, but administration API previously returned 403. PC vault is not linked. See [open work](vault/open-work.md) and [code protection](vault/code-protection.md).
