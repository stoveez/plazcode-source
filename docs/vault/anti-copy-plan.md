---
title: Anti-copy plan (per-release variation + takedowns), 1.24.30
updated: 2026-10-31
---
# Anti-copy plan: owner chose "per-release variation" + "takedowns" (2026-10-31)

**Status (2026-11-01): implementation and documents complete; final validation pending.** Node variant/protection/1,066-output tests pass; configured-variant native suite passes 268 + 5; optimized signed-app integration passes (foreign variant/tamper refusal, Stop and ordinary use preserved). Full JS suite running. Final Mac alias-path adjustment needs recompile/hosted checks. Licence review found retained GPL terms/source-publication mismatch; no licence changes or takedowns sent. Everything below is the agreed scope. Commit `c87bea2` (a separate small WIP) is not part of it. Work on branch `claude/plazcode-dev` in `development/1.24.30/overlay` (never edit `build-src-1.24.30`; run `python3 development/1.24.30/prepare.py` to regenerate it). Follow the owner's rules in CLAUDE.md (plan mode first: inspect, plan, then change; no Co-Authored-By lines; no publishing without a clear yes; repo visibility is the owner's to change).

## Why (what protection can and cannot do)
- Protection = an edited extension stops working with the app, and an extension loaded from any other folder is never paired (`security.rs`, `integrity.rs`, `text_pack.rs`). It does NOT stop editing, and does NOT stop someone who patches `PlazCode.exe` (unsigned, nothing outside the program checks it).
- Owner decision: **do not** use a server (owner said ignore hosting/cost; a server cannot hide text that is typed into the chat box or code that runs in Studio anyway), **do not** pack/virtualize the exe (it raises antivirus false positives, the very problem fixed in 1.24.30), **do not** buy code signing (costs money). Chosen: make each release different so a patch written for one version breaks on the next, and prepare takedowns.
- Past releases up to 1.24.29 are public GPL with source zips; they cannot be recalled. This plan only affects new versions.

## Owner's answers (AskUserQuestion, 2026-10-31)
1. Version: **1.24.30** (not 1.24.31). One more CI build before the test zips go out.
2. What varies each release (all three recommended): **sealed-file key and layout**, **self-check spots**, **scrambled-text keys**. NOT chosen: renaming extension files (touches updater and Firefox copy; do not do it).
3. Tracing copies: **hidden per-release mark** only (no user data, nothing sent anywhere, no behaviour change). NOT chosen: per-account marks.
4. Takedown side, all three: **takedown notice template**, **license and branding review**, **stop publishing source zips** (needs the owner's clear "yes" again before changing release tooling; ask when you reach it).

## Part A: per-release variation (code)
Hard rules: Windows and Mac startup unchanged, updater untouched (`Update-PlazCode.ps1`, `.command`, feeds, URLs), behaviour identical, startup time and size stay low, no new plain-text command names in the exe (CI `test-exe-av-signals.py` forbids them), JS output must stay byte-identical (`test-text-pack.mjs` proves 1066 outputs).

### A1. Sealed text file: key and layout per release
- Today: `core/text-pack.bin` = "PCTP1" | 12-byte nonce | AES-256-GCM(gzip(JSON)) | 16-byte tag. Key = SHA-256("PlazCode text pack v1\n" + SALT + "\n" + version). SALT is one constant in `protection.mjs` (`TEXT_PACK_SALT`) AND `agent/src/text_pack.rs` (`SALT`). Served by `GET /api/text-pack` only through the pairing check; loaded by `core/text-pack.js`.
- Change: derive a per-release value from a build-time secret/nonce that is generated during packaging and compiled into the exe, instead of one fixed SALT shared by every version. Options (pick the simplest that keeps both sides identical): (a) packaging reads a per-release salt from an env/secret and writes it into a generated Rust file (`include!`/`env!` at compile time) AND uses it for sealing; (b) derive from the release's already-signed values (version + channel + the Ed25519 public key bytes) plus a per-release random "release tag" stored in the signed installation manifest. Pick (a) or (b), then:
  - vary the container too: magic bytes (`PCTP1` -> derived per release), field order, optional padding; the app and `protection.mjs` must agree (`openTextPack`, `sealTextPack`, `text_pack::open`).
  - keep dev/test builds working: when no per-release value is configured (unpackaged dev, cargo tests) fall back to a fixed test value so `cargo test` and `test-text-pack.mjs` still run.
  - never put a secret in files or chat; the public key and version are already public. The per-release value ends up in the exe regardless (a patcher can read it); the goal is only that a tool written for version N fails on N+1.
- Tests to add/adjust: `text_pack.rs` unit tests (a pack sealed with another release's value is refused), `test-text-pack.mjs` (packaged mode still identical), `test-release-verifier.mjs` (signed Linux e2e still serves the pack to the official ID).

### A2. Self-check spots per release
- Today the exe checks files in: startup (`integrity::verify_installation` in `main.rs`), every work request (`integrity::check_work`, middleware `track_tool_activity`, legacy WS handler in `handle_legacy_ws`, browser WS `check_work` before payload), pairing (`security.rs` official extension IDs), text-pack serve. All call one function, so a patch to that function disables all of them.
- Change: add a few independent, differently-shaped re-checks that do not call the same function, and make their arrangement depend on a per-release value: e.g. (1) a cheap re-check of the exe's own embedded manifest hash/version consistency at different request types, (2) a check that `core/text-pack.bin` opens (already implicit), (3) a tiny canary comparison between the version compiled into the exe and the signed manifest. Use the existing `hidden.rs` tools (`hidden!`, `fnv`, `one_of`) so no new plain strings appear. Order/placement selected at build time from the per-release value (a `const` array chosen by the packaging step, or by a `build.rs` reading the same value as A1).
- Constraints: must not slow normal commands (work check already shares a pass for 10 s and compares size+mtime in between; keep that). Stop must stay available when a check fails. Failing checks must give the existing recovery message (`integrity::RECOVERY`), never crash.
- Tests: Rust unit tests per check; `test-release-verifier.mjs` tamper case (edit `core/main.js` after startup -> 409, Stop 200) must still pass; add a case for each new check.

### A3. Scrambled-text keys per release
- Today `hidden.rs`: `hidden!("text")` XORs with `key(i,len)` (fixed constants) at compile time; `fnv(name)` fingerprints are fixed FNV-1a. A scanner written once finds them in every version.
- Change: mix a per-release 64-bit seed into `key()` and `fnv` (seed provided at compile time, e.g. `option_env!("PLAZCODE_RELEASE_SEED")` or a generated const; default fixed value for dev/tests). All `const { fnv("x") }` call sites and the `LOCAL_READ` list must use the same seeded function so dispatch tables stay consistent (they already go through `hidden::fnv`).
- Careful: `fnv` values are compared at runtime with `fnv(name)` of the incoming tool name, so the seed must be identical in the const and runtime paths (same function, same const). Add a test that seed A and seed B give different scrambled bytes but the same behaviour. Keep `test-exe-av-signals.py` green (no command names as plain text).
- Where the seed comes from: packaging step generates a random seed per release, exports it to the Rust build (env var read by `build.rs` or `option_env!`), and records only a hash of it in the release check report. Do NOT store the seed in the repo or notes.

### A4. Hidden per-release mark (tracing)
- Add a short value derived per release (e.g. first 8 bytes of SHA-256(version + release seed)) embedded in places a casual rebrander will not touch: the sealed pack's padding bytes, a defaulted unused field in the signed manifest, and the compiled exe. Nothing is sent anywhere; no user data; no behaviour change.
- Record the mark -> version table in the private repo only (docs/vault, no secrets: the mark is not a key). A takedown can then say which release a copy came from.
- Test: a unit test that two releases give different marks and the same release always gives the same.

### A5. Build/CI wiring
- `protection.mjs` / `package.py` / `promote.py` / workflows (`validate-1.24.30.yml`, `publish-1.24.30.yml`): generate the seed, pass it to cargo, to `sealTextPack`, and to the release-check report (hash only). The test zip and the real update zip must stay 1:1. The `release-check.py` report should list "per-release variation: ok" and the mark.
- Rebuild order matters: seed -> cargo release build -> seal pack (needs the same seed) -> sign (existing order). Do not reorder signing steps; read `promote.py` and `development/1.24.30/protection.mjs` first.
- Windows CI must still pass `test-exe-av-signals.py`, the Defender check and the real signed update test; Mac job must still pass.

## Part B: takedowns and licence (documents, plus one release-tooling change)
1. **Takedown notice template** (plain words, in the vault, e.g. `docs/vault/takedown-template.md`): who the owner is (stoveez, no email in files), what is copied, the official source of truth (public repo `stoveez/PlazCode`, release names), how to identify a copy (the per-release mark from A4, the signed file lists, the exact strings/layout), what to request (removal), and where to send it (GitHub DMCA form, the host of any other site). State clearly it is not legal advice and the owner sends it themselves. Never include the owner's email.
2. **Licence and branding review**: read `LICENSE`, `BRANDING-NOTICE.txt`, `README.md`, `SOURCE.txt`, `THIRD-PARTY-NOTICES.txt` in the built package and `development/1.24.30/overlay`. List: what they say about copying/rebranding, what third-party parts force (Ultra with SyphoDev's permission, Ro-Engineer MIT, Brickwire MIT, GPL items that must not be copied), what changes if source zips stop, and gaps. Past releases stay GPL and cannot be revoked; a lawyer should confirm before any licence change. Write findings in a vault note; do not change licence text without the owner's clear yes.
3. **Stop publishing source zips (needs the owner's clear "yes" again before you change it)**: the places: `development/1.24.30/promote.py` (line ~336 `PlazCode-source-{VERSION}.zip` in `packages`, SOURCE_INPUTS, line ~49 old source name), `development/1.24.30/package.py` (builds `PlazCode-source-1.24.30-development.zip`), `publish_release.py` (`PLAZCODE_PUBLISH_SOURCE` env, default '1' adds the source zip to the release assets; setting it to '0' stops it), `.github/workflows/publish-1.24.30.yml` (the `git add ... PlazCode-source-1.24.30.zip` line), `SOURCE.txt` inside the packages and the release notes wording. Do not touch the updater feeds, `latest.json`, `latest-macos.json`, or any download URL. Keep old versions' source zips as they are (cannot be recalled). Update `docs/vault/releasing.md`, `release-format.md`, `new-version-checklist.md` and the new-version checklist test expectations.

## Order of work
1. Read: `docs/NOW.md`, `docs/vault/code-protection.md`, `bridge-stability.md`, this note; code: `agent/src/hidden.rs`, `text_pack.rs`, `integrity.rs`, `security.rs`, `main.rs` (grep `check_work`, `set_official_extension_ids`), `development/1.24.30/protection.mjs`, `package.py`, `promote.py`, `.github/workflows/validate-1.24.30.yml`.
2. Plan in plan mode, ask the owner anything unclear (AskUserQuestion with recommended answers).
3. A1 -> A3 -> A2 -> A4 -> A5 (each with tests), push to `claude/plazcode-dev` after each finished step, tell the owner branch + short commit + one line.
4. Part B documents; ask for the "yes" before changing release tooling (B3).
5. Full local suites (`cargo test --locked` from `build-src-1.24.30/PlazCode/agent`, the JS suite `release-tools/test-javascript.py`, text pack, Logs page, py suites, signed Linux e2e `test-release-verifier.mjs` with the validation key), then CI on the branch, then the two lean test zips.
6. Update `docs/NOW.md`, `docs/vault/open-work.md`, `code-protection.md`, `decisions.md`, `how-we-work.md` if rules change, plus a line in `development/1.24.30/release-entry.json` (keep GitHub body under 2,000 characters).

## Open items that are NOT part of this plan
- The "stop if the extension's checker is missing" change in `background.js`/`protection.mjs` (commit `c87bea2`, WIP, full JS suite not run, owner not yet decided to keep it). Judge it separately; it keeps the 5-minute background re-check and exempts Stop/status.
- Test zips for 1.24.30 are NOT delivered: CI run 41264335495 (source `03a68a9`) passed all jobs, but this cloud session cannot download the build files and had no Drive connector. Deliver via the connected GitHub artifact tool + Google Drive (see `test-builds.md`) in a session that has them; owner must restore the source repo to Private (settings link in CLAUDE.md).
- The review ZIP from another AI (`PlazCode-1_24_30-protection-review.zip`): its `background.js`/`protection.js` changes undo the background re-check and gate Stop; only the "fail closed" ideas were kept.

## Final implementation decisions (supersede proposed details above)
- Deterministic per-version/channel seed derived from the existing Ed25519 key using HKDF; generated only in the build environment, same across platforms. No new maintainer secret. Unpackaged tests use the documented zero fallback; package.py refuses it.
- Descriptor/mark is a separate signed `core/release-variant.json` rather than an extra manifest field: older updaters reject unknown manifest fields. Generic signature/ZIP verification and updater scripts remain unchanged. Native descriptor must equal packager descriptor; promotion/release report require three matching platform descriptors.
- Independent checks validate the signed running-executable fingerprint, a seeded selected program fingerprint/compiled release record, and authenticated pack contents. Seed/request-dependent order. Separate caches hold passes for at most 10 seconds with stamps taken before verification; failures never reused. Generic updater verification remains independent of current-release canaries.
- More obfuscation (owner, 2026-11-01): shorten private function names as well as local variables; keep top-level globals, classes/error names and object properties stable. No eval, string-code execution, property mangling or control-flow flattening. Decoder maps remain encrypted/private.
- Source ZIP publication was already disabled in the existing workflow; this implementation does not change that setting. See license-and-branding-review.md before an external release. Existing GPL releases and notices retained.
- Takedown document is a template only; owner reviews factual rights/licence claims and submits it. Matching marks are provenance evidence, not proof of infringement. See release-marks.md.
