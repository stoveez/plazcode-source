# Workflow: design-system (architect role)

Design module structure, ownership and boundaries before code.

## Phases

1. **Load references.** `references/system-design.md` and
   `references/pattern-selection.md`. If a game loop doc exists, start from
   its system list and keep each system's loop step.
2. **Ground.** In `rotex` mode, call `list_systems` and `get_system_context`
   / `get_library_context` to find existing systems and library versions to
   reuse. In `studio` mode, read the relevant scripts. Do not design a system
   that already exists.
3. **Ownership.** Who owns each piece of state, where it lives, how it
   replicates, whether it persists. Fill the ownership map table.
4. **Pattern.** Pick the pattern with the decision rules, including whether
   to use composition, pooling or a state manager. Record why, and why not
   each alternative. Load the matching pattern reference if needed.
5. **Interfaces.** Define each module's public API (functions, signals,
   exported types) before internals.
6. **Client/server boundary.** Remotes (name, direction, payload type),
   validation per remote, rate limits. Load
   `references/client-server-boundaries.md` and
   `references/networking-remotes.md`.
7. **Performance and cleanup.** Expected entity counts and update rates, the
   performance budget, and the cleanup strategy (which trove owns what
   lifetime).
8. **Output** using `templates/design-doc-template.md`.

**Stop and ask for approval before implementation.**
