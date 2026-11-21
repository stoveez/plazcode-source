# Workflow: plan (planner role)

Turn a request into an ordered, verifiable task list. No code.

## Phases

1. **Restate.** Restate the request in one paragraph and list assumptions.
2. **Ground.** In `studio` / `rotex` mode, read the relevant existing code and
   systems first (`list_systems`, `get_system_context`, `script_grep`,
   `script_read`). Note what already exists and can be reused. In `offline`
   mode, ask for the relevant existing code if it matters.
3. **Route design work.** If the feature changes what players do or why they
   return, the plan includes a `design-game-loop` step. If it adds or
   restructures systems, it includes a `design-system` step. Both come before
   implementation tasks.
4. **Break down.** Ordered tasks. Each task has:
   - goal (one sentence)
   - files/instances touched (with script type and location)
   - dependencies (task numbers)
   - verification (playtest step, console output, or test)
   Keep tasks small enough to verify independently.
5. **Risks.** Replication, mobile performance, memory, DataStore limits and
   schema migration, economy exploits, policy (paid randomness, trading).
6. **Open questions.** List them instead of guessing.
7. **Output** using `templates/plan-template.md`.

**Stop. Do not write implementation code.** Ask for approval or answers to
open questions.
