-- Roblox stand-ins for running PlazLib (core/plazlib-data.js) in the plain Luau VM; used by test-plazlib.js.
-- Only what the helpers touch is modelled. runBuild(src) runs one injected execute_luau command with these stand-ins.
local function typed(kind, t) t.__type = kind return t end
local V3 = {}
V3.__index = V3
V3.__add = function(a, b) return Vector3.new(a.X + b.X, a.Y + b.Y, a.Z + b.Z) end
Vector3 = { new = function(x, y, z) return setmetatable(typed("Vector3", { X = x or 0, Y = y or 0, Z = z or 0 }), V3) end }
Vector3.zero = Vector3.new(0, 0, 0)
Vector2 = { new = function(x, y) return typed("Vector2", { X = x or 0, Y = y or 0 }) end }
local CF = {}
CF.__index = CF
CF.__mul = function(a, b) return CFrame.new(a.X + (b.X or 0), a.Y + (b.Y or 0), a.Z + (b.Z or 0)) end
function CF:GetComponents() return self.X, self.Y, self.Z, 1, 0, 0, 0, 1, 0, 0, 0, 1 end
CFrame = {
  new = function(x, y, z) if type(x) == "table" then x, y, z = x.X, x.Y, x.Z end return setmetatable(typed("CFrame", { X = x or 0, Y = y or 0, Z = z or 0 }), CF) end,
  Angles = function() return setmetatable(typed("CFrame", { X = 0, Y = 0, Z = 0 }), CF) end,
}
Color3 = {
  new = function(r, g, b) return typed("Color3", { R = r, G = g, B = b }) end,
  fromRGB = function(r, g, b) return typed("Color3", { R = r / 255, G = g / 255, B = b / 255 }) end,
  fromHex = function(h) h = h:gsub("#", "") return Color3.fromRGB(tonumber(h:sub(1, 2), 16), tonumber(h:sub(3, 4), 16), tonumber(h:sub(5, 6), 16)) end,
}
BrickColor = { new = function(name) local known = { ["Bright red"] = Color3.fromRGB(196, 40, 28) } if known[name] then return typed("BrickColor", { Name = name, Color = known[name] }) end return typed("BrickColor", { Name = "Medium stone grey", Color = Color3.fromRGB(163, 162, 165) }) end }
UDim = { new = function(s, o) return typed("UDim", { Scale = s, Offset = o }) end }
UDim2 = { new = function(a, b, c, d) return typed("UDim2", { X = UDim.new(a, b), Y = UDim.new(c, d) }) end, fromScale = function(a, b) return UDim2.new(a, 0, b, 0) end }
local KNOWN = {
  Material = { "SmoothPlastic", "Neon", "Concrete", "Wood", "Plastic" }, PartType = { "Ball", "Block", "Cylinder" }, SurfaceType = { "Smooth" },
  Font = { "Gotham", "GothamBold", "GothamMedium", "Arial" }, EasingStyle = { "Sine", "Quad", "Linear", "Bounce" }, EasingDirection = { "In", "Out", "InOut" },
  FillDirection = { "Vertical", "Horizontal" }, SortOrder = { "LayoutOrder", "Name" }, HorizontalAlignment = { "Left", "Center", "Right" },
  VerticalAlignment = { "Top", "Center", "Bottom" }, TextXAlignment = { "Left", "Center", "Right" }, ZIndexBehavior = { "Sibling", "Global" }, ApplyStrokeMode = { "Border", "Contextual" },
}
Enum = {}
for kind, names in pairs(KNOWN) do
  local e = {}
  for _, n in ipairs(names) do e[n] = typed("EnumItem", { Name = n, EnumType = kind }) end
  Enum[kind] = setmetatable(e, { __index = function(_, k) error(tostring(k) .. " is not a valid member of " .. kind) end })
end
local BASEPART = { Part = true, WedgePart = true, CornerWedgePart = true, TrussPart = true }
local SCRIPT = { Script = true, LocalScript = true, ModuleScript = true }
local GUIBUTTON = { TextButton = true, ImageButton = true }
local Inst = {}
local function isA(self, c)
  local k = rawget(self, "_p").ClassName
  if k == c then return true end
  if c == "Instance" then return true end
  if c == "BasePart" then return BASEPART[k] == true end
  if c == "LuaSourceContainer" or c == "BaseScript" then return SCRIPT[k] == true end
  if c == "GuiButton" then return GUIBUTTON[k] == true end
  if c == "GuiObject" then return k == "Frame" or k == "TextLabel" or GUIBUTTON[k] == true end
  if c == "LayerCollector" then return k == "ScreenGui" end
  return false
end
Inst.__index = function(self, k)
  local m = rawget(Inst, k)
  if m then return m end
  return rawget(self, "_p")[k]
end
Inst.__newindex = function(self, k, v)
  local p = rawget(self, "_p")
  if k == "Parent" then
    local old = p.Parent
    if old then local kids = rawget(old, "_kids") for i, c in ipairs(kids) do if c == self then table.remove(kids, i) break end end end
    p.Parent = v
    if v then table.insert(rawget(v, "_kids"), self) end
    return
  end
  p[k] = v
end
function Inst:IsA(c) return isA(self, c) end
function Inst:GetChildren() local t = {} for i, c in ipairs(rawget(self, "_kids")) do t[i] = c end return t end
function Inst:GetDescendants() local t = {} local function walk(o) for _, c in ipairs(rawget(o, "_kids")) do t[#t + 1] = c walk(c) end end walk(self) return t end
function Inst:FindFirstChild(n) for _, c in ipairs(rawget(self, "_kids")) do if c.Name == n then return c end end return nil end
function Inst:FindFirstChildOfClass(n) for _, c in ipairs(rawget(self, "_kids")) do if c.ClassName == n then return c end end return nil end
function Inst:FindFirstChildWhichIsA(n, deep) for _, c in ipairs(deep and self:GetDescendants() or self:GetChildren()) do if c:IsA(n) then return c end end return nil end
function Inst:IsDescendantOf(a) local cur = self.Parent while cur do if cur == a then return true end cur = cur.Parent end return false end
function Inst:FindFirstAncestorWhichIsA(c) local cur = self.Parent while cur do if cur:IsA(c) then return cur end cur = cur.Parent end return nil end
function Inst:GetFullName() local parts, cur = {}, self while cur and cur ~= game do table.insert(parts, 1, cur.Name) cur = cur.Parent end return table.concat(parts, ".") end
function Inst:SetAttribute(n, v) rawget(self, "_attr")[n] = v end
function Inst:GetAttribute(n) return rawget(self, "_attr")[n] end
function Inst:Destroy() self.Parent = nil end
local function make(class, name)
  return setmetatable(typed("Instance", { _p = { ClassName = class, Name = name or class }, _kids = {}, _attr = {} }), Inst)
end
Instance = { new = function(class, parent) local o = make(class) if parent then o.Parent = parent end return o end }
game = make("DataModel", "game")
workspace = make("Workspace", "Workspace") workspace.Parent = game
local services = { Workspace = workspace }
for _, n in ipairs({ "StarterGui", "StarterPlayer", "ServerStorage", "ReplicatedStorage" }) do services[n] = make(n, n) services[n].Parent = game end
services.HttpService = { JSONDecode = function(_, s) local t = {} for k, v in s:gmatch('"([%w_]+)":"([^"]*)"') do t[k] = v end for k, v in s:gmatch('"([%w_]+)":(%d+)') do t[k] = tonumber(v) end return t end }
function game:GetService(n) local s = services[n] if not s then error(n .. " is not a valid Service name") end return s end
local BASE = getfenv(1)
function runBuild(src)
  local f, err = loadstring(src)
  if not f then error("build code did not compile: " .. tostring(err)) end
  setfenv(f, setmetatable({ typeof = function(v) if type(v) == "table" and rawget(v, "__type") then return rawget(v, "__type") end return type(v) end }, { __index = BASE }))
  return f()
end
function compiles(src) local f, err = loadstring(src) if not f then error("generated script does not compile: " .. tostring(err) .. "\n" .. src) end return true end
