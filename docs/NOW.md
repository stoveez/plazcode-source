# NOW
Updated: 2026-10-28. Branch `claude/plazcode-dev`; no helper agents.

**Latest finished step: Approve all now remembers the tool type across tasks, chats and AI sites.** It uses the saved Safety list, survives task reset and is removable there. Saved approvals apply in Plan Mode; plans themselves still need approval. Storage errors do not pretend persistence succeeded. Focused approval/feature-guide checks passed.

**WIP: 1.24.26 code protection, owner authorized.** Development overlay copied from released 1.24.25; existing 1.24.26 feature plans retained. No app signing, mandatory account, new setup/approval steps or online requirement. User skills, vault notes and settings stay editable. Design: [code protection](vault/code-protection.md).

**WIP security implementation:** signing, native/extension verification, authenticated update checks, CSP-safe obfuscation, encrypted private maps, legacy migration and staged rollback are implemented. Linux native suite: 213 passed; real Chromium/Firefox cryptography checks passed. The three outdated JS fixtures were fixed and passed targeted rechecks; all 219 JavaScript regression files passed the complete rerun. Optimized native signature/authenticated-work/Stop tests passed, including the no-setup older-browser fallback. Private billing blocked 40696596361; the public run 40703709421 started successfully, then was cancelled to avoid building with temporary validation keys. Its protected-browser fixture read the worker before initial imports finished; readiness waiting is now explicit. Windows/Mac/full-extension production gates remain pending.

**Final compatibility checks:** migration restores executable permissions, bootstrap data deduplicates shared browser assets, and packaging/promotion enforce the installed updater's 64 MiB limit. Migration and optimized native tests passed. Final review added explicit hashing of the running executable, including macOS copied/translocated apps; its final native/optimized rerun passed.

**Public/private build rule:** owner reaffirmed the temporary public build/publish window on 2026-10-28. Repo is now PUBLIC. Owner authorized the assistant to change visibility, but GitHub integration rejected the PATCH with 403; owner switched it manually. Restore Private after build/publish; attempt the authorized API change, then ask the owner only if token permissions still prevent it.

**Environment:** local Chromium blocks installed extensions by administrator policy; the unchanged 1.24.25 extension fails too. CI requires installed-extension validation. No workaround or policy changes.

**Key setup blocker:** integration API and the existing publisher token both reject source-secret management (403; bootstrap run 40705538648 failed before key generation). Owner must add one private integrity seed/PEM as `PLAZCODE_RELEASE_SIGNING_KEY` in repository Actions secrets. Built-in PowerShell instructions are ready in [code protection](vault/code-protection.md); no Node/Git install is needed. Never paste the secret in chat. A trusted bootstrap job then commits only its derived public key and NOW.

**Release blockers:** The repo is now public and hosted runners start; private billing previously blocked run 40696596361. GitHub also denies this session access to Actions secrets (403). Protected production builds require a private release key in a secret and matching pinned public key. Never ship a test key or disable verification.

**Latest published: 1.24.25.** Validation 40362663766 on `810676d`; publish 40368356121. Original affected Studio/account behavior remains unverified. Accounts, Workshop, Brickwire and other deferred work stay planned, outside this job.

**Repo PUBLIC for the authorized release window (owner changed it).** No release yet; restore Private immediately after the build/publish finishes. Separate Windows `PlazCode-Vault` folder is inaccessible to this cloud session. See [open work](vault/open-work.md).
