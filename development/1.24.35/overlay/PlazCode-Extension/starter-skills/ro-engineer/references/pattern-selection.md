# Pattern selection

Pick the simplest structure that meets the requirement. Patterns are tools,
not goals.

## Decision table

| Need | Use | Avoid when |
|---|---|---|
| Simple, one-off logic | Plain module | You already have three copies of the same logic |
| Shared state with many readers or subscribers | State manager | State is local to one module |
| Frequent spawn/destroy (projectiles, VFX, NPCs, damage numbers) | Object pooling | Instances are rare or long-lived |
| A few long-lived entities with behaviour | OOP with composition | Hundreds of identical entities processed in bulk |
| Thousands of similar entities processed every frame | ECS | Under a few hundred entities, or heavy per-entity behaviour |

## Decision steps

Ask these in order and stop at the first "yes":

1. Can a plain module with functions do it? Use that.
2. Does the thing have identity and lifetime (created, lives, destroyed) with
   its own behaviour? Use OOP with composition (`oop-patterns.md`,
   `composition.md`).
3. Are there hundreds to thousands of them, mostly doing data transforms every
   frame, and has profiling shown the OOP version is too slow? Use ECS
   (`ecs.md`).
4. Separately: is the same state read by many unrelated systems or UI? Add a
   state manager for that state only (`state-management.md`).
5. Separately: are instances created and destroyed many times per second?
   Pool them (`object-pooling.md`).

Steps 4 and 5 are orthogonal to 1-3. They stack on top of whatever you chose.

## Rules

- Default to the simplest option. Plain modules beat patterns.
- Patterns combine: pooled objects can be OOP instances; ECS can read from a
  state manager.
- Every design records the chosen pattern, the reason, and the rejected
  alternatives with one line each on why.
- Prefer composition at every level. See `composition.md`.
- Upgrade a pattern when evidence appears (duplication, profiler numbers,
  bugs from shared mutable state), not in anticipation.

## Rough scale signals

These are starting points, not laws. Measure on target devices (low-end mobile
first).

| Signal | Suggests |
|---|---|
| < 50 live entities | Plain modules or OOP |
| 50 - 500 live entities | OOP with composition; consider pooling |
| 500+ entities updated per frame | Benchmark ECS against OOP |
| > 10 spawn/destroy per second of the same kind | Pooling |
| 3+ systems reading the same mutable data | State manager for that data |

## Writing it down

In a design doc:

```
Pattern: OOP with composition (Health, Mover, LootDrop components)
Why: ~30 live enemies, rich per-enemy behaviour, tied to Models.
Rejected:
- ECS: entity count too low to justify; adds a library and a mental model.
- Plain module: enemies have per-instance state and lifetimes.
Plus: pooling for projectiles (fire rate ~20/s).
```
