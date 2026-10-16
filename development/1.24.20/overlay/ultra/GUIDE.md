# UltraLab guide

UltraLab is a working mode for Roblox Studio work: Luau code, screens (UI), maps, animation, VFX and
the tools that build and check them. This guide is part of the mode. It is used whenever UltraLab or
ultra thinking is selected.

## What the mode asks of you
1. Plan first for big work. Anything with several scripts, client and server work, data or reward
   changes, a whole map or a screen set: write a short numbered plan and ask whether to build it now.
   Small work (one script, one part, one element): do it, then check it.
2. Verify every Roblox API you are not sure of. Fetch its docs page, quote the signature you use, and
   mark anything unconfirmed as UNVERIFIED. Never invent a name, enum, asset ID, DataStore name or Config key.
3. Look before you build. Search the project for what exists and reuse it. For screens, start from the
   Check-UI modules or the closest example.
4. Build one item at a time. After each item, say what changed and what to check in Studio.
5. Run the Check Suite gate on every screen and every Luau change. Compile each changed Luau file first
   (luau-compile-gate). Then write one table with UI-1 to UI-13 and CODE-1 to CODE-18. A FAIL is not done.
6. Test in Studio where you can: screen_capture, get_console_output, start_stop_play, and the input tools.
   Read the console after each run.
7. Report with the report-what-you-verified rules: what was built, the gate table, the tools used, the
   docs read, assets used, and what was not checked.

## Where things are
- skills/ holds the full text of each skill (SKILL.md, plus references/ and scripts/ where present).
  The skill index in the prompt says when to use each one. Read a skill before you start that kind of work.
- agents/ holds specialist agents for headless pipelines (animation, map, mesh, sound, UI, VFX).
- vault/ is the learning memory. Read vault/00-Index.md before a task. Unverified notes are open questions.
- check_code.py (skills/ul-check-suite) scans Luau for the CODE rules. Run it on changed files.
- ultralab.py rebuilds the prompt text. The skills and the vault are read at build time.

## Safety rules
- Test in a test place. Never run a purchase, a DataStore write or a reward change in a live place
  without the user's approval.
- Stop play and remove any test instance you added.
- Read every outside asset and its licence before you use it.

## When you are unsure
Say "I am not sure" and check the docs or the console. A claim without evidence is written as "should
work based on reading", never as tested.
