# NOW
Updated: 2026-10-26. Branch: `claude/plazcode-dev`.

**Latest change: 1.24.25 validation passed; publication configured.** Exact source `810676d`, validation run 40362663766; all browser and Windows/Mac/Linux jobs green. Publication still requires its packaged Mac desktop gate. Owner authorized release, with no separate test build.

**Fixes:** canvas screenshot display avoids site image-URL blocks; unreadable data reports an error. Plan Mode respects per-command task approvals. Creator response handling explains missing endpoint, size limit and invalid responses. Real three-node preview HTTP save/read tested on each platform. Desktop shows recent browser extension versions and mismatches; known outdated versions stay red through failed/stale checks.

**Latest published remains 1.24.24.** 1.24.25 is pending publish-1.24.25.yml on the publication branch. Windows/Mac binaries are reused from validation, never rebuilt during promotion.

**Limits:** actual affected Studio captures/accounts not tested live. Replacing only an EXE cannot replace an extension loaded from a separate folder; the warning explains loading the updated folder. PC vault sync unavailable (no PC connection).

**Next:** monitor publication and Mac desktop gate, verify live release/feed checksums, remind owner to restore Private. Source repo is currently public.

**Deferred:** accounts, code protection, Skill Workshop, Brickwire and carried-over features stay in 1.24.26.

**Rules:** work directly on claude/plazcode-dev; no helper agents; rewrite NOW with every push; update open-work and vault. See [Home](vault/Home.md).
