# Workflow: code-review

Review Luau code and give a grade with specific fixes.

## Phases

1. **Read the code.** In `studio` mode, read scripts with `script_read` and
   find related code with `script_grep`. In `rotex` mode, use
   `validate_code`, `call_sites` and `dependency_map` for context.
2. **Check each area:**

| Area | Look for |
|---|---|
| Security | Client-trusted values, missing validation, no rate limits, price from payload (SE-1, SE-4, SE-9) |
| Cleanup | Unstored connections, uncancelled threads, per-player tables not cleared (SE-2, SE-16) |
| Strict typing | Missing `--!strict`, untyped public API, `any` casts |
| Modern Luau | Legacy `wait`/`spawn`/`delay`, `pairs`/`ipairs`, deprecated APIs |
| Pattern fit | Over-engineering (ECS/state manager for small systems) or under-engineering (copy-pasted logic) |
| Composition | Inheritance beyond one level, god objects, components reaching into each other |
| Hot spots | Per-frame allocations, `GetDescendants` in loops, per-object Heartbeat connections |
| Data | Saving per change, no session locking, no BindToClose |
| Readability | Naming, module size, hardcoded tuning numbers |

3. **Grade A-F:**
   - **A:** ship it; nits only.
   - **B:** minor issues, no risk.
   - **C:** real issues (leaks, missing types, perf) to fix soon.
   - **D:** a HIGH-severity issue (leak, flooding, broken economy).
   - **F:** a CRITICAL issue (exploit, data loss).
4. **Output:** the grade, then findings ordered by severity, each with the
   location, what is wrong, why it matters, and the fixed code. End with what
   is done well (briefly).
