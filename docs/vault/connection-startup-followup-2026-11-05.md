---
title: Follow-up — bridge discovery, persistent ChatGPT receipts and foreign namespaces
updated: 2026-11-05
---

Owner says extension remains Run PlazCode.exe while already past profile/guest selection. ChatGPT new console shows11958char48line startup insertion1728ms, native list_commands response, then committed=true CHATGPT_SEND_FAILED after15s; earlier receipt fix incomplete. Startup abort stays stopped (no watchdog resurrection in this trace). CSP runner.html message is not proof of submission cause. Owner confirms BDS/BetterDeepSeek enabled; BDS:plazcode_help refused11ms, then exact plazcode_help succeeds8ms9s later. Native guards worked; do not silently strip foreign namespaces. New log contains separate [BDS] prompt guard; no BDS namespace in PlazCode sources/catalog. Raw log stays outside repo.

## Analysis and failing-before proof
Actual complete background.js runs in deterministic transport/clock fixture test-bridge-discovery.js;5failures reproduced,1healthy case passes:
1. When app starts after extension, first successful refreshProcStatus awaits optional settings sync before updating localReady; held preferences prevent AS detection despite healthy status.
2. connect has no in-flight ownership;10overlapping status wakeups plus initial attempt create11primary WebSockets after shared auth resolves.
3. CONNECTING socket has no deadline and blocks later connect forever.
4. Failed status reads silently leave localReady true, stale online after app exits.
5. Cached status omits profile_required/bridge_reachable, conflating profile gate with absent app (owner's case is already logged in; still test this legitimate gate).
Existing healthy open-socket status poll does not pair again; keep it. Before log /workspace/bridge-discovery-before.log. New tests intentionally red in initial WIP; no product edit yet.

## Ordered plan
- Coordinate connect before any awaits, guard healthy socket first, bound unfinished handshake only, one retry owner, discard late callbacks; never close healthy/in-flight command transport or replay work.
- One native health read owner; authenticate/profile-isolate before advertising ready, then publish native fields independently of optional preferences. Coalesce settings startup sync, remove duplicate first-probe path, clear stale health on failed fresh read, status/manual wake can trigger a fresh coalesced probe.
- Propagate profile/reachable/connecting state to UI; differentiate initial checking/profile gate/unreachable/permission/integrity while preserving engine/start/Stop gates. No fake Ready.
- ChatGPT actual failure DOM requested via async text question (loaded beacon, message roles/surfaces/lengths/interactive wrapper, no body text). Browser tool unavailable. Inspect decoration vs receipt ownership; add matching failing layout before product edit. Do not treat native assistant command alone as send receipt, no resend.
- Invalid foreign namespace: stable cause/fix only if exact unqualified advertised command exists; never automatic alias/dispatch, valid published namespaced tools unchanged. Correct model guidance about bare catalog names; test guards.
- Focused/full JS/protection/browser regressions, native if changed, fresh full Windows/universalMac CI/Drive exact-package delivery. Current42078807676 ZIPs lack follow-up. No stable release/feed/main changes. Source Public at prior delivery; Private reminder remains. Repo vault current/owner PC not connected.
