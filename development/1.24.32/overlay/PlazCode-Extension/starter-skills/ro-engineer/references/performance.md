# Performance

Measure first, fix the biggest cost, measure again. Target low-end mobile;
it is a large share of Roblox players.

## Tools

| Tool | Shows |
|---|---|
| MicroProfiler (Ctrl+F6) | Per-frame time by task; add labels with `debug.profilebegin(name)` / `debug.profileend()` |
| Developer Console (F9) | Memory by category, script activity (`ScriptProfiler`), network |
| Script Profiler | Which functions consume CPU |
| Stats panel (Shift+F5 etc.) | FPS, ping, memory, physics |
| Studio Device Emulator | Screen sizes, not real performance; test on a real phone |

In `studio` mode, use `execute_luau` to count instances, parts and
connections, and `get_console_output` to read benchmark prints.

## Common costs, biggest first

1. **Too many parts/instances and draw calls.** Merge static geometry into
   meshes, use `StreamingEnabled`, reduce unique materials/textures, cull
   distant decorations.
2. **Per-frame scripts doing too much.** Many scripts each with their own
   `Heartbeat` connection; heavy loops over all parts; `GetDescendants` every
   frame. Centralize updates and cache lookups.
3. **Physics.** Unanchored parts, complex collision geometry
   (`CollisionFidelity`), many constraints. Anchor what does not move; use
   `Box`/`Hull` fidelity; disable `CanTouch`/`CanQuery`/`CanCollide` where not
   needed.
4. **Network.** Firing remotes every frame, replicating many moving parts
   from the server, large payloads (`networking-remotes.md`).
5. **Memory growth.** Leaks from connections and tables
   (`cleanup-lifecycle.md`).
6. **UI.** Rebuilding UI every update, many `UIGradient`/`UIStroke` in lists,
   huge scrolling frames without virtualization.
7. **Lighting/VFX.** Shadows on many lights, `Future` lighting on low-end,
   many active ParticleEmitters, high-res textures.

## Script hot-path rules

- One update loop per system, not per object.
- Cache `GetService`, `FindFirstChild` results and config lookups outside
  loops.
- Avoid allocating tables, closures and strings per frame in hot code.
- Spread expensive work over frames (time-slice) or run at a lower rate.
- Use spatial queries (`GetPartBoundsInRadius`, `Raycast` with
  `RaycastParams`) instead of looping over all parts.
- Use `workspace:BulkMoveTo` for moving many parts.
- Parallel Luau (Actors, `task.desynchronize`) can help CPU-heavy, isolated
  work; measure, and remember writes to the DataModel must be synchronized.

## Rendering budget (rough guides, verify per game)

- Keep visible part counts and unique meshes modest on mobile; stream the
  rest.
- Prefer textures/decals at reasonable resolution; reuse materials.
- Use `RenderFidelity = Automatic` on MeshParts.
- Limit light count with shadows.

## Server performance

- Server frame rate (heartbeat) drops cause rubber-banding for everyone.
  Watch server script activity in the Developer Console (Server tab).
- Move cosmetic work to clients.
- NPC AI: lower tick rate for distant NPCs, pathfinding results cached and
  recomputed sparingly.

## Process

1. Reproduce the slowdown with a specific scenario (full server, boss fight,
   lobby with 30 pets).
2. Capture numbers: frame time, memory, network, instance count.
3. Identify the single biggest cost.
4. Fix it, re-measure, record before/after.
5. Stop when the target is met. Do not micro-optimize code that is not on the
   profile.
