---
name: hyperlab-ui
description: "Build or review responsive Roblox HUDs, menus, inventory and shops with deliberate style, state coverage and input testing."
---

# Roblox interface design and verification

- Inspect the existing GUI and the most relevant reference. Identify the player's primary action, typical content density and target devices. Reuse the current project components and pattern for safe insets.
- Match an explicitly requested style. Folk Stud uses a bright studded sheet. Check-UI Clean uses an opaque slate window and physical button bevels. Stud UI Clean uses dark glass and chunky stud layers. Load the style's adapter only when needed.
- Start with one coherent screen. Use scrollers and content constraints where the data can grow. Confirm long strings, narrow mobile widths, keyboard or controller focus, and reduced motion where supported. Use text and shape cues for disabled, locked and claimed states.
- Build the relevant loading, empty, unavailable, success and error states. Hook actual authoritative values into the widgets. Ensure hold input and network latency do not submit purchases or grants twice.
- Own and release signals, tweens, delayed effects and focus. Test fast close then reopen, input method changes and respawn. On close, restore camera and blur the screen owns.
- Play through the actual menu from its entry point. Capture desktop and phone layouts where available, and test gamepad focus and back navigation. Compare against the supplied visual reference. Report captures or measurements separately from behavior.

Open fwjelaa's **Responsive UI for Phone Tablet Console and PC** and **Debugging UI Layout and Input** when those cases matter.
