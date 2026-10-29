---
name: roblox-npc-ai
description: "Use when creating NPCs or enemies that walk, chase, patrol or detect players: pathfinding, state machines, line of sight and spawns."
---

NPCs are server-owned. The server decides where an NPC goes, what it sees and when it attacks. Clients only show it.

## Verified API (Roblox docs, checked for this skill)
- `PathfindingService:CreatePath(agentParameters)` returns a `Path`.
- Path usage in the docs sample: `path:ComputeAsync(startPosition, targetPosition)` and `path:GetWaypoints()`. The exact signatures of ComputeAsync and GetWaypoints are UNVERIFIED in this skill: read them from the Path docs page first.
- `PathStatus`: the docs sample uses `Enum.PathStatus.Success`. Other values are UNVERIFIED here.
- `Humanoid:MoveTo(location, part)`.
- `Humanoid.Died` (event), `Humanoid.StateChanged(old, new)` (event), `Humanoid.WalkSpeed` (number).
- Deprecated on the docs page: `ComputeRawPathAsync`, `ComputeSmoothPathAsync`, `FindPathAsync`. Do not use them in new code.

## Rules
1. The server runs the AI loop. Keep one loop per NPC or one shared loop over all NPCs, not one loop per frame per NPC.
2. Use a state machine with named states (idle, patrol, chase, attack). Each state has an entry and an exit, and the exit cleans up its connections.
3. Re-path on a timer, not every frame. Recompute only when the target has moved more than a set distance.
4. Check the path status before you walk it. If it is not Success, pick a new target or wait; do not walk a failed path.
5. Line of sight: check with a raycast from the NPC's head. The raycast call is UNVERIFIED here: read its docs page before you write it.
6. Clean up on death: disconnect every event, stop the loop, and remove or pool the model with a delay.
7. Set tunables (detection range, speed, attack cooldown) in a Config module.

## Checks
- Spawn one NPC, walk it to a target, and check the path it takes in a playtest.
- Kill it and confirm its loop and connections stop (print a count before and after).

## Not checked by this skill
- Behaviour on complex maps with many obstacles. Test on the real map.
- Server cost with many NPCs. Measure with the performance tools.
