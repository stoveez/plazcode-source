---
title: Tool-call consistency and speed (DeepSeek DSML, helper results, sizes, gap between calls)
updated: 2026-10-30
---
# Tool-call consistency (1.24.27)

Owner report, 2026-10-30, from DeepSeek and AgentScript sessions:
- **DeepSeek DSML.** DeepSeek sometimes writes calls in its own markup, which PlazCode showed as raw text and never ran. The markup looks like `<｜DSML｜tool_calls>`, then `<｜DSML｜invoke name="…">`, then `<｜DSML｜parameter name="…" string="true|false">`. `core/parser.js` now reads it in every form seen: fullwidth or ASCII bars, doubled bars or spaces, and a `tool_calls`, `function_calls` or plain `calls` wrapper. `string="true"` values are kept as raw text; `string="false"` values are read as JSON. An unfinished call keeps the watcher waiting. `providers/deepseek.js` hides the DSML paragraphs behind the tool card, through the wrapper closer.
- **"Corrupted / cross-wired" results were not a replay bug.** The `env_info` extra in `core/agent_skills.js` ran `file_info` plus a command called `list_dir`, which does not exist. It returned an "unknown command" error glued under the `file_info` result. It also hid the desktop app's real `env_info`. Other extras returned the inner command's heading, so `git_status` answered as "Output of 'run_command'". Now `env_info` goes to the desktop app, `list_recent` uses `list_directory`, and every extra answers under its own name. Inner errors read "ERROR in '<extra>' (while it ran <inner>)".
- **"TB everywhere."** `human_size` in `agent/src/workspace.rs` never divided by 1024, so 16 GB read "17179869184.0 TB". It is fixed and unit-tested. This part needs the new desktop app; the other fixes work with an extension reload.
- **Unknown-command errors** used to list the bridge's names only (63), which differed from the startup list (65). They now name the six closest real commands, extras included, and point to `list_commands`.

Tests: `test-dsml-tool-calls.js`, Rust `workspace::human_size_tests`, and an updated `test-skills.js`. Live DeepSeek has not been tested; only the page format from the owner's screenshot was.

## Gap between tool calls (owner, 2026-10-30: "Claude takes up to 12 seconds")
Cause, from the code: every site treats the AI as busy while its Stop button shows or a soft signal is on. A soft signal is text that grew recently or a streaming/thinking marker. A soft signal that lingered on a finished reply made `waitForResponse` wait for the STABLE_MS fallback. That is 8 to 14 s on Claude (12 s on Fable/Mythos) and 9 s on most sites. Claude's sender then waited up to 45 s on the same signal. After a Studio change, a console read could also add up to 8 s.

Fix (every site except DeepSeek, which keeps its account-safe pacing on purpose): once the reply holds a complete, closed command, the real Stop button is gone and the text has been quiet for 0.8 s, the command runs. Freebuff waits 3 s (`FAST_TOOL_SETTLE_MS`); Notion keeps its own check (0). Claude sends once Stop is gone and the text has been quiet for 1 s. The console read is capped at 3 s. Plain answers and unfinished commands keep the old timing. Test: `test-fast-tool-settle.js`, which runs the real watcher; the old code took 12.8 s and the new code 1.1 s. Diagnostic event: `response.fastToolSettle`. Not measured on a live site; the AI's own thinking time is not affected.
