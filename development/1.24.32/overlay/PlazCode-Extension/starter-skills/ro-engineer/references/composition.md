# Composition

**Core idea:** build entities from small parts that each do one thing, instead
of inheriting behaviour down a class tree.

## Why inheritance breaks in games

A `FlyingEnemy` that also needs to be a `ShootingEnemy` that also drops loot
forces either a diamond hierarchy or duplicated code. Designers ask for new
combinations constantly. Parts that can be mixed freely absorb those requests;
class trees resist them.

Signs you need composition:
- A subclass overrides a parent method to do nothing.
- You copy a method between two sibling classes.
- A base class has fields only some children use.
- Adding a feature means picking which branch of the tree it "belongs" to.

## Composition in OOP

- An entity is a thin container: model, id, a table of components.
- Behaviour lives in components such as `Health`, `Mover`, `LootDrop`,
  `Targeting`. Each has `new`, optional `start`, and `Destroy`.
- Components talk through the entity (signals or a small interface), not by
  reaching into each other's fields.
- The entity owns component lifecycle: it creates them, ticks or connects
  them, and calls `Destroy` on all of them, in reverse order of creation.
- Config decides which components an entity gets, so new enemy types are data,
  not code.

```lua
--!strict
-- Composition: behaviour comes from parts, not a class hierarchy.
local function createEnemy(model: Model, config: EnemyConfig): Entity.Entity
	local entity = Entity.new(model)
	local health = entity:add("health", Health.new(config.maxHealth))
	entity:add("mover", Mover.new(model, config.speed))
	if config.lootTable then
		local loot = entity:add("loot", LootDrop.new(config.lootTable))
		-- Wire through signals, not direct field access.
		health.died:Connect(function()
			loot:drop(model:GetPivot().Position)
		end)
	end
	return entity
end
```

A minimal entity container:

```lua
--!strict
export type Component = { Destroy: (self: any) -> () }

local Entity = {}
Entity.__index = Entity

export type Entity = typeof(setmetatable({} :: {
	model: Model,
	_components: { [string]: Component },
	_order: { string },
}, Entity))

function Entity.new(model: Model): Entity
	return setmetatable({ model = model, _components = {}, _order = {} }, Entity)
end

function Entity.add<T>(self: Entity, name: string, component: T & Component): T
	assert(self._components[name] == nil, `duplicate component {name}`)
	self._components[name] = component
	table.insert(self._order, name)
	return component
end

function Entity.get(self: Entity, name: string): Component?
	return self._components[name]
end

function Entity.Destroy(self: Entity)
	for i = #self._order, 1, -1 do
		self._components[self._order[i]]:Destroy()
	end
	table.clear(self._components)
	table.clear(self._order)
end

return Entity
```

### CollectionService components (Roblox-native composition)

Tag instances in Studio (`Lava`, `Collectible`, `Door`) and attach one
component class per tag. This is composition at the instance level and plays
well with streaming.

- Listen with `CollectionService:GetInstanceAddedSignal(tag)` and
  `GetInstanceRemovedSignal(tag)`, and process `GetTagged(tag)` at start.
- Create the component on add; `Destroy` it on remove. Removal also fires when
  an instance streams out or is destroyed, so cleanup is automatic.
- On the client with streaming enabled, never assume a tagged instance's
  descendants exist yet; use `WaitForChild` with a timeout or handle `nil`.
- Libraries such as Sleitnick's `Component` wrap this pattern. Check current
  maintenance before adopting.

## Composition in ECS

- An entity is only an id. A component is plain data (no methods). A system
  is a function over all entities that have a given set of components.
- Behaviour comes from which components an entity has, so adding `Burning` to
  any entity makes the burning system affect it. No code change per type.
- Keep components small and single-purpose (`Position`, `Velocity`,
  `Health`), not bundles like `EnemyStuff`.
- Tag components (no data, e.g. `IsEnemy`) are cheap filters for queries.

Teaching sketch (real projects use a library, see `ecs.md`):

```lua
--!strict
local position: { [number]: Vector3 } = {}
local velocity: { [number]: Vector3 } = {}

local function movementSystem(dt: number)
	for entity, vel in velocity do
		local pos = position[entity]
		if pos then
			position[entity] = pos + vel * dt
		end
	end
end
```

## Choosing between them

- **OOP components:** tens to low hundreds of entities, rich behaviour, tight
  Roblox instance integration (Models, Humanoids, ProximityPrompts).
- **ECS:** thousands of similar entities, behaviour that is mostly data
  transforms, systems that benefit from running over packed data.
- **Hybrid** is common: ECS for bulk simulation (projectiles, crowds,
  particles-as-gameplay), OOP components for hero entities (players, bosses,
  vehicles).
- **Migration path:** start with OOP components. Move a component type to ECS
  only when profiling shows entity counts or per-frame cost justify it. Keep
  the component's data shape the same so the move is mechanical: OOP component
  fields become ECS component data, its update method becomes a system.

### Hybrid boundary

Pick one direction of truth per piece of data:
- ECS owns simulation data (position, velocity, lifetime) for bulk entities;
  one sync system writes to instances once per frame.
- OOP entities that need to interact with ECS entities (a boss hit by
  projectiles) expose a small interface the ECS damage system can call, or
  register an ECS entity id that mirrors them.
- Never let both sides write the same field.

## ECS design points

- Structural changes (adding/removing components, destroying entities) during
  iteration go to a command buffer or end-of-frame step.
- Order systems explicitly (input, AI, movement, damage, cleanup, render sync)
  and document the order.
- Sync to Roblox instances at the edge: simulate in data, write to instances
  once per frame in one system (prefer `workspace:BulkMoveTo` for many parts).
- Evaluate existing community ECS libraries before writing your own
  (`ecs.md`).

## Anti-patterns

- God components that hold everything about an entity.
- Components that call each other directly, recreating inheritance's
  coupling.
- ECS for fewer than a few hundred entities because it feels clean.
- Behaviour methods on ECS components.
- Components that destroy their own entity mid-update (defer it).
- An "Entity" base class that grows a method for every component.
