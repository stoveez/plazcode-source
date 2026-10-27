# PlazCode 1.24.21: safety limits, action log, site setups, skill sharing, connectors

Owner asked for five features in 1.24.21 (alongside Fix connection) and asked
Claude to choose the approach and build all of them in order without stopping
for approval. Nothing is published without the owner's confirmation.

## What already exists (build on it, do not duplicate)
- `agent/src/checkpoints.rs`: per-task journal with file before/after copies,
  protected paths, whole-task revert and single-file restore (desktop Task Center).
- `checkpoint_tool` in `agent/src/main.rs`: the one place every AI tool call from
  the extension runs through (`call_tool` frames carry `checkpoint_id`).
- Ask mode (`permMode === "ask"`) with `requestApproval()` in `core/main.js`.
- Skill import of one JSON or pasted text, and per-skill export (`core/skills-ui.js`).
- MCP add-on catalog with Blender, Context7, Fetch, Git, Memory, Thinking.

## 1. Safety limits
New synced preferences (extension storage <-> app `settings.json`):
- `rsReadOnly` (default off): the AI may look but not change anything. Blocks
  every change command (file writes/edits/moves/deletes/downloads, commands,
  process kill, mouse/keyboard, app launch, Studio and Blender changes, add-on
  tools that are not read-only by name). Enforced twice: friendly refusal in the
  extension before dispatch, hard refusal in the app's `checkpoint_tool` for any
  AI task (non-empty `checkpoint_id`) and for every AgentScript call.
- `rsConfirmDelete` (default on): before a file/folder delete, or a command that
  looks like a delete (`rm`, `del`, `rmdir`, `rd`, `Remove-Item`, `erase`,
  `unlink`, `shred`), PlazCode shows the existing approval prompt. The app
  refuses the same calls unless the frame says `confirmed: true`, which the
  extension sets only after the user clicks Allow (never from AI arguments).
- `rsAllowedFolders` (default empty = no extra limit): with Full PC access,
  absolute paths must sit inside the workspace or one of these folders
  (canonicalised, so `..` and links cannot escape). Commands are not limited by
  folder; the UI says so and points to Read-only or Ask for commands.
UI: a "Safety" section in the PlazCode bar menu and the app Settings page.
The AI's state line says when read-only mode is on so it does not keep trying.

## 2. "What just happened" log with undo
- Journal records an event per tool call: time, tool, short target (path,
  command, Studio tool), result ok/failed, and whether the file change can be
  undone. Bounded (200 events per task).
- `core/action-log.js` turns events into plain sentences ("Edited
  src/main.lua", "Ran command: npm test", "Deleted notes.txt") and renders a
  list with an Undo button per changed file. Used by a new "What happened"
  panel in the bar (menu button) and by the app's Task Center.
- Undo = existing single-file restore, which already refuses when the file
  changed since. Restore is now allowed even when the task also ran commands
  (those block only whole-task revert); a per-file `unsafe` flag still blocks
  files that changed outside the task between steps. Deleted files restore
  from their saved copy (files up to 4 MB; folders are listed as not undoable).

## 3. Saved setups per site
- `core/site-setups.js`: a setup is { engine, effort, reasoning level, access,
  plan mode, extra thinking, instructions, memory project, pinned skill ids,
  tool add-ons on }. Stored in extension storage `rsSiteSetups` keyed by site
  (provider id, e.g. `chatgpt`, `notion`, `clickup`, `claude`).
- Menu section "Setup for this site": Save current setup, Apply, Auto-apply when
  I open this site (toggle), Remove. Applying writes the stored settings,
  turns listed add-ons on (never turns others off), sets the chat's memory
  project, and pins skills: pinned skills are added to the task's skill
  reference as always-use, without changing global favourites.

## 4. Shared skills library
In the app's Skills page:
- Select several skills -> "Export pack" downloads `name.plazskills.json`
  ({format:"plazcode-skill-pack", version:1, skills:[public fields]}).
- "Copy share code": `plazskill:` + base64url(JSON) for one or more skills, to
  paste in Discord or a message.
- Import accepts: one skill JSON, a pack, a share code, pasted text, a file, or
  an https link (GitHub, Gist, raw text). Links are fetched by the app with a
  1 MB cap and https only.
- Every imported skill arrives unconfirmed and off, with a "From: <source>" note,
  and never overwrites an existing skill. The user reviews then turns it on.

## 5. More connectors
Add pinned catalog entries (exact versions, like the rest of the pipeline):
- Figma: `npx -y mcp-remote@0.15.1 http://127.0.0.1:3845/mcp` (needs Figma
  desktop with the Dev Mode MCP server turned on).
- Unity: `uvx --from mcpforunityserver==10.3.0 mcp-for-unity --transport stdio`
  (needs the MCP for Unity package in the Unity project).
- Browser: `npx -y @playwright/mcp@0.0.83` (a separate browser window PlazCode
  controls; not the user's signed-in browser).
Read-only mode lets add-on tools through only when their name starts with a
read verb (get/list/search/read/inspect/find/browser_snapshot/
browser_take_screenshot/browser_console_messages/browser_network_requests/
browser_tabs).

## Testing
- Rust unit tests: read-only gate, delete confirmation gate, allowlist
  resolution, event recording, per-file restore after a command, deleted-file
  restore.
- JS tests (node + jsdom): safety classification, action-log sentences and undo
  wiring, site setup capture/apply, skill pack/share code/link import parsing.
- Existing suites, locale checks and the desktop regression pin stay green.
