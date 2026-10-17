# gui-verify

Use this user-provided reference only when it helps the current project request. Adapt paths, assets, style and APIs to the actual project and available PlazCode tools. The current user scope takes priority. Keep working features. Do not impose extra search loops or ask the user to continue after every component. Use actual tests when tools permit; report what remains untested.

When relevant: any screen before it is called done, and any change to an existing screen.

Verify by the numbers first. A picture costs more and proves less than a measurement.
- Use the verifier in references/gui-verify/ (verify_gui.client.lua and gui_rules.lua). Place
  gui_rules.lua as a ModuleScript and verify_gui.client.lua as a LocalScript beside it. Run it in
  Play with a character alive. It prints a PASS or FAIL line per problem and a RESULT line. It
  checks that every element is on screen, siblings keep 8 px gaps and do not overlap, text fits its
  box, and elements marked Centred sit in the middle of their parent (within 1 px).
- Mark deliberate overlaps with the attribute Overhang = true, and centred elements with Centred = true.
  The verifier only checks what is marked, so mark every element that must be centred.
- The verifier fails when it checks nothing. A FAIL with "nothing was checked" means the screen did not load.
- When the verifier cannot run (no Studio, or no play test), write the same checks as numbers in the
  code and say in the report that they were not run.
- Check the centre: compare each centred element's centre to its parent's centre, in pixels.
  Pass only if they match within 1 pixel.
- Check the Check-UI numbers if the style applies: all text is GothamBlack; the canvas is
  #3B5866 with transparency 0; the close button is 38 x 38; the header divider has two tones;
  icons are ScaleType Fit; every interactive element has AnchorPoint (0.5, 0.5); the responsive
  factor is clamped between 0.52 and 1.18; the screen matches one of the five archetypes.
- Check every button path: each button has a click handler, that handler does what the label
  says, and any value it changes is validated on the server (see the server line in check-cycle).
- Check the states: default, hovered, pressed, disabled, loading and empty each exist and look
  different.
- Check that nothing is left behind: a screen that was removed is not still in the tree, and a
  screen that is replaced does not keep its old connections.
- Run the screen once in play, with a character alive, if a human can do it. Otherwise list it
  under "not checked" and name the exact steps the user should run.
- Every check fails when its target is not found. "Not found" is a fail.
Say which checks were run by reading, which by the numbers the code computes, and which need a human.