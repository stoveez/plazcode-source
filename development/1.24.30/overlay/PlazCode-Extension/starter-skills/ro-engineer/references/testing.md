# Testing

Test the logic that would hurt most if it broke: economy math, inventory
operations, validation, state transitions, save migrations.

## What to test

| Test type | Good for | How |
|---|---|---|
| Unit tests | Pure functions: pricing, damage formulas, validators, migrations | Test runner in Studio or Lune |
| Integration tests | Services working together with fake players/data | Test runner in Studio play mode |
| Playtests | Feel, replication, UI, edge cases | Studio Play / Start Server with multiple clients |
| Soak tests | Leaks, long-session performance | Run for 30+ min with join/leave cycles |

## Make code testable

- Keep logic in pure functions that take data and return data. Push Roblox
  API calls (DataStores, Players, Instances) to thin edges.
- Inject dependencies (pass the DataStore wrapper in) so tests can use fakes.
- Keep config in data modules so tests can use small, predictable values.

```lua
--!strict
-- Pure: easy to test.
local function priceAfterDiscount(base: number, discountPct: number): number
	local pct = math.clamp(discountPct, 0, 90)
	return math.floor(base * (100 - pct) / 100)
end
```

## Tooling

**[verify]** current status before adopting:

- **Jest Lua** (Roblox's port of Jest): `describe`/`it`/`expect` in Studio.
- **TestEZ**: older BDD runner, still found in many codebases.
- **Lune**: standalone Luau runtime; run pure-logic tests from the command
  line or CI without Studio.
- **Rojo** to sync files, **Selene** for linting, **StyLua** for formatting,
  **luau-lsp** for type checking outside Studio.

## Example spec (Jest Lua style)

```lua
local priceAfterDiscount = require(script.Parent.priceAfterDiscount)

describe("priceAfterDiscount", function()
	it("applies a percentage discount", function()
		expect(priceAfterDiscount(100, 25)).toBe(75)
	end)

	it("caps discount at 90%", function()
		expect(priceAfterDiscount(100, 200)).toBe(10)
	end)
end)
```

## Economy and validation tests worth writing

- Buying with exactly enough, one short, and with a negative/NaN amount.
- Concurrent purchase requests do not double-spend.
- Selling and rebuying cannot generate currency (no free loops).
- Prestige resets what it should and keeps what it should.
- Save migration from every previous schema version.

## In studio mode

- Run tests via `execute_luau` and read results with `get_console_output`.
- Use `start_stop_play` for playtests, then inspect state with
  `execute_luau`.
- Every implementation task in a plan names its verification step.
