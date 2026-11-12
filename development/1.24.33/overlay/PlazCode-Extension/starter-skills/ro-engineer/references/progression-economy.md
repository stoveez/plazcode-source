# Progression and economy

## Sources and sinks

List every way each currency enters (sources) and leaves (sinks) the game.

| Currency | Sources | Sinks | Notes |
|---|---|---|---|
| Coins | Selling ore, quests, daily reward | Upgrades, zone unlocks, cosmetics | Soft currency |
| Gems | Achievements, rare drops, Robux purchase | Premium cosmetics, boosts | Hard currency |

- Sources with no sinks inflate: prices stop meaning anything and new
  players fall far behind.
- Sinks with no clear value feel like a tax. Every sink should buy something
  the player wants.
- Track rates: expected currency per minute at each stage vs. cost of the
  next meaningful purchase.

## Pacing curve

- First upgrades fast (seconds to a minute), then slower.
- Each tier should open something new (a zone, an ability, a mechanic), not
  only a bigger number.
- Common shape: costs grow geometrically (e.g. `base * growth^level`) while
  income grows a bit slower, so time-to-next rises gently. Tune `growth`
  per tier; reset the curve when a new mechanic opens.
- Write the expected time to each milestone and test it with real play.

```lua
-- Typed, frozen tuning data, not logic.
local UpgradeCosts = table.freeze({
	base = 50,
	growth = 1.15,
	maxLevel = 100,
})

local function costForLevel(level: number): number
	return math.floor(UpgradeCosts.base * UpgradeCosts.growth ^ (level - 1))
end
```

## Multipliers and stacking

- Define caps per multiplier and overall.
- Define order of operations: additive within a category, multiplicative
  across categories, then cap. Write it down and implement it in one
  function.
- Unbounded stacking (pets x rebirth x boost x gamepass) breaks balance and
  makes new content worthless. Model the max-stack case before shipping.

## Prestige / rebirth

- Reset only what the player can quickly rebuild (soft currency, basic
  upgrades).
- Give a permanent, visible benefit (multiplier, new tool, cosmetic badge,
  new zone).
- The first rebirth should be reachable in a reasonable first few sessions
  and clearly explained before the player commits.
- Each rebirth should make the early game faster, so re-climbing feels
  powerful rather than repetitive.

## Gating

- Gates should feel like a goal, not a wall.
- Offer at least two ways past (skill, time, social, currency).
- Show what is behind the gate before the player reaches it.
- Avoid gates that are only passable by paying.

## Monetization fit

- Paid items should save time or add expression, not be required to
  progress.
- Gamepasses with permanent multipliers must be included in the stacking
  model.
- Paid random items: **check current Roblox policy** on odds disclosure,
  regional restrictions (`PolicyService`) and trading before designing.

## Server authority

All currency math, drops and purchases happen and are validated on the
server (`client-server-boundaries.md`, `networking-remotes.md`). The client
only displays balances and sends requests.

## Exploit checks

- **Duplication:** item or currency granted twice through retries, race
  conditions, trading, or rejoining mid-transaction.
- **Race conditions on purchase:** two requests in the same frame both pass
  the balance check. Check and deduct atomically in one server function.
- **Client-trusted values:** price, quantity or reward from the payload.
- **Free loops:** buy A for 10, sell A for 11. Check every conversion pair
  and cycle.
- **Negative/NaN amounts:** selling -5 items, buying NaN.
- **Trade abuse:** alt accounts funnelling items, scams; log trades.

## Tuning data

- Keep numbers in typed, frozen data tables, not hardcoded in logic.
- One module per domain (UpgradeConfig, DropTables, ZoneConfig).
- Version config changes and note them in patch notes; balance changes are
  content.
- Log economy events with a `reason` so you can see where currency comes
  from and goes in practice.
