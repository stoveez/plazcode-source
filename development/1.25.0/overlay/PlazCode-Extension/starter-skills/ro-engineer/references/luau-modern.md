# Modern Luau

Roblox runs one Luau version for every experience; there is no per-game
version to pick. Claims marked **[verify]** are about whether a feature has
shipped yet (features sometimes reach Studio before live servers). Re-check
them against the Luau release notes (luau.org and the Roblox Creator Hub
release notes) before relying on them.

## File header

```lua
--!strict
```

Every module. Use `--!nonstrict` only for legacy code you are migrating, and
leave a comment saying why.

## Bindings

- Always `local`. No globals; strict mode flags them.
- `const` bindings: **[verify]** check the release notes for whether a
  `const` keyword has shipped. If not, use `local` and treat values as
  immutable by convention (UPPER_SNAKE for module-level constants).
- Freeze shared config tables: `table.freeze(CONFIG)` (shallow; freeze nested
  tables too if they are shared).

## Syntax worth using

| Feature | Example |
|---|---|
| Generalized iteration | `for key, value in tbl do` |
| String interpolation | `` `{player.Name} has {coins} coins` `` |
| If-expressions | `local label = if n == 1 then "item" else "items"` |
| Compound assignment | `count += 1`, `name ..= "!"` |
| `continue` | inside loops |
| Floor division | `7 // 2 == 3` |
| Typed varargs | `function log(...: string)` |
| Generics | `function first<T>(list: { T }): T?` |

Generalized iteration replaces `pairs`/`ipairs`. For arrays it iterates
`1..n` in order like `ipairs`; for dictionaries order is unspecified.

## task library

| Use | Instead of |
|---|---|
| `task.wait(s)` | `wait(s)` |
| `task.spawn(fn, ...)` | `spawn(fn)` / `coroutine.wrap(fn)()` for fire-and-forget |
| `task.defer(fn, ...)` | running something "after this frame's current work" |
| `task.delay(s, fn, ...)` | `delay(s, fn)` |
| `task.cancel(thread)` | flags checked in loops |

- `task.spawn` runs immediately until the first yield; `task.defer` runs later
  in the same frame cycle. Use `defer` to avoid re-entrancy in event handlers.
- Keep the thread returned by `task.delay`/`task.spawn` if you might need to
  cancel it, and cancel it in cleanup.
- Prefer event-driven code (`RunService.Heartbeat`, signals) over
  `while true do task.wait() end` loops.

## Table helpers

- `table.create(n, value?)` preallocates arrays in hot paths.
- `table.clear(t)` empties a table while keeping its memory (good for reused
  scratch tables).
- `table.clone(t)` for shallow copies.
- `table.freeze(t)` / `table.isfrozen(t)` for config and constants.
- `table.find(array, value)` for small arrays; use a set (`{ [T]: true }`)
  for repeated lookups.

## buffer

`buffer` is a fixed-size byte array (`buffer.create`, `buffer.writeu8`,
`buffer.readf32`, ...). Use it for compact network payloads, serialization and
large numeric data. Do not use it for ordinary game state.

## Engine APIs to prefer

| Prefer | Over |
|---|---|
| `Animator:LoadAnimation` | `Humanoid:LoadAnimation` |
| Constraint movers (`LinearVelocity`, `AlignPosition`, `AlignOrientation`) | `BodyVelocity`, `BodyPosition`, `BodyGyro` |
| `Instance.new(class)` then set properties, then `.Parent` last | `Instance.new(class, parent)` |
| `:Connect` | `:connect` |
| `workspace:GetServerTimeNow()` for synced time | `tick()` |
| `os.clock()` for benchmarking | `tick()` |
| `RunService.PreSimulation` / `PostSimulation` / `PreRender` **[verify names]** | `Stepped` / `Heartbeat` / `RenderStepped` (still work) |
| `Instance.Destroying` signal | polling `.Parent == nil` |
| `UnreliableRemoteEvent` for lossy high-rate data | `RemoteEvent` for cosmetic spam |
| `table.unpack` | `unpack` |

## Avoid

- `getfenv` / `setfenv` / `loadstring`: they disable Luau optimizations.
- Legacy `spawn`, `delay`, `wait`.
- Deeply nested anonymous functions in hot paths (allocations per call).
- String keys built at runtime in hot loops (`"part" .. i`) when an array
  works.
- `:: any` casts to silence the type checker. Fix the type or narrow it.

## Performance-minded idioms

- Cache services and frequently used functions in locals at module top.
- Use `Vector3`, `CFrame` math instead of tables of numbers.
- Avoid creating closures per frame; create once and reuse.
- Measure with `os.clock()` deltas or the MicroProfiler before optimizing.
