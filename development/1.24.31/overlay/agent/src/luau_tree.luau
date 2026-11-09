-- PlazCode 1.24.31 Luau service: read-only walk of the open place for the luau-lsp sourcemap
-- (docs/vault/luau-validation-plan.md, stage 2). Fixed code: it reads names, class names and script
-- text and never runs, changes or requires anything from the place. The app replaces __ARGS__.
local HttpService = game:GetService("HttpService")
local Args = HttpService:JSONDecode(__ARGS__)
local SERVICES = { "Workspace", "ReplicatedStorage", "ReplicatedFirst", "ServerScriptService", "ServerStorage",
	"StarterGui", "StarterPack", "StarterPlayer", "Lighting", "SoundService", "Teams", "TextChatService", "MaterialService" }
local MAX_NODES = 12000
local MAX_SCRIPTS = 4000
local Editor = nil
pcall(function() Editor = game:GetService("ScriptEditorService") end)

local function isScript(inst)
	local ok, result = pcall(function() return inst:IsA("LuaSourceContainer") end)
	return ok and result == true
end
local function sourceOf(inst)
	if Editor then
		local ok, text = pcall(function() return Editor:GetEditorSource(inst) end)
		if ok and type(text) == "string" then return text end
	end
	local ok, text = pcall(function() return inst.Source end)
	return (ok and type(text) == "string") and text or ""
end
-- Fast change fingerprint of a text (not a security hash): 4 bytes at a time through a buffer.
local function fingerprint(text)
	local data = buffer.fromstring(text)
	local size = buffer.len(data)
	local h = 2166136261
	local i = 0
	while i + 4 <= size do
		h = bit32.bxor(h, buffer.readu32(data, i))
		h = (bit32.lrotate(h, 13) * 5 + 3864292196) % 4294967296
		i += 4
	end
	while i < size do
		h = bit32.bxor(h, buffer.readu8(data, i))
		h = (bit32.lrotate(h, 13) * 5 + 3864292196) % 4294967296
		i += 1
	end
	return string.format("%08x%x", h, size)
end

-- Every script and its ancestors are always kept; other instances fill the rest up to MAX_NODES.
local keep = {}
local scriptCount = 0
local roots = {}
for _, name in ipairs(SERVICES) do
	local ok, service = pcall(function() return game:FindService(name) end)
	if ok and service then
		roots[#roots + 1] = service
		local okList, list = pcall(function() return service:GetDescendants() end)
		if okList and type(list) == "table" then
			for _, inst in ipairs(list) do
				if scriptCount < MAX_SCRIPTS and isScript(inst) then
					scriptCount += 1
					local cur = inst
					while cur and cur ~= game and not keep[cur] do keep[cur] = true; cur = cur.Parent end
				end
			end
		end
	end
end

local rows, instances, scripts = {}, {}, {}
local function visit(inst, depth)
	if not keep[inst] and #rows >= MAX_NODES then return end
	local script = keep[inst] == true and isScript(inst)
	local index = #rows + 1
	instances[index] = inst
	rows[index] = HttpService:JSONEncode({ depth, inst.ClassName, inst.Name, script and 1 or 0 })
	if script then scripts[#scripts + 1] = index end
	local ok, children = pcall(function() return inst:GetChildren() end)
	if ok and type(children) == "table" then
		for _, child in ipairs(children) do visit(child, depth + 1) end
	end
end
for _, service in ipairs(roots) do visit(service, 1) end

local result = { v = 1, fp = fingerprint(table.concat(rows, "\n")), total = #rows }
local budget = math.clamp(tonumber(Args.budget) or 70000, 2000, 80000)
if Args.mode == "summary" then
	local list = {}
	for _, index in ipairs(scripts) do
		local text = sourceOf(instances[index])
		list[#list + 1] = { index, fingerprint(text) }
	end
	result.scripts = list
elseif Args.mode == "tree" then
	local out, used, index = {}, 0, math.max(1, tonumber(Args.from) or 1)
	while index <= #rows and (used == 0 or used + #rows[index] < budget) do
		out[#out + 1] = rows[index]; used += #rows[index] + 1; index += 1
	end
	result.from = math.max(1, tonumber(Args.from) or 1)
	result.next = index <= #rows and index or nil
	-- Rows are already JSON; splice them in instead of encoding them twice.
	local encoded = HttpService:JSONEncode(result)
	return string.sub(encoded, 1, -2) .. ',"rows":[' .. table.concat(out, ",") .. "]}"
elseif Args.mode == "sources" then
	if Args.fp ~= result.fp then
		result.stale = true
	else
		-- Long scripts arrive in slices; a slice never ends inside a UTF-8 character.
		local out, used, rest = {}, 0, {}
		for _, item in ipairs(Args.want or {}) do
			local index, offset = tonumber(item[1]), tonumber(item[2]) or 0
			local inst = index and instances[index]
			if inst and isScript(inst) then
				if used >= budget then
					rest[#rest + 1] = { index, offset }
				else
					local text = sourceOf(inst)
					local stop = math.min(#text, offset + (budget - used))
					while stop < #text and stop > offset do
						local byte = string.byte(text, stop + 1)
						if byte < 128 or byte >= 192 then break end
						stop -= 1
					end
					out[#out + 1] = { index, offset, string.sub(text, offset + 1, stop), #text }
					used += stop - offset
					if stop < #text then rest[#rest + 1] = { index, stop } end
				end
			end
		end
		result.sources = out
		result.rest = rest
	end
end
return HttpService:JSONEncode(result)
