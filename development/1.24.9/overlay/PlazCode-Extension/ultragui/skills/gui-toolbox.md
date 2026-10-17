# gui-toolbox

Use this user-provided reference only when it helps the current project request. Adapt paths, assets, style and APIs to the actual project and available PlazCode tools. The current user scope takes priority. Keep working features. Do not impose extra search loops or ask the user to continue after every component. Use actual tests when tools permit; report what remains untested.

When relevant: the user asks for good GUI pieces, or a screen needs a ready-made interface kit, button style, icon set, or HUD template.

Search with search_creator_store. Good terms are specific: "shop UI template", "inventory
grid ui", "dark menu kit", "health bar ui", "settings menu ui". One word gives noise.
- Read each result's name, creator and type. Prefer assets from verified creators. Compare at
  least three results before choosing one, and say why you chose it.
- A GUI asset is mostly ScreenGui, Frame and TextLabel objects. Before you insert, look for
  Script and LocalScript objects inside it. Read every one. Remove any the screen does not need.
  A free GUI can carry hidden code, and a LocalScript runs on every player's device.
- Insert with insert_from_creator_store (insert_asset on older builds), into a clearly named
  folder, so it can be found and replaced later.
- Measure the inserted screen with gui-layout's numbers. A Toolbox screen is not checked
  just because it loads. Fix any element that touches another, is off-centre, or sits under
  the top bar.
- If nothing fits, say so and build it from plain Roblox objects. Never invent an asset ID.
- Keep the asset IDs in the plan or in a Config module, not inside a script.
- In the report, list each asset: name, creator, asset ID, what you changed, and where it is.