# NOW
Updated: 2026-10-28. Branch `claude/plazcode-dev`; no helper agents.

**Latest: production integrity key provisioned inside GitHub Actions.** The private key is stored only in `PLAZCODE_RELEASE_SIGNING_KEY`; only the matching public key is committed. No private key is printed or included in an artifact. The private key is never written to the runner filesystem. Keep an owner backup in a password manager; never retrieve plaintext keys through chat.

**Next:** run all 1.24.26 release gates on this exact public-key commit, then publish using the owner's release-note format. No separate test build delivery. Normal users need no new login/setup; skills, notes and settings remain editable.

**Local checks:** 219 JS files and 213 native tests passed, plus optimized native signature/authenticated-work/Stop and Chromium/Firefox cryptography tests. Hosted Windows/Mac and installed-extension checks remain required.

**Visibility:** public build/publish window authorized; restore Private immediately afterward. The session's integration cannot edit repository visibility (403), so owner assistance may be required. Separate Windows PC vault folder is not linked. See [code protection](vault/code-protection.md) and [open work](vault/open-work.md).
