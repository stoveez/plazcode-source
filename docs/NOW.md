# NOW
Updated: 2026-10-28. Branch `claude/plazcode-dev`; no helper agents.

**Latest: production integrity key configured.** Owner added `PLAZCODE_RELEASE_SIGNING_KEY`; trusted bootstrap 40713055559 derived and committed only the public key in `6229d98`. No private key was exposed, written to runner files or uploaded. Do not ask for key setup again.

**1.24.26 scope:** original code protection plus signed file/update checks, native enforcement, conservative browser obfuscation/private encrypted maps and permanent per-tool Approve all across tasks/chats/AI sites. No app signing, required login or extra user setup; user skills/notes/settings remain editable. See [code protection](vault/code-protection.md).

**Local checks passed:** all 219 JS files, 213 native tests, optimized native signature/authentication/Stop/migration tests, Chromium/Firefox cryptography, preparation/locales/Ultra and promotion guards. The actual protected extension also passed hosted Chromium/Firefox checks in 40709317960.

**Current release check:** the hosted language fixture caught a storage-rejection race. Local language checks pass; better diagnostics and a focused browser-only workflow are being run while the full production Windows/Mac/Linux/browser gates start on the configured key. No separate test build is delivered. Publish only when all four gates and Mac lifetime check pass; use the existing ***bold*** release-note format under 2,000 characters.

**Visibility:** owner opened the temporary PUBLIC build/publish window and authorized automatic switching. Integration's repo-settings API returns 403; attempt the authorized restore and request owner help only if still denied. Restore Private after publication. PC vault folder is not connected.

**Latest published remains 1.24.25.** Other deferred feature plans are not part of this security release. Next: finish browser issue, validate exact source, pin successful SHA/run, publish and verify live feeds/packages, then record the handoff.
