# gui-packs

Use this user-provided reference only when it helps the current project request. Adapt paths, assets, style and APIs to the actual project and available PlazCode tools. The current user scope takes priority. Keep working features. Do not impose extra search loops or ask the user to continue after every component. Use actual tests when tools permit; report what remains untested.

When relevant: choosing how to build a screen: plain Roblox objects, or a library pack. Also when a project already uses a library.

Pick one approach per project and keep it. Do not mix two libraries in one interface.
Default: plain Roblox objects (ScreenGui, Frame, TextButton, UIListLayout, UIPadding,
UICorner, UIStroke). Use this for menus and HUDs unless there is a clear reason not to.
Library packs confirmed to exist on GitHub:
- Fusion (github.com/dphfox/Fusion): a declarative state system. Good when a screen has many
  values that change together. Confirm the version you use and read its docs first.
- Rayfield (github.com/shlexware/Rayfield): a ready-made window, tabs and controls, usually
  loaded from a URL. Good for quick tools. Read its license before you use it.
- Roact (github.com/Roblox/roact): an older declarative library. Use it only if the project
  already uses it; do not start a new project on it without checking its current status.
Rules for any pack:
- Read its license file and its docs before you use it. Confirm its version.
- Never load a library from a URL at run time, such as loadstring(game:HttpGet(...)). That runs
  code you have not read, and it can change after you checked it. Instead, copy the library
  into src/ as a ModuleScript at a fixed version, read it, and let Rojo serve it.
- Say in the plan which pack you chose and why. If you chose plain Roblox objects, say so too.