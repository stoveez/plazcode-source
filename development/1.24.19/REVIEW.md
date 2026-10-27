# PlazCode 1.24.19 development review

Status: private development branch; not published. Stable main, releases and update feeds remain unchanged.

## Shared response handling
- Retain exact assistant text across remounts only with the same fresh non-null response identity and nonempty unchanged conversation/send/session ownership.
- Invalidate on same-node identity reuse and conversation/session/send changes. No user/composer/thinking fallback.
- Carry the exact parsed source from watcher and sweep into dispatch bookkeeping, including blank live body cases.
- Revalidate response ownership after asynchronous visibility parking and before dispatch; pause without replay on unverifiable ownership.
- Accurate stopped-loop instructions direct the user to the PlazCode bar, not an ineffective chat-only nudge.

Local fixture evidence is not proof of the affected user's live Claude cause. Provider identity fallbacks and preexisting watchdog marking semantics remain separate limitations; no comprehensive no-replay claim.

## Polish
- Add Polski — Polish (pl), left-to-right, with 877 offline interface translations to the existing 14 languages.
- Shared desktop, extension bar and popup picker; English remains default. Native preference allowlist and persistence tests include pl.
- Do not translate AI replies, user text, code, tool identifiers/arguments or host website content.

## Validation
- Shared watcher: 60 cases across six provider modes.
- Dispatch/memory ownership: 12 direct-function cases plus 7 actual asynchronous agentLoop cases.
- Sweep ownership: 7 cases.
- Offline Chromium real Claude adapter: 5 cases (remount, reused identity, thinking-only, user-only, missing identity).
- Actual shared i18n desktop Chromium fixture: all 15 choices/persistence/search/refresh/rollback/draft and RTL isolation passed.
- Extension bar/popup Chromium fixture: Polish search/selection/persistence and unchanged user draft, existing RTL and rollback passed.
- Strict catalog generation reproduces committed bytes twice; CRLF overlay parity passed.
- Full prepared JavaScript and hosted/native validation outcomes must be recorded after completion; not assumed from these fixtures.

No actual Claude account or Studio project was used or changed by these tests.
