# NOW
Updated: 2026-10-28. Branch `claude/plazcode-dev`; no helper agents.

**Latest finished step: Approve all now remembers the tool type across tasks, chats and AI sites.** It uses the saved Safety list, survives task reset and is removable there. Saved approvals apply in Plan Mode; plans themselves still need approval. Storage errors do not pretend persistence succeeded. Focused approval/feature-guide checks passed.

**WIP: 1.24.26 code protection, owner authorized.** Development overlay copied from released 1.24.25; existing 1.24.26 feature plans retained. No app signing, mandatory account, new setup/approval steps or online requirement. User skills, vault notes and settings stay editable. Design: [code protection](vault/code-protection.md).

**WIP security implementation:** signing, native/extension verification, authenticated update checks, CSP-safe obfuscation, encrypted private maps, legacy migration and staged rollback are implemented. Linux native suite: 213 passed; real Chromium/Firefox cryptography checks passed. The three outdated JS fixtures were fixed and passed targeted rechecks; all 219 JavaScript regression files passed the complete rerun. Optimized native signature/authenticated-work/Stop tests passed, including the no-setup older-browser fallback. Hosted Windows/Mac/full-extension gates remain blocked by Actions billing (run 40696596361 did not start any jobs).

**Final compatibility checks:** migration restores executable permissions, bootstrap data deduplicates shared browser assets, and packaging/promotion enforce the installed updater's 64 MiB limit. Native rerun for these migration changes is in progress.

**Environment:** local Chromium blocks installed extensions by administrator policy; the unchanged 1.24.25 extension fails too. CI requires installed-extension validation. No workaround or policy changes.

**Release blockers:** GitHub billing/spending limits prevented all hosted jobs from starting. GitHub also denies this session access to Actions secrets (403). Protected production builds require a private release key in a secret and matching pinned public key. Never ship a test key or disable verification.

**Latest published: 1.24.25.** Validation 40362663766 on `810676d`; publish 40368356121. Original affected Studio/account behavior remains unverified. Accounts, Workshop, Brickwire and other deferred work stay planned, outside this job.

**Repo private verified 2026-10-28.** No new release or visibility changes. Separate Windows `PlazCode-Vault` folder is inaccessible to this cloud session. See [open work](vault/open-work.md).
