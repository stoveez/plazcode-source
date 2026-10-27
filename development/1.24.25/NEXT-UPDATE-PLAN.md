# PlazCode 1.24.25 — reliability fixes

Updated: 2026-10-26

Owner reports, with screenshots:
- Screen capture sometimes displays a blank/grey image.
- Approve all for this task still repeats the proposed-action popup (shown in Plan Mode).
- App updates can leave a loaded extension on older files after reload.
- creation_preview repeatedly fails parsing the desktop response as JSON, even for a small draft.

Investigate and fix each cause, add regression coverage and run appropriate checks. Real Studio, Windows/Mac and browser checks remain necessary before claiming live verification.

Accounts, code protection, Skill Workshop, Brickwire and carried-over feature work remain deferred to 1.24.26.
