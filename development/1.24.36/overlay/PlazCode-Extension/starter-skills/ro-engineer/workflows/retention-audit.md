# Workflow: retention-audit

Review an existing game's loops and hooks against player incentives. Load
`references/game-loops.md`, `references/player-incentives.md` and
`references/retention-psychology.md`.

## Phases

1. **Reconstruct the loop.** From the game (playtest, scripts and config in
   `studio` mode) or the user's description: core loop steps, session loop,
   meta loop.
2. **First session walk-through,** with timestamps:
   - when the first reward lands
   - when the first choice appears
   - when the first goal is visible
   - where a new player is likely to hesitate or get lost
3. **Stall points.** Where pacing slows sharply, where progression stops
   unlocking new things, where content runs out.
4. **Hook inventory** per time scale (first minute, session, days, long term,
   social). For each: the principle it uses (`retention-psychology.md`), the
   player-facing reason, and whether it is the fair or the manipulative
   version (guilt, fake urgency, punishing absence).
   Also map the game's building blocks (`game-loops.md`) and flag weak
   blocks, especially missing tension or a missing release.
5. **Data.** What analytics are tracked (funnels, D1/D7/D30, session length,
   progression). If none, recommend the minimum set.
6. **Ethics and policy check** on hooks involving paid randomness,
   time-limited purchases, or streaks.

## Output

A ranked list of fixes, highest expected impact first. Each fix: the
problem, the evidence, the change, the loop step or time scale it affects,
and how to measure whether it worked.
