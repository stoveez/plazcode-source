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

**Production key configured:** owner added the private integrity secret; bootstrap 40713055559 derived only the public key in commit `6229d98`. Never request or expose the private value. Validation keys are forbidden in releases. Owner opened the temporary public release window and authorized the assistant to restore Private afterward; API administration access remains restricted.

## Compatibility and release boundaries
Chrome 111-136 can ask an extension-origin-only native endpoint to verify signed public metadata when WebCrypto lacks Ed25519. File hashes still run in the extension. The endpoint has no tool dispatch, filesystem access or private credentials, and requires the pinned key/version/channel; no new account or pairing step.

Native signatures live inside `PlazCode-Extension`, which old installers already replace. A signed bootstrap restores skipped legacy mirrors on the first launch of each new version, without touching user data. After migration, changed program files block work; Stop and recovery/update controls remain available. The bootstrap itself is authenticated before any repair. The migration marker is best-effort after successful verification so valid read-only installation folders require no new permissions; absence of a marker never bypasses authentication. A removed migration marker can only restore official signed bytes, never authorize arbitrary edits. The running executable is hashed too, including when macOS resolves its installation from a copied/translocated app. Bootstrap blobs deduplicate shared assets, retain signed executable permissions, and every native ZIP must fit existing clients' 64 MiB limit.

Decoder maps are AES-256-GCM encrypted using a key derived from the private release key; only ciphertext reaches build artifacts. Publication checks real decryption in a temporary directory and retains both platforms' encrypted maps and checksum index permanently in the private `release-validation-<version>` record, since CI artifacts expire. They never enter public downloads or source archives. Private maps and signing keys stay outside packages and source archives. CI uses explicit ephemeral validation keys when production trust is absent; promotion rejects those artifacts. New workflow actions are pinned to immutable commits.

## Maintainer key setup (not an end-user step)
The integration and the existing publishing token both lack source-repository secret-management permission (403 confirmed in run 40705538648). Publishing permission does not grant those API scopes. Add one free integrity secret through GitHub's owner settings:

1. In Windows PowerShell, generate a private random seed straight to the clipboard, without printing it:

```powershell
$plazcodeKeyBytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($plazcodeKeyBytes)
Set-Clipboard -Value ("ed25519-seed:" + (($plazcodeKeyBytes | ForEach-Object { $_.ToString("x2") }) -join ""))
```

2. Open https://github.com/stoveez/plazcode-source/settings/secrets/actions/new . Name the secret `PLAZCODE_RELEASE_SIGNING_KEY` and paste the clipboard value. Keep a private backup in a password manager. Never paste the value in chat or commit it.
3. The assistant dispatches `validate-1.24.26.yml` with `bootstrap_integrity_key=true`. This reads the secret only inside the trusted GitHub job, derives and commits ONLY its public key, then the assistant runs the full production release gates. The job cannot rotate an established public key automatically. No private key is printed, written to a runner file or uploaded.

The original trusted-PC alternative remains available: `node development/1.24.26/protection.mjs provision <absolute-private-backup-path-outside-repo>` with authenticated GitHub CLI secret permissions. Both standard Ed25519 PKCS8 PEM and the explicitly labeled random seed are accepted. All signing and decoder-map encryption uses the same resulting private key.

Before key setup, explicit validation keys are suitable only for internal checks. They cannot be published. No protected release has shipped; Windows/Mac and installed-extension gates are still required. No separate test-build delivery (owner instruction).
