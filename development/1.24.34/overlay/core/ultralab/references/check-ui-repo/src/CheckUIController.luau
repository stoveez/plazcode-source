--!strict
-- CheckUIController.luau
-- Client-side controller: responsive scaling, pop animations, micro-interactions.
--
-- CheckUIComponents requires this module and calls bindButtonAnimations for every
-- standard button (AutoBindHover) and bindResponsiveUIScale for every window.
-- (v1.0 shipped with this file orphaned: nothing required it, and the component
-- check for bindButtonAnimations was always nil, so no button ever animated.)
--
-- Scale ownership, one UIScale per job, so nothing overwrites anything:
--   WindowScale   responsive fit to the device (this file, refit on viewport change)
--   ButtonScale   hover and press on a button (bindButtonAnimations)
--   Modal open and close pops tween the window's WindowScale and re-rest it at the
--   device fit afterwards.

local TweenService = game:GetService("TweenService")
local RunService = game:GetService("RunService")
local Debris = game:GetService("Debris")

-- Design baseline and clamp from the Check-UI standard.
local DESIGN_W = 1050
local DESIGN_H = 620
local MIN_SCALE = 0.52
local MAX_SCALE = 1.18

----------------------------------------------------
-- 1. MULTI-DEVICE RESPONSIVE SCALING
----------------------------------------------------

-- Camera.ViewportSize is the device safe area (it excludes notches and cutouts),
-- which is what a UI should fit. See the Camera.ViewportSize docs.
local function getDeviceScale(): number
	local cam = workspace.CurrentCamera
	if not cam then
		return 1 -- server, or the camera is not created yet
	end
	local vp = cam.ViewportSize
	if vp.X <= 0 or vp.Y <= 0 then
		return 1
	end
	local factor = math.min(vp.X / DESIGN_W, vp.Y / DESIGN_H)
	return math.clamp(factor, MIN_SCALE, MAX_SCALE)
end

-- Every responsive UIScale. Weak keys, so a destroyed window does not stay in memory.
local responsive: { [UIScale]: boolean } = setmetatable({}, { __mode = "k" }) :: any
-- Scales a modal is animating. A refit must not fight the animation; the animation
-- re-rests the scale at the current device fit when it finishes.
local busy: { [UIScale]: boolean } = setmetatable({}, { __mode = "k" }) :: any

local function refitAll()
	local s = getDeviceScale()
	for scale in pairs(responsive) do
		if scale.Parent and not busy[scale] then
			scale.Scale = s
		end
	end
end

local function watchCamera(cam: Camera)
	cam:GetPropertyChangedSignal("ViewportSize"):Connect(refitAll)
end

if workspace.CurrentCamera then
	watchCamera(workspace.CurrentCamera)
end
workspace:GetPropertyChangedSignal("CurrentCamera"):Connect(function()
	local cam = workspace.CurrentCamera
	if cam then
		watchCamera(cam)
		refitAll()
	end
end)

local function bindResponsiveUIScale(guiObj: GuiObject, scaleName: string?): UIScale
	local name = scaleName or "WindowScale"
	local scale = guiObj:FindFirstChild(name) :: UIScale?
	if not scale then
		scale = Instance.new("UIScale")
		scale.Name = name
		scale.Parent = guiObj
	end
	local s = scale :: UIScale
	s.Scale = getDeviceScale()
	responsive[s] = true
	return s
end

----------------------------------------------------
-- 2. AUDIO PLAYBACK HELPER
----------------------------------------------------
local function playSound(soundInstance: Sound?)
	if not soundInstance then
		return
	end
	local clone = soundInstance:Clone()
	clone.Parent = soundInstance.Parent or workspace
	clone:Play()
	Debris:AddItem(clone, 1.5)
end

----------------------------------------------------
-- 3. CENTER-ANCHORED BUTTON MICRO-INTERACTIONS
----------------------------------------------------
-- scaleObj must be the button's own UIScale (ButtonScale), not a window's
-- WindowScale: this function sets its Scale on hover, press and release.
local function bindButtonAnimations(
	btn: GuiButton,
	scaleObj: UIScale,
	hoverFactor: number?,
	clickFactor: number?,
	hoverSound: Sound?,
	clickSound: Sound?
)
	local infoHover = TweenInfo.new(0.08, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
	local infoClick = TweenInfo.new(0.05, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
	local infoRelease = TweenInfo.new(0.12, Enum.EasingStyle.Back, Enum.EasingDirection.Out)

	local hoverTo = hoverFactor or 1.05
	local clickTo = clickFactor or 0.94
	local hovered = false
	local pressed = false
	local current: Tween? = nil

	local function goTo(target: number, info: TweenInfo)
		if current then
			current:Cancel()
		end
		current = TweenService:Create(scaleObj, info, { Scale = target })
		current:Play()
	end

	-- One place decides the resting state, so hover, press and release cannot disagree.
	local function rest(info: TweenInfo)
		if pressed then
			goTo(clickTo, infoClick)
		elseif hovered then
			goTo(hoverTo, info)
		else
			goTo(1, info)
		end
	end

	btn.MouseEnter:Connect(function()
		hovered = true
		if hoverSound then
			playSound(hoverSound)
		end
		rest(infoHover)
	end)

	btn.MouseLeave:Connect(function()
		hovered = false
		pressed = false -- a drag off the button releases it visually
		rest(infoHover)
	end)

	btn.MouseButton1Down:Connect(function()
		pressed = true
		if clickSound then
			playSound(clickSound)
		end
		rest(infoClick)
	end)

	btn.MouseButton1Up:Connect(function()
		pressed = false
		rest(infoRelease)
	end)
end

----------------------------------------------------
-- 4. ADAPTIVE MODAL OPEN / CLOSE BOUNCE ANIMATION
----------------------------------------------------
-- scaleObj is the window's WindowScale. The pop goes from a fraction of the device fit
-- to the fit, and back down on close.
local function createModalAnim(frame: Frame, scaleObj: UIScale)
	local animating = false
	local defaultPos = frame.Position

	local function openModal()
		if animating or frame.Visible then
			return
		end
		animating = true
		busy[scaleObj] = true

		frame.Visible = true
		local targetScale = getDeviceScale()
		scaleObj.Scale = targetScale * 0.72
		frame.Position = UDim2.new(defaultPos.X.Scale, defaultPos.X.Offset, defaultPos.Y.Scale, defaultPos.Y.Offset + 16)

		local openInfo = TweenInfo.new(0.24, Enum.EasingStyle.Back, Enum.EasingDirection.Out)
		local scaleTween = TweenService:Create(scaleObj, openInfo, { Scale = targetScale })
		local posTween = TweenService:Create(frame, openInfo, { Position = defaultPos })
		scaleTween:Play()
		posTween:Play()

		scaleTween.Completed:Connect(function()
			busy[scaleObj] = nil
			animating = false
		end)
	end

	local function closeModal()
		if animating or not frame.Visible then
			return
		end
		animating = true
		busy[scaleObj] = true

		local closeInfo = TweenInfo.new(0.14, Enum.EasingStyle.Back, Enum.EasingDirection.In)
		local scaleTween = TweenService:Create(scaleObj, closeInfo, { Scale = scaleObj.Scale * 0.70 })
		local posTween = TweenService:Create(frame, closeInfo, {
			Position = UDim2.new(defaultPos.X.Scale, defaultPos.X.Offset, defaultPos.Y.Scale, defaultPos.Y.Offset + 14),
		})
		scaleTween:Play()
		posTween:Play()

		scaleTween.Completed:Connect(function()
			frame.Visible = false
			scaleObj.Scale = getDeviceScale()
			frame.Position = defaultPos
			busy[scaleObj] = nil
			animating = false
		end)
	end

	return openModal, closeModal
end

----------------------------------------------------
-- 5. SUNBURST CONTINUOUS ROTATION
----------------------------------------------------
-- Spins every "Sunburst" ImageLabel under the container while it is visible. Stops and
-- disconnects when the container is destroyed; picks up sunbursts added later.
local function bindSunburstRotation(container: GuiObject, speedDegreesPerSec: number?)
	local speed = speedDegreesPerSec or 20
	local sunbursts: { ImageLabel } = {}

	local function isSunburst(desc: Instance): boolean
		return desc.Name == "Sunburst" and desc:IsA("ImageLabel")
	end

	for _, desc in container:GetDescendants() do
		if isSunburst(desc) then
			table.insert(sunbursts, desc :: ImageLabel)
		end
	end

	local addedConn = container.DescendantAdded:Connect(function(desc)
		if isSunburst(desc) then
			table.insert(sunbursts, desc :: ImageLabel)
		end
	end)

	local removedConn = container.DescendantRemoving:Connect(function(desc)
		for i = #sunbursts, 1, -1 do
			if sunbursts[i] == desc then
				table.remove(sunbursts, i)
			end
		end
	end)

	local stepConn: RBXScriptConnection? = nil
	stepConn = RunService.RenderStepped:Connect(function(dt: number)
		if container.Visible and #sunbursts > 0 then
			local delta = speed * dt
			for _, sb in sunbursts do
				sb.Rotation = (sb.Rotation + delta) % 360
			end
		end
	end)

	container.Destroying:Connect(function()
		addedConn:Disconnect()
		removedConn:Disconnect()
		if stepConn then
			stepConn:Disconnect()
			stepConn = nil
		end
		table.clear(sunbursts)
	end)
end

return {
	getDeviceScale = getDeviceScale,
	bindResponsiveUIScale = bindResponsiveUIScale,
	bindButtonAnimations = bindButtonAnimations,
	createModalAnim = createModalAnim,
	bindSunburstRotation = bindSunburstRotation,
	playSound = playSound,
}
