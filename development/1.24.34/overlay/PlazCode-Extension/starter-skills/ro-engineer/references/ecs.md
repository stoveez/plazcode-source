# ECS

Entity Component System: entities are ids, components are plain data,
systems are functions over queries. Read `composition.md` first; check
`pattern-selection.md` to confirm ECS is justified.

## When it is overkill

- Fewer than a few hundred entities.
- Entities with very different, rich behaviour (bosses, vehicles).
- A team unfamiliar with ECS on a short timeline.
- Logic mostly event-driven (on touch, on click) rather than per-frame.

## Libraries

Evaluate before writing your own. **[verify]** maintenance status and API
before adopting; this list ages quickly.

| Library | Notes |
|---|---|
| Jecs | Archetype-based, fast, actively developed as of writing; supports relationships/pairs |
| Matter | Mature, good debugger and docs, hooks-style API; check recent activity |
| ECR | Sparse-set based, typed, performance-focused |

Pick based on: typing quality, query speed for your shapes, debugging tools,
documentation, and whether it is still maintained.

## Entity lifecycle

1. Spawn: create id, add initial components in one place (a factory).
2. Live: systems add/remove components as state changes (`Stunned`,
   `Burning`).
3. Despawn: mark with a `Dead`/`Despawn` tag; a cleanup system at the end of
   the frame removes the entity and releases any instance to its pool.

Never despawn inside another system's query loop.

## Component design

- Small and single-purpose: `Position`, `Velocity`, `Health`, `Lifetime`.
- Plain data only. No methods, no Instances unless it is the render link
  component (`Renderable = { part: BasePart }`).
- Tag components (no data) for filtering: `Enemy`, `Projectile`.
- Avoid nested tables in hot components; flatten fields.

## Storage choices (if writing your own)

| Storage | Good for | Cost |
|---|---|---|
| Table per component keyed by entity id | Simple, flexible | Slower multi-component queries |
| Sparse set (dense array + index map) | Fast iteration, fast add/remove | More code |
| Archetypes (tables per component set) | Fastest multi-component queries | Expensive structural changes |

## Systems and scheduling

Run systems in a fixed, documented order, usually:

```
input -> AI/decisions -> movement/physics -> collision/damage -> lifetime/despawn -> render sync
```

- One scheduler drives all systems from one `RunService` event.
- Systems take `dt` and the world; they do not yield.
- Expensive, infrequent systems (AI retargeting) can run every N frames or
  on a time budget.

## Command buffers

Queue structural changes (spawn, despawn, add/remove component) during
iteration and apply them at a defined point (end of system or end of frame).
This avoids iterator invalidation and order-dependent bugs.

## Instance sync

- Simulate in data; write to instances once per frame in a render-sync
  system.
- Batch transforms with `workspace:BulkMoveTo(parts, cframes,
  Enum.BulkMoveMode.FireCFrameChanged)` for many parts.
- On the server, consider not having instances at all for pure simulation and
  replicating compact state to clients, who render.
- Pool render instances (`object-pooling.md`).

## Networking

ECS state does not replicate on its own. Choose:
- Replicate only the components clients need, via a snapshot/diff system and
  remotes (see `networking-remotes.md`).
- Or replicate spawn events with seeds and let clients simulate cosmetics
  deterministically.

## Debugging

- Build an entity inspector (Matter ships one; others have community tools)
  or a debug command that prints an entity's components.
- Name entities in debug builds (a `DebugName` component).
- Log structural changes behind a flag.

## Measuring

Benchmark the hot system against an OOP baseline with the same entity count on
a low-end device. Use MicroProfiler labels (`debug.profilebegin` /
`debug.profileend`) around each system. Keep ECS only if it wins
meaningfully or simplifies the code.
