# Desktop profiles and sign-in
Updated: 2026-10-30. Implemented, owner-approved design; full verified test packages delivered. Latest stable remains 1.24.26.

The existing loading screen fades into the profile picker. Each new app process starts signed out. Users choose a saved profile, see its theme-colored selection and then green Log in/red Remove controls. First sign-in creates or uses an online username/password account; later launches use the remembered session without retyping. Valid remembered sessions also open local data offline. The Account page provides sync and sign-out/profile switching. Removing a saved profile asks for confirmation, revokes that device session when reachable, and keeps the online account and local data.

## Appearance and actual previews
The owner rejected the initial brown row/list preview. The replacement uses a charcoal glass welcome panel, larger heading, compact horizontal profile rows (matching the first reference) with individual theme colors and selected check badges, redesigned green/red actions and a framed creation tile. Keyboard focus, reduced motion, small windows/scrolling and glow-off remain supported. Show actual running-app screenshots immediately when the feature is ready, before the rest of packaging finishes.

Actual compiled native screenshots with two real local Worker/SQL test accounts:
- [Gold](previews/desktop-profiles-gold.png)
- [Cyan](previews/desktop-profiles-cyan.png)

The screenshots use actual PlazCode HTML served by the compiled native bridge, with real signup/session actions. No image generation or mockup UI. Both were shown to the owner; no JS errors recorded. The separate original PC vault folder remains unavailable to this workspace.

## Isolation and existing data
Native preferences, memory, skills, vault, checkpoints, history, creations, templates, toolkit, Engram databases, MCP configuration and learning state use separate profile stores. Browser appearance, notifications, custom look and wallpaper caches are namespaced by account ID. Existing files are copied only to the first profile; originals and already-created profile edits are kept. The original IndexedDB wallpaper is copied too. Migration acknowledgement prevents deleted wallpaper reappearing on later page reloads.

Profile changes cancel tasks, reset runtime state and reject stale API epochs. Studio dispatches use session-specific wire IDs; late results cannot reach a new profile even with reused caller IDs. Browser extension storage is partitioned; old content-script contexts are invalidated on a profile change and AI tabs must refresh. Normal chat changes do not reset approval choices.

## Account service
Fixed HTTPS endpoint: https://plazcode-accounts-stoveez.mistysong24.chatgpt.site
Sites project: appgprj_6ae3b330d8b481919934a74c73dc7874. Dedicated service source 0176721; review mirror in account-service/. Owner explicitly approved Public audience on 2026-10-30; it is now Public. Real public signup/session/private-sync/revoke checks pass without a Sites bypass. This is independent of GitHub's public-for-builds/private-after-delivery rule. Release apps contain no private Sites bypass; debug-only test access stays in session memory.

Passwords use salted scrypt; server sessions store token hashes. Native saved sign-ins use an authenticated encrypted device registry, private filesystem permissions and atomic recovery backups. Passwords are never persisted. Proof challenges, bounded requests and quotas protect the public credential routes. No account-list endpoint or required email/paid key.

Portable settings and private skills use revision checks and a three-way merge. Changes made while a request is in flight are preserved. Device access grants, paths, credentials, memory and files stay local. Offline changes remain local and retry sync. Optional recovery email/reset, username attribution on future sharing flows and owner administration from the broader account plan remain separate work; do not claim them implemented.

## Verification
- Hosted private API: actual signup/KDF, session validation, isolated sync, unauthorized rejection and revocation passed.
- Native + real Worker/SQLite across two separate installations: signup, first-owner migration, encrypted remembered login, profile isolation, stale epoch and late Studio result rejection, remove preserving data, offline login and settings/skills sync without device grants passed.
- Final full CI: Linux 229, Mac 227, Windows 223 native tests plus 4 library tests each passed (2 ignored). Seven focused account tests also passed locally.
- Actual browser localStorage/IndexedDB tests: first-owner copy, original retention, no overwrite of edits and second-profile isolation pass.
- Actual screen interactions and desktop regression pass; actual shared-i18n desktop language checks pass all 15 languages. Failed saves remain visible through polling and clear after successful retry (explicit browser assertions).
- Extension partition/locked-access checks pass. Old v1.18 fixture now models the account status prerequisite and browser AbortSignal API.
- Full Windows/Mac/Linux/browser CI 40989215099 / 9c175eb passed; fresh production-integrity-signed inner archives delivered. Signatures/source/layouts verified; actual downloaded signed Linux launch passed. Older 962899c archives do not include profiles. Latest stable remains 1.24.26; no stable release authorized.

## Latest polish
Owner requested stronger glow: panel/selected-card halos, avatar/brand highlights, luminous green/red actions and edge lighting now follow the desktop glow treatment. Updated actual gold/cyan images above. Failed-login focus is restored synchronously after unlocking, preventing Escape reaching the page during a frame gap; five consecutive Chromium 141 interaction runs pass with a focus assertion. Optional local appearance caching cannot block a successful account login. Final signed packaging remains pending.

## Arrow and shine refinements
Login uses a vector arrow centered on the right edge. The desktop lift/inset-light treatment, glossy green primary action, panel/card reflections and restrained shine now apply to sign-in; reduced motion disables animation. Actual compiled screenshots above updated; [actual UI recording](previews/desktop-profiles-shine.mp4) shows the effect and theme switching. UI/desktop regressions pass, no native-preview JS errors.

## Latest owner direction: profile rows and background
Use compact wide rectangles, not square profile tiles. Avatar/name/detail/check now align horizontally. Full-screen background also has polished ambient lighting and slow reflections; not only the welcome card. Actual screenshots and recording above are refreshed from the compiled app. Reduced motion disables background/shine animation. The design guard allowlist names the three owner-requested effects explicitly rather than allowing arbitrary repeating motion. UI, theme/design and desktop regressions pass; full fresh CI pending.

## Approved design and CI harness correction
Owner approved the actual rectangular-profile/background screenshot. Keep this design. CI 40987906606 passed browsers, 229 native plus 4 library tests on Linux and real account/native integration. Storage test source extraction used an obsolete exact State declaration; corrected the delimiter and added boundary assertions. Real browser storage and Linux bootstrap/profile-gate/reopen/Quit tests pass locally. Runtime unchanged from 58773d9; final full CI/archive delivery remains pending.

## Final test delivery
2026-10-30: online profiles/sign-in, per-profile data and settings/private-skills sync are included in the full verified 1.24.27 test builds. Owner approved the actual rectangular-profile/background design. CI 40989215099 / source 9c175eb passed Windows, universal Mac, Linux and browsers. Production signatures, reviewed source and official archive layouts verified; inner ZIPs delivered. Account API remains Public by explicit approval. Source repo is now PRIVATE, verified after owner restored visibility. Earlier integration visibility attempts were denied HTTP 403. Latest stable remains 1.24.26.

[Archive verification](test-build-1.24.27-profiles-verification.json) records hashes, sizes, CI/source and checks. Quit the old same-version app and replace the complete folder; reload extensions/AI tabs. Windows is unsigned and Mac is not notarized. The exact approved screenshots/recording remain the implemented design. Earlier pending entries above are historical and superseded by this final result. The separate PC vault folder was not accessible.

## Startup/icon follow-up
2026-10-30 follow-up (not in the delivered ZIPs): replaced the font plus beside Create a new profile with a centered SVG badge and the approval-mode font arrow with the same geometric chevron as Effort. Loading and profile picker now overlap in one fade; the local picker no longer waits on update-network requests (native automatic updates remain independent). Actual screen/crossfade, approval browser, desktop regression and theme checks pass. Owner clarified the long delay is before any window; investigating native protected-file verification separately. Source stays Private. Replacement packages pending.

## Native startup WIP
WIP native startup follow-up: preserved every signature/path/size/hash check and replaced the serial full-tree scan with four bounded verification workers; startup still waits for all workers, without a cache or mtime bypass. Added tamper/missing/symlink regressions and protection/bridge/WebView phase timings. Rust compile/security tests and before/after package timing are pending; do not deliver old ZIPs as containing this change.

## Startup local validation
Native startup checks now compile and pass all 230 native + 4 library tests (2 ignored), including parallel tamper/missing/symlink rejection. Corrected startup timing log placement; existing-instance discovery now explicitly avoids proxies for its loopback-only request. Full verification still completes before bridge/window startup. Optimized before/after timings, actual refreshed preview and replacement platform packages remain pending; delivered Drive ZIPs still contain 9c175eb.
