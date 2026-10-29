# NOW
Updated: 2026-10-29. Branch `claude/plazcode-dev`; no helper agents.

**Latest: wrong-version security fixtures corrected.** Initial 1.24.27 CI 40898279700 passed browsers and all JavaScript suites, then caught three rollover mistakes in rejection tests: a tampered payload replaced 1.24.27 with itself, and a wrong-version native check requested the valid version. All three now use 0.0.0 as the invalid version, including the optimized native verifier fixture. Audited the old 26 tree for every pre-existing future-version literal; these were the only three occurrences. JavaScript protection suite passed locally. No Rust toolchain is installed locally; the fresh full CI run must verify native tests. No runtime security check changed and no test ZIP delivered.

**Initial test-build browser gate passed.** Full run 40898279700 builds exact source 2563eb2. Browsers completed successfully; Windows/Linux regression suites continue; Mac is waiting for a hosted runner. No ZIPs delivered yet. Verify both packages and deliver inner lean ZIPs after all four jobs pass, then restore Private.

**1.24.27 full test-build run started.** Owner made source Public and visibility was verified. This push starts validate-1.24.27 on `claude/plazcode-dev` for Windows, Mac, Linux and browsers; no separate browser-only mode. Deliver both verified inner lean ZIPs after all four jobs pass. No stable publication.

**Owner requested full 1.24.27 test builds.** Windows and Mac packages must include both browser extensions, use production integrity trust and preserve the official ZIP layout. Source is ready; owner opened the temporary Public build window after visibility API returned HTTP 403. Settings link/request sent. Once public, push a fresh NOW commit without skip-ci to start validate-1.24.27 on dev. Deliver verified inner lean ZIPs; do not publish feeds/releases. Restore Private immediately after delivery.

**1.24.27 implementation.** Extracted only the provider from PlazCode-Extension.rar for comparison; its sole difference is the pacing wrapper. Merged that wrapper into `development/1.24.27/overlay/providers/deepseek.js`, retaining a null initial timestamp and defensive diagnostics. It serializes every programmatic send, forwards optional arguments, waits the remaining sampled 8–9.8 second cooldown after prior completion in ≤250 ms slices, and logs `send.pace`. First send has no delay. Long replies beyond the cooldown add no wait. Raw sending logic remains unchanged.

**Version setup:** 1.24.27 source, manifest/native versions, workflows, release-note draft and generated Ultra files prepared. Publication pins reset; no release or CI build started yet; test build is now requested. 1.24.26 provider/tests restored to released baseline so the previous release line stays historical. Other copied feature designs remain deferred and outside this update.

**Checks:** focused queue/timing tests passed, including full jitter window, images/options, rejection recovery and no overlapping sends; provider AST preservation, desktop hash pins, ClickUp version wiring, canonical overlay preparation, locales, Ultra generation, package layout and promotion guards passed. Firefox package checks and generated root/Chromium/Firefox byte parity, syntax and exact definition counts also passed. Full platform/browser CI and a live DeepSeek account check remain. See [DeepSeek pacing](vault/deepseek-send-pacing.md).

**Latest published remains 1.24.26:** validation 40772509288 / a74ae17; publish 40781780030. Do not alter its archives or feeds. 1.24.27 must pass fresh exact-source CI and packaged Mac lifetime before publishing. Normal integrity key/public trust retained, no new login/setup or app signing.

**Visibility:** source confirmed PRIVATE. Keep the public-then-private build plan for future CI/publishing. PC vault folder is not connected; GitHub notes updated.
