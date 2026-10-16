# Offline Vani public DOM fixtures

Sanitized from public composer and pending-response DOM captured on 2026-10-16.
Only the main composer/conversation layout is retained. The user row contains the
public test string `Reply with exactly: VANI_TRANSPORT_OK`; timestamps are fixed
fixture labels. No account details, personal messages, auth/sidebar/history UI,
site scripts, executable event attributes, or external resource attributes remain.

`host.css` retains the captured host layout/reset rules, including native button
and hidden-element styling. Every CSS URL resource is replaced with an empty data
URL and external imports are removed. No website JavaScript is included.

The regression harness replays these files locally and simulates controlled editor
acceptance and native Send/Stop. It does not run Vani React, contact Vani, establish
React hydration compatibility, or prove the cause of React error 418.

Run `node release-tools/test-vani-independent-regressions.cjs` in a complete,
prepared source tree with Playwright already installed. The source defaults to
this script's parent directory. Set `PLAZCODE_TEST_BROWSER=chromium` or `firefox`
(`all` also works). Missing browser binaries are failures, not skipped tests.

For explicit red-baseline evidence, set `PLAZCODE_REVIEW_SOURCE` to the complete
baseline source tree. Optional `PLAZCODE_REVIEW_PROVIDER`, `PLAZCODE_REVIEW_CORE`,
and `PLAZCODE_REVIEW_CSS` override individual files without modifying that tree.
`PLAZCODE_REVIEW_FILTER` runs a named subset. Fixture paths remain sibling-local.
