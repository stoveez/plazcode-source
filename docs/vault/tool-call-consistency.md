---
title: Tool-call consistency (DeepSeek DSML, helper results, sizes)
updated: 2026-10-30
---
# Tool-call consistency (1.24.27)

Owner report, 2026-10-30, from DeepSeek and AgentScript sessions:
- **DeepSeek DSML.** DeepSeek sometimes writes calls in its own markup, which PlazCode showed as raw text and never ran. The markup looks like `<｜DSML｜tool_calls>`, then `<｜DSML｜invoke name="…">`, then `<｜DSML｜parameter name="…" string="true|false">`. `core/parser.js` now reads it in every form seen: fullwidth or ASCII bars, doubled bars or spaces, and a `tool_calls`, `function_calls` or plain `calls` wrapper. `string="true"` values are kept as raw text; `string="false"` values are read as JSON. An unfinished call keeps the watcher waiting. `providers/deepseek.js` hides the DSML paragraphs behind the tool card, through the wrapper closer.
- **"Corrupted / cross-wired" results were not a replay bug.** The `env_info` extra in `core/agent_skills.js` ran `file_info` plus a command called `list_dir`, which does not exist. It returned an "unknown command" error glued under the `file_info` result. It also hid the desktop app's real `env_info`. Other extras returned the inner command's heading, so `git_status` answered as "Output of 'run_command'". Now `env_info` goes to the desktop app, `list_recent` uses `list_directory`, and every extra answers under its own name. Inner errors read "ERROR in '<extra>' (while it ran <inner>)".
- **"TB everywhere."** `human_size` in `agent/src/workspace.rs` never divided by 1024, so 16 GB read "17179869184.0 TB". It is fixed and unit-tested. This part needs the new desktop app; the other fixes work with an extension reload.
- **Unknown-command errors** used to list the bridge's names only (63), which differed from the startup list (65). They now name the six closest real commands, extras included, and point to `list_commands`.

Tests: `test-dsml-tool-calls.js`, Rust `workspace::human_size_tests`, and an updated `test-skills.js`. Live DeepSeek has not been tested; only the page format from the owner's screenshot was.
