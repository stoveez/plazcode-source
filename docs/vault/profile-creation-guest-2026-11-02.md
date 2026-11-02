# Profile creation recovery and persistent guest — 2026-11-02

## What was found
The desktop collapsed all HTTP 429/service-busy responses into a generic “service unavailable” error. Password checks consume a one-use proof before they may hit the account server's single-hash busy guard. Replaying that same registration after an unreadable host response could reuse an already consumed proof, or hide a registration that had actually committed. These are concrete client recovery bugs, not evidence of one specific tester's historical network failure.

Current production account API is active/Public. Unauthenticated health and challenge requests succeeded. Two parallel logins using randomly generated nonexistent usernames returned the expected 401; no accounts created and no existing user data read. Available error logs show no matching current server crash. Historical screenshot outage is not conclusively identified. Asked owner for affected version/time to match logs; continue independently.

## Change
- Preserve busy status/error, and bound retries. Do not retry exhausted quotas or host HTTP 429; preserve real host refusal status without erasing remembered tokens. Get a fresh proof for every password attempt; never replay register/login with the old proof.
- If signup may already have completed, try a fresh login with the same password. A taken username cannot grant access without a correct password. Clear secrets from UI after attempts; passwords still are never saved or logged.
- Read-only requests/disposable challenges can retry once. Keep HTTPS/normal server access; no embedded bypass credentials, no weaker password hashing, no account API deployment.
- Dedicated reserved local guest UUID, data directory and fresh session epoch. Uses the same profile switches, cancellation, permissions and stale-result rejection. Never claims original-data ownership; first online account still receives original data. Guest settings/skills/memory persist across app launches and never cloud sync. Guest can set a local profile picture.
- Guest card in picker and creation/sign-in form, matching themed glass/glow and exact owner text: “Can't create a profile right now? Use PlazCode as a guest.” Guest account page says local-only and hides cloud sync. Normal login and accounts remain available.

## Verified locally
- Native: all 5 library + 286 agent tests passed, 2 ignored. New HTTP protocol tests prove fresh-proof busy retry, lost-registration recovery with one register then one login, and wrong-password refusal after username conflict. Guest unit proves durable memory, no legacy ownership or cloud access.
- Actual native executable + real account Worker/SQL: account creation, remembered and offline login, picture/private-skill cross-device sync, old-epoch rejection. New guest cases prove first-online legacy copy remains intact, settings/private skills stay separate, restart persists guest data with a fresh epoch, and offline entry works after the service stops.
- Actual native desktop UI with a deliberately unavailable local test server: create screen/failure fallback, guest opens successfully, no guest account-service requests, no page errors. UI interactions also cover failed creation, no password needed for guest, narrow screens and existing splash animation. Small final hidden-control CSS refinement has its own focused UI check.
- Full account Worker tests passed. Full JS regression and fresh full platform CI/package checks pending. No live user device/AI/Studio claim.

## Actual running-app previews delivered immediately
Drive metadata name/MIME/size read back before delivery; sharing unchanged.
- [Create profile with guest](https://drive.google.com/file/d/1SsFG3USw4BJMdpLtmX2zppbbhmDBERJV/view?usp=drivesdk): PNG, 849416 bytes.
- [After unavailable signup](https://drive.google.com/file/d/1bjOC1QnynXYstie8St8o0E_bv7QOatHO/view?usp=drivesdk): PNG, 845723 bytes.

## Delivery
Replace the app as well as reloading the extension. Existing delivered 69a4f8c/41449512168 ZIPs lack this new follow-up. Build/deliver fresh Windows/Mac inner test-lean ZIPs, production signatures and layout verification, Drive metadata readback, Private reminder. No stable publishing/main/release pushes. Release-note draft revised with guest and signup recovery, 1,805 UTF-16 chars; show exact revised notes before any real release. Source remains Public; owner restores Private, never assistant. Account API stays Public independently. PC vault folder unavailable; repo notes updated, no claim of PC sync.

## 2026-11-02 — final recovery review before fresh test build
Temporary single-hash busy replies renew proofs; exhausted quotas and host HTTP 429 now stop immediately instead of retrying. Non-JSON host access refusals retain their real HTTP status, and a host refusal cannot silently erase a valid remembered token. Added a fifth native regression for JSON/HTML rate-limit stop behavior. Final UI check including hidden guest/removal confirmation passed against overlay. Full native pass above predates this small last recovery refinement; rerun after active full JS completes and prepare is safe. Actual native guest/restart/isolation and earlier recovery cases passed. Source is Public for the owner-authorized new Windows/Mac test build; skip-ci push then explicit dispatch, never stable publish.

