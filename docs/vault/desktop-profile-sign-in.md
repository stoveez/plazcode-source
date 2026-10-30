# Desktop profiles and sign-in
Updated: 2026-10-30. Implemented; final signed test-build validation and public account API verified; final test packages pending.

The existing loading screen fades into the profile picker. Each new app process starts signed out. Users choose a saved profile, see its theme-colored selection and then green Log in/red Remove controls. First sign-in creates or uses an online username/password account; later launches use the remembered session without retyping. Valid remembered sessions also open local data offline. The Account page provides sync and sign-out/profile switching. Removing a saved profile asks for confirmation, revokes that device session when reachable, and keeps the online account and local data.

## Appearance and actual previews
The owner rejected the initial brown row/list preview. The replacement uses a charcoal glass welcome panel, larger heading, two-column avatar tiles with individual theme colors and selected check badges, redesigned green/red actions and a framed creation tile. Keyboard focus, reduced motion, small windows/scrolling and glow-off remain supported. Show actual running-app screenshots immediately when the feature is ready, before the rest of packaging finishes.

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
- Seven focused native account tests pass; the last full native suite before the final fixes passed 227 tests plus 4 library tests (2 ignored). Final CI provides the current total.
- Actual browser localStorage/IndexedDB tests: first-owner copy, original retention, no overwrite of edits and second-profile isolation pass.
- Actual screen interactions and desktop regression pass; actual shared-i18n desktop language checks pass all 15 languages. Failed saves remain visible through polling and clear after successful retry (explicit browser assertions).
- Extension partition/locked-access checks pass. Old v1.18 fixture now models the account status prerequisite and browser AbortSignal API.
- Full Windows/Mac/Linux/browser CI and fresh production-signed test archive verification remain pending. Older delivered archives do not include accounts. Latest stable remains 1.24.26; no stable release is authorized in this test-build request.

## Latest polish
Owner requested stronger glow: panel/selected-card halos, avatar/brand highlights, luminous green/red actions and edge lighting now follow the desktop glow treatment. Updated actual gold/cyan images above. Failed-login focus is restored synchronously after unlocking, preventing Escape reaching the page during a frame gap; five consecutive Chromium 141 interaction runs pass with a focus assertion. Optional local appearance caching cannot block a successful account login. Final signed packaging remains pending.
