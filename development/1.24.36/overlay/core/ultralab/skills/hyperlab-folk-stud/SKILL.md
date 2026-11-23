---
name: hyperlab-folk-stud
description: "Folk Stud UI adapter for PlazCode, with a bright studded sheet, outlined labels and reusable shop, inventory and other simulator UI patterns."
---

# Folk Stud UI

If PlazCode lists `folk-stud-ui` via `plazcode_skills`, open it on demand for its existing components and source references. Preserve the user's existing FolkStudUI module and controller contracts when editing an installed kit.

For a project starting from an empty GUI, `resources/hyperlab/FolkStudPanel.luau` is a standalone client module for the frame, title, scrolling content and close button. Parent its root to an appropriate ScreenGui and wire the close button's Activated event through the project's controller. The experience supplies the verified stud texture and application behavior.

Use a white lightly studded window surface, a strong dark outline and title that crosses the top edge. Use saturated panels for options and rewards, with a clear primary action next to less prominent alternatives. Keep stud detail subordinate to content. A close button and expensive or destructive actions must stay visually distinct.

Translate the reference into the current feature. For a rebirth screen, show current and next multipliers side by side, then the reset consequence, progress and action. For an inventory, prioritize capacity and selected details. For a shop, make price, currency and ownership states explicit. Use the game's own art or permitted assets and verify appearance in Studio.

Reuse one consistent UI scale and focus flow. Check clipping of protruding icons on a small viewport, text stroke legibility, and close/reopen behavior. See `hyperlab-ui` for cross-platform checks.
