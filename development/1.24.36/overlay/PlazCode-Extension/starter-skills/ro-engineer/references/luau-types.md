# Luau types

Strict mode only helps if public surfaces are typed. Type the edges (module
APIs, remote payloads, config), let inference handle locals.

**[verify]** Roblox has been rolling out a new type solver. It only affects
type checking in Studio (analysis), never runtime: every experience runs the
same Luau. Some checks (refinements, generic inference, type functions) differ
between the old and new solver, and which one you get can depend on a Studio
beta setting per developer. When something type-checks differently than
expected, check which solver is active and the Luau release notes.

## export type

```lua
--!strict
export type ItemId = string

export type Item = {
	id: ItemId,
	name: string,
	price: number,
	tags: { string },
	rarity: "Common" | "Rare" | "Epic", -- singleton string union
}

return {}
```

Consumers: `local Items = require(path.Items)` then `Items.Item`.

## Classes

```lua
local Wallet = {}
Wallet.__index = Wallet

type WalletData = { _balance: number, _owner: Player }
export type Wallet = typeof(setmetatable({} :: WalletData, Wallet))

function Wallet.new(owner: Player): Wallet
	return setmetatable({ _balance = 0, _owner = owner }, Wallet)
end

function Wallet.add(self: Wallet, amount: number)
	self._balance += amount
end
```

Declare methods with `.` and an explicit `self: Wallet` parameter. The colon
form also works but the old solver types `self` less reliably.

## Generics

```lua
local function map<T, U>(list: { T }, fn: (T) -> U): { U }
	local out = table.create(#list)
	for i, v in list do
		out[i] = fn(v)
	end
	return out
end
```

Generic classes (e.g. a typed pool):

```lua
export type Pool<T> = {
	acquire: (self: Pool<T>) -> T,
	release: (self: Pool<T>, item: T) -> (),
}
```

## Optional and nil

- `T?` means `T | nil`. Narrow before use: `if x then ... end`.
- `FindFirstChild` returns `Instance?`; narrow with `if child and child:IsA("Part") then`.
- `assert(x, msg)` narrows `x` to non-nil after the call.

## Type guards and refinement

```lua
local function isVector3(value: unknown): boolean
	return typeof(value) == "Vector3"
end

local function handle(payload: unknown)
	if typeof(payload) ~= "table" then
		return
	end
	local amount = (payload :: any).amount -- table contents still need checks
	if typeof(amount) ~= "number" or amount ~= amount then -- rejects NaN
		return
	end
	-- amount: number from here
end
```

- Use `typeof` (Roblox types: `Vector3`, `Instance`, `CFrame`) not `type`
  (Lua base types only) when checking engine values.
- `x:IsA("BasePart")` refines `Instance` to `BasePart`.
- Remote payloads arrive as `unknown`. Treat them that way and refine; do not
  annotate handler parameters with the type you hope for.

## unknown, any, never

- `unknown`: you must refine before use. Correct for untrusted input.
- `any`: opts out of checking. Avoid; if needed, confine it to one line with a
  comment.
- `never`: unreachable. Useful in exhaustive checks.

## Exhaustive checks on unions

```lua
type State = "Idle" | "Running" | "Dead"

local function label(state: State): string
	if state == "Idle" then
		return "idle"
	elseif state == "Running" then
		return "run"
	elseif state == "Dead" then
		return "dead"
	end
	local _exhaustive: never = state
	error("unreachable")
end
```

## Tagged unions for messages

```lua
export type Command =
	{ kind: "buy", itemId: string }
	| { kind: "sell", itemId: string, count: number }
```

Refine on `kind`. Useful for remote message types and state actions.

## Typing tables of functions

```lua
export type Service = {
	start: () -> (),
	getBalance: (player: Player) -> number,
}
```

## Common pitfalls

- `typeof(setmetatable(...))` must reference the metatable table itself, so
  declare `Class.__index = Class` before the `export type`.
- Whether indexing a dictionary returns `T?` differs between the old and new
  solver; narrow anyway.
- Casting with `::` lies to the checker. Use it to *widen* or for known engine
  shapes (`:: Model`), not to skip validation.
