# 1.24.30 handoff — 2026-11-01

The owner is handing this back to Claude because Codex usage is low. Coding is pushed; **final CI, archive verification and test-ZIP delivery are unfinished**. Do not repeat the entire audit or publish stable.

## Start / exact run
- Fetch/check out `claude/plazcode-dev`; no task branches. Read AGENTS.md and docs/NOW.md.
- Final program/package source: `936a302e101a39f91eca0749a35c7d6e2e8458f4`.
- Active full validation: https://github.com/stoveez/plazcode-source/actions/runs/41342349857 . Latest check: all four jobs running, no failures; browsers installing engines, Mac/Linux JavaScript, Windows preferences. Bootstrap is intentionally skipped.
- Commits after 936a302 are handoff/verification notes only; no validated program/package input changed. Use this run/source when it succeeds; do not rebuild merely because docs HEAD is newer.
- Stable remains 1.24.29. No stable 1.24.30 publication was authorized in this task.

## Owner decisions / finished changes
- Anti-copy: derived version/channel variant, three authenticated pack layouts, seeded hidden text/fingerprints, independent native/program/text checks, signed public descriptor/mark, safe JS private-function/local name mangling (globals/classes/properties preserved), native/packer/CI/promotion matching proofs. Stop/recovery/user-data boundaries and legacy updater schema/scripts/feeds preserved.
- Owner explicitly rejected source ZIP distribution: package/promote no longer create one, CI excludes them, source hash/length proofs replace them. Legacy input/source archives and old release rights retained.
- Owner explicitly rejected future GPL and confirmed all first-party ownership. 1.24.30 first-party code is proprietary; current headers, Rust licence-file metadata, root/Chrome/Firefox notices and generators updated. Wider final scan includes CSS, BOMs, later lines and all file types. Third-party/historical terms unchanged; no new acceptance UI. Luraph explicitly dropped.
- Current notices now copy from source instead of an old baseline. Dependency notices retained in runtime/THIRD-PARTY-RUST-LICENSES.txt (236 Linux / 274 Windows / 265 universal Mac); missing original notices pinned by upstream commit/hash in dependency-notices/. No GPL dependencies in these resolved graphs; MPL option-ext keeps source link/terms.
- Broader fixes: cancellation/timeout invalidates temporary LSP text; pending requests clean up on drop; background checks stop with the task; profile changes clear LSP/results/streaks and isolate session keys.
- Sealing is deterministic for matching release content: separate nonce key + canonical content HMAC, gzip OS header normalized to 255. Root/Chrome/Firefox sealed hashes must match; CI release-check also requires all three OS reports to match. This fixes otherwise broken cross-platform promotion equality.
- Luau/MiMo/Arena/account changes from Claude retained. Missing-verifier c87bea2 was explicitly chosen to be kept by owner; test fixture stubs fixed.

## What has passed
- Full local JS suite: 0 failures after first broad licensing pass. Last header-only CSS/BOM fixes pass desktop/protection/licence/preparation checks; final full hosted suite is the active run above.
- Configured native 268 + 5 with real LSP; optimized signed native integration after lifecycle/path fixes; all three text layouts/foreign variants/tamper; 1,066 prompt/help/skill outputs byte-identical; source proof/promotion/content-report negative cases, generated Ultra, locales/Firefox/desktop checks.
- Local validation-key Linux package built and passed actual desktop launch/authentication checks: 49,994,881 bytes / 3,075 files before the last header-only fix. **Never deliver local artifacts/: they use a temporary validation key.**
- Actual running native/frontend Luau Settings screenshot delivered immediately via Drive and metadata verified: https://drive.google.com/file/d/1rbUnl6a1_yvHWqoslgic0UFr4wBG_-z1/view?usp=drivesdk . PNG 236,394 bytes. Temporary local profile/actual account Worker; zero page errors. This is UI proof, not a real Studio analysis demonstration.
- Release notes cover final features/licence; required format and 1,667 UTF-16-unit body pass (<2,000). Do not lose this format.

## Status update (Claude, 2026-11-01)
Step 1 done: run 41342349857 succeeded (all jobs + release-check). Mark recorded (step 4 part). Steps 2-3, 5-6 and the 1.24.29 file-list comparison could NOT be done from Claude's cloud workspace (artifact storage blocked, no Drive connector); verified instead from CI logs: sizes, matching descriptors/sealed proofs, Mac universal check, Linux static binary, Windows install/Defender. See [verification](test-build-1.24.30-verification.json). Step 7 reminder given. Step 8 done.

## Remaining steps — finish these
1. Monitor run 41342349857; require browsers, all three native jobs AND release-check success. If a real failure appears, fix it and run appropriate checks. Earlier runs are superseded/cancelled; do not deliver their ZIPs.
2. Download thin artifacts `plazcode-1.24.30-{Windows,macOS,Linux}-test-lean` from THIS run. Verify GitHub artifact digest; unwrap once. Exact inner files: PlazCode-1.24.30-test-lean.zip, PlazCode-macOS-1.24.30-test-lean.zip, PlazCode-Linux-1.24.30-test-lean.zip (Linux tar.gz also available). No source ZIP, DEVELOPMENT note, plaintext maps or secret files.
3. Prepare exact source and run `node development/1.24.30/verify-delivery.mjs /extracted/PlazCode` for each. It checks production key/signatures/version, all browser manifests, source/output hashes, current licences, CSS bytes and variant mirrors. It never needs the private key or raw variant seed. Also check ZIP CRC/safe paths, binary formats (Windows PE; universal Mac x64+arm64; Linux static ELF), executables/modes, checksum listing, <=64 MiB, Linux ZIP/tar byte parity.
4. Compare Windows/Mac file lists to published 1.24.29, accounting for intentional internal-note/installer removals, Ro-Engineer/MiMo/protection/notice files. Verify all three production descriptors and sealed-content proofs match. Download release-check report and record the production mark in docs/vault/release-marks.md. Verify Windows/Mac source-proof reports agree (within validation artifacts), particularly before eventual promotion.
5. Run actual downloaded Linux desktop integration: from prepared source, `PLAZCODE_NATIVE_INSTALL_ROOT=/extracted/PlazCode node release-tools/test-linux-desktop.cjs` (Playwright dependencies required). Do not confuse it with a debug/source-only preview.
6. Deliver exact verified INNER Windows/Mac/Linux ZIPs through Google Drive, plus the release-check report; read back Drive name/MIME/size (and checksum if available), give normal observed file links. No wrapper ZIPs, workspace-only links, fake screenshots or new sharing permissions. Owner approved this exact method.
7. Same message as ZIP delivery: remind owner to restore source Private at https://github.com/stoveez/plazcode-source/settings (Danger Zone / Change visibility / Private). Recheck visibility before stopping. Source was verified PUBLIC at handoff; owner flips it, do not do so yourself. Account API stays Public independently.
8. Rewrite NOW newest first, update open-work/related vault notes and a permanent verification JSON + mark + delivery links, commit/push on dev, tell owner branch/short SHA/one line. Final message checklist must distinguish finished work from any remaining owner/device actions.

## Download/tool details
The current ChatGPT environment has connected GitHub artifact download + Google Drive upload/metadata tools. Direct cloud `gh run download` blob redirects were denied earlier; connected artifact tool returns a reusable file_uri.download_url. Stream that supplied URL normally (large files exceed the 32 MiB download_file limit), verify wrapper SHA256 against GitHub digest. Do not print bearer URLs. On an owner's PC GitHub CLI may work normally. Discover available tools before claiming unavailable. No source/keys/maps should be uploaded to Drive.

Current cloud-only helpers: /workspace/anti-copy-validation/delivery/unpack_verify.py and verify.mjs, published 1.24.29 Windows/Mac baselines under /workspace/anti-copy-validation/baselines/. They may not exist in another environment; portable Node verification helper is committed. Local temp validation keys are outside repo; never copy/print/upload them.

## Honest limits / do not overclaim
Actual Studio edit/restore/sourcemap flow, full MiMo/Arena tasks, original startup/bridge reports and quarantined Mac opening still need device testing. Luau is advisory by default with opt-in NEW-syntax undo; checks happen after edit with conditional restore, not pre-apply staging. Direct require/name dependency filter (max 12), not full transitive graph. Arbitrary execute_luau Source writes/no-task/Play edits are not automatically validated; repairs happen through AI turns, with a three-failure instruction. Unsigned local apps remain patchable. Third-party artwork provenance is unresolved. The separate PC PlazCode-Vault folder is not connected; repository notes are updated.
