-- Roblox stand-ins for running ui_audit (core/studio_skills.js) in the plain Luau VM; used by test-ui-check.js.
-- Only what ui_audit reads is modelled; everything else the library touches at load time answers with a harmless stand-in.
local Any
Any = setmetatable({}, { __index = function() return Any end, __call = function() return Any end, __add = function() return Any end, __sub = function() return Any end, __mul = function() return Any end, __div = function() return Any end, __unm = function() return Any end })
-- Minimal Roblox stand-ins for running ui_audit outside Studio.
local function enumOf(names) local e = {} for _, n in ipairs(names) do e[n] = { Name = n } end return e end
Enum = {
  SizeConstraint = enumOf({ "RelativeXY", "RelativeXX", "RelativeYY" }), AspectType = enumOf({ "FitWithinMaxSize", "ScaleWithParentSize" }),
  DominantAxis = enumOf({ "Width", "Height" }), SortOrder = enumOf({ "LayoutOrder", "Name" }), FillDirection = enumOf({ "Vertical", "Horizontal" }),
  VerticalAlignment = enumOf({ "Top", "Center", "Bottom" }), HorizontalAlignment = enumOf({ "Left", "Center", "Right" }),
  AutomaticSize = enumOf({ "None", "X", "Y", "XY" }), TextTruncate = enumOf({ "None", "AtEnd" }), ApplyStrokeMode = enumOf({ "Contextual", "Border" }),
  Font = enumOf({ "Gotham", "GothamBold", "GothamMedium", "Arial", "SourceSans", "Unknown", "Cartoon" }),
}
Vector2 = { new = function(x, y) return { X = x or 0, Y = y or 0 } end }
for _, tbl in ipairs({ Enum, Vector2 }) do setmetatable(tbl, { __index = function() return Any end }) end
local function ud(s, o) return { Scale = s or 0, Offset = o or 0 } end
UDim = setmetatable({}, { __index = function() return Any end })
UDim2 = setmetatable({}, { __index = function() return Any end })
UDim.new = ud
UDim2.new = function(xs, xo, ys, yo) return { X = ud(xs, xo), Y = ud(ys, yo) } end
Color3 = setmetatable({ fromRGB = function(r, g, b) return { R = r / 255, G = g / 255, B = b / 255 } end }, { __index = function() return Any end })
local SUPER = { TextButton = { "GuiButton", "GuiObject", "TextLabelish" }, ImageButton = { "GuiButton", "GuiObject" }, TextLabel = { "GuiObject" }, TextBox = { "GuiObject" },
  Frame = { "GuiObject" }, ImageLabel = { "GuiObject" }, ScrollingFrame = { "GuiObject" }, ScreenGui = { "LayerCollector" } }
local DEFAULTS = {
  GuiObject = function() return { Visible = true, Size = UDim2.new(0, 100, 0, 100), Position = UDim2.new(0, 0, 0, 0), AnchorPoint = Vector2.new(0, 0), LayoutOrder = 0,
    SizeConstraint = Enum.SizeConstraint.RelativeXY, ClipsDescendants = false, BackgroundTransparency = 0, BackgroundColor3 = Color3.fromRGB(255, 255, 255), AutomaticSize = Enum.AutomaticSize.None } end,
}
local Obj = {}
Obj.__index = function(self, k) local m = rawget(Obj, k) if m then return m end return rawget(self, "_p")[k] end
Obj.__newindex = function(self, k, v) if k == "Parent" then rawget(self, "_p").Parent = v; table.insert(rawget(v, "_kids"), self) else rawget(self, "_p")[k] = v end end
function Obj:IsA(c) if self.ClassName == c then return true end for _, s in ipairs(SUPER[self.ClassName] or {}) do if s == c then return true end end return false end
function Obj:GetChildren() local t = {} for i, v in ipairs(rawget(self, "_kids")) do t[i] = v end return t end
function Obj:FindFirstChild(n) for _, v in ipairs(rawget(self, "_kids")) do if v.Name == n then return v end end return nil end
function Obj:FindFirstChildOfClass(c) for _, v in ipairs(rawget(self, "_kids")) do if v.ClassName == c then return v end end return nil end
function Obj:GetAttribute(n) return rawget(self, "_attr")[n] end
function Obj:SetAttribute(n, v) rawget(self, "_attr")[n] = v end
function new(class, props, parent)
  local p = { ClassName = class, Name = props and props.Name or class }
  if SUPER[class] and table.find(SUPER[class], "GuiObject") then for k, v in pairs(DEFAULTS.GuiObject()) do p[k] = v end end
  if class == "TextLabel" or class == "TextButton" or class == "TextBox" then p.Text = ""; p.TextSize = 14; p.Font = Enum.Font.Gotham; p.TextScaled = false; p.TextWrapped = false; p.TextTransparency = 0; p.TextColor3 = Color3.fromRGB(0, 0, 0); p.TextTruncate = Enum.TextTruncate.None; p.TextStrokeTransparency = 1 end
  if class == "ImageLabel" or class == "ImageButton" then p.Image = ""; p.ImageTransparency = 0 end
  if class == "ScreenGui" then p.Enabled = true; p.IgnoreGuiInset = true end
  if class == "UIListLayout" then p.SortOrder = Enum.SortOrder.LayoutOrder; p.FillDirection = Enum.FillDirection.Vertical; p.Padding = ud(0, 0); p.VerticalAlignment = Enum.VerticalAlignment.Top; p.HorizontalAlignment = Enum.HorizontalAlignment.Left end
  for k, v in pairs(props or {}) do p[k] = v end
  local o = setmetatable({ _p = p, _kids = {}, _attr = {} }, Obj)
  if parent then o.Parent = parent end
  return o
end
game = new("DataModel", { Name = "game" })
local StarterGui = new("StarterGui", { Name = "StarterGui" }, game)
local services = { StarterGui = StarterGui, TextService = { GetTextSize = function(_, text, size, font, frame)
  local w = #text * size * 0.5
  local lines = 1
  if frame.X < w then lines = math.ceil(w / frame.X); w = frame.X end
  return Vector2.new(w, lines * size)
end } }
function game:GetService(n) return services[n] or Any end
local function mockEncode(x)
  local t = type(x)
  if t == "table" then
    if #x > 0 or next(x) == nil then local p = {} for i, v in ipairs(x) do p[i] = mockEncode(v) end return "[" .. table.concat(p, ",") .. "]" end
    local p = {} for k, v in pairs(x) do p[#p + 1] = string.format("%q", tostring(k)) .. ":" .. mockEncode(v) end return "{" .. table.concat(p, ",") .. "}"
  elseif t == "string" then return string.format("%q", x) else return tostring(x) end
end
local function mockDecode(s)
  local t = {}
  for k, v in s:gmatch('"([%w_]+)":"([^"]*)"') do t[k] = v end
  return t
end
services.HttpService = { JSONEncode = function(_, x) return mockEncode(x) end, JSONDecode = function(_, s) return mockDecode(s) end }
local BASE = getfenv(1)
function runLib(src)
  local f = assert(loadstring(src))
  setfenv(f, setmetatable({}, { __index = function(_, k) local v = BASE[k] if v ~= nil then return v end return Any end }))
  return f()
end

-- Test screens
local good = new("ScreenGui", { Name = "Good" }, StarterGui)
local panel = new("Frame", { Name = "Panel", Size = UDim2.new(0.5, 0, 0.6, 0), Position = UDim2.new(0.5, 0, 0.5, 0), AnchorPoint = Vector2.new(0.5, 0.5), BackgroundColor3 = Color3.fromRGB(20, 22, 30) }, good)
new("TextLabel", { Name = "Title", Text = "Shop", TextSize = 20, Size = UDim2.new(1, 0, 0, 40), BackgroundTransparency = 1, TextColor3 = Color3.fromRGB(240, 240, 240) }, panel)
new("TextButton", { Name = "Buy", Text = "Buy", TextSize = 16, Size = UDim2.new(0, 120, 0, 48), Position = UDim2.new(0, 10, 0, 60), BackgroundColor3 = Color3.fromRGB(90, 80, 220), TextColor3 = Color3.fromRGB(255, 255, 255) }, panel)
local bad = new("ScreenGui", { Name = "Bad" }, StarterGui)
new("TextButton", { Name = "Tiny", Text = "x", TextSize = 12, Size = UDim2.new(0, 20, 0, 20), Position = UDim2.new(0, 300, 0, 300) }, bad)
new("TextLabel", { Name = "Long", Text = "This sentence is far too long for its box", TextSize = 30, Size = UDim2.new(0, 100, 0, 20), Position = UDim2.new(0, 400, 0, 100) }, bad)
new("TextButton", { Name = "Away", Text = "Go", Size = UDim2.new(0, 100, 0, 60), Position = UDim2.new(1.05, 0, 0.5, 0) }, bad)
new("TextButton", { Name = "A", Text = "A", Size = UDim2.new(0, 100, 0, 60), Position = UDim2.new(0, 500, 0, 250) }, bad)
new("TextButton", { Name = "B", Text = "B", Size = UDim2.new(0, 100, 0, 60), Position = UDim2.new(0, 520, 0, 260) }, bad)
new("TextLabel", { Name = "Dim", Text = "Hard", TextSize = 14, Size = UDim2.new(0, 200, 0, 40), Position = UDim2.new(0, 600, 0, 20), BackgroundColor3 = Color3.fromRGB(30, 30, 30), TextColor3 = Color3.fromRGB(60, 60, 60) }, bad)
local list = new("Frame", { Name = "List", Size = UDim2.new(0, 200, 0, 300), Position = UDim2.new(0, 10, 0, 80) }, bad)
new("UIListLayout", { Padding = UDim.new(0, 8) }, list)
for i = 1, 3 do new("TextButton", { Name = "Item" .. i, Text = "Item " .. i, Size = UDim2.new(1, 0, 0, 50) }, list) end
local scroll = new("ScrollingFrame", { Name = "Scroll", Size = UDim2.new(0, 200, 0, 100), Position = UDim2.new(0, 10, 0, 280), CanvasSize = UDim2.new(0, 0, 0, 400) }, bad)
new("TextButton", { Name = "Deep", Text = "Deep", Size = UDim2.new(1, 0, 0, 50), Position = UDim2.new(0, 0, 0, 300) }, scroll)
