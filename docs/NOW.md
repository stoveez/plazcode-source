# NOW
Updated: 2026-10-29. Branch `claude/plazcode-dev`; no helper agents.

**Latest: WIP native profile storage foundation and hosted account API verified.** Dedicated account service deployed owner-private at https://plazcode-accounts-stoveez.mistysong24.chatgpt.site (project appgprj_6ae3b330d8b481919934a74c73dc7874; source 0176721). Four local protocol/SQL/crypto tests and hosted private signup/KDF/session/sync/revoke passed. Only test account data used. Source mirror in account-service/. Service must not receive a shared bypass credential in release apps. Public API audience will need an explicit decision once the complete app is reviewable.

**Storage WIP:** new profile_paths module selects independent stores; preference retargeting, memory/skills/checkpoints/vault/Engram/template/MCP paths are being isolated. Initial native check, 13 preference/path-harness tests and 2 direct path tests passed; latest cache/upload isolation changes need recheck. No account manager, native gates, cloud sync or startup connection yet. UI controller remains unmounted; no actual login preview or new app build delivered.


**Owner choices confirmed:** online accounts with settings/skills sync; show saved profiles on each launch, select and Log in without retyping; separate settings/theme/skills/memory per profile, keeping current data for the first profile. Implement these as real account/session boundaries. Remove profile removes this device's saved sign-in, keeps account/data and asks for confirmation. Hosted account service and native/storage/extension isolation are now active implementation work.


**Next:** implement actual credential/session backend and native integration, connect loading→profile→desktop fades, localize/verify the real app, capture an actual native screenshot and run fresh complete Windows/Mac/Linux test packages. No mockup preview or inactive-UI-only test delivery.


**Previous: full 1.24.27 test builds delivered and verified; release-note draft marks delivery complete.** Source `962899c`; CI [40932400772](https://github.com/stoveez/plazcode-source/actions/runs/40932400772) passed Windows, Mac, Linux and browsers. Delivered INNER Windows/Mac ZIPs and Linux x64 tar.gz (ZIP also available) from /workspace/PlazCode-test-builds. Production signatures, exact reviewed JS source, versions, archive integrity and layout verified. Windows/Mac file lists exactly match 1.24.26; Linux ZIP/tar contents and executable permissions match. Verification: [record](vault/test-build-1.24.27-verification.json).

**Shipped in test:** owner-archive DeepSeek paced send queue; all effort choices accessible; persistent Ask/Approve for me/Bypass controls under Effort and in app Settings; composer-relative bar/restore tab; targeted same-user Mac stale-port recovery; static native Linux browser frontend + memory helper. Existing read-only/folder limits and production integrity checks retained. Headless startup errors now exit without modal dialogs. Actual Mac takeover/unrelated-listener, Windows/Mac launch/update handoff and exact signed Linux frontend launch/auth/save/reload/Show/Quit checks passed.

**Visibility needs owner action:** source is still PUBLIC after delivery. Authorized API attempt to restore Private was rejected with HTTP 403 (integration lacks access); owner sent settings link and status request. Check visibility and keep reminding until Private. Latest stable remains 1.24.26; no stable release/feed publication in this test request.

**Screenshots:** actual final signed Linux Settings screen captured; actual extension UI bar screenshot uses a local composer fixture (not a live AI account). Files: /workspace/PlazCode-test-builds/previews. Release-note format updated; 15 language catalogs include approval controls.

**Remaining:** owner live testing on affected devices/AI accounts; no live DeepSeek ban-prevention claim. Linux automatic updates/ARM downloads are not published; native x64 download works. Separate PC vault folder is not connected. Next: verify source restored Private and collect test feedback before any stable publication.
