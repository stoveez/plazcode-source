# OOP patterns

Use OOP for things with identity and a lifetime: a player session, a vehicle,
a boss, a round. Combine it with composition (`composition.md`); avoid
inheritance chains.

## Typed class template

```lua
--!strict
local Players = game:GetService("Players")

local Trove = require(path.to.Trove) -- or your Maid/Janitor

local Turret = {}
Turret.__index = Turret

type TurretData = {
	model: Model,
	range: number,
	_trove: typeof(Trove.new()),
	_target: Model?,
	_destroyed: boolean,
}

export type Turret = typeof(setmetatable({} :: TurretData, Turret))

function Turret.new(model: Model, range: number): Turret
	local self = setmetatable({
		model = model,
		range = range,
		_trove = Trove.new(),
		_target = nil,
		_destroyed = false,
	}, Turret)

	self._trove:Connect(model.Destroying, function()
		self:Destroy()
	end)

	return self
end

function Turret.setTarget(self: Turret, target: Model?)
	self._target = target
end

function Turret.Destroy(self: Turret)
	if self._destroyed then
		return
	end
	self._destroyed = true
	self._trove:Destroy()
end

return Turret
```

## The Destroy contract

Every class with connections, threads or instances must:
- Expose `Destroy()` (PascalCase matches Roblox and cleanup libraries).
- Be idempotent: calling it twice is safe.
- Release everything it created: connections, threads (`task.cancel`),
  instances it created, child objects.
- Not destroy things it does not own (e.g. a Model passed in by the caller),
  unless documented.
- Mark itself destroyed so late callbacks can bail out.

See `cleanup-lifecycle.md`.

## Constructors

- `Class.new(...)` returns a fully usable object. No two-step init unless
  there is async work.
- If construction needs yielding (loading data), use a static
  `Class.load(...)` that returns the object or `nil, err`, and document that
  it yields.
- Validate arguments in `new`; fail loudly with `assert` on programmer errors.

## Composition inside classes

Prefer has-a: a `Boss` holds a `Health`, a `PhaseController` and an
`AttackScheduler`, each its own small class, rather than inheriting from
`Enemy`.

```lua
function Boss.new(model: Model, config: BossConfig): Boss
	local self = setmetatable({}, Boss)
	self.health = self._trove:Add(Health.new(config.maxHealth))
	self.phases = self._trove:Add(PhaseController.new(config.phases))
	self._trove:Connect(self.health.changed, function(hp)
		self.phases:onHealthChanged(hp / config.maxHealth)
	end)
	return self
end
```

## Inheritance limit

If you must inherit, go at most one level (an abstract base plus concrete
classes), and only when every child genuinely uses all base behaviour. Beyond
that, switch to components. Metatable chains (`setmetatable(Child, {__index =
Parent})`) also make types harder in strict mode.

## When a plain module is better

- No per-instance state: a module of functions (`MathUtil`, `Formatting`).
- Exactly one instance for the server's lifetime: a module with local state
  and `start()` is simpler than a singleton class.
- Data with no behaviour: a typed table.

## Private fields

Prefix with `_` and keep them out of the exported surface by convention.
Luau has no access modifiers. For truly private state, keep it in a
module-local table keyed by the object, but that is rarely worth it.

## Signals

For component events, use a small signal implementation (e.g. GoodSignal or
the one bundled with your cleanup library) rather than BindableEvents:
cheaper, typed, and no serialization of arguments.
