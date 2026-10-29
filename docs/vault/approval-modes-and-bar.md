# Command approval modes and composer placement
Updated: 2026-10-29. Unreleased 1.24.27.

The bar has a separate Approval selector directly below Effort. Desktop Settings > General > Reasoning > Command approvals shares rsApprovalMode through the existing preference bridge. Modes persist across chats/sites/restarts: ask prompts for every editing command, auto prompts for detected removal/deletion commands, bypass automatically approves commands and plans. Read-only and file-access boundaries remain enforced. Invalid explicit values fall back to Ask. Native legacy settings migrate from access/delete preferences; missing extension settings retain legacy behavior until synced/selected. Strict modes override old saved per-tool approvals.

Removal detection covers named removal tools, local delete/run-command safety classification, multi-edit removal operations and common Luau/Python removal patterns. Arbitrary code effects cannot be fully predicted. Native deletion gates keep existing one-shot confirmation plumbing; no safety backend is disabled.

The real bar measures its current composer for both expanded positioning and collapsed restore tab, resets host transforms/margins, clamps viewport bounds and follows composer movement/remount. Approval menu opens above its control when possible. Actual frontend tests exercise these behaviors; they cannot guarantee compatibility with future host DOM changes.

Verified: policy/legacy approval suites, actual bar browser regression, desktop effort regression, 11 native preferences tests, compiled native desktop saving/reload of all modes. Screenshots come from actual app UI/native backend and actual extension UI on a local composer fixture, not drawn mockups. Full hosted platforms and final packages remain pending. Desktop Settings/effort changes require replacing the app too, then reloading extension and AI tabs.
