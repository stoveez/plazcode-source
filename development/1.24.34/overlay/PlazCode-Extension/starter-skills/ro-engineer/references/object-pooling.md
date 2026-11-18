# Object pooling

Reuse instances instead of `Instance.new`/`Clone` + `Destroy` for things
created and destroyed often: projectiles, hit VFX, damage numbers, bullet
holes, short-lived NPCs.

## When not to pool

- Rare or long-lived objects (a boss, a map piece).
- Objects whose reset is as expensive as creating them.
- Before measuring: confirm creation/destruction cost shows up in the
  MicroProfiler or memory graphs.

## API

```lua
--!strict
local Pool = {}
Pool.__index = Pool

type PoolData<T> = {
	_create: () -> T,
	_reset: (T) -> (),
	_free: { T },
	_inUse: { [T]: true },
	_max: number,
}

export type Pool<T> = typeof(setmetatable({} :: PoolData<T>, Pool))

function Pool.new<T>(create: () -> T, reset: (T) -> (), max: number): Pool<T>
	return setmetatable({
		_create = create,
		_reset = reset,
		_free = {},
		_inUse = {},
		_max = max,
	}, Pool) :: any
end

function Pool.prewarm<T>(self: Pool<T>, count: number)
	for _ = 1, math.min(count, self._max) - #self._free do
		table.insert(self._free, self._create())
	end
end

function Pool.acquire<T>(self: Pool<T>): T
	local item = table.remove(self._free) or self._create()
	self._inUse[item] = true
	return item
end

function Pool.release<T>(self: Pool<T>, item: T)
	if not self._inUse[item] then
		return -- double release or foreign object
	end
	self._inUse[item] = nil
	self._reset(item) -- reset on release, not on acquire (SE-3)
	if #self._free < self._max then
		table.insert(self._free, item)
	elseif typeof(item) == "Instance" then
		item:Destroy()
	end
end

return Pool
```

## Reset on release

Reset everything the next user might observe: CFrame, velocity, transparency,
color, attributes, particle emitters (`:Clear()`, `Enabled = false`), sounds
stopped, connections disconnected, tweens cancelled, child instances removed.
A stale value from the previous use (SE-3) is the classic pooling bug.

## Where released instances live

- Option A: keep them parented to a hidden folder and move them far away
  (`CFrame = CFrame.new(0, -10000, 0)`). Cheapest; avoids reparent cost.
- Option B: `Parent = nil`. Fewer things in the workspace, but reparenting
  has a cost and can trigger replication.
- On the server, parked parts in workspace still replicate and simulate.
  Anchor them and set `CanCollide`, `CanTouch`, `CanQuery` to false.

## Sizing

- Prewarm to the typical peak (measure it in a playtest).
- Cap the pool (`max`); destroy overflow on release.
- Optionally shrink after a quiet period if memory matters.

## Server vs client

- Cosmetic objects (VFX, damage numbers, shell casings): pool on the client
  only. The server should not create them at all; send an event.
- Gameplay objects that must replicate: pool on the server, but consider
  whether clients could render them from data instead.

## Measuring that it helped

Compare before/after: frame time in the MicroProfiler during peak spawning,
and memory/instance count over a 10-minute session. If there is no
difference, remove the pool.

## Anti-patterns

- Pooling rarely-used objects.
- Resetting on acquire (state leaks between release and acquire, e.g.
  lingering touch events).
- Forgetting to release on every exit path (hit, timeout, owner left).
- Holding references to released objects elsewhere.
