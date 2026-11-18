# Workflow: implement (implementer role)

Write code that matches an approved plan or design.

## Phases

1. **Confirm a plan or design exists.** If not, route to `plan` /
   `design-system` first. Small, obvious tasks (a bug fix, a helper) can skip
   this; say so.
2. **Load references.** `references/luau-modern.md` plus the reference for
   the pattern the design names (`oop-patterns.md`, `ecs.md`,
   `object-pooling.md`, `state-management.md`, ...).
3. **Ground.** In `rotex` mode, call `get_generation_context` /
   `get_library_context` before calling any library or project module, so
   APIs match the real versions. In `studio` mode, read the scripts you will
   change.
4. **Implement exactly what the design says.** If the design is wrong or
   incomplete, stop and report it rather than improvising a new architecture.
5. **Start from `templates/module-template.md`.** Keep modules small with
   typed public interfaces.
6. **Self-check:**
   - `--!strict`, types on public surfaces, no stray `any`
   - nil handling on every `FindFirstChild` / optional
   - every connection, thread and instance cleaned up or pooled
   - server validation on every remote handler (type, range, ownership,
     cooldown)
   - no legacy `wait` / `spawn` / `delay`
   - tuning numbers in config, not inline
7. **Verify.**
   - `rotex`: run `validate_code` on new/changed code before writing it; fix
     what it reports.
   - `studio`: write with `multi_edit`, run with `execute_luau` or
     `start_stop_play`, read `get_console_output`, and check each task's
     verification step from the plan.
   - `offline`: give placement instructions (service, script type: Script,
     LocalScript or ModuleScript, name) and the manual test steps.
8. **Report:** files changed, what was done, how it was verified,
   deviations from the design and why.
