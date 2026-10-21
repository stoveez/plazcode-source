# PlazCode Vault Memory - design (for 1.24.21)

Written 2026-10-20. Status: DESIGN ONLY, nothing built. Owner decision needed before any code (see section 7).

## 1. The idea in plain words
Today PlazCode's memory is a flat list of up to 200 short notes. Every chat gets the newest notes pasted in (up to about 20,000 characters). It does not link notes together, does not know what is important, and forgets how a job went.

The owner wants a real "brain": a folder of linked notes the AI reads at the start, searches when it needs detail, and UPDATES itself after every job: your preferences, your coding style, your model styles, the reference images you gave it, and the journey it took to get something right (what failed, what fixed it). That is exactly what an Obsidian vault is. A vault is not a special program; it is an ordinary folder of Markdown text files that link to each other with `[[wikilinks]]`. Obsidian is just a nice window onto that folder.

## 2. Recommendation (A + optional B)
**Build our own Obsidian-compatible vault inside PlazCode (option A). Do NOT bundle Obsidian. Optionally let it work with the user's own Obsidian (option B) later.**

Why, from the research:
- **Obsidian cannot be bundled.** Its terms say you may not distribute or sublicense the software or make it available to third parties, so PlazCode cannot ship it. (Source: Obsidian terms.) Obsidian itself is free to use, including for work (Obsidian blog: "free for work").
- **Users who do not have Obsidian must still get the benefit.** Because a vault is just Markdown files, PlazCode can read and write the folder itself on Windows and Mac. If the user has Obsidian, they can open the same folder in it and see the graph, backlinks and search for free. Nothing is lost either way.
- **Obsidian's own command line needs Obsidian installed and running.** It requires Obsidian 1.12.7 or newer, has to be switched on in Obsidian's settings, and connects to the open app (it launches Obsidian if closed). It offers read, create, append, search and list-files commands. That is fine as an optional extra but a bad foundation: it breaks for anyone without Obsidian and adds a moving part. Direct file access is simpler, faster and works offline.
- **Direct files is also what the community does.** Agent memory vaults that work well (several public guides, listed in sources) are plain Markdown folders with an always-loaded small orientation note, an index, typed notes with frontmatter, and a log. The agent reads the index first and loads notes only when needed.

So: PlazCode manages the folder directly; "Open vault in Obsidian" is a button that appears only if Obsidian is installed.

## 3. Vault structure (what the AI sees in the folder)
Default location: PlazCode's data folder (next to `memory.json`), under `Vault/`. The user can choose another folder (for example inside their Obsidian vault). PlazCode adds only what it needs and never touches files outside the vault.

```
Vault/
  00-START-HERE.md        always loaded each chat, small (about 3,000 characters max): who the user is, the rules, where things are
  Index.md                one line per note: [[link]] - what it is - type. The AI reads this to find things
  Log.md                  newest-first list of what changed and when (trimmed to about 100 lines)
  Preferences/            how the user likes things (UI, naming, tone)
  Coding-Style/           code conventions, patterns the user likes or hates
  Models-and-Styles/      one note per style (for example "low-poly-cartoon-trees"), with rubric and lessons
  Projects/<name>/        project facts, decisions, current state
  Lessons/                mistakes made and the fix ("trap" notes)
  Journeys/               the story of one job: tries, scores, what fixed it
  References/             reference images and what they show
  _attachments/           image files (reference images, accepted results)
  _Archive/               retired notes (never deleted outright)
  Inbox/Imported/         notes migrated from the old memory.json
```

Every note is Markdown with a small header (frontmatter):
```
---
type: preference | coding-style | style | project | decision | lesson | journey | reference
project: "Game A"        # optional; notes without it apply everywhere
status: active | superseded
confidence: high | medium | low
created: 2026-10-20
updated: 2026-10-20
related: [[Other note]]
---
```
Linking rules: every new note links to at least one existing note (its project, its style, the lesson it came from) and is added to `Index.md`. Journeys link to the style note they improved. Names are short and readable (`Low-poly trees.md`).

## 4. How the AI uses it every session (without wasting tokens)
1. **Automatic start:** PlazCode pastes only `00-START-HERE.md` plus a compact list of the notes that match the current project (title and one line each, about 4,000 characters total). This replaces today's 20,000-character dump of recent notes.
2. **Search and read on demand:** a new tool `plazcode_vault` (section 5) lets the AI search, read and follow links when a topic comes up, instead of everything being loaded up front.
3. **Learning (writing):** the instructions tell the AI to update the vault when (a) the user corrects it or states a preference, (b) a job finishes, (c) it discovers a trap. Rules that keep it clean, taken from what works in published agent vaults:
   - **Rewrite, do not pile on:** update the one current note for a topic. Search first; create a new note only if none exists.
   - **Supersede, never silently delete:** an outdated note gets `status: superseded` and moves to `_Archive/`, so history survives.
   - **Verify before trusting:** facts about code or a place change; each note has an `updated` date and the AI is told to re-check anything older than a set age against the real project before relying on it.
   - **Never store secrets:** the tool refuses text that looks like a key, token or password.
   - **Caps:** size limit per note and per vault; the start note stays tiny.
4. **User stays in control:** a settings switch "Let the AI learn from my work" (on/off), a "Forget this" button per note (moves to `_Archive/`), "Open vault folder", and a plain "What did it learn today?" view from `Log.md`.

**Relation to what exists:**
- `memory.json` notes are migrated once into `Inbox/Imported/` (one note per old entry, project scope kept) and the old file is kept as a backup. Nothing the user saved is lost. The old `plazcode_memory` tool keeps working and points to the vault.
- **Engram** (the separate memory helper) stays as it is: it holds session history. The vault is the curated, linked, human-readable brain. Removing Engram is not part of this change.

## 5. The new tool and the app code (developer appendix)
`plazcode_vault` actions: `index` (start note + tree), `search` (text, optional type and project; returns paths and matching lines), `read` (path, offset), `write` (path, frontmatter, body, mode: create | append | replace-section), `backlinks` (path), `archive` (path, reason), `add_image` (copy a file or the last screenshot into `_attachments/` and link it from a note), `log` (append one line to `Log.md`).

Safety built in: all paths are resolved inside the vault (no `..`, no absolute paths, no symlink escapes); only `.md` plus image types; atomic writes (write temp, rename), per-vault lock; size caps; secret filter; `archive` instead of delete (so Confirm-before-deleting is never bypassed); writes limited to the vault. Read-only mode and Allowed folders must be checked: see open question 3.

Files (all under `development/1.24.21/overlay/`):
- `agent/src/vault.rs` (new): storage, search (simple word match over file text plus titles; no database needed for hundreds of notes), migration from `memory.json`, backlinks, tests.
- `agent/src/main.rs`: register `mod vault;` and the `/api/vault` route (same pattern as `/api/engram` and `/api/memory`, with a body-size limit).
- `core/vault.js` (new): builds the start prompt, the tool description and the learning instructions; mounts the settings panel pieces.
- `core/memory.js`, `core/main.js` (hash-pinned!): tool lists (about lines 1993, 2005, 2084), tool dispatch (about 2550, where `plazcode_memory` is handled), the "no extra pending read" list (about 4130), replace the memory prompt with the vault prompt. Update `test-desktop-regression.js` hash pins.
- `agent/src/desktop.html` / `gui.rs` (settings: location, open folder, learning switch); `core/i18n-catalog.js` + locale files (15 languages) for every new visible string.
- Tests: Rust (path escape attempts, atomic write, caps, secret refusal, archive-not-delete, migration keeps every old note, concurrent writes), JS (prompt size budget, tool dispatch and argument repair, nothing sent when learning is off), locale test.
- Docs: `THIRD-PARTY-NOTICES.txt` needs no new third-party code if we write our own (ideas from public guides are not code). Do not copy code from the GitHub projects listed in sources without checking their licences.

## 6. The reference-and-critic loop (the Blender example)
**What the owner wants:** reference images live in the vault; the AI builds in Blender; a second agent compares the result with the reference, scores it and says what is missing; the builder redoes it until the critic agrees; then the whole journey is saved so the style is remembered.

**What PlazCode can do TODAY (verified in the code):**
- A builder/reviewer split exists as roles inside the SAME chat (`plazcode_agent` with planner, builder, reviewer, debugger prompts). It is not a separate AI instance.
- `plazcode_screenshot` already captures Blender (`get_viewport_screenshot`) or Studio and attaches the picture to the chat through the site's image-attach path (`P.attachImages`). So the AI can see its own result.
- Blender is driven through the Blender add-on connection (execute code, scene info, screenshot).
- The Ultra pack already has `ul-3d-model`, `reference-library` and check-cycle skills, so there is existing "do it, check it" know-how to build on.

**Design (works in 1.24.21):**
1. Style note holds a **rubric** (for example silhouette, proportions, colour and material, detail level, clean geometry) and links to the reference images in `_attachments/`.
2. Loop: builder builds in Blender -> `plazcode_screenshot` -> the AI switches to the **critic role**, with the reference image(s) attached again from the vault (`add_image`/read returns the image through the same path screenshots use) -> the critic MUST score every rubric line 1-10 with one sentence each, list "what is missing", and may only say APPROVED when the total is at or above the threshold (default 80 percent) -> the builder fixes exactly the listed gaps -> repeat, maximum 5 rounds (setting) so it cannot loop forever, with the existing stall guard still active.
3. On approval (or when the limit is reached): write a **Journey** note (rounds, scores, what was wrong each time, what finally fixed it, the final screenshot), then update the **Style** note with the new lessons and rubric tweaks, add links and update `Index.md`. Next time the AI reads the style note first, so it starts better.

**Honest limits:**
- The critic is the same chat and model wearing a different hat, not an independent second brain. The forced rubric scoring, re-attaching the reference every round and the round cap reduce "grading its own homework" but do not remove it.
- It needs a chat site that accepts images. If not, the loop falls back to text rubric checks and says so.
- A truly separate critic (second chat tab or another AI site judging) needs multi-tab orchestration: that is follow-up work for 1.25.0, not 1.24.21.
- Returning a vault image to the AI uses the same image-result path as screenshots; this must be confirmed in the build step (tool result with image from the app side), because screenshots currently come from Studio/Blender/tab capture, not from a stored file.
- Not tested on a live Blender plus live AI site. That will need the owner's help to try.

## 7. Scope for 1.24.21, effort and risk
**Ship in 1.24.21 (minimum useful slice):**
1. The vault folder, structure, `plazcode_vault` tool, start-note prompt, migration from `memory.json`, learning instructions, settings (location, open folder, learning switch, forget).
2. The critic loop as built-in instructions (prompt template plus rubric/journey note templates), using existing screenshot and role features.
3. Tests and 15 languages.

**Follow up in 1.25.0:** independent critic in a second chat, Obsidian CLI integration (optional), semantic/AI-assisted search, vault health check ("find duplicates, stale and orphan notes"), graph-style view inside PlazCode, history/rollback integration (planned item 12), Notion/other-site project log (planned item 14).

**Effort and cost (honest):** this touches the hash-pinned `core/main.js`, adds a new Rust module and a new settings panel in 15 languages. Expect several CI rounds, and because it changes the app, **rule 5 applies in full: the Mac desktop test is required** and a new app build must be tested by testers. GitHub's Mac machines were scarce today (took seven tries), so schedule that. 1.24.21 is otherwise ready, so this delays its publication by roughly the time to build, test and re-validate. If the owner wants 1.24.21 out sooner, the same feature can still ship as 1.24.22 with no loss.

**Risks:** AI writing junk or wrong notes (mitigated by rewrite-not-append, status/superseded, verify-before-trusting, caps and the learning switch); token cost of a big vault (mitigated by index-first loading); path-escape or secret-leak bugs (mitigated by tests and a strict sandbox); losing old notes during migration (mitigated by keeping `memory.json` and a migration test); prompt changes in `core/main.js` accidentally breaking provider flow (mitigated by the preservation and regression tests).

## 8. Questions the owner must decide (with my recommendation)
1. **Own vault or integrate with Obsidian?** Recommend own vault now (works for everyone, legal), optional Obsidian open button.
2. **Should the AI write notes automatically?** Recommend yes by default but with a visible switch and a daily "what I learned" log; user can forget any note.
3. **Should vault writes be allowed in Read-only mode?** The vault is PlazCode's own data, like today's memory. Recommend yes for the vault folder only (nothing else), and confirm this in the code before building because Read-only handling of memory tools must be checked.
4. **Where does the vault live?** Recommend PlazCode data folder by default, with a "choose folder" option so you can point it at an existing Obsidian vault.
5. **Critic rounds and pass mark?** Recommend max 5 rounds and 80 percent, both changeable.
6. **Ship in 1.24.21 or release 1.24.21 now and put this in 1.24.22?** You said this version. It is doable but delays publish by one full build-and-Mac-test cycle or more; say if you prefer to split.

## 9. Sources
- Obsidian terms of service: https://obsidian.md/terms (no redistribution or sublicensing of the software)
- Obsidian "free for work": https://obsidian.md/blog/free-for-work/
- Obsidian CLI help (needs Obsidian 1.12.7+, app must be running; read, create, append, search, files): https://obsidian.md/help/cli
- Guide: vault structure, note types, tiered loading, index first, token-saving practices: https://github.com/Jrcruciani/obsidian-memory-for-ai/blob/main/guide.md
- obsidian-second-brain project (rewrite over append, redirects instead of delete, freshness and duplicate linting, abstain when unsure): https://github.com/eugeniughelbur/obsidian-second-brain
- Obsidian memory for agents, staleness and "memory lying" write-up (not fetched in full): https://zchmael.substack.com/p/how-i-keep-my-ai-agents-obsidian
- Code facts verified in this repo: `agent/src/memory.rs`, `core/memory.js`, `agent/src/engram.rs`, `core/main.js` (plazcode_agent roles, plazcode_screenshot, attachImages), `agent/src/blender.rs`, `core/ultralab/skills/reference-library`.
