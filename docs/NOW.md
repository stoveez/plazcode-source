# NOW
Updated: 2026-10-28. Branch `claude/plazcode-dev`; no helper agents.

**Latest finished step: Approve all now remembers the tool type across tasks, chats and AI sites.** It uses the saved Safety list, survives task reset and is removable there. Saved approvals apply in Plan Mode; plans themselves still need approval. Storage errors do not pretend persistence succeeded. Focused approval/feature-guide checks passed.

**WIP: 1.24.26 code protection, owner authorized.** Development overlay copied from released 1.24.25; existing 1.24.26 feature plans retained. No app signing, mandatory account, new setup/approval steps or online requirement. User skills, vault notes and settings stay editable. Design: [code protection](vault/code-protection.md).

**Next:** implement signed file manifests, native/extension verification, signed updates, conservative obfuscation/private maps and loopback hardening. Test normal use and tampering on every platform. No security feature is complete yet.

**Setup blocker:** GitHub denies this session access to Actions secrets (403). Protected production builds require a private release key in a secret and matching pinned public key. Never ship a test key or disable verification.

**Latest published: 1.24.25.** Validation 40362663766 on `810676d`; publish 40368356121. Original affected Studio/account behavior remains unverified. Accounts, Workshop, Brickwire and other deferred work stay planned, outside this job.

**Repo private verified 2026-10-28.** No new release or visibility changes. Separate Windows `PlazCode-Vault` folder is inaccessible to this cloud session. See [open work](vault/open-work.md).
