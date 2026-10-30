# Native startup and sign-in polish
Updated: 2026-10-30. Follow-up code is not in the delivered 9c175eb ZIPs.

Owner clarified the long delay occurs before any window. Full signed protected-file verification runs before the bridge/window. It now uses four bounded workers; every signature, safe-path, symlink, size and SHA-256 check remains, and all workers join before startup can proceed. No mtime cache or verification bypass. Loopback existing-instance discovery explicitly avoids proxies. Logs record protection, bridge and native window/WebView phase durations for device-specific diagnosis.

Optimized local comparison against the same signed Linux package: previous median 0.2883s, new 0.1600s over five alternating warm runs. This is component timing, not Windows app startup. Previous binary is static musl and comparison binary is glibc, so do not claim a controlled Windows speedup. Optimized production-key verification rejects same-length tampering/missing files. Full native/security tests passed before the updater follow-up; exact counts in NOW.

Plus badge now uses a centered SVG; approval arrow uses the same geometric chevron as Effort. Local profile picker crossfades with the splash and never waits on update-network requests. Native background updates remain independent. Actual compiled recording reached the picker in 2997ms including browser navigation, with no JS errors. That measurement starts after the native bridge was already running; it does not measure the delay before a Windows window.

- [Actual plus screenshot](previews/desktop-profiles-plus.png)
- [Actual loading/sign-in video](previews/desktop-profiles-startup.mp4)
- [Drive screenshot](https://drive.google.com/file/d/1xGWwaZO1_h2UIF9SFnW_Z0xcudd4ZzZt/view?usp=drivesdk)
- [Drive video](https://drive.google.com/file/d/18Wq7TADPI4dp6lncj5pq7gxVupEW_0Le/view?usp=drivesdk)

Ahead-of-stable updater bug: 1.24.27 against stable 1.24.26 was classified as an error before availability was checked. Valid signed older feeds now mean no update; no installer/download is permitted, stale failure state clears, signature checks and last-known-release rollback rejection remain. Same-version complete repairs and newer releases remain allowed. Targeted updater tests pass; real Windows/Mac Check/Install regression is added to CI, pending next full build.
