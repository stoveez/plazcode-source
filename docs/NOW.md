# NOW
Updated: 2026-10-29. Branch `claude/plazcode-dev`; no helper agents.

**Latest: CI browser job passed; native JS caught the intentionally expanded feature-guide startup index.** Verified old guide reproduces every old startup hash exactly; updated saved expectations for the new approval-guide index. Linux native tests also passed (216). Full rerun required; no test packages delivered yet.

**Packaging adds a real signed static Linux frontend smoke test and frame/referrer protection.** The public desktop shell blocks embedding and suppresses referrers. Linux package creation reruns the actual browser/bootstrap/settings/reopen/Quit test against its exact production-signed static native binary and protected shipped files before upload. Full hosted validation next.

**Linux desktop end-to-end passed.** Real compiled Linux binary launches the actual desktop frontend through its default browser. One-use 60-second launch tickets keep permanent credentials out of URLs; wrong-origin/replay/unauthenticated requests rejected. Settings changes persist to disk/reload; Show reopens and Quit exits the real process. Native tests passed: 216 + 4 build tests, 2 ignored. App/bar approval and effort browser regressions passed. Screenshots are actual frontend/native UI; bar screenshot uses a local composer fixture, not a live AI account.

**Mac startup fix:** screenshot showed occupied port 17613. Mac reclaim_port was a no-op. It now finds the listening process, verifies same user and actual PlazCode executable name/path, requests exit and targets that PID if stuck, then retries binding. Real Mac regression covers stale PlazCode takeover and preserving unrelated listeners; hosted Mac compile/run still required.

**Test scope:** 1.24.27 DeepSeek archive pacing; accessible effort menus; persistent Ask/Approve for me/Bypass selectors in bar + Settings; composer-relative expanded/collapsed bar; Mac recovery; statically linked x86-64 Linux package with bundled pinned memory helper. Existing access/read-only limits and production integrity checks preserved. Linux automatic updates are not published; Windows/Mac feeds unchanged. All 15 language catalogs updated.

**Next:** full validate-1.24.27 on this implementation; fix failures, verify Windows/Mac/Linux inner packages/signatures/layout, deliver downloads and screenshots. No stable publication. Source PUBLIC for owner-authorized build window; restore Private immediately after delivery (integration previously denied visibility change, 403). Latest stable 1.24.26. PC vault folder is not connected.
