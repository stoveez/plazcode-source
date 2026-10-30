# Native startup and sign-in polish
Updated: 2026-10-30. Follow-ups are in the replacement 38fd7d2 test ZIPs, verified and delivered through Drive after green full CI 41085855952. Earlier 9c175eb ZIPs lack these fixes.

Owner clarified the long delay occurs before any window. Full signed protected-file verification runs before the bridge/window. It now uses four bounded workers; every signature, safe-path, symlink, size and SHA-256 check remains, and all workers join before startup can proceed. No mtime cache or verification bypass. Loopback existing-instance discovery explicitly avoids proxies. Logs record protection, bridge and native window/WebView phase durations for device-specific diagnosis.

Optimized local comparison against the same signed Linux package: previous median 0.2883s, new 0.1600s over five alternating warm runs. This is component timing, not Windows app startup. Previous binary is static musl and comparison binary is glibc, so do not claim a controlled Windows speedup. Optimized production-key verification rejects same-length tampering/missing files. Full native/security tests passed before the updater follow-up; exact counts in NOW.

Plus badge now uses a centered SVG; approval arrow uses the same geometric chevron as Effort. Local profile picker crossfades with the splash and never waits on update-network requests. Native background updates remain independent. Actual compiled recording reached the picker in 2997ms including browser navigation, with no JS errors. That measurement starts after the native bridge was already running; it does not measure the delay before a Windows window.

- [Actual plus screenshot](previews/desktop-profiles-plus.png)
- [Actual loading/sign-in video](previews/desktop-profiles-startup.mp4)
- [Drive screenshot](https://drive.google.com/file/d/1xGWwaZO1_h2UIF9SFnW_Z0xcudd4ZzZt/view?usp=drivesdk)
- [Drive video](https://drive.google.com/file/d/18Wq7TADPI4dp6lncj5pq7gxVupEW_0Le/view?usp=drivesdk)

Ahead-of-stable updater bug: 1.24.27 against stable 1.24.26 was classified as an error before availability was checked. Valid signed older feeds now mean no update; no installer/download is permitted, stale failure state clears, signature checks and last-known-release rollback rejection remain. Same-version complete repairs and newer releases remain allowed. Targeted updater tests and real Windows/Mac Check/Install regression passed in CI 41085855952.

Final local follow-up: all 234 native + 4 library tests pass (2 ignored). The updater blocks a lower bundled desktop even when the extension release version is higher. Actual splash overlap, approval, design and 15-language checks pass; Windows/Mac ahead-of-stable native integration passed in full CI. Replacement package verification and actual signed Linux startup passed. Original-device startup measurements remain; do not claim measured Windows startup improvement.

## Fresh-window replay and full-motion follow-up (2026-10-30)
Owner videos show the initial logo replaying after missing locked context triggers location.reload. Removed that reload only for a fresh locked namespace; actual profile changes retain reload/isolation. Splash animations wait for native ready acknowledgement (explicit nativeWindow boot flag) or visible browser frames. Linux's browser IPC adapter does not wait for native window acknowledgement. Hide desktop under sign-in so crossfade cannot expose accountless app content.

Owner explicitly selected full preview motion even when Windows Animation effects is off. Intro letter stagger/rise, ring/glyph drawing/pulse, backdrop drift/reflection, profile/button shine and crossfade keep motion. Other desktop reduced-motion rules remain. Intro holds until drawing completes. Native dark shell is shown before WebView initialization; loopback instance discovery has a 150ms connect limit, 900ms full response limit. Signatures and protected-file checks still complete before any window/API; no security checks skipped.

Actual compiled frontend recording delivered immediately: https://drive.google.com/file/d/1pcaZwlVlG7L5-SAcPchk8vY3_lEMuL-E/view?usp=drivesdk . Empty session storage and reduced-motion environment; one navigation/no JS errors. It starts after bridge startup and is not a Windows before-window measurement. Fresh Linux startup, actual native-ready UI/animation and protected-source regressions passed. Full platform test rebuild pending. Previously delivered 38fd7d2 ZIPs do not contain this fix.

Full replacement CI 41092415126 started on 5746f98. Final actual video refreshed at the same Drive link; 660134 bytes metadata verified, navigation-to-picker 3493ms (bridge already running), one navigation/no JS errors. Repo copy previews/desktop-startup-full-animation.mp4. No measured native Windows opening time.
