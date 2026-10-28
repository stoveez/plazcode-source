# NOW
Updated: 2026-10-28. Publication branch `release/1.24.26-publish`; no helper agents.

**Latest: loader provenance newline correction in promotion only.** All four validation gates passed on a74ae17 in 40772509288. Packaged Mac gate passed in 40779688114; Firefox packages now match after the builder fix. Promotion stopped BEFORE publication at protection.js source-hash comparison: packaging reads the Windows CRLF checkout template, while prepared source is LF. Promotion now recognizes only these exact newline-equivalent loader inputs with the pinned public key/release channel. Signed output byte hashes, signatures, cross-platform bytes and exact-source checks remain unchanged. Focused regressions exercise LF/CRLF and reject edited code, wrong key and changed hashes.

**Next:** retry publication with the SAME validated source/run, full packaged Mac gate and owner-formatted release notes. Nothing published; latest public is 1.24.25. No app signing, separate test delivery or extra user setup. Private integrity secret/public key already configured; never ask for it again.

**Handoff:** after success verify live signed feeds/download, record NOW/open work/milestones, merge publication/main back into dev while retaining exact source. Source is PUBLIC temporarily; owner authorized automatic Private restore, API administration may return 403. Separate PC vault is not linked.
