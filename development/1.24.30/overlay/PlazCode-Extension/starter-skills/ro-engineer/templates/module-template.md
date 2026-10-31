# Module template

Strict-typed module skeleton. Replace `Example` with the module name. Delete
the class section for plain function modules.

```lua
--!strict
--[[
	Example
	Responsibility: <one sentence>
	Loop step: <action | reward | progression | reinvestment | n/a>
	Location: <e.g. ServerStorage/Services/Example> (ModuleScript)
]]

-- Services
local Players = game:GetService("Players")

-- Dependencies
local Trove = require(path.to.Trove)
local Config = require(path.to.ExampleConfig)

-- Types
export type Options = {
	rate: number,
}

-- Constants
local DEFAULT_OPTIONS: Options = table.freeze({
	rate = Config.defaultRate,
})

-- Class
local Example = {}
Example.__index = Example

type ExampleData = {
	_options: Options,
	_trove: typeof(Trove.new()),
	_destroyed: boolean,
}

export type Example = typeof(setmetatable({} :: ExampleData, Example))

-- Private helpers
local function validateOptions(options: Options)
	assert(options.rate > 0, "rate must be positive")
end

-- Public API
function Example.new(options: Options?): Example
	local resolved = options or DEFAULT_OPTIONS
	validateOptions(resolved)

	local self = setmetatable({
		_options = resolved,
		_trove = Trove.new(),
		_destroyed = false,
	}, Example)

	self._trove:Connect(Players.PlayerRemoving, function(player)
		self:_onPlayerRemoving(player)
	end)

	return self
end

function Example._onPlayerRemoving(self: Example, player: Player)
	-- clear per-player state here
end

-- Cleanup
function Example.Destroy(self: Example)
	if self._destroyed then
		return
	end
	self._destroyed = true
	self._trove:Destroy()
end

return Example
```

Checklist:
- [ ] `--!strict`
- [ ] Exported types for the public surface
- [ ] Tuning numbers in a config module
- [ ] Every connection/thread/instance in the trove
- [ ] `Destroy` is idempotent
- [ ] Per-player state cleared on leave
