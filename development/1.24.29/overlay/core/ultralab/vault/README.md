# UltraLab vault

Plain markdown. Open this folder in Obsidian to browse it. UltraLab reads and writes these files itself with its
file tools. Nothing here needs a command to run.

## Folders

- `lessons/` mistakes and the rule or fix that came from them
- `api/` Roblox API facts, each with the docs page it came from
- `patterns/` techniques that worked and can be reused
- `decisions/` choices made, and open questions (status: unverified)
- `sessions/` one short note per task: what changed, what was checked, what was not

## Note format

Every note starts with this frontmatter, then the body. Link another note by putting its file name, without .md, inside double square brackets.

    ---
    title: Short name
    type: lesson | api | pattern | decision | session
    status: verified | user-confirmed | unverified
    source: the docs URL, the file or check that showed it, or "user"
    date: YYYY-MM-DD
    tags: [ui, gamepad]
    ---

    What it is, and the rule or fact in one or two sentences.

## Rules

- `verified` only when checked against a docs page, a run, or the code. Say which in `source`.
- `api` notes need a docs URL in `source` and a signature in the body. Without both, the status is `unverified`.
- `unverified` notes are open questions. They are not shown as facts.
- Never store secrets, DataStore keys, remote names, or asset IDs as general facts.
- After adding a note, add a line to `00-Index.md`.
