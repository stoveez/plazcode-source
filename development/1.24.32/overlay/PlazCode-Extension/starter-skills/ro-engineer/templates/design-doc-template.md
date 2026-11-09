# Design: <system>

## Overview
<What this system does and which loop step it serves.>

## Ownership map

| State | Owner | Lives on | Replicated how | Persisted |
|---|---|---|---|---|

## Pattern
- **Chosen:** 
- **Why:** 
- **Rejected:**
  - <alternative>: <one line why not>
- **Also:** <pooling / state manager / composition notes>

## Module interfaces

```lua
export type <Module> = {
	-- functions
	-- signals
}
```

| Module | Location | Script type | Responsibility |
|---|---|---|---|

## Client/server boundary

| Remote | Direction | Payload | Validation | Rate limit |
|---|---|---|---|---|

## Performance budget
- Expected entity counts / update rates:
- Budget (frame time, network, memory):

## Cleanup strategy
- <Which trove/maid owns which lifetime: player, character, round, object.>

## Open questions
- 
