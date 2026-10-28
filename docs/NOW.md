# NOW
Updated: 2026-10-28. Work directly on `claude/plazcode-dev`; no helper agents.

**Latest: Firefox canonical-byte packaging correction.** All four validation jobs passed on 6891f46 (40765879729), and packaged Mac desktop lifetime/relaunch passed in publication 40771295797. Promotion stopped before public publication because Firefox Windows/Mac artifacts differ: builder used platform-dependent text writes before signing. Firefox manifest/install instructions now use explicit UTF-8 LF bytes before protection. Fresh full exact-source validation is required. Do not normalize already signed artifacts or weaken cross-platform equality.

**Publication:** nothing shipped; latest public release remains 1.24.25. Release branch 77e44b7 has OLD validation pins; update only after new validation succeeds, preserving all completed source/packaging checks and full Mac gate. Direct release authorized; no separate test build, no app signing, owner release-note format (1,250 chars).

**Scope:** signed program/update checks, conservative browser obfuscation, permanently retained encrypted private decoder maps, permanent per-tool Approve all across tasks/chats/AI sites. No required login/setup/online dependency; user skills/notes/settings editable. Production integrity secret/public key already configured.

**Visibility:** source PUBLIC during authorized build/publish window. Restore Private immediately after publication; owner authorized automatic changes, but API administration may return 403. The PC vault folder is not linked. See [open work](vault/open-work.md) and [code protection](vault/code-protection.md).
