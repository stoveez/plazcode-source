# PlazCode 1.24.10 review

Validation: all exact-source platform CI jobs and the packaged macOS desktop check passed. See release-validation-1.24.10.

Scope: Notion AI provider only (`providers/notion.js`), plus its regression tests and the 1.24.10 version bump. The release is built from the published `PlazCode-source-1.24.9.zip` with the `overlay/` files and the exact unique-block edits in `edits.json` (core/activity.js, core/checklist.js, core/config.js, core/main.js, overlay.css) applied by `prepare.py`.

Root causes fixed after Notion's site update:
- `/ai` is the new-chat landing and threads use `/chat?t=<id>`; the conversation key now includes the thread id so chats no longer collide.
- Large native inserts could freeze the tab; drafts are settle-checked and fall back to bounded chunked paste. Foreign or changed drafts are never overwritten.
- The composer renders emoji as `img.notion-emoji` and converts the final straight quote to a curly quote; draft read-back now includes emoji alt text and folds curly quotes, so the startup digest verifies and auto-sends.
- New chat controls are matched in multiple languages and the send control has a structural fallback.

Live check: the maintainer confirmed Start Agent on Windows / Chrome 154 / AgentScript — the startup digest auto-sent and the model replied.

Additional fixes (automated tests only, `overlay/test-1.24.10-fixes.js`):
- Startup drafts that Notion rewrites into Markdown/blocks count as our own partial draft, so they are cleared and resent instead of stranded; foreign drafts are still preserved.
- Send receipts use whitespace/Markdown-insensitive matching, so rendered messages are not reported missing.
- The startup handshake accepts "PlazCode is ready." with a short plain follow-up.
- Plan-only replies in Plan Mode / high THINK / Ultracode get one continue prompt per loop.
- The command catalogue and startup digest list connected addons (e.g. Blender).
- Task checklists: numbered steps from the request and replies, goal header, step-progress advance, completion.
- Skill/template/reference context is delivered once per task and labelled as not being a command result.
- The automatic prompt enhancer only runs before creation saves/inserts; failures fall back to the original command.
