# NOW
Updated: 2026-10-28. Work directly on `claude/plazcode-dev`; no helper agents.

**Latest: canonical-source publication retry pinned.** Release branch now contains the Firefox LF correction and pins successful 40772509288 / a74ae17. Quick mode remains off, official downloads target unchanged; run packaged Mac gate before promotion/publication.

**All four canonical-source gates passed.** Run 40772509288 completed successfully on a74ae17802681c0ec30f5b5b6ee0547bead217d3, including the retried Windows Defender check. Refresh release branch and pins to this source; packaged Mac gate and publication remain required.

**Exact-source Windows retry completed.** Mac completed successfully in 40772509288 on a74ae17, joining browsers/Linux. Only failed Windows job restarted, preserving the same source and all scan requirements; failure was definition-update download, not detection. Wait for its retry to pass before pinning publication.

**Transient Windows Defender definition-update failure.** On a74ae17, run 40772509288 passed browsers/Linux and every Windows build/updater/installation check. Windows stopped at `Update-MpSignature` with definition-update errors BEFORE scanning; no detection occurred. Retry only the failed Windows job after Mac finishes (GitHub rejects rerun while this run is active). Do not skip scans or loosen gates.

**Firefox canonical-byte packaging correction.** All four validation jobs passed on 6891f46 (40765879729), and packaged Mac desktop lifetime/relaunch passed in publication 40771295797. Promotion stopped before public publication because Firefox Windows/Mac artifacts differ: builder used platform-dependent text writes before signing. Firefox manifest/install instructions now use explicit UTF-8 LF bytes before protection. Fresh full exact-source validation is required. Do not normalize already signed artifacts or weaken cross-platform equality.

**Publication:** nothing shipped; latest public release remains 1.24.25. Release branch 77e44b7 has OLD validation pins; update only after new validation succeeds, preserving all completed source/packaging checks and full Mac gate. Direct release authorized; no separate test build, no app signing, owner release-note format (1,250 chars).

**Scope:** signed program/update checks, conservative browser obfuscation, permanently retained encrypted private decoder maps, permanent per-tool Approve all across tasks/chats/AI sites. No required login/setup/online dependency; user skills/notes/settings editable. Production integrity secret/public key already configured.

**Visibility:** source PUBLIC during authorized build/publish window. Restore Private immediately after publication; owner authorized automatic changes, but API administration may return 403. The PC vault folder is not linked. See [open work](vault/open-work.md) and [code protection](vault/code-protection.md).
