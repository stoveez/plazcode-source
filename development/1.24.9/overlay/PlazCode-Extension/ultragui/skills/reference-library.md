# reference-library

Use this user-provided reference only when it helps the current project request. Adapt paths, assets, style and APIs to the actual project and available PlazCode tools. The current user scope takes priority. Keep working features. Do not impose extra search loops or ask the user to continue after every component. Use actual tests when tools permit; report what remains untested.

When relevant: any task that needs icon style, a Check-UI recipe, or a hat or icon example.

The reference files sit in references/ next to ultragui.py. The model can read them only if an
addon tool reads them, or the user pastes them, or the build used --full.
- references/check-ui/SKILL.md: the full Check-UI standard, 667 lines, with every recipe and code
  sample. Read it before building any cartoon or simulator screen. --full pastes it into the prompt.
- references/check-ui/Copy_And_Paste_Skill.txt: the short version of the same standard. The numbers match.
- references/vector-hats/: 494 icon files in 27 folders (Baseball Cap, Beanie, Beret, Top Hat, Wizard Hat,
  and more). Each hat comes as a PNG at 64 px and 256 px, and as an SVG, in a plain and an outline version.
  Use them as the reference for icon style, outline weight and silhouette. Use the 256 px PNG for large
  displays and the 64 px PNG for small ones. Icons are always ScaleType Fit.
- The hat bundle's terms are on the rhosgfx license page named in its License.url file. Read that before
  any of these images ship in a game. Do not assume they are free to use.
- references/gui-syntax/: example.lua, a GUI script that passes check_gui_syntax.py, plus test files.
- references/gui-verify/: the layout verifier (gui_rules.lua, verify_gui.client.lua) and its tests.
- The roblox-ai-skills upload was empty, so it is not in references/. Do not look for GUI examples there.