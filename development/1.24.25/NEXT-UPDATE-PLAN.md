# PlazCode 1.24.25 — reliability fixes

Updated: 2026-10-26

Owner reports, with screenshots:
- Screen capture sometimes displays a blank/grey image.
- Approve all for this task still repeats the proposed-action popup (shown in Plan Mode).
- App updates can leave a loaded extension on older files after reload.
- creation_preview repeatedly fails parsing the desktop response as JSON, even for a small draft.

Shipped 2026-10-26. Validation 40362663766 on 810676d; publication 40368356121. Full Windows/Mac/Linux and Chromium/Firefox checks, real three-node preview HTTP round trips and packaged Mac lifetime/relaunch passed. Version labels retain red Outdated through failed/stale checks. Original affected account and real Studio captures remain untested live. The extension-folder mismatch is detected and explained; replacing only an EXE cannot update a separately loaded extension folder.

Accounts, code protection, Skill Workshop, Brickwire and carried-over feature work remain deferred to 1.24.26.
