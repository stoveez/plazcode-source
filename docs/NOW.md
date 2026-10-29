# NOW
Updated: 2026-10-29. Branch `claude/plazcode-dev`; no helper agents.

**Latest: WIP desktop profile sign-in frontend implemented and tested; account choices still pending.** Actual desktop HTML now contains the theme-aware profile screen, selected-card glow, green Log in / red Remove controls, username/password forms, confirmation, responsive layout and reduced-motion behavior. Controller is deliberately not mounted until real authentication/session/storage is implemented. Isolated actual-controller browser tests passed selection/theme callbacks, safe text, saved login, password failure/clearing, creation, removal confirmation, keyboard/empty/narrow behavior; protected desktop regression passed. These are interaction tests, not a real-app preview. No new test builds or final screenshots yet.

**Owner choices confirmed:** online accounts with settings/skills sync; show saved profiles on each launch, select and Log in without retyping; separate settings/theme/skills/memory per profile, keeping current data for the first profile. Implement these as real account/session boundaries. Remove profile removes this device's saved sign-in, keeps account/data and asks for confirmation. Hosted account service and native/storage/extension isolation are now active implementation work.


**Next:** collect these account/storage choices, implement actual credential/session backend and native integration, connect loading→profile→desktop fades, localize/verify the real app, capture an actual native screenshot and run fresh complete Windows/Mac/Linux test packages. No mockup preview or inactive-UI-only test delivery.


**Previous: full 1.24.27 test builds delivered and verified; release-note draft marks delivery complete.** Source `962899c`; CI [40932400772](https://github.com/stoveez/plazcode-source/actions/runs/40932400772) passed Windows, Mac, Linux and browsers. Delivered INNER Windows/Mac ZIPs and Linux x64 tar.gz (ZIP also available) from /workspace/PlazCode-test-builds. Production signatures, exact reviewed JS source, versions, archive integrity and layout verified. Windows/Mac file lists exactly match 1.24.26; Linux ZIP/tar contents and executable permissions match. Verification: [record](vault/test-build-1.24.27-verification.json).

**Shipped in test:** owner-archive DeepSeek paced send queue; all effort choices accessible; persistent Ask/Approve for me/Bypass controls under Effort and in app Settings; composer-relative bar/restore tab; targeted same-user Mac stale-port recovery; static native Linux browser frontend + memory helper. Existing read-only/folder limits and production integrity checks retained. Headless startup errors now exit without modal dialogs. Actual Mac takeover/unrelated-listener, Windows/Mac launch/update handoff and exact signed Linux frontend launch/auth/save/reload/Show/Quit checks passed.

**Visibility needs owner action:** source is still PUBLIC after delivery. Authorized API attempt to restore Private was rejected with HTTP 403 (integration lacks access); owner sent settings link and status request. Check visibility and keep reminding until Private. Latest stable remains 1.24.26; no stable release/feed publication in this test request.

**Screenshots:** actual final signed Linux Settings screen captured; actual extension UI bar screenshot uses a local composer fixture (not a live AI account). Files: /workspace/PlazCode-test-builds/previews. Release-note format updated; 15 language catalogs include approval controls.

**Remaining:** owner live testing on affected devices/AI accounts; no live DeepSeek ban-prevention claim. Linux automatic updates/ARM downloads are not published; native x64 download works. Separate PC vault folder is not connected. Next: verify source restored Private and collect test feedback before any stable publication.
