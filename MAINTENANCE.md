PlazCode 1.22.1 — Model Builder, Notion and add-on fixes

Model Builder and UI Builder Generate works again, Notion AI turns no longer stop with Message was not confirmed after an accepted message, Studio add-ons such as robloxstudio-mcp stay connected during long playtests, and Git, Ollama and Roblox requests no longer fail or wait forever.

- Add-on tools get the time they ask for: a tool's own timeoutMs or timeout_seconds is honored (plus 30 seconds, up to 10.5 minutes), and Studio add-ons such as robloxstudio-mcp get 5.5 minutes by default.
- Ollama chat waits up to 10 minutes for an answer, so large local models on a CPU still have time to reply. Past that, the Ollama page shows OLLAMA TIMED OUT. Listing models gives up after 5 seconds.
- Each Roblox request (developer products, universe lookup) ends after 20 seconds with a message naming the address that did not answer.
- Generate in the desktop Model Builder and UI Builder no longer fails with Invalid desktop agent action.
- creation_preview no longer fails with action_id must be a string when the AI leaves out the blueprint action_id; a preview ID is filled in.
- When the AI wraps a tool such as creation_preview in a Studio MCP skill call, PlazCode runs that tool directly instead of returning Unknown skill.
- Notion AI: the composer is found again when Notion renders it as a page-style block next to its own send button, so accepted messages are confirmed instead of stopping the turn with Message was not confirmed.
- A slow add-on tool call no longer kills the add-on server. PlazCode cancels the call and keeps the server, so robloxstudio-mcp keeps its Studio plugin connection; the server restarts only after two timeouts in a row.
- The Git add-on finds Git installed after PlazCode started (current user and system PATH), and Git from GitHub Desktop or Chocolatey.
- The Ollama page no longer stays on the thinking indicator forever when Ollama accepts the connection but never replies.

PlazCode 1.22.0 — Copy debug report

Settings in the desktop app now has a Copy debug report button at the bottom. It copies a report of recent PlazCode and AI-site errors, warnings and info, with the file and function involved and the likely cause, ready to paste into an AI chat for debugging.

- Copy debug report at the bottom of Settings in the desktop app, with Show report to read it first. The report lists PlazCode errors and warnings, errors from the AI site itself, recent info, failed bridge requests, agent events and the desktop log.
- Each problem in the report names where it happened, such as core/main.js > sendPrompt, and the report starts with the most likely causes.
- Keys, tokens, cookies, user names, e-mail addresses and chat text are removed from the report, and the report stays on this computer until it is copied.

PlazCode 1.21.1 — No more hang on Starting Up

The agent no longer hangs on Starting Up when the PlazCode bridge stops answering, the extension always answers its own startup checks, and the Notion AI chat box is also found when its placeholder reads How can I help.

- Every request to the PlazCode bridge now gives up after a time limit, and background checks for memory, status and updates never run twice at the same time.
- Starting an agent could hang on Starting Up when the bridge accepted a connection but never replied, because waiting background requests filled the browser's connection limit.
- An unexpected error while handling an extension message could leave the bar waiting forever. An error reply is now always sent.
- The Notion AI chat box was not found when its placeholder read How can I help instead of the known wording.

PlazCode 1.21.0 — Working Model Builder and UI Builder, Studio vision, asset upload and DeepSeek rate-limit handling

The Model Builder and UI Builder now generate with the AI selected in PlazCode and insert into Roblox Studio 1:1 in front of the camera, PlazCode reviews Studio screenshots after visual changes and fixes problems on its own, assets can be uploaded to Studio from the toolkit or by asking the AI, and DeepSeek rate limits are waited out instead of stopping a run.

- Model Builder and UI Builder have a simplified layout: prompt, detail and style options, reference image, presets, a live preview, recolour and size controls, revise-by-request and saved creations.
- The UI Builder preview switches between phone, tablet and PC sizes.
- Upload to Studio in the toolkit lists every uploadable asset (models, animations, sounds, images and more) with search. The AI can also upload an asset when asked.
- Automatic Studio vision: after a visual change, a Studio screenshot is reviewed and problems such as misplaced parts, VFX or weapon grips are fixed without being asked.
- Seconds between commands setting (0 = no pause, the previous behaviour) to stay under provider rate limits.
- Saved memories now have a title describing what each memory is about.
- Builders use the AI currently selected in PlazCode instead of a separate model.
- Insert into Studio builds one Model in front of the camera, snapped to the ground, as a single undo step (Ctrl+Z).
- DeepSeek busy or rate-limit replies are waited out automatically with growing pauses (5 s to 120 s) and the last message is resent, with no retry limit. Stop still works during the wait.
- Repeated failed commands no longer pause a run; the AI is told to change approach instead.
- The memory settings page is simplified and the separate Engram section is removed.
- Image-to-model keeps refining until the result matches the reference instead of stopping after two rounds.
- When the PlazCode bridge is running in Roblox mode, other bridges or AI tools holding the Studio MCP connection are closed so the agent can start.
- Model Builder and UI Builder did not produce or insert anything.
- The clarify tool failed with Recommend one option and explain why, which could trigger the repeated tool failures pause.
- Test windows no longer pop up on screen while tests run.

PlazCode 1.20.0 — Notion in Edge, fewer stalled runs, accurate Studio status and a sturdier updater

Notion AI now loads in Microsoft Edge, cut-off commands no longer pause a run after three tries, a tool result is no longer sent to the AI more than once, the bar no longer reports MCP as off while Roblox Studio is connected, and the desktop updater keeps working when the GitHub API is unreachable.

- When Notion AI is slow to load in Microsoft Edge, the Notion AI isn't ready message now includes an Edge-specific tip.
- Cut-off (incomplete) commands no longer pause a run after three failures. Six attempts are allowed, and from the second one the AI is asked to split the edit into smaller parts.
- The Studio connection check now tolerates a single missed status reading and an empty status line, so a connected Studio MCP stays shown as connected.
- Notion AI could fail to load in Microsoft Edge with Notion did not load its AI editor at /ai after 60 seconds, because Edge can report a window height of 0 while the page loads. The chat box is now found in that case.
- The same tool result (for example the list_commands output) could be sent to the AI several times. A result that was already delivered is not sent again within 45 seconds, and results with images or very long text are never retried automatically.
- The bar could show Studio is open but MCP is off while Roblox Studio showed 1 client connected.
- An update could fail with error sending request for url when api.github.com was unreachable or returned a server error. The updater now retries once and then downloads the fixed official release asset, still verified against the published SHA-256.
- The update window could show Update could not finish next to Update ready. A ready update now clears the earlier error.

PlazCode 1.19.39 — Hidden bar frees the chat box, steadier Notion runs and a continuation setting

Hiding the PlazCode bar now returns the chat box to its normal size, Notion tool results are no longer lost when Notion confirms a message late, the bar says what the agent is doing while it works, and a new setting turns the continue-previous-chat prompt on or off.

- Setting: Offer to continue previous chat (on by default). It is in the PlazCode bar settings and in the desktop app under Settings, and the two stay in sync. When it is off, a new chat never asks whether to continue the previous chat or start a new project. Saved chats and memory are not deleted.
- While the agent works, the bar now says which step is happening: running a tool (with its name), sending the result to the AI, the AI writing, or waiting for the AI to finish. A working agent no longer looks stuck when the site's own Stop button has already turned back into Send.
- The message for a chat without an agent is clearer: Not connected to this chat yet. Click Restart Agent to connect Roblox Studio (or AgentScript when AS is selected). The full status text also shows when you hover over it.
- If PlazCode could not deliver a tool result before anything was sent (for example the chat box was not ready yet), it now waits 2 seconds and tries once more instead of stopping the task. A message that may already have been sent is never sent twice.
- Fixed hiding the PlazCode bar leaving the chat box enlarged. The hidden bar now gives back the space it reserved, so the chat box returns to its normal size and no longer covers chat text. Showing the bar again restores it exactly.
- Fixed Notion runs stopping with Message was not confirmed when Notion accepted a tool result but showed it late. PlazCode now keeps watching for up to 30 more seconds (without clicking Send again), so the AI gets its result and the run continues.
- Fixed duplicate files in the source download. The release tools folder of PlazCode-source-1.19.38.zip contained two copies of five files; the packager now writes each file once and checks every ZIP for duplicate entries.

PlazCode 1.19.38 — Faster Notion start, bar on the chat box and fewer tool errors

Start Notion agents in seconds instead of waiting up to a minute, keep the PlazCode bar on top of the Notion chat box, repair common tool-call formatting mistakes automatically, fix the Git MCP server and find updates sooner.

- Automatic tool-call repair. Before a command runs, PlazCode fixes common formatting mistakes from the AI: arguments sent as a JSON string, quoted numbers, true/false and lists, wrong capitalisation of allowed values, Luau code wrapped in code fences and stray spaces in tool names. Real mistakes are still reported to the AI.
- Notion starts the agent as soon as its chat box and send button are visible. PlazCode no longer waits up to 60 seconds for Notion to confirm the editor, so Start and Restart finish in a few seconds.
- Update checks retry once with separate time limits, and the background check allows 15 seconds instead of 8, so a slow response no longer hides a new version.
- An update found while PlazCode is idle installs within 30 minutes. It still never interrupts a running task.
- Fixed the PlazCode bar on Notion floating away from the chat box. It now sits directly on top of the chat box, follows it when it moves and stays centred on the chat column.
- Fixed the Git MCP server failing to start when Git was not on the PATH used by PlazCode. PlazCode now also checks the usual Git install folders and shows a clear message if Git is missing.
- Fixed new versions sometimes not being detected until PlazCode was updated by hand.

PlazCode 1.19.37 — Hide bar, steady bar size and Mac fixes

Add a Hide bar button that keeps PlazCode working, keep the bar a steady size and on top of the chat box, fix Blender MCP on Intel Macs and fix macOS updates that could not find the PlazCode folder.

- Hide bar button (›) on the PlazCode bar. Hiding only makes the bar invisible and click-through so it never covers chat text; runs, Co-Work, tools, desktop Start/Stop and every setting keep working. A small PlazCode tab at the bar's right edge shows it again in the same position with every control as it was. The choice is remembered for that browser tab.
- The bar keeps the same compact height in narrow or zoomed browser windows instead of growing to about twice its normal height below 720 pixels wide.
- On Notion, while the chat box is still loading or not yet confirmed, the bar sits on top of the visible chat box instead of floating over chat text at the centre of the window.
- macOS launch scripts clear the download quarantine flag and remember the PlazCode folder, so macOS runs PlazCode.app from its real folder.
- Fixed Blender MCP (and other uvx servers) failing to start on Intel Macs with "maturin failed" while building cryptography. cryptography 49 and newer have no Intel Mac package, so uv now uses the newest version that does (48.0.1) instead of compiling it; Apple Silicon, Windows and Linux are unchanged.
- Fixed macOS updates failing with "The application was moved outside its PlazCode installation folder" when macOS ran PlazCode.app from a temporary read-only copy (App Translocation) or when only PlazCode.app was moved. PlazCode now finds its recorded folder, and explains the one-time fix if it cannot.

PlazCode 1.19.36 — Faster ChatGPT startup and reliable unattended runs

Start ChatGPT sessions faster, keep long unattended runs going in background or sleeping browser tabs, and make Windows auto-updates recover from a locked PlazCode.exe without restart loops.

- Unattended-run protection. While an agent run is active, PlazCode keeps its tab from being discarded by Edge sleeping tabs or Chrome Memory Saver, keeps the run's timers on schedule in hidden or covered tabs, and tells the desktop app that work is in progress so an automatic update waits until the run finishes.
- Update failure record. A failed Windows update is written to logs/update-failure.json with its version, attempt count and message.
- ChatGPT startup and each tool step finish sooner. PlazCode recognizes ChatGPT's finished-turn controls instead of waiting out fixed idle timers, which removes up to about 4 seconds from the startup handshake.
- Windows updates rename a locked PlazCode.exe or other locked file aside and install the new copy instead of failing, then delete the renamed files on the next start.
- Desktop downloads allow up to 30 minutes and fail only after 60 seconds without progress, so slow connections finish instead of timing out at 3 minutes.
- After a failed automatic update, PlazCode waits 10 minutes before trying again, doubling up to 6 hours. A newer version or a manual update starts immediately.
- Notion waits up to 60 seconds for its AI editor to load, which covers slow Microsoft Edge cold starts.
- Tool-call parsing accepts commands written with params before the command name, trailing commas and no-break spaces between JSON tokens.
- Fixed a restart loop where a failed Windows update relaunched PlazCode, which updated again immediately and closed the app about every minute.
- Fixed a tool command running twice. When the desktop app restarted or updated while a command was running, the browser extension resent it after reconnecting; it now reports the uncertain result and asks the model to check the current state first.
- Fixed tool timeouts asking the model to retry blindly. Timed-out commands may still finish in Studio, so the model is told to check the result before running them again.
- Fixed automatic updates being postponed indefinitely while the browser extension was open, and being able to restart the bridge during a long model reply.
- Fixed leftover download folders from interrupted desktop updates never being removed.
- Fixed a failed download turning off automatic installs until PlazCode was restarted.

PlazCode 1.19.35 — Reliable Notion file uploads and faster Windows updates

Retry stalled Notion protocol file uploads automatically so long tasks keep running, and make Windows updates download faster and wait longer for PlazCode.exe to close.

- Automatic retry for Notion protocol file uploads. When Notion ignores the file or its upload spinner never finishes, PlazCode removes only its own file, pauses and uploads it again, up to four attempts, alternating between Notion's file picker and drag-and-drop.
- Notion tool results and startup messages continue without stopping the task when a single upload stalls. Nothing is submitted until the file finishes uploading, so a retry never sends a message twice.
- The Windows updater downloads the release package without PowerShell's per-chunk progress display, which slowed Update-PlazCode.bat downloads many times over. The updater window still shows its own progress.
- The Windows updater waits up to 60 seconds instead of 20 for PlazCode.exe to be released after closing PlazCode, giving antivirus scans and slow process shutdowns time to finish.
- Notion no longer pauses mid-task and stops with Message was not confirmed after one stalled protocol file upload, during startup or while sending tool results.
- Update-PlazCode.bat no longer takes a very long time on the Downloading update step in Windows PowerShell 5.1.
- Updates no longer fail with PlazCode.exe is still locked when Windows releases the file slowly. If it stays locked, the message names the likely causes: another PlazCode copy started as administrator, an antivirus scan or a pending restart. No files are copied in that case, as before.

PlazCode 1.19.34 — Firefox Notion startup, Co-Work and update-restart fixes

Fix Firefox paste and file delivery for Notion and Co-Work, keep the desktop app open during active work and start ChatGPT commands sooner.

- A Firefox-only page helper that delivers PlazCode paste, file-drop and input events to AI pages with their text and files intact. Chromium packages are unchanged.
- Real-Firefox release checks for the Notion protocol file upload, inline follow-up paste, Co-Work draft clearing and unchanged native page events.
- Automatic desktop updates wait until PlazCode has been idle for 3 minutes. An update found during a task shows Update ready, and Update now still installs immediately.
- After an automatic update, an open desktop window reopens without taking focus instead of restarting minimized.
- ChatGPT commands start 0.5 seconds after the reply stops and its Stop control disappears, instead of after a fixed 1.5-second idle wait. Each command round trip is about 0.8 seconds faster.
- Firefox Notion no longer waits a long time at Start and then fails with Message was not confirmed because the protocol file upload never reached Notion.
- Firefox Co-Work on Notion accepts typed follow-ups while the AI is working, queues them with Enter and clears the composer, matching Chrome.
- The desktop app no longer closes in the middle of a task when an automatic update arrives, and no longer appears to close by restarting minimized after a background update.

## Firefox page events (maintainers)

Firefox hides DataTransfer data/files created by content scripts from page handlers and ignores clipboardData in the ClipboardEvent constructor. The Firefox package therefore adds core/firefox-events.js (first script in each isolated content-script group) and core/firefox-events-main.js (a MAIN-world entry with the same matches). Synthetic paste, drag/drop and input events that carry text or files are rebuilt in the page world; native events and events without data use the normal dispatch. release-tools/build-firefox.py inserts both entries; the Chromium manifest and scripts do not load them. firefox-transfer-check.js verifies Notion protocol upload, inline paste, Co-Work draft clearing and helper semantics in real Firefox (--without-shim reproduces the original failure).

PlazCode 1.19.33 — Firefox installation and authenticated bridge support

Add a Firefox extension package and correct Firefox background startup and desktop pairing.

- A dedicated PlazCode-Extension-Firefox folder in both desktop downloads and a standalone PlazCode-Firefox-1.22.1.zip with manifest.json at its root.
- Firefox installation instructions explain selecting manifest.json or the Firefox ZIP in about:debugging, reloading after updates and the unsigned temporary-install limitation.
- Firefox uses the same provider adapters, tools, bar, creators and settings as the Chromium extension, with a Firefox background script and stable addon identity.
- Firefox requests use the installation-specific extension UUID for automatic pairing, while authenticated desktop HTTP and WebSocket routes recognize valid moz-extension origins.
- Startup prompt limits reserve space for clarification instructions and memory on providers with smaller prompt limits.
- The Chrome-only background service-worker manifest no longer prevents the Firefox package from starting its bridge controller.
- Firefox automatic pairing no longer fails because its addon ID differs from Chrome extension IDs. Invalid, mismatched and webpage origins remain rejected.

PlazCode 1.19.32 — Clarify unclear tasks and fix Blender command results

Add an AI clarification panel with scoped options and explicit answers, and correct Blender command result handling.

- A clarification panel displays the active AI name followed by is asking you…, with 2–3 options, the scope of each, a recommended approach and 1–3 clarifying questions.
- Answers support selecting an option, adding details or proposing a different approach. Submitted answers return to the same AI session.
- Supported AI sessions assess the request before acting and use plazcode_clarify when unclear choices would materially change the scope. Clear tasks can proceed without unnecessary questions.
- The agent waits quietly for an explicit response, without reminders, default selections or automatic timeouts. Waiting pauses the task time budget and does not consume a command.
- The panel uses the current PlazCode theme, responsive spacing, keyboard focus controls and reduced-motion support.
- Blender scene checks use an 8-second command limit. Timeout messages distinguish process/tool discovery from actual addon responses and explain checking or updating the addon without automatically replaying edits.
- Stop or a chat/engine change cancels an unanswered clarification without sending an answer or running the pending work.
- Clarification inputs stay isolated from native AI composer searches and render AI text safely.
- Ordinary Blender commands no longer read unrelated mesh files after receiving a result. Named operations parse the current Python output directly and never substitute an older status file.
- Mesh exports read only the mesh file identified by the current response. Concurrent Blender commands return a clear busy message instead of silently waiting in a queue.
- Blender transport failures clear extension readiness, and completed commands clear their fallback timers.

PlazCode 1.19.31 — Faster Studio detection and reliable Notion send confirmation

Push verified Studio connection changes to the bar and recognize Notion messages in virtualized or slow-loading chats.

- A checking connection state distinguishes the initial Studio handshake from a confirmed disconnected editor.
- Verified Studio connection changes reach connected extension instances immediately without waiting for the heartbeat.
- Studio process detection checks once per second using process names; disconnected editors retry once per second while connected checks retain their existing interval.
- Notion waits up to 15 seconds for message confirmation, including foreground chats.
- Notion Co-Work follow-ups use normal plain-text messages instead of appearing as red code; long follow-up files are described as requests rather than startup protocol.
- Notion messages are confirmed when the transcript replaces or reuses user rows without increasing the visible message count.
- Old identical messages, unrelated new rows and an emptied composer alone do not confirm a send; uncertain sends remain single attempts.
- Studio status preserves the difference between a running Studio process and a verified MCP connection.

PlazCode 1.19.30 — Safer release packages and visible Co-Work follow-ups

Add verified production packages, persistent follow-up visibility and clearer browser update instructions.

- GitHub build provenance attestations for release downloads, with a separate editable GPL source archive.
- Co-Work follow-ups remain visible in the conversation with queued, sending, sent and unconfirmed states.
- An independent Co-Work composer accepts follow-ups during internal tool feedback writes and retains drafts separately for each chat and engine.
- Production JavaScript removes comments and whitespace while preserving names, execution order and parsed structure.
- Official automatic updates cross-check package checksums against published GitHub release metadata. If that API is rate-limited, downloads use the fixed official asset URL and retain checksum and version verification.
- Official update feeds select the running operating system, including macOS installations made from the combined ZIP.
- Outdated bar messages explain updating the desktop first and reloading the extension at chrome://extensions, edge://extensions or brave://extensions. Other browsers show Outdated.
- GitHub API rate limits no longer prevent otherwise valid official automatic updates or Windows manual updates.
- Error and result cards reserve consistent internal spacing across AI-site wrappers and wrap long labels without overlap.
- Notion command cards retain completed or failed status after stale page updates and response remounts.
- Localized Notion AI composers, including German Frag Notion-KI, anchor the bar to the composer instead of leaving it detached.
- Browser error diagnostics preserve readable details and exclude unrelated site errors from extension error reporting.
- Co-Work follow-ups remain visible after the queue hands them to the AI, including follow-ups attached to tool results.
- The Follow up composer placeholder appears only while the AI is working and restores each site's original placeholder when the task finishes.
- Execution settings separate limits, visual review, help text and continuation buttons into clearly spaced rows.

PlazCode 1.19.29 — Recognizable AI icons in the supported-AI dropdown

Replace supported-AI letter badges with recognizable logo artwork while preserving existing links, layout and behavior.

- Add supplied icons for Gemini, Kimi, Z.ai / GLM, Qwen, Arena, FreeBuff, OxAlpha, Notion AI and Ollama.
- Reuse the existing ChatGPT, Claude and DeepSeek logos in the full supported-AI list.
- Keep a consistent icon frame with preserved proportions, theme-aware styling and offline artwork.
- Keep Crax and Use.ai letter badges unchanged.
- Remove the baked-in checkerboard behind the supplied Arena logo.
- Trim empty artwork margins visually so logos remain legible without stretching or overlapping labels.

PlazCode 1.19.28 — Reliable Blender checks, tab-local engines and update recovery

Verify actual Blender responses, isolate script modes per AI tab, recover missing update helpers and improve Notion/Claude command presentation.

- Test Blender connection verifies an actual addon scene response and explains addon setup separately from the MCP process.
- Browser connection errors include pairing and extension/local-network permission guidance.
- Blender commands use a bounded native TCP bridge instead of temporary PowerShell/Python request files; scene checks finish or report an error within eight seconds.
- RobloxScript and AgentScript choices persist per tab across service-worker restarts. Popup and desktop switches target only the selected AI tab.
- Notion protocol uploads select text-compatible file inputs and allow more time for slow uploads without duplicate submissions.
- Missing update helpers are recovered from the compiled app in temporary staging; incomplete application-only installations receive a clear full-folder extraction error.
- Failed update screens no longer promise a restart that is not pending.
- Blender no longer appears connected merely because a port or MCP process is running.
- Each browser socket has its own connection ID, preventing one browser disconnect from removing another browser connection.
- Claude command frames support deeper wrappers and Copy-to-clipboard controls while preserving narration and ordinary code.

PlazCode 1.19.27 — Separate builders, Studio Toolkit and readable notifications

Separate Model Builder and UI Builder, add the Toolkit page, and introduce notifications that become read when opened.

- Model Builder and UI Builder each have a dedicated page, relevant controls and a filtered saved-draft library.
- Toolkit includes 12 AI game starters, six AI script jobs, six direct lighting presets, seeded terrain generation, Creator Store search and model insertion, a Luau console, Play controls, a read-only health scan and saved place backups.
- A themed notification bell records Studio connection changes, completed AI tasks, update availability and errors, and Toolkit results. Opening the panel marks messages read; read state persists and notifications can be cleared.
- Both builders retain Describe, Review preview and Insert in Studio steps, reference images, revision requests, exports and saved preview edits. UI Builder hides model-only controls.
- Toolkit explains which actions use the AI chat, which run directly in Studio, and which work with saved files.
- New pages use responsive cards, wrapping action rows, consistent gaps, themed focus states and a scrollable sidebar that fits short windows.
- Builder libraries and blueprint imports cannot silently open a draft of the wrong type.
- Terrain accepts seed 0 and replaces only the selected generation area when replacement is enabled.
- Backups verify checksums before restoring, block restoration while Studio is detected open, and preserve the replaced file as another backup.

PlazCode 1.19.26 — Supported AI shortcuts and reliable Studio connection status

Add a supported-AI dropdown to Home, match Quick Access icons, and fix conflicting Studio connection checks.

- Home includes an All supported AIs dropdown with launch buttons for every registered browser AI provider and an Ollama website entry.
- Ollama includes a clear note that local chat opens from the browser extension; Notion is labeled experimental.
- AI launch buttons use the same external-browser flow as the recommended ChatGPT, DeepSeek and Claude buttons.
- The dropdown uses a responsive grid, consistent button gaps, wrapping labels and themed focus/hover states.
- Quick Access Tools, MCP Servers, Terminal and Settings icons now use the exact SVG artwork from the sidebar.
- The supported-AI list expands in normal page flow, keeping Task checkpoints & workflows and following content from overlapping.
- The browser bar now reads the desktop’s confirmed Studio connection status instead of ignoring it.
- A missed process scan or a disconnected browser tab no longer clears a verified Studio MCP connection. Unknown probe timeouts retain the last confirmed result; explicit connection failures still disable the agent.

PlazCode 1.19.25 — Reliable updater restarts and clear Notion settings

Confirm the updated desktop has loaded, keep background restarts accessible and hide the floating bar over Notion settings.

- Regression checks cover Notion settings, nested model controls, closing panels and hidden settings.
- Automatic updates wait for a versioned desktop-ready confirmation and retry once if the first launch exits.
- Settings visibility is detected even when the underlying Notion AI chat route stays unchanged. Normal AI chat and PlazCode settings remain usable.
- Windows update installation skips identical files; background restarts remain minimized in the taskbar or Dock without taking focus.
- The floating bar no longer covers Notion settings actions or the Restrict models from Notion Agent dialog.
- Update completion is no longer reported merely because a process launched. A desktop startup failure preserves the installed update and reports startup diagnostics.
- Update helpers run from temporary copies so replacing the installed macOS script cannot interrupt its own execution.

PlazCode 1.19.24 — Clear execution settings, guided creators and readable chat activity

Make execution controls and the model/UI creator easier to use, preserve AI explanations and clean up crowded or unstyled controls.

- Beginner-friendly execution help explains engines, command/time limits, visual review, stop modes, permissions, continuation exports and resuming paused tasks.
- An Engram guide explains project notes, searching, fact IDs, topic keys and the difference between memory, saved logs and continuation files.
- Creators now follow Describe → Review preview → Insert in Studio, with labeled inputs, simpler edit buttons, an AI readiness explanation and optional file/feedback controls grouped separately.
- Desktop and extension numeric/select controls use themed backgrounds, clear borders, focus states and consistent spacing. Saved-chat controls and creator edit actions have explicit gaps.
- Changes to execution limits sync into open browser chats; 0 remains unlimited and applies to the next run or resumed allowance.
- Command cards keep readable spacing and left-aligned labels. Collapsing activity no longer hides assistant explanations or original user requests.
- Desktop refresh no longer resets command/time values while a field is focused or its change is being saved. Empty or invalid numeric changes are not saved as limits.
- Ordinary assistant prose followed by a tool result is no longer replaced by a tool-only chip.
- DeepSeek no longer interprets “Stopped” inside generated code or prose as a site stop notice; message IDs take priority over recycled virtual-list keys.
- An unfinished DeepSeek command block no longer masks every following paragraph.

PlazCode 1.19.23 — Correct Chrome extension version labels

Fix Chrome showing extension version 1.19.16 despite newer extension files being installed.

- Release validation checks both extension manifests for contradictory displayed and actual versions.
- Chrome uses the actual manifest version as the extension display version, removing the separately maintained version label.
- Removed the stale version_name value of 1.19.16 from both extension manifests.

PlazCode 1.19.22 — Reliable PlazCode application and background tray icons

Complete the Windows application icon fix and correct the updater notification icon copy.

- Retains the embedded PlazCode application icon introduced in 1.19.21, with nine sizes from 16 to 256 pixels.
- Windows icon checks now inspect the updater tray icon pixels and verify that the installed icon file can be replaced during updates.
- The updater now copies a fully loaded native icon, preventing corrupted tray pixels after its icon input stream closes.

PlazCode 1.19.21 — Branded Windows application and tray icons

Add the missing PlazCode application icon to the Windows executable and background tray.

- Embedded multi-resolution PlazCode icon includes 16–256 pixel sizes for Windows application files and display scaling.
- The application window, taskbar and background tray share the existing orange PlazCode brand mark.
- The updater uses the PlazCode icon for its progress window and background tray notification while retaining the selected theme and background behavior.
- File Explorer and the running application tray no longer fall back to the generic white and blue Windows application icon because the executable lacked an icon resource.

PlazCode 1.19.20 — Clear Settings icon at sidebar size

Correct the distorted Settings wrench and gear while retaining the 1.19.19 navigation and updater improvements.

- Redrawn wrench, handle opening and gear geometry follow the supplied reference with a thinner outline and clear spacing.
- Settings keeps consistent stroke proportions in selected and unselected states, including shared themes and display scaling.
- Removed the mismatched gear transform and crowded strokes that made Settings look distorted at normal sidebar size.

PlazCode 1.19.19 — Updated navigation icons and theme-aware background updates

Refresh Home, Templates and Settings icons and keep automatic updates from interrupting the foreground app.

- Non-activating update progress and a tray notification explain automatic background updates on Windows.
- Background relaunch mode keeps an automatically updated desktop behind the current app.
- Home uses a house icon, Templates an open folder with a document, and Settings a gear with a wrench, based on the supplied references.
- Windows update animation follows the saved PlazCode theme, glow and gradient settings. PlazCode Orange keeps its default update colors.
- Manual updates retain visible progress; automatic updates use foreground progress when PlazCode is active.
- Release descriptions use a title, short summary, New additions, Improvements and Bug fixes.
- An automatic update no longer brings the Windows progress window or relaunched desktop to the foreground when PlazCode is in the background.
- The macOS automatic updater relaunches a background desktop without activating it.
- Official release checks migrate the previous PlazCodeneww feed to the renamed PlazCode repository while preserving custom update feeds.
- Published feeds keep recent descriptions within the updater size limit; the complete release history remains in release-notes.json.

PlazCode 1.19.18 — Engram memory, larger templates and automatic creator enhancement

Persistent project memory and clearer saved chat logs improve continuation across chats. Large templates stream in small chunks, creator requests reuse the prompt enhancer automatically, and saved memory expands to 500,000 characters.

- Bundled Engram 3.0.0 with local project-isolated databases, memory search, observation reads, stable topic updates and session summaries.
- Engram context recall during tasks and new-chat continuation, plus durable completed/interrupted checkpoint references. Current project state is checked before resuming historical work.
- Desktop controls to review/search/read/save/soft-remove project observations and download retained saved chat logs.
- Automatic prompt enhancement before chat-driven model or UI creation, using the existing enhancer rules and preserving the original constraints.
- Saved memory capacity increases from 150,000 to 500,000 characters in total, including adding, editing, importing and restoring notes. Long notes remain available through paged reads; prompt previews stay bounded.
- Template uploads accept .rbxl, .rbxlx, .rbxm and .rbxmx files up to 512 MiB using 2 MiB chunks, progress reporting, cancellation and asynchronous indexing.
- Template search accepts descriptions of systems and matches related script paths and source, with synonym/plural handling, bounded previews and exact paged script reads.
- Template indexing supports up to 10,000 scripts, 64 MiB of source per template and 128 MiB across the catalog. The original uploaded file is preserved exactly.
- The 1.19.17 desktop design, twelve themes and automatic-update fixes remain included. Separate normal and macOS downloads contain rebuilt native apps.
- Oversized saved notes no longer prevent chat-context restoration: full notes are stored while only short reference excerpts are sent.
- Automatic creator enhancement cancels on Stop or chat changes, coalesces concurrent attempts and reuses a manually enhanced prompt without another rewrite.
- Project memory does not cross into unrelated project databases. Disabling automatic memory blocks automatic observations and checkpoint writes while keeping explicit manual saves available.
- Corrupt or unreadable chat archives are preserved and reported instead of overwritten. Log exports expose retention omissions.

PlazCode 1.19.17 — Visible desktop revamp and persistent automatic updates

A more visible upgrade to the existing desktop workspace, paired with automatic installation for updates detected after launch and accurate desktop build detection.

- Larger stacked AI launch cards, a stronger session panel, four separate status cards, and framed Quick Access and Recent Activity panels.
- A clearer navigation rail, larger headings, more readable card text, improved input controls, and consistent spacing throughout the desktop.
- Separate running desktop and extension version reporting, with native build requirements in both platform release feeds.
- Smooth CSS hover, press, and navigation transitions retain existing controls and workflows. Reduced-motion preferences remain respected.
- All twelve themes remain available, including Oceanic, Copper Atelier, Aurora, Orchid Noir, and Solar Dusk.
- Responsive layouts adapt the upgraded workspace to wide, medium, and compact windows.
- Automatic installation stays enabled after an up-to-date launch check, so releases detected while the app remains open can install.
- Verified same-version Windows packages can repair an older executable without bypassing checksum/version verification or permitting package downgrades.
- Extension manifest updates no longer hide an older running desktop executable or make its older interface appear current.
- Background release checks are spaced thirty seconds apart, replacing the two-second network loop. Transient check failures retry; installer failures remain visible and avoid repeated install loops.

PlazCode 1.19.16 — Workspace design upgrade and new themes

A visual refinement built on the existing workspace layout, with smoother interaction tweens, clearer controls and five new shared themes. Startup update detection also receives dedicated macOS feed freshness protection.

- Five shared themes: Oceanic, Copper Atelier, Aurora, Orchid Noir and Solar Dusk. Each colors the complete desktop surface system, browser bar and extension popup.
- Named theme preview tiles with visible selection and keyboard focus states.
- Workspace card spacing, rounded surfaces, session hierarchy, navigation feedback and form styling build on the existing desktop design.
- Short CSS hover, press and page-entry tweens add interaction feedback without new animation libraries, timers or DOM observers.
- Reduced-motion settings disable desktop transitions and animations, including the update spinner. Existing glow and gradient controls still apply.
- Normal app launch and reopening an existing app instance request automatic installation when a newer published version is detected.
- New palettes stay synchronized across desktop preferences, browser overlays and popup appearance.
- The dedicated macOS release feed now uses the same commit-pinned freshness lookup and cache-busting fallback as the normal feed. Platform feed cache entries cannot reuse another platform payload.

## PlazCode 1.19.15: Create models and UI directly in chat

- Asking an active RobloxScript AI chat to make a model or UI uses PlazCode's saved creator workflow. The desktop creator page does not need to be opened.
- The AI saves shape/layout and detail passes with creation_preview, then calls creation_insert with the exact ready draft revision for Studio creation requests.
- Insertion reads the saved blueprint rather than recreating it in Luau. Geometry, hierarchy and supported properties use the same validated compiler.
- Preview-only/draft-only requests stay out of Studio. The desktop Create preview flow remains preview-only. Existing script repairs and AgentScript retain their normal tools.
- Duplicate insertion calls retain their outcome; stale drafts, concurrent insertion, Stop, chat/engine changes and unconfirmed Studio results are handled explicitly. Finished/uncertain passes require inspection before retrying.
- Saved root-parent and absent-name normalization is repaired in the chat insertion path without changing the stored draft.

This extension-only update retains the signed 1.19.14 Windows/macOS native components. Studio rendering can differ from the creator preview; data parity does not promise pixel-identical lighting, materials, fonts or advanced layouts. Live signed-in AI chats and real Studio insertion remain unverified.

- Each GitHub release offers PlazCode-VERSION.zip for Windows and PlazCode-macOS-VERSION.zip for Mac. The normal package retains compatibility with older shared-feed Mac updaters. Mac setup/start launchers select latest-macos.json and preserve custom feed settings.

Reload the extension AND refresh open AI tabs after updating.

## PlazCode 1.19.14: Creators, native macOS and launch updates

### Model and UI creators

- A compact prompt row, Preview/Blueprint tabs, export/insert controls above the preview, and an "Ask for a change…" row below it.
- Models: Realistic, Low poly, Cartoon and Blocky styles; shape/detail passes; part colour/material edits; undo; recolour; resize; ground alignment; optional welded insertion; .rbxmx and preview PNG export.
- UI: Phone/Tablet/PC preview, list/grid layout support, gradients, readability/tap-target checks and optional hover/click/panel animations.
- Saved drafts and explicit likes/improvement notes inform later creation prompts. Revisions target stable node IDs instead of replacing the complete build.
- Use an active RobloxScript chat to Generate, revise or Insert. AgentScript remains available for ordinary project work. Draft previews do not modify Studio until you choose Insert.

### Desktop updates and macOS

- Desktop launch checks quietly and installs the latest complete release directly when outdated. The app shows progress for the actual download/install; extension reload and chat-tab refresh remain manual.
- A native universal macOS app supports Apple Silicon and Intel. macOS launchers, StudioMCP discovery, startup locking and file/browser opening have platform-specific handling.
- Creator drafts join settings, memory, templates and MCP configuration outside the replaceable installation. Corrupt creator libraries are reported rather than overwritten.

### Scope and validation

Creation uses the current browser AI, with bounded completed build passes rather than token-by-token rendering. Advanced UI layouts, live Studio appearance and reference fidelity still require Studio review. The Mac app is ad-hoc signed, not Developer ID notarized; first-launch approval may be required. Native automated tests do not establish live signed-in AI-site, desktop GUI or Roblox Studio compatibility.

After updating, reload the extension AND refresh open AI tabs.

### Maintaining creators and native platforms

Creator drafts, geometry, validation and insertion passes live in core/creator.js; desktop preview controls live in core/creator-ui.js. Native storage/export live in agent/src/creations.rs and creation_export.rs. Preserve stable IDs, revision checks, typed properties, pass limits and explicit Studio insertion. Never silently truncate drafts or claim saved previews changed Studio. Keep creator data outside the installation and release ZIPs.

When embedded desktop/creator assets or Rust change, build and validate Windows plus both macOS architectures. Combine the Mac slices, sign and verify the bundle, and preserve executable permissions in the ZIP. Ad-hoc signing does not replace Developer ID notarization. Extension-only updates may retain the existing signed native component; never force a native rebuild just to match the package version or downgrade a native component.

Run current JS regression fixtures and authenticated bridge smoke tests. Check Windows updater locks/process scope and runtime installation on Windows, and Mac preflight on macOS. Preserve provider/startup contracts, user data, Stop and native composers. Record benchmarks and live-test limits in VALIDATION.txt. Publish one current complete ZIP, a new GitHub Release and matching SHA-256 feed; retain prior release history.

## PlazCode 1.19.12: Consistent package versions and current release checks

- Sidebar, title, Settings and Updates display the same installed package version. An independently versioned app binary no longer produces a contradictory outdated badge.
- BAT update checks request uncached current release metadata. Both update paths select the latest complete package directly, including across multiple skipped releases.
- Native build and extension are both 1.19.12 in this package. Existing settings, memory, templates and MCP configuration remain preserved.
- BRANDING-NOTICE.txt identifies the official repository/release channel and distinguishes unofficial modified distributions. Existing GPL and third-party licenses remain unchanged. This notice and update SHA256 verification do not prevent copying or modification.

Reload the extension AND refresh open AI tabs after updating.

## PlazCode 1.19.11: Urgent tool-result loop fix

- Fixed `toSend is not defined`, which interrupted normal tool-result delivery after a command executed.
- Outgoing feedback is initialized directly from the completed result. Successful results, formatted errors and screenshots retain their send path and changed-memory context.
- Periodic command-list reminders remain disabled. Existing repeated-failure pause, startup, Stop and recovery behavior remain intact.
- Extension-only hotfix: the native executable remains the unchanged 1.19.10 binary; no Rust/agent rebuild was required.

Reload the extension AND refresh open AI tabs after updating. Settings, memory, templates and MCP configuration remain preserved. Do not assume a command was undone because the old result-delivery error appeared; inspect its result/project state before repeating a mutation.

## PlazCode 1.19.10: Notion startup status and meaningful chat continuation

- Startup command outcomes survive Notion settling under a replacement event anchor. Matching stays scoped to the conversation, original assistant position, preceding user message and command text; later identical commands remain distinct.
- Bootstrap identity is captured before card rendering, and restored completed/error outcomes also prevent re-dispatch.
- Notion result attachments use `plazcode_tool_result_*.txt` and tell the AI to continue the existing handshake or task. The second attachment is the command result, not a second startup.
- New-chat continuation is offered only for chats with real user requests or pending follow-ups. Startup-only records, including legacy exports, are excluded.

Reload the extension AND refresh open AI tabs after updating. Saved settings, memory, templates and enabled MCP servers remain preserved.

## PlazCode 1.19.09: Normal chat flow and targeted command recovery

- Normal replies release the composer before checkpoint bookkeeping. Notion retains its pre-send response identity; stale/duplicate send callbacks cannot start another loop.
- Idle Co-work messages use the site’s normal composer/send path, matching Co-work Off. Active follow-ups keep their existing queue and safe-boundary delivery.
- Removed periodic command-list reminders, full-prompt riders and idle reminder sends. Changed memory context remains supported.
- Explicit command-access refusal triggers a connected-engine check and one same-chat restart handshake, then resumes the unfinished request. Stop, changed chat/engine, disconnected engine and unsent drafts prevent recovery. A repeated refusal stops rather than repeatedly restarting.
- Delayed injection cleanup cannot clear a newer send, and stale cover requests cannot block an idle composer.
- Display versions use 1.19.09, 1.19.10 … 1.19.99, then 1.20.00. Internal Chrome/native versions remain 1.19.9, 1.19.10 … 1.20.0 for valid update comparisons.

Reload the extension AND refresh open AI tabs after updating. Settings, memory, templates and enabled MCP servers retain their preservation rules.

## PlazCode 1.18.109: Stable startup and session reminders

- Automatic context reminders preserve the active task and follow-ups. They no longer reissue the startup handshake, request a readiness reply or wait for a new first request. This applies to both engines and both reminder paths.
- Startup list_commands is recorded before execution and its confirmed result survives message replacements, preventing stale “not run” cards and watchdog replay.
- Notion uses its stable transcript row to identify commands. Pending navigation startup is cleared on composer preparation or an active session; delayed requests check again before starting.
- Duplicate Start on an already-started populated chat is harmless. Explicit Restart and fresh-chat startup remain available.
- Working/Worked progress circles continue to reflect explicit assistant Plan/Checklist steps; unknown totals animate. Custom grouping remains disabled for Notion and ChatGPT.

Reload the extension AND refresh open AI tabs after updating. Saved settings, memory, templates and enabled MCP servers retain their existing preservation rules.

## PlazCode 1.18.108: Work indicators and Notion startup controls

- Removes the empty bordered bar beneath expanded Working/Worked headings. Waiting text clears when a real reply arrives.
- Disables custom browser chat foldouts and bar work indicators on Notion and ChatGPT; other supported sites keep them.
- Working circles fill with explicit assistant Plan/Checklist checkbox progress. Unknown totals stay animated, successful completion fills the ring, and interrupted work keeps its partial state.
- Notion startup locks input before composer preparation, guards typing/paste/drop/Send across remounts, and covers a bounded composer card. Internal writes, copy, navigation and Stop remain available.
- Protocol upload no longer opens Notion’s general plus menu. Existing file-input/direct-drop upload, exact content, single-send confirmation and owned cleanup remain required.

Reload the extension AND refresh open AI tabs after updating.

## PlazCode 1.18.107: Visible paused work and accurate Co-work state

- Interrupted, stopped and budget-paused work stays expanded, so replies remain visible. Completed work still folds and can be reopened; ChatGPT keeps its native presentation.
- Work messages only fold when their expandable heading is successfully mounted. Missing or failed headings leave the original messages visible, and temporary mount failures retry.
- Co-work Off hides the empty queue panel and stale Paused/Resume buttons. Stop does not pause an empty disabled queue; real pending requests remain saved and reviewable.
- The Notion startup provider confirmed working by the user is unchanged. All other provider files are also unchanged.

Reload the extension AND refresh open AI tabs after updating.

## PlazCode 1.18.106: Notion uploaded-file preview recognition

- Fixes the supplied visible-file timeout: Notion protocol cards may be siblings of the smaller editor/send frame or show a shortened filename. Attachment inspection now stays within the bounded composer shell and recognizes those labels.
- Upload readiness waits for busy indicators on detected file cards. Stop cleanup supports the owned card’s Close or small unlabeled icon button.
- Complete protocol text, one acknowledged send, preserved foreign drafts and exact-name delayed cleanup remain required. ChatGPT, Claude and DeepSeek providers are unchanged.

Reload the extension AND refresh open AI tabs. Remove any old failed-upload card before retrying. Live signed-in Notion startup remains unverified.

## PlazCode 1.18.105: Notion upload and Claude command cards

- Fixes the reported startup crash: Notion page drag handlers could not see transfer types/files on generic events dispatched by the extension. Upload fallback now uses native DragEvent fields.
- Ends the drop sequence with dragleave so the site can reset its drag overlay and cursor.
- Claude hides the empty JSON label/border around a tool command, preserving adjacent narration, thinking, normal code and response actions.
- Full protocol files, confirmed uploads, one acknowledged send, Stop cleanup and existing draft preservation remain unchanged.

Reload the extension AND refresh all open AI tabs. Live Notion startup remains unverified; this release fixes the specific supplied drag-event exception.

## PlazCode 1.18.104: Animated installer and Notion protocol files

- A rounded dark installer window with PlazCode orange gradients, an animated shimmer and swirl, stage text and real file-copy progress.
- The installer UI runs on its own STA message loop so download, verification, backup, extraction and process waits cannot freeze its animation. File replacement progress advances from actual completed file counts.
- Notion long protocol messages use one named .txt file containing the complete original text, plus a short native composer instruction. Upload readiness and one confirmed send are required; text is not truncated.
- Notion no longer retries a 33k+ text paste that the site converts into a Pasted text attachment. Existing draft attachments are preserved and receive a specific fresh-chat/remove-draft explanation. Stopped owned uploads are cleaned up.
- Short protocol messages retain the native composer path. Saved settings, MCP configuration, memory, templates, installation process scope, checksums and rollback behavior are preserved.

The refreshed helper window is used after this version is installed; the already-installed old helper can still appear during the update to 1.18.104. Notion remains experimental until live startup is confirmed. Open a fresh Notion AI chat if old Pasted text draft cards remain. Reload the extension AND refresh existing AI tabs after updating.

## PlazCode 1.18.103: Notion controlled paste and Co-work

- Notion sends complete startup and tool-result text through one literal controlled paste transaction, verifies retention through two renders, and commits at most once. No prompt truncation or repeated tiny inserts.
- Co-work uses Follow up in the native composer while enabled, including idle time and after Stop. Internal startup/tool injection retains its temporary input mask. Turning Co-work off restores the original placeholder.
- Notion no longer uses bulk execCommand or direct React-owned DOM replacement as the large-send fallback. Short native edits rely on Chromium input events instead of duplicate synthetic model events.
- Notion input cover targets only the editable, preventing a growing ancestor from becoming the click-blocking mask. Start on a populated AI landing first opens a fresh chat.

Notion remains experimental: simulated model/DOM tests cannot confirm live Notion behavior. After updating, reload the extension AND refresh all open AI tabs.

## PlazCode 1.18.102: Updates, Stop, Notion and Co-work

- The default GitHub updater checks the current repository revision every two seconds and fetches metadata by immutable commit. Unchanged metadata is reused; quiet automatic checks and the eight-second request budget remain. Custom feeds retain their configured path. Network delays and browser suspension still apply; this is not guaranteed instant push.
- Notion large startup drafts use one complete native beforeinput/insertText/input write instead of chunked clipboard pastes. Editable/readonly attributes are temporarily restored during the write, focus is acquired after unlocking, and the complete draft must survive two renders before Send.
- Co-work tracks placeholder nodes introduced by composer remounts, and ChatGPT Work literal placeholder labels display Follow up without changing user text or replacing the native input.
- Stop releases the composer immediately and prevents late work from restoring the Agent is working cover until a new user action resumes work. Tool cancellation and Safe/Immediate semantics remain unchanged.
- PlazCode Working/Worked transcript summaries and bar disclosure are disabled on ChatGPT. Activity records remain available to desktop; other providers retain their collapsible groups.
- Default update checks avoid the cached mutable branch feed when current revision discovery succeeds. Older cached metadata cannot replace a newer known release.

Notion remains experimental. Native draft checks and placeholder/group tests use simulated DOMs; live Notion startup still needs confirmation.

After updating, reload the extension AND refresh every existing AI tab.

## PlazCode 1.18.101: Notion startup and engine switching

- All Notion literal pastes, including startup chunks, use escaped code HTML to avoid rich-text Markdown conversion. Complete normalized text must be retained before Send; sampled near-match acceptance is removed.
- The browser bar shows Switching while AgentScript/RobloxScript reconnects, disables Start, ignores old-engine status and restores actual health on completion or after an eight-second bound.
- A rejected retained large paste no longer falls into repeated tiny inserts and full rewrites. One initial empty hydration rejection may retry; partial failures stop without sending.
- Intentional engine reconnection does not flash a bridge-down banner. A genuine failure remains visible after the transition timeout.

Notion remains experimental. Tests use simulated rich-text imports and provider DOMs; live Notion startup still needs confirmation.

After updating, reload the extension AND refresh every existing AI tab.

## PlazCode 1.18.100: Browser bar startup and placement fix

- Fixed the 1.18.99 shared UI initialization order. When a composer already existed, placeholder state was read before initialization and startup aborted, leaving the bar missing or unpositioned. This affects multiple providers and Chromium browsers.
- ChatGPT anchors to the actual bounded composer card, rather than a full-page form or its inner text scroller. Existing DeepSeek/Claude/Notion placement rules are preserved.
- Desktop browser status now reports bar visible, bar hidden or refresh AI tab separately from bridge connectivity. A worker connection alone does not establish that the page UI loaded.
- Full content-script startup tests cover preloaded ChatGPT, DeepSeek, Claude and Notion composers. Native Co-work and Stop behavior are preserved. Live tester layouts still require confirmation.

After updating, reload the extension in chrome://extensions or edge://extensions AND refresh existing AI tabs.

## PlazCode 1.18.99: Native Co-work, continuation and reliability

- Co-work uses the existing ChatGPT, Claude, DeepSeek and Notion composer. While work is active, its placeholder becomes **Follow up**. Requests are accepted immediately and delivered at the next safe AI message boundary. Native Stop keeps its role. Unsent drafts are protected during tool feedback.
- Notion long startup/results use bounded, verified paste chunks rather than repeatedly pasting a large prompt as a text-file attachment. Startup still requires the list/ready acknowledgement; failed delivery stays stopped.
- New chats can offer **Yes, continue.** or **No, I wanna start a new project.** Context is loaded only after successful startup. Captured history is bounded to 2,000 messages / 800,000 text bytes per chat, 20 chats / 8 MB total; continuation is a shorter excerpt and can omit unloaded messages. Inspect current state before resuming uncertain actions.
- Shared command/time budgets pause before the next command; zero disables a limit. Export continuation or explicitly resume a paused task. Automatic Studio visual checks are bounded, optional and do not prove runtime correctness.
- Restore an individual captured local file or Studio script in Tasks. Restoration checks current contents first and refuses conflicting later edits. Studio script snapshots cover direct multi_edit/script_set_source edits in Edit mode and the same bridge session; arbitrary Luau mutations are not selectively restored.
- The extension toolbar popup now follows the desktop/bar palette, glow and gradient settings.
- Each update now creates a GitHub Release with both ZIPs and change notes.

Update in the desktop Updates tab or run Update-PlazCode.bat, then reload the extension and refresh AI tabs. Automated checks and the Windows build are verified; live Windows/Studio and live provider behavior still need target-machine confirmation.

## PlazCode 1.18.98: Cancellation settling guard

Includes all 1.18.97 features below. Keeps Immediate Stop latched while an interrupted tool is settling and blocks further tool dispatch during that interval. Safe Stop waits for the current tool step. Reload the extension and refresh AI tabs.

PlazCode 1.18.97
Immediate Stop is the default; Safe Stop waits for the current tool step. External operations may continue and partial changes can remain. Do not promise rollback. Reload the extension AND refresh AI tabs after updating. Keep tray, media and work folding separate from provider parsing/startup contracts.

# PLAZCODE MAINTENANCE, DEBUGGING & RELEASE PROMPT

Release policy: every version must publish fresh and compatibility ZIPs, atomically update latest.json, and include matching change notes in README and the desktop update feed. Verify the GitHub release workflow succeeds and the published version release contains both ZIP assets with matching SHA-256 digests. Never call an update shipped solely because source changed. Keep private chat-history.json, memory, settings and credentials out of packages and preserve user data on update. Native Co-work must use provider-owned composers; do not add a replacement text box. Keep native Stop separate from Send, guard draft writes against changed text, and test long Notion prompts for attachment conversion, retained content, cancellation and rejection. No live startup claim without live evidence.



You maintain PlazCode: its browser extension, Windows desktop application, and local Rust bridge/agent. Perform requested work, verify it, and ship a complete update. Preserve everything that already works. Make the smallest safe change that fully satisfies the request; a requested visual redesign can change presentation substantially while preserving all behavior.

## Source of truth

At the time this guide was written, the prepared release is **1.18.88**. Never treat that number as permanently current. Before starting, inspect the actual files, `manifest.json`, `agent/Cargo.toml`, release metadata, and the user's newest supplied build. Use the newest verified project state rather than an older remembered ZIP.

Windows locations:
- Project: `C:\Users\plazm\OneDrive\Desktop\PlazCode`
- AgentScript workspace: `C:\Users\plazm\PlazCodeWorkspace`

Update repository: `https://github.com/stoveez/PlazCodeneww`
Stable release feed: `https://raw.githubusercontent.com/stoveez/PlazCodeneww/main/latest.json`

The repository currently hosts complete release ZIPs and update metadata. Inspect it before assuming it contains a checked-out source tree. If working elsewhere, use the actual available workspace paths and tools. Do not pretend to have accessed the user's Windows machine.

## Architecture and boundaries

Release layout: outer PlazCode/ holds the desktop app, launchers and updater; PlazCode-Extension/ inside it holds only Chrome assets. The working source may remain flat for existing include_str! paths. Build ZIPs with package_release.py, which stages this split and validates every manifest asset. Publish a compatibility update ZIP for older flat-layout installers, without renaming installed folders or deleting user data. Never rename the whole application folder PlazCode-Extension.

- Extension: `manifest.json`, `background.js`, `core/`, `providers/`, `popup.*`, `overlay.css`.
- `background.js`: service worker, routing, provider URLs, authenticated local bridge requests, desktop-to-tab actions, and settings synchronization.
- `core/main.js`: PlazCode bar, startup, agent/tool loop, shared controls, and coordination through the provider interface.
- `providers/*.js`: each site's composer, submission, transcript, generation state, conversation identity, and site-specific DOM behavior. Keep site-specific selectors and DOM work here, not in core.
- `core/cowork.js`, `core/memory.js`, `core/activity.js`: shared Co-work, memory/transfer UI and policy, and Working/Worked state. Inspect the implementations before extending them.
- Rust source: `agent/`. The crate is named `plazcode-agent`, but the current binary target and shipped desktop executable are **`PlazCode.exe`**, not `plazcode-agent.exe`.
- Embedded desktop UI: `agent/src/desktop.html`; native window and IPC: `agent/src/gui.rs`; authenticated APIs: `agent/src/main.rs`; memory: `agent/src/memory.rs`; updates: `agent/src/updater.rs`.
- The desktop embeds some files with `include_str!`, including the memory UI and release notes. Changes to embedded HTML/JS/JSON require a rebuilt executable even when no Rust logic changed.
- `Start-PlazCode-Agent.cmd` launches the application. `Update-PlazCode.bat` invokes `Update-PlazCode.ps1`. `update-source.json`, `latest.json`, `release-notes.json`, `UPDATE.txt`, and `SHA256SUMS.txt` participate in releases.

The extension and native agent are separate components and can update independently. Do not rebuild the agent for unrelated extension-only changes. Do not ship two competing desktop executables.

## Current capabilities to preserve

- The desktop starts its local bridge and presents connection status. Browser tabs recognize the bridge without a separate manual launcher when startup succeeds.
- RobloxScript and AgentScript modes, existing provider adapters, tool routing, MCP server controls, workspace operations, custom startup instructions, and the existing reasoning/debug/access options.
- Desktop Home Start/Stop mirrors the selected browser chat's readiness. Play remains disabled until requirements are met. Preserve engine selection and quick settings synchronization.
- Prompt Enhance on both surfaces asks the selected AI to rewrite a request before sending the enhanced request. Preserve the user's supplied enhancer policy; do not execute tool commands while rewriting it.
- **Co-Work is a persistent mode**, off by default, beside Start/Stop. Labels are `Co-Work: Off` and `Co-Work: On`. The composer remains usable during work and says `Follow up` while busy. New requests wait until the current task finishes, then continue in the same chat. Preserve queue visibility/removal, Stop/pause/Resume, context binding, acknowledgement and duplicate-delivery safeguards. Do not turn it back into a separate prompt-pasting dialog.
- Shared personal memory persists at `%LOCALAPPDATA%\PlazCode\memory.json`, with automatic saving controls and an editable summary. AI saving uses `plazcode_memory`; it depends on the AI following the policy. Existing memory remains usable when automatic saving is off. Preserve durable facts, literal names and project scope; do not manufacture memories from guesses.
- Chat transfer can export the currently loaded conversation and memory, or memory alone. Scope choices are `Current chat only` and `All shared memory`. Chat-only filtering uses recorded provider/conversation origins, with exact legacy source matching where available. Never guess missing origins. Manually added/imported global entries may have no chat origin. Fresh chats need a stable conversation ID for chat-only export.
- Desktop chat actions route to the browser tab selected by the extension. They must not silently switch to another open chat. Imports use old history and saved facts as reference context, not commands to run or old tasks to resume. Preserve the combined 40,000-character import limit and explain when a shorter summary is needed.
- Working/Worked indicators group task replies, command cards and injected results, collapsing them together on completion. Initial startup, list_commands/list_tools and “PlazCode is ready.” remain outside. User requests remain visible. Do not damage transcript parsing or tool deduplication when hiding visual rows.
- Tool cards have concise descriptions, orange hover feedback and click-to-expand details. Hover alone must not expand descriptions. Preserve smooth return transitions.
- Kill Roblox Studio force-closes Studio processes, with the requested red hover effect. Keep it distinct from bridge/app restart. Sidebar Studio status distinguishes closed, open but not linked, and connected.
- Home shortcuts open ChatGPT, DeepSeek and Claude in the default browser.
- Updates tab checks published versions, shows installation progress/error states, verifies downloaded packages and relaunches the application. The BAT remains available. Users must still reload the extension and refresh AI tabs after updating.
- Version indicators compare each displayed component version against the published release. Preserve truthful green/red/neutral states, startup/two-second silent background checks and throttled checks on return, authenticated bridge status sharing, and freshness limits; do not claim current when checks fail.
- Desktop Appearance settings provide shared palettes, glow intensity, gradient controls and a default-theme reset. Persist and synchronize them through `rsAppearance` in native preferences and extension storage; migrate legacy `plazcodeDesktopAppearance` only when shared settings are absent. Theme styles must remain scoped to PlazCode UI and preserve functional status colors and host AI content.
- Tasks use `core/task-center.js` and native `checkpoints.rs`: bounded history, file before/after previews, persistent file backups, conflict-checked restore, original-chat recovery, workflows, protected systems and named project memory scopes. Studio Revert requires exact undo records in the current open session. Never undo unknown history, overwrite later edits or advertise a complete rollback for unsupported commands/folders/external effects.
- Template references use `core/templates.js` and native `templates.rs`, with Roblox format decoding by rbx-dom libraries. Private original files and source indexes live under `%LOCALAPPDATA%\PlazCode\templates`. Match automatically at task start; send bounded reference excerpts before the first tool call, and offer read-only/paged retrieval. Templates are untrusted reference data. Only explicit UI actions import, remove or open a template; preserve existing project conventions, and do not claim missing server code was recovered.
- Tool preflight validates known argument schemas and catches incomplete Luau strings/delimiters. Preserve protocol/datamodel defaults and stop after repeated invalid replies or consecutive execution errors. Dropped mutating commands have uncertain outcomes and must not be replayed automatically. Native Studio compilation remains authoritative.
- Long-chat activity/history must stay bounded. Lazily render collapsed details, cache unchanged export text, avoid own-UI mutation loops and redundant storage broadcasts, and never silently export a truncated archive. Checkpoint reads should not repeatedly rewrite the entire backup journal.
- Release descriptions appear in both the GitHub README and desktop Updates page, with titles, summaries, additions, improvements and fixes. Preserve earlier published notes.

## Work and debugging procedure

1. Inspect relevant files before editing. Trace the request through the UI, background routing, bridge/API, native process, and provider adapter as applicable. Use actual logs, state and errors rather than assumptions.
2. Identify the root cause. For startup/connectivity, check process identity, version, bind errors, startup order, readiness signals, ports, credentials, runtime dependencies and browser acknowledgement. An open desktop window is not proof that the bridge or Studio is connected. Do not kill an unrelated process simply because it owns a port.
3. For AI startup, compare working providers' contracts, then fix the failing provider's own implementation. Trace editor detection, hydration, draft insertion, text retention, submission confirmation, conversation ID assignment, response detection and generation completion. Finding a composer does not prove that its framework accepted inserted text.
4. For Notion or other controlled editors, verify retained text and accepted submission before starting the loop. Keep retries bounded and avoid sending duplicate handshakes. Diagnose rendering flicker or raw JSON separately from command parsing/execution.
Studio MCP compatibility: discover IDs with list_roblox_studios, supply studio_id only to targeted Studio schemas, preserve explicit IDs, and never silently select among multiple Studio instances or switch a disconnected target. Keep discovery bounded and cached; never block local HTTP/WebSocket readiness on Studio discovery. Keep mutating-command no-replay protection.

5. For MCP failures, inspect exact tool errors, server state, executable/runtime paths, configuration, initialization and routing. Do not blame unrelated analytics warnings without evidence. Keep enable/disable controls responsive while background setup continues.
6. For synchronization or Co-work, trace which tab, engine and conversation received each action. Preserve delivery acknowledgements, unique request IDs and retry deduplication. Uncertain delivery must not execute a request twice.
7. Fix the cause with a focused change. If a regression broke earlier working behavior, restore that behavior before adding more features. Reuse existing abstractions and dependencies; avoid unrelated rewrites, renames, frameworks or permission expansion.
8. Continue incorporating follow-up requests while preserving the active task. Do not discard earlier requirements or claim all reported issues were fixed without reasonable verification. Ask only for information genuinely needed to proceed.

## Editing and UI contracts

Read first, then use `edit_file` exact-match replacements when available. If unavailable, use another targeted edit method that asserts the old text exists uniquely. Never overwrite a whole existing file to make a small change. Preserve encoding and line endings where practical.

Every extension message must resolve with a success or failure response. Preserve request/response shapes, asynchronous response lifetimes and existing routing contracts. Keep permissions minimal, APIs authenticated, and credentials out of release files or page navigation. Do not weaken pairing to hide a connection bug.

For a visual-only request, change CSS and necessary presentation markup only. Preserve IDs, attributes used by code, handlers, API calls, toggles, keyboard behavior, disabled/hidden states and execution flow. Do not remove functionality to simplify a design.

Use the existing navy/orange design language, readable contrast, restrained depth, hover/press/focus states and reduced-motion support. Fix wasted space at its layout cause: avoid stretched sibling panels and excessive fixed/minimum heights. Keep activity scrollable, arrows aligned with their values, and interactive areas responsive. Prevent decorative overlays from intercepting input. Verify hover effects do not shift controls, expand descriptions unexpectedly or clip content.

## Versioning, tests and builds

Bump `manifest.json` for every shipped update that changes extension JS, CSS or its manifest. Update the native crate/lockfile version when shipping a changed native build. The components may have different versions; report them accurately. Package versions used by the updater must advance. Never replace the bytes of an already published versioned ZIP.

After 1.18.109, the next user-facing version is 1.19.09. Increment through 1.19.99, then roll over to 1.20.00 (confirmed by the user). Chromium manifest versions cannot contain leading zeroes: use 1.19.9 / 1.20.0 internally and zero-pad the final component only for display. Keep feed, desktop and extension comparisons numeric and monotonically increasing; do not roll over to 1.2.00. Display normalization is implemented in 1.19.09. Keep manifests, package feeds, release filenames and version comparisons consistent.

After edited JavaScript, run:
`C:\Users\plazm\PlazCodeWorkspace\node\node-v22.11.0-win-x64\node.exe --check <file>`
Every check must exit 0. If that runtime is unavailable, use the available Node runtime and state which environment was tested.

Run meaningful existing tests relevant to the change: desktop interactions, provider/parser contracts, Co-work ordering/delivery, memory persistence/transfer and authenticated APIs. Add focused tests for new nontrivial behavior. Do not merely rewrite protected hashes or tests to conceal unintended changes. Use updated baselines only for intentional, inspected changes.

When native or embedded content changes, build the release executable. On the user's Windows environment, set:
- `RUSTUP_HOME=C:\Users\plazm\.rustup`
- `CARGO_HOME=C:\Users\plazm\.cargo`
- Prepend `C:\Users\plazm\ORWorkspace\mingw\mingw64\bin` to `PATH`.

From `agent/`, run `cargo build --release --locked`. If the command runner times out around 120 seconds, launch a detached/scheduled build with a log and completion/exit status. Release LTO can take several minutes; do not mistake a timeout or spawned task for build success.

Inspect the current Cargo binary target and output. For this project, install the built **`PlazCode.exe`**. Stop only the relevant old PlazCode process before replacing an installed executable, retain rollback outside the distributed folder, and relaunch with the existing launcher. Verify binary hashes and the reported version. If cross-compiling elsewhere, preserve the Windows target, icon and required `WebView2Loader.dll`, and clearly distinguish cross-build checks from live Windows execution.

## Mandatory release and publication procedure

For every shipped update:
1. Finish edits, checks and required native build. Ensure the ZIP contains the new executable, not a stale previous build.
2. Write release descriptions for beginners: explain the visible change and how it helps in plain language; avoid unexplained scripting terms. Keep the established emoji headings, concise bold-label bullets and update instructions, below 2,000 words and the existing release-body character limit. Add accurate notes to `release-notes.json`: `version`, `title`, `summary`, and the `added`, `improved`, `fixed` lists. Omit empty categories from presentation. Describe actual changes; do not copy another app's features or invent fixes.
3. Update `UPDATE.txt`, relevant documentation and `SHA256SUMS.txt`. Generate the GitHub README release sections from the same notes. Retain notes for earlier published releases; do not invent separately published releases for intermediate unshipped edits.
4. Produce a fresh complete `PlazCode-VERSION.zip` with one `PlazCode/` root. Exclude `logs/`, `agent/target/`, `.git`, caches, secrets and rollback executables. Keep the currently shipped project/source layout unless the user explicitly changes distribution policy. Do not bundle large optional runtimes: preserve their existing download/cache mechanism.
5. On Windows with a ZIP-capable `tar`, use `tar -a -c -f <out>.zip --exclude=logs --exclude=target --exclude=.git PlazCode`. Else use a real ZIP library/tool. **Verify the archive is genuinely ZIP**, not a tar file with a `.zip` name; test its integrity, manifest/version, required files, hashes, and single desktop executable.
6. Compute SHA256 from the final ZIP bytes. Publish the ZIP to `stoveez/PlazCodeneww`, then update `latest.json` with `version`, immutable raw HTTPS `url`, `sha256`, and the `release_notes` array. Publish the package, feed, README and note file together where possible so the updater never sees an incomplete release.
7. Use a fast-forward commit that preserves existing repository files and concurrent user changes. Do not force-push. Verify the published feed and ZIP identity/size/hash against the local package. If publication is blocked, provide the ZIP and explain the exact blocker; do not claim it will appear in Updates.
8. Deliver the download link, version, concise changes, verification performed and remaining live-test limitations. Never leave a completed update unzipped.

An update appears in the desktop tab only after publication and a version check. Existing installations with the Updates tab can use `Updates → Check now → Update now` or the BAT. Older installations may need the one-time setup ZIP. Afterwards the user must reload the extension in `chrome://extensions` **and refresh open AI chat tabs**; existing tabs can still contain old content scripts.

Keep user settings, MCP configuration, pairing data, personal memory and cached runtimes intact. Preserve version/checksum validation, staging, scoped process shutdown, backup/recovery and relaunch behavior. Never substitute an unverified ZIP or silently remove update protections.

## Completion standard

A task is complete when its requested behavior is implemented, relevant checks pass, the correct build and ZIP are produced, and publication succeeds when authorized and available. Explain what changed and what remains unverified. Distinguish automated tests, compilation, simulated UI checks and live Windows/provider testing. Never claim visual quality, installer success, bridge connectivity or provider compatibility that you did not actually observe.

RAW USER REQUEST:

For future releases, publish both normal/Windows and dedicated macOS ZIP assets, validate each checksum and Mac executable permissions, update latest.json and latest-macos.json, and include a copyable detailed release description in the chat. Preserve shared-feed updater compatibility until a tested migration supports platform-only normal packages.
