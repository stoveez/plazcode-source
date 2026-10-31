# System design

How to carve a game into modules with clear ownership, interfaces and data
flow.

## Module boundaries

- One system per responsibility: `CurrencyService`, `InventoryService`,
  `RoundController`, `ShopUI`.
- A system owns its state and exposes functions and signals. Nobody else
  writes its state.
- Split by what changes together, not by object type. If two modules always
  change in the same commit, they may be one module.
- Keep shared code in `ReplicatedStorage/Shared` (types, config, pure
  functions). Server-only code in `ServerScriptService`/`ServerStorage`.
  Client-only code in `StarterPlayerScripts`/`ReplicatedStorage/Client`.

## Typical layout

```
ReplicatedStorage/
  Shared/         types, config (frozen), pure utils, remote definitions
  Client/         client controllers, UI
  Packages/       Wally or vendored libraries
ServerScriptService/
  Main.server.luau        bootstraps services
ServerStorage/
  Services/       server systems
StarterPlayer/StarterPlayerScripts/
  Main.client.luau        bootstraps controllers
```

Use one bootstrap script per side that requires modules and calls `init`
then `start`, instead of many independent Scripts with hidden ordering.

## Lifecycle

```
init()   -- create state, no cross-system calls
start()  -- connect events, call other systems
```

Two phases avoid require-order bugs. Frameworks (Knit-style) do this for you,
but a 20-line loader is enough.

## Ownership map

For each piece of state, write down:

| State | Owner | Lives on | Replicated how | Persisted |
|---|---|---|---|---|
| Coins | CurrencyService | Server | Attribute on player / remote | DataStore |
| Round phase | RoundService | Server | Attribute on workspace | No |
| Shop open | ShopUI | Client | n/a | No |

If two systems claim the same state, redesign.

## Interfaces first

Define each system's public surface before internals:

```lua
export type CurrencyService = {
	getBalance: (player: Player) -> number,
	add: (player: Player, amount: number, reason: string) -> (),
	trySpend: (player: Player, amount: number, reason: string) -> boolean,
	balanceChanged: Signal<Player, number>,
}
```

- Functions for commands and queries, signals for "something happened".
- Pass ids and plain data across boundaries, not internal objects.
- Include a `reason` on economy mutations for logging and analytics.

## Dependencies

- Dependencies point one way. Draw the graph; break cycles by introducing a
  signal or moving shared logic down into a lower module.
- High-level systems (Round) depend on low-level ones (Currency), not the
  reverse. Low-level systems announce via signals.
- Avoid a global "GameManager" that knows everything.

## Data flow

Typical flow for a player action:

```
Client input -> Client controller -> Remote (request)
  -> Server handler: validate -> System command -> State change
  -> Signal -> Replication -> Client UI update
```

The client may predict for feel, but the server result wins.

## Persistence

- One data module owns load/save per player, with session locking (e.g.
  ProfileStore-style libraries; **[verify]** current recommendation).
- Save on leave, on `game:BindToClose`, and periodically.
- Version the saved schema and migrate on load.
- Respect DataStore request budgets; never save per change.

## Config and tuning

Numbers live in typed, frozen config modules, not inline in logic, so tuning
does not require code changes.
