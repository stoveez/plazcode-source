# PlazCode Skill Workshop — design (draft for owner sign-off)

Decisions made: owner approves every shared skill before it is public; built in the same later version as the login system, on the same Cloudflare Workers + D1 server (the existing learning-service is the model: proof-of-work tickets, strict schemas, server-only admin secret).

## What people can do (in the app's Skills screen)
- Browse the workshop: search, sort by rating / newest / most installed, filter by engine (Roblox, Godot, Blender, Unity, general).
- Install: a workshop skill arrives as a new, untested skill (same rule as Share skills today). It never replaces the user's own.
- Share: choose one of your skills, add a title, short description, engine and tags, send it for review.
- Rate (1–5 stars) and report a skill. One rating per account per skill; ratings change when the user changes them.

## Safety (skills are instructions the AI follows)
- Nothing is public until the owner approves it. Developers/admins may review, owner decides (permissions follow the license system).
- Size limits (text only, no files/executables); blocked patterns (hidden instructions, "ignore previous", secrets, URLs the skill tells the AI to fetch and run); the same scanner the Ultra pack test uses.
- Reports: three reports hide a skill until reviewed. Owner can remove any skill and ban an author.
- Installed workshop skills show their author and "community, not checked by PlazCode" until approved by the owner, then "reviewed by PlazCode".
- Imports always arrive untested; the app never runs a workshop skill without the user starting a task.

## Server
- Worker + D1 tables: skills (id, author, title, body, engine, tags, status pending/approved/hidden, created), ratings, reports, installs counter.
- Endpoints: list/search, get, submit, rate, report, install-count; owner: queue, approve, reject, remove, ban. Writes need the logged-in user's token from the license system; reads are public so the workshop page works before login.
- Rate limits and size caps on every write.

## Privacy
- Stores author username, skill text, ratings. No chat content or project data leaves the PC. Notices updated before release.

## Build order
1. Server and tests 2. App Workshop screen (browse/install/share/rate/report) 3. Owner review queue in the owner page 4. Notices and release notes 5. Windows + Mac validation.

## Content: skills and virtual specialists (added at owner request)
Goal: the workshop starts full, not empty, with skills and "virtual specialists" (a specialist is a skill that sets a persona and working method, e.g. "Roblox UI designer").
- Own content only. Multi-Script's skills and specialists are GPL and belong to someone else, so none are copied or adapted.
- Seed sources: PlazCode's starter skills; skills written fresh for PlazCode in reviewed batches, each tested by the same checks as Ultra (header, no hidden instructions, no secrets); the UltraLab pack's skills only if SyphoDev agrees to workshop distribution (his licence allows no sale or paid bundle; credit is required) — to be confirmed with him; later, community submissions through the owner queue.
- Honest scale: 897 + 300 is a number to grow toward, not a launch promise. Quality beats count: the AI follows these, so each one must be tested. Proposed launch target: about 60 skills and 20 specialists, then batches.
- Specialists get their own filter and badge in the Workshop and install as a persona the user turns on per task.
- Every seed item shows "reviewed by PlazCode", with its author credited.
