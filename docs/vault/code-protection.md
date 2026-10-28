---
title: Code protection without extra user steps
updated: 2026-10-28
---
# Code protection

Owner authorized the original 1.24.26 protection plan plus signed manifests, verified updates and bridge hardening on 2026-10-28. No app signing, mandatory account, new setup/approval steps or online dependency. Preserve normal installs, offline use, automatic pairing, updates, browser reloads and editable user skills, notes and settings.

- Conservatively obfuscate Chromium and Firefox program JavaScript at packaging time; private decoder maps stay outside downloads.
- Ed25519-signed SHA256 manifests verified against a pinned public key. The private key never ships or enters the source repo/logs/public artifacts.
- Native verification before bridge startup and sensitive work. Modified signed program files block execution with an official-download message. User data is outside the signed set.
- Signed version/platform/archive-digest statements before update installation. Preserve safe extraction, backup, rollback and relaunch; no feed address changes or unsigned fallback for protected clients.
- Authenticated loopback requests and authority/origin validation. No new server/login dependency; never trust browser claims as native authorization.
- Local checks deter tampering; a device owner can patch a verifier. Never promise unbreakable protection.

Implementation lives in `development/1.24.26/overlay`. Production and test packages must share the same protection path, with normal and negative tests across platforms/browsers.

**Setup blocker:** GitHub denies this session access to Actions secrets (403). Production requires a maintainer-provisioned private release key and matching pinned public key. Never ship a validation key or silently disable verification. Repo was verified private on 2026-10-28; never change visibility automatically.

## Compatibility and release boundaries
Native signatures live inside `PlazCode-Extension`, which old installers already replace. A signed bootstrap restores skipped legacy mirrors on the first launch of each new version, without touching user data. After migration, changed program files block work; Stop and recovery/update controls remain available. The bootstrap itself is authenticated before any repair. A removed migration marker can only restore official signed bytes, never authorize arbitrary edits.

Decoder maps are AES-256-GCM encrypted using a key derived from the private release key; only ciphertext reaches build artifacts. Private maps and signing keys stay outside packages and source archives. CI uses explicit ephemeral validation keys when production trust is absent; promotion rejects those artifacts. New workflow actions are pinned to immutable commits.

## Maintainer key setup (not an end-user step)
On a trusted machine, in a current `claude/plazcode-dev` checkout with Node and authenticated GitHub CLI access to Actions secrets, run:

```powershell
node development/1.24.26/protection.mjs provision "$env:USERPROFILE\plazcode-release-key.pem"
```

The command generates an Ed25519 key, saves a private backup outside the repo, puts the private key in the `PLAZCODE_RELEASE_SIGNING_KEY` Actions secret, and writes ONLY the public key to `development/1.24.26/overlay/release-public-key.hex`. Keep the backup private; do not upload or paste it. Commit the public key with NOW, then rerun all platform gates. Do not replace an established production key without a rotation plan.

Before production key setup, tests can use the explicit validation channel. This is not a releasable update. No protected build or release has shipped; Windows/Mac and installed-extension gates are still required.

