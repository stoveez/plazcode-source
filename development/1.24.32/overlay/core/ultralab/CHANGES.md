# UltraLab: what changed from the uploaded pre-alpha

Compared with `UltraLab_pre-alpha.zip` as uploaded. Full reasoning and sources: `skills/ul-ui-builder/references/ui-roadmap.md`.

## Fixed

- **UI controller** (`ul-ui-builder/skills/ul-ui-builder/references/UIController.client.lua`): pages now fit the screen and refit on resize;
  close-then-reopen no longer hides the page; the open button works during a fade-out; hover, press and release
  share one state; gamepad focus stays on the open page; B and Escape close it; wiring is deferred one step.
- **Check-UI** (`references/check-ui-repo/src`): the controller is now used (it was orphaned); windows fit to the
  device and refit on viewport change; buttons animate (the auto-bind was silently skipped); the sunburst spin
  disconnects when its container is destroyed; the sound clone goes to the sound's own parent.
- **`ui_build.py`**: pages set `SelectionGroup` so gamepad focus stays in the page.
- **`ultralab.py`** (main prompt): the DeepSeek prompt had the Check Suite gate twice (fixed); the prompt claimed
  every skill's text was in `skills/` (now true: 29 skill folders were written); the `gui-syntax` step is marked
  unverified when the Roblox API dump is missing; the non-existent toolbox skill is replaced by the Studio asset tools.
- **`kaggle_icon_ab.py`**: removed an unused import and `shell=True` (every call was a fixed command string).
- **Check-UI SKILL.md**: the sample now calls the controller.

## Added

- Gamepad and keyboard focus (controller and `SelectionGroup`).
- `UIFormat.luau`: compact numbers and timers (1.2K, 3.4M, 1:02:05). Tested in Studio.
- `UIBind.luau`: binds a label to an attribute; shows `<unbound>` when there is no value.
- `UIToast.luau`: a queue of short messages.
- `ul-ui-builder/skills/ul-ui-builder/scripts/check_contrast.py`: WCAG contrast gate for the theme.
- `vault/`: 16 seeded notes (lessons, verified API facts, patterns, decisions, a session note), read and written by
  the assistant with its own file tools. `ultralab.py` embeds a build-time snapshot. No command to run.
- 29 skill folders under `skills/` for the core skills that had no folder.
- `ui-roadmap.md`: fixes, additions, findings, and GitHub tools (with licence and archive status).

## Still open (not done, and why)

- **Studio:** the controllers, the toast and the Check-UI changes are not run in Studio. The Studio connection is to
  `Place1`, which was not confirmed as a test place, so nothing was written to it.
- **Gamepad:** not tested. It needs a person with a controller.
- **Theme contrast:** 8 of 15 text pairs are below 4.5:1 (white on green, gold, grey and blue; inkSoft on panelAlt and
  slot). This is a colour decision, not a code fix.
- **Two UI systems:** Check-UI (1050x620, GothamBlack) and ul-ui-builder (1280x720, Fredoka) still disagree.
- **`check_gui_syntax.py`:** needs the Roblox API dump, which is not in the pack.
- **Vault:** nothing automatically checks the notes now that the lint script is gone. The rules are in `vault/README.md`.
- **GitHub tools:** the official Studio MCP server and the boshyxd server are archived; the Stud licence is contradictory.
  None is vendored into the pack.
- **Core skill folders:** the 29 folders were written from the prompt text. They are a copy, so edits must be made in
  both places until the prompt reads from the folders.

## Luau skills adopted from Roqer (ideas only)
Roqer (S4US/Roqer, AGPL-3.0) was studied for ideas; no code was copied. See skills/ROQER-ADOPTION.md.
- Added: roblox-tooling (with rokit.toml, selene.toml, stylua.toml), luau-compile-gate (with compile_check.lua), roblox-input, roblox-camera, roblox-physics, roblox-npc-ai, roblox-server-data, roblox-audio, roblox-localization, roblox-monetization, roblox-analytics, roblox-publish-checklist.
- Changed: the Check Suite gate now compiles each changed Luau file before the table; a compile error is a FAIL.
- Verified against Roblox docs in this pass: the signatures listed in each new skill. Anything not confirmed is marked UNVERIFIED in that skill.
