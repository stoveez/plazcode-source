# Networking and remotes

## Choosing the remote type

| Type | Use for |
|---|---|
| `RemoteEvent` | Fire-and-forget requests and notifications (most cases) |
| `UnreliableRemoteEvent` | High-rate, lossy, order-insensitive data (cosmetic positions, VFX triggers) |
| `RemoteFunction` | Client asks server and needs an answer (e.g. "can I buy this?"). Never invoke the client from the server: a client can hang it |
| Attributes / ValueObjects | Small replicated per-instance state |
| Instance replication | World objects that everyone sees |

## Organisation

- Define remotes in one place (a shared module that creates or finds them) so
  names are not scattered string literals.
- Create remotes on the server at startup; clients `WaitForChild` them.
- One remote per intent (`RequestBuy`, `RequestEquip`), not one generic
  remote with a `"action"` string, unless you also validate the action
  against a strict allow-list.
- Networking libraries (e.g. Zap, Blink, ByteNet, Packet; **[verify]**
  status) add typed schemas and packing. Worth it for busy games.

## Server handler pattern

```lua
--!strict
local RATE_LIMIT_PER_SECOND = 5

local lastCalls: { [Player]: { number } } = {}

local function allow(player: Player): boolean
	local now = os.clock()
	local calls = lastCalls[player]
	if not calls then
		calls = {}
		lastCalls[player] = calls
	end
	-- drop timestamps older than 1 second
	while calls[1] and now - calls[1] > 1 do
		table.remove(calls, 1)
	end
	if #calls >= RATE_LIMIT_PER_SECOND then
		return false
	end
	table.insert(calls, now)
	return true
end

Remotes.RequestBuy.OnServerEvent:Connect(function(player: Player, itemId: unknown)
	if not allow(player) then
		return
	end
	if typeof(itemId) ~= "string" or #itemId > 64 then
		return
	end
	local item = ShopConfig.items[itemId]
	if not item then
		return
	end
	ShopService.tryBuy(player, item) -- server computes price, checks balance
end)

Players.PlayerRemoving:Connect(function(player)
	lastCalls[player] = nil -- avoid leaking per-player tables
end)
```

A token bucket is smoother than this sliding window for bursty input;
either is fine. Always clear per-player tables on leave.

## Bandwidth

- Send ids and small numbers, not whole tables or Instances you could look
  up.
- Batch frequent updates into one send per frame or per tick instead of one
  per change.
- Send deltas, not full state, for large replicated structures.
- Quantize where precision does not matter (positions to centimetres, angles
  to bytes) using `buffer` for packed payloads in hot paths.
- Check the Network stats in the Developer Console during a full-server
  playtest.

## Client to server patterns

- Requests describe intent ("use ability 2 at target X"), not results ("I
  dealt 50 damage").
- Include only what the server cannot know (the aim direction), not what it
  can (the player's level).

## Server to client patterns

- Broadcast with `FireAllClients` only for things everyone needs; otherwise
  `FireClient` to the relevant players (in range, on the team).
- For late joiners, provide a snapshot on join; do not rely on having
  received every past event.

## RemoteFunction cautions

- Server `OnServerInvoke` must return quickly and never yield on client
  input.
- Never use `InvokeClient`: a malicious or disconnected client can yield the
  server thread forever or error.
- Wrap client-side `InvokeServer` calls with error handling; they can fail.
