# gui-layout

Use this user-provided reference only when it helps the current project request. Adapt paths, assets, style and APIs to the actual project and available PlazCode tools. The current user scope takes priority. Keep working features. Do not impose extra search loops or ask the user to continue after every component. Use actual tests when tools permit; report what remains untested.

When relevant: building or changing any ScreenGui, Frame, button, label, list, menu or HUD element.

Layout is numbers first. Decide the numbers, then check them.
- Position and size use UDim2 with a scale part and an offset part. A scale-only layout
  breaks on other screen sizes; an offset-only layout breaks on phones. Use both on purpose.
- Centred means measured. Anchor the element at (0.5, 0.5) and place it at (0.5, 0) so it
  lands in the middle. A 0.5 position with the default top-left anchor is off-centre by half
  its own size, and it looks almost right.
- Elements must never touch. Keep at least 8 pixels between siblings at the reference size.
  Overlap is a failure unless it is deliberate, and a deliberate overlap is stated in the plan.
- No frame draws a box around a single child. A container that only positions its child is
  transparent (BackgroundTransparency = 1). An opaque container within 6 pixels of its one
  child is the classic box-around-the-button defect.
- Use UIListLayout, UIGridLayout and UIPadding for repeated items, not hand-placed copies.
- Text uses TextScaled only with a TextSize cap (UITextSizeConstraint), so it stays readable
  on large and small screens.
- Give every interactive element a clear pressed and disabled look, not only a hover look.
  Phones have no hover.
- Respect the top bar and safe areas. Do not put a button under the Roblox top bar.
- Set ResetOnSpawn deliberately. If the HUD should survive respawn, say so in the plan.