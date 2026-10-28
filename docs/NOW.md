# NOW
Updated: 2026-10-28. Branch `claude/plazcode-dev`; no helper agents.

**Latest: browser and Linux gates passed; decoder recovery checked.** Validation 40715893481 has green browser/Linux jobs; Windows/Mac continue. A real local encrypted-map round trip exercised private-record retention, both platform paths, no raw key/maps in the record and overwrite rejection using isolated ephemeral test trust. Production decryption is additionally required during promotion.

**Durable private decoder retention added to publication.** CI artifacts expire, so publication verifies real decryption outside the repo and stores only encrypted maps plus their checksum index in the private release record. Public downloads/source archives never include maps. Publication guard checks passed; final native validation continues unchanged.

**Full hosted browser gate passed.** Production validation 40715893481 on `d17badc` passed its complete browser job: protected Chromium/Firefox, screenshot policies, provider fixtures, languages and interface regressions. Windows/Mac/Linux native jobs are still running; no publication yet.

**Release notes finalized in the owner format.** Under 2,000 characters, triple-emphasis section titles, plain language and honest live-testing/signing limits. Publication remains gated on final validation 40715893481 (`d17badc`) and the packaged Mac lifetime check.

**Preserve valid read-only installations.** Integrity checks no longer require writing a migration marker after all files verify. A native regression exercises read-only installation roots; missing markers can restore only authenticated official bytes and never waive verification. Full release checks rerun on this compatibility fix.

**Publication handoff automation prepared.** Each automated source push now includes a fresh NOW; successful publication records milestones/open work and attempts the owner-authorized Private restore. The preceding source validation was `f1e928e` (40715015896); the final run must match this compatibility fix.

**Browser storage race fixed.** Hosted diagnostics identified rejected `rsChatEngines` autosaves escaping the synchronous catch. Best-effort autosaves now also catch asynchronous failures; the browser fixture forces that failure deterministically. Focused checks passed; final full release gates must rerun on this source.

**Production integrity key configured.** Owner added `PLAZCODE_RELEASE_SIGNING_KEY`; trusted bootstrap 40713055559 derived and committed only the public key in `6229d98`. No private key was exposed, written to runner files or uploaded. Do not ask for key setup again.

**1.24.26 scope:** original code protection plus signed file/update checks, native enforcement, conservative browser obfuscation/private encrypted maps and permanent per-tool Approve all across tasks/chats/AI sites. No app signing, required login or extra user setup; user skills/notes/settings remain editable. See [code protection](vault/code-protection.md).

**Local checks passed:** all 219 JS files, 213 native tests, optimized native signature/authentication/Stop/migration tests, Chromium/Firefox cryptography, preparation/locales/Ultra and promotion guards. The actual protected extension also passed hosted Chromium/Firefox checks in 40709317960.

**Current release check:** the hosted language fixture caught and diagnosed a storage-rejection race. The regression now forces chat-mode storage rejection while testing language persistence; final Windows/Mac/Linux/browser gates rerun on the fix. No separate test build is delivered. Publish only when all four gates and Mac lifetime check pass; use the existing ***bold*** release-note format under 2,000 characters.

**Visibility:** owner opened the temporary PUBLIC build/publish window and authorized automatic switching. Integration's repo-settings API returns 403; attempt the authorized restore and request owner help only if still denied. Restore Private after publication. PC vault folder is not connected.

**Latest published remains 1.24.25.** Other deferred feature plans are not part of this security release. Next: finish browser issue, validate exact source, pin successful SHA/run, publish and verify live feeds/packages, then record the handoff.
