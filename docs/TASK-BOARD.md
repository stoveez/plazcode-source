# PlazCode task board

Read `docs/MAINTAINER-GUIDE.md` section 11 first. Claim a task by adding a line under "In progress" in your own small commit. Move it to "Done" with a handoff note when finished. Do not take a task someone else has claimed.

Format:
`- [task name] | AI: claude or codex | branch: <ai>/<task> | files: <the files you will touch> | started: <date> | CI run: <link or none>`

## In progress
- (none yet)

## Ready to start (from `development/1.25.0/NEXT-UPDATE-PLAN.md`)
- Hang recovery (stall guard: Stop then continue, resend cut-off block, retry undelivered message, wrong Studio mode, Studio not answering). Files: `core/stall-guard.js`, `core/main.js`, tests.
- Keep-awake and reload recovery. Files: `background.js`, `core/main.js`, desktop app power handling.
- Luau helper library, building helpers, build self-checks, effects module (high effort).
- History and rollback app, export as report or replay.
- Notion Dev log / project log switch.
- Studio plugin chat; Blender and Figma previews.
- License server and login (Cloudflare Workers + D1) and the Skill Workshop (high effort, own folder, no extension files).
- Website: deploy `PlazCode-website.zip` to Cloudflare Pages once the owner has the domain; point download buttons at the new links.
- Add "Response changed - run paused" fix once a tester sends a debug report.
- Mac app opens then closes: needs the tester's app version or crash report.

## Done (handoff notes)
- (none yet)
