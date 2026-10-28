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

Implementation/validation are unfinished. No protected build or release has shipped.
