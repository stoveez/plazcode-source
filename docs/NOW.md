# NOW (live handoff, overwrite at the end of every session)
Updated: 2026-10-26. Long-term knowledge: [vault/Home.md](vault/Home.md).

**Latest change:** the owner reserved 1.24.25 for a new issue (scope pending). All work previously planned for 1.24.25 is moved to **1.24.26**: accounts, code protection, Skill Workshop, Brickwire and remaining carried-over items. Plans moved to `development/1.24.26/`; links and scheduling notes updated. Documentation only; no app or updater changes.

**Latest published: 1.24.24**, 2026-10-26 (validation 40340881855 on ae33b25; publish 40344067698). Live feed and zip verified by the previous session. Fixes Claude input-limit errors and excess usage; extension reload is enough. Full platform tests passed; not live-tested on a real Claude account with a 12,000 limit.

**Previously shipped:** 1.24.23 antivirus false-positive fix (validation 40325619553 on bff6768; publish 40328989177); 1.24.22 lean startup.

**1.24.26 decisions:** PlazCode stays free; username/password accounts, optional recovery email added only while signed in, owner-only user page; code protection checks program files only, including test builds. See [decisions](vault/decisions.md) and `development/1.24.26/NEXT-UPDATE-PLAN.md`.

**Working rules:** use `claude/plazcode-dev`; no task branches or helper agents. Update affected notes and this handoff with each push; keep PC vault copies in sync when linked. See [how-we-work](vault/how-we-work.md).

**Checks for this change:** 22 plan references checked, design documents preserved, diff whitespace check passed; no build needed for documentation-only scheduling. PC vault cannot be synced from this session (no PC connection).

**Still open:** [open-work](vault/open-work.md) contains site checks and queued work. Earlier Claude typing/card fixes were live-checked; other site behavior, Firefox appearance and desktop features still need real-user checks. Desktop feature guide and lean startup phases 2–3 remain unfinished.

**Next step:** ask the owner what needs addressing in 1.24.25, then investigate it. Plan placeholder: `development/1.24.25/NEXT-UPDATE-PLAN.md`. Do not build the deferred 1.24.26 work as part of 1.24.25.
