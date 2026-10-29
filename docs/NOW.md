# NOW
Updated: 2026-10-29. Branch `claude/plazcode-dev`; no helper agents.

**Latest: CI 40911856672 passed Windows, Linux and browsers; Mac exposed a headless error-dialog hang.** On source 671b833, signed Windows package and exact production-signed static Linux package passed. Linux real frontend launch/authentication/save/reload/Show/Quit passed against shipped protected files. Full browser job passed. Mac stale native process takeover passed, but the expected unrelated-port rejection opened a blocking macOS alert even under --headless. Fixed headless startup failures to report on stderr and exit; GUI launches retain their alert. New full CI required on this fix before final delivery.

**Local checks:** 216 native + 4 build tests passed (2 ignored); 11 preference tests; real native desktop and bar approval/effort browser regressions. All 15 language catalogs updated. Startup golden snapshots updated after verifying the old guide reproduces every previous hash; only intentional new approval index changes expectations.

**Test scope:** 1.24.27 owner-archive DeepSeek pacing; accessible effort menus; persistent Ask/Approve for me/Bypass selectors under Effort + app Settings; composer-relative expanded/collapsed bar; same-user targeted Mac stale-port recovery; signed static x86-64 Linux download with bundled memory helper and real browser-hosted interface. Existing read-only/folder limits and production integrity checks remain. Linux automatic updates have no published feed; Windows/Mac feeds unchanged. Latest stable 1.24.26.

**Screenshots:** actual compiled native desktop and actual extension frontend captured. Bar screenshot uses a local composer fixture, not a live AI account. Files in /workspace/PlazCode-test-builds/previews. Final package/layout/signature verifier: /tmp/plazcode-verify-test-packages.py; verified release baselines in /workspace/PlazCode-test-builds/baselines.

**Next:** push headless fix and pass full hosted CI, download and verify final Windows/Mac/Linux inner archives, deliver downloads/screenshots, then immediately restore Private. Source PUBLIC for authorized build window; visibility API previously denied 403. No stable publication authorized by this test request. PC vault folder is not connected.
