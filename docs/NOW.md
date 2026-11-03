# NOW
Updated: 2026-11-03 (owner timezone). Branch **claude/plazcode-dev** only; no helpers.

**ACTIVE:** fix intermittent Blender MCP initialize timeout and raw desktop abort. Owner clarified UV was not on PATH. Analysis/plan recorded in [Blender diagnosis](vault/blender-uv-path-2026-11-03.md); implementation/tests next. Windows runtime discovery misses current registry PATH/pip locations and uv.exe fallback, uses profile path for bundled runtimes. Blender initialize budget20s; AgentScript refresh cancellation6s; desktop scene deadline7s vs native8s + queue45s. Must reproduce and fix the underlying paths, never replay edits.

**Plan:** improve UV discovery/keep verified auto-setup, separate cold initialization, background catalogue continuation/cancelled-stream recovery, bounded scene-check queue and aligned typed desktop timeout, truthful scene error. Real child/socket/browser tests and regressions required. Previous delivered CI41579556782 all green (runtime5870a11) does NOT contain this follow-up.

**Preserve:** guest/signup, DeepSeek, continuation, live readiness/loader/ChatGPT startup/results, anti-copy/Luau/Arena/learning/batches/jobs. Stable1.24.30 already published; future stable needs NEW version and exact notes shown first. No main/release/feed/source ZIP/visibility changes. Source still PUBLIC after prior ZIPs; owner reminded Private at https://github.com/stoveez/plazcode-source/settings. Never change it. Prior verified Win/Mac links/hashes remain in vault/test-build-1.24.30-followup-2026-11-02-verification.json. PC vault folder not connected.
