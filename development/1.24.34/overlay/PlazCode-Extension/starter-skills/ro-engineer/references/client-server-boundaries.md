# Client/server boundaries

## The rule

The server is authoritative. The client is an input device and a display.
Anything the client says is a request that can be forged.

Exploiters can: fire any remote with any arguments at any rate, read all
client code and ReplicatedStorage, change their own character's physics
(they own its network ownership), and read/modify any client-side value.

## What lives where

| Server only | Client only | Shared (ReplicatedStorage) |
|---|---|---|
| Currency, inventory, XP, unlocks | Input handling | Types, config, constants |
| Damage, hit validation, drops | UI, camera, VFX, sounds | Pure helpers (formatting, math) |
| DataStores, purchases (ProcessReceipt) | Prediction and interpolation | Remote definitions |
| Round/match state | Local settings | Asset ids |
| Secrets, drop tables if exploitable | | |

Do not put anything in ReplicatedStorage you would not want an exploiter to
read (e.g. hidden loot weights you rely on being secret, admin lists).

## Validation checklist for every remote handler

1. **Type:** every argument checked with `typeof`; reject NaN and inf for
   numbers (`n ~= n`, `math.abs(n) == math.huge`).
2. **Range:** counts are integers within bounds; strings have max length;
   enums are in an allowed set.
3. **Ownership:** the player owns the item, plot, pet or unit they reference.
4. **State:** the action is legal now (alive, in round, in range, not
   stunned).
5. **Distance:** for world interactions, check the server-side position of
   the character against the target.
6. **Cooldown/rate:** per-player limit (`networking-remotes.md`).
7. **Cost:** server computes the price from server config, never from the
   payload.

## Physics and network ownership

- Players own their character's physics, so position is client-controlled.
  Sanity-check movement-sensitive actions (teleport distance, speed) on the
  server.
- Unanchored parts near a player may be owned by that client. Set
  `part:SetNetworkOwner(nil)` for gameplay-critical physics objects.
- Never trust client-reported hits for damage without server checks (range,
  line of sight, fire rate).

## Prediction

For responsiveness, the client can act immediately (play the swing, show
the coin count go up) and reconcile when the server responds. The server's
answer always wins; roll back the visual if rejected.

## Touched events

`Touched` fires on the side that owns the physics. On the server, validate
that the touching part belongs to a live character and debounce per player.
Prefer server-side spatial queries (`GetPartBoundsInBox`, `Raycast`) for
critical checks.

## Purchases

- Developer products: grant only inside `MarketplaceService.ProcessReceipt`,
  idempotently (record receipt ids), and return `PurchaseGranted` only after
  the grant is saved.
- Game passes: check ownership on the server with
  `UserOwnsGamePassAsync` (cache it) and handle `PromptGamePassPurchaseFinished`.
- Never grant on a client message saying "I bought it".
