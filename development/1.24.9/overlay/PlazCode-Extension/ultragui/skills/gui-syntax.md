# gui-syntax

Use this user-provided reference only when it helps the current project request. Adapt paths, assets, style and APIs to the actual project and available PlazCode tools. The current user scope takes priority. Keep working features. Do not impose extra search loops or ask the user to continue after every component. Use actual tests when tools permit; report what remains untested.

When relevant: every GUI script, before it is marked done. Apply it to any code that creates or changes ScreenGui, Frame, TextButton, TextLabel, ImageLabel, UI modifiers or gradients.

Write GUI code that Roblox accepts. These rules come from Roblox's own API dump.

Create and set up objects:
- Create with Instance.new("ClassName"). Set the properties, then set Parent last.
- Text lives on TextButton and TextLabel. ImageButton and ImageLabel have no Text or Font, so
  never set them on an image class.
- Click handlers: use Activated. It works for mouse, touch and gamepad. MouseButton1Click
  works for mouse and touch only.
- Enums are written in full and spelled exactly, such as Enum.Font.GothamBlack,
  Enum.ApplyStrokeMode.Border, Enum.ScaleType.Fit. A misspelt enum is an error.
- A ScreenGui made in a LocalScript goes under the player's PlayerGui:
  screen.Parent = player:WaitForChild("PlayerGui")
- Use task.wait and task.delay, never wait() or delay().

Value types:
- UDim2.new takes four numbers: scaleX, offsetX, scaleY, offsetY.
- UDim.new takes two numbers. Color3.fromRGB takes three values from 0 to 255. Color3.new takes
  three values from 0 to 1. Vector2.new takes two numbers.
- Transparency is a number from 0 to 1.
- ColorSequence and NumberSequence keypoints run from time 0 to time 1, in increasing order, and must
  start at 0 and end at 1.
- Image properties take "rbxassetid://<id>". Icons use ScaleType.Fit (never stretched). Textures
  that repeat use ScaleType.Tile with a TileSize.

Text and shape:
- Fit text with TextScaled = true, plus a UITextSizeConstraint with MinTextSize and MaxTextSize.
- Rounded corners: UICorner.CornerRadius = UDim.new(0, pixels).
- Outlines: UIStroke with ApplyStrokeMode = Enum.ApplyStrokeMode.Border, and a Thickness in pixels.
- UIGradient.Color is a ColorSequence. UIGradient.Transparency is a NumberSequence.

Check the script before it is done. The user can run check_gui_syntax.py on it. That checks:
- every Instance.new class name is real and creatable
- every property set on an object exists on that class and takes a matching type
- every :Connect event exists on that class
- every Enum.Type.Item exists
- argument counts for UDim2, UDim, Color3, Vector2 and keypoints are right

Limits of that check: it tracks only variables made with Instance.new in the same file. It does not
catch undefined variables or scope errors, so read those by hand. Passing it does not prove the code
runs. Say so in the report.

Example that follows every rule above. It passes check_gui_syntax.py with 0 failures. It is a
LocalScript:
```lua
<<EXAMPLE>>
```