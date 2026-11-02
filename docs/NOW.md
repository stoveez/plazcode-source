# NOW
Updated: 2026-11-02. Branch **claude/plazcode-dev** only; no helpers.

**Newest:** guest/signup follow-up implemented. Persistent guest data stays local/separate, no cloud sync or first-owner migration. Exact themed fallback works in actual PlazCode while the account service is unavailable. [Actual preview](https://drive.google.com/file/d/1SsFG3USw4BJMdpLtmX2zppbbhmDBERJV/view?usp=drivesdk) and [failure screen](https://drive.google.com/file/d/1bjOC1QnynXYstie8St8o0E_bv7QOatHO/view?usp=drivesdk), metadata verified and already delivered immediately. Signup busy/ambiguous-response recovery now uses fresh proofs and password-verified login, never replays a used register/login proof. Historical tester outage not proven from available logs; current public API checks pass, no real accounts/data accessed. Asked affected version/time; proceed independently.

**Checked:** 5 library + 286 agent native tests passed, 2 ignored. New real HTTP recovery tests; actual native+Worker/SQL full account, picture/sync, guest offline/restart/isolation and first-online legacy ownership pass. Account Worker tests pass. Actual native UI entry succeeds with no guest cloud requests/page errors. Final hidden-control CSS refinement and UI test check next; full JS currently running on same program logic before that CSS-only refinement. Do not regenerate while suite active.

**Final review:** temporary busy versus exhausted quota/host 429 now distinguished; new stop-without-retry test added. Focused final UI hidden-controls check passed. Last full native pass predates this small final request-classification refinement; repeat after full JS finishes, then prepare.

**Next:** push source/docs, dispatch fresh validate-1.24.30.yml on this branch (cancel duplicate old-version push runs if any; skip-ci commits used). Require all required jobs green, verify exact INNER production-key Windows/Mac test-lean ZIPs, signature/source/SHA/CRC/native formats/official layout, Drive upload + name/MIME/size readback. Both app and extension replacement required. Earlier verified build 69a4f8c / 41449512168 already delivered; it lacks this guest follow-up. Details: vault/profile-creation-guest-2026-11-02.md. Logs/work: /workspace/plazcode-profile-followup/.

**Preserve:** all prior 1.24.30 anti-copy/Luau/Arena, DeepSeek pacing, selective learning, batching/background jobs and exact result-page framing. Earlier full CI 41449512168 and final local JS were all green, production Windows/Mac ZIPs verified/delivered (vault/deepseek-workflow-1.24.30-2026-11-02-verification.json). No live AI/Studio guarantee.

**Release:** stable remains 1.24.29; no publish/main/release/feed change. Current revised draft includes guest/recovery, 1,805 UTF-16 chars using actual publisher formatting. Show exact revised notes before every real release; a draft/test build is not permission. Account API has no source/deployment changes; remains Public by prior owner approval.

**Public/private:** source still Public after earlier delivered ZIPs; owner reminded to restore Private: https://github.com/stoveez/plazcode-source/settings → Danger Zone → Change visibility → Private. Recheck before ending, repeat if still Public; never change visibility yourself. Resend full build plan/settings link before dispatch. Repo vault updated; PC vault folder not connected.

**Before ending:** keep NOW + evening handoff in each commit, permanent/open-work/build/milestone notes current; push under stoveez/empty email/[skip ci], report branch + short SHA + one line. Finish with done checklist, say honestly what is unfinished.
