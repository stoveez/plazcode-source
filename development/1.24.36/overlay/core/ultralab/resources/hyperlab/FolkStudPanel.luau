--!strict
-- Client-side builder for a Folk Stud-style modal shell.
-- Supply a verified stud texture ID if the experience can load it.
-- The calling controller owns mounting, visibility, focus, actions and cleanup.
export type Options = {
	title: string,
	studTexture: string?,
}

export type Panel = {
	root: Frame,
	content: ScrollingFrame,
	closeButton: TextButton,
}

local INK = Color3.fromRGB(19, 17, 22)
local WHITE = Color3.fromRGB(255, 255, 255)
local FONT = Enum.Font.GothamBlack

local FolkStudPanel = {}

local function stroke(parent: GuiObject, width: number, mode: Enum.ApplyStrokeMode)
	local border = Instance.new("UIStroke")
	border.ApplyStrokeMode = mode
	border.Thickness = width
	border.Color = INK
	border.Parent = parent
end

local function round(parent: GuiObject, size: number)
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, size)
	corner.Parent = parent
end

function FolkStudPanel.new(options: Options): Panel
	local panel = Instance.new("Frame")
	panel.Name = "FolkStudPanel"
	panel.AnchorPoint = Vector2.new(0.5, 0.5)
	panel.Position = UDim2.fromScale(0.5, 0.5)
	panel.Size = UDim2.fromScale(0.86, 0.72)
	panel.BackgroundColor3 = WHITE
	panel.BorderSizePixel = 0
	round(panel, 14)
	stroke(panel, 4, Enum.ApplyStrokeMode.Border)

	local size = Instance.new("UISizeConstraint")
	size.MaxSize = Vector2.new(700, 510)
	size.Parent = panel

	if options.studTexture and options.studTexture ~= "" then
		local studs = Instance.new("ImageLabel")
		studs.Name = "StudTexture"
		studs.BackgroundTransparency = 1
		studs.Position = UDim2.fromOffset(8, 8)
		studs.Size = UDim2.new(1, -16, 1, -16)
		studs.ScaleType = Enum.ScaleType.Tile
		studs.TileSize = UDim2.fromOffset(44, 44)
		studs.Image = options.studTexture
		studs.ImageTransparency = 0.82
		studs.Parent = panel
	end

	local title = Instance.new("TextLabel")
	title.Name = "Title"
	title.AnchorPoint = Vector2.new(0, 0.5)
	title.Position = UDim2.fromOffset(18, 0)
	title.Size = UDim2.new(1, -78, 0, 42)
	title.BackgroundTransparency = 1
	title.Text = options.title
	title.TextColor3 = WHITE
	title.TextScaled = true
	title.TextXAlignment = Enum.TextXAlignment.Left
	title.Font = FONT
	title.ZIndex = 3
	stroke(title, 3, Enum.ApplyStrokeMode.Contextual)
	title.Parent = panel

	local close = Instance.new("TextButton")
	close.Name = "CloseButton"
	close.AnchorPoint = Vector2.new(1, 0.5)
	close.Position = UDim2.new(1, 0, 0, 0)
	close.Size = UDim2.fromOffset(48, 48)
	close.BackgroundColor3 = Color3.fromRGB(245, 50, 58)
	close.TextColor3 = WHITE
	close.Text = "X"
	close.TextSize = 26
	close.Font = FONT
	close.Selectable = true
	close.ZIndex = 3
	round(close, 8)
	stroke(close, 3, Enum.ApplyStrokeMode.Border)
	close.Parent = panel

	local content = Instance.new("ScrollingFrame")
	content.Name = "Content"
	content.Position = UDim2.fromOffset(16, 36)
	content.Size = UDim2.new(1, -32, 1, -52)
	content.BackgroundTransparency = 1
	content.BorderSizePixel = 0
	content.AutomaticCanvasSize = Enum.AutomaticSize.Y
	content.CanvasSize = UDim2.fromOffset(0, 0)
	content.ScrollingDirection = Enum.ScrollingDirection.Y
	content.ScrollBarThickness = 4
	content.Parent = panel

	local layout = Instance.new("UIListLayout")
	layout.Padding = UDim.new(0, 10)
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Parent = content

	return { root = panel, content = content, closeButton = close }
end

return FolkStudPanel
