---
name: roblox-sfx
description: "Find and wire Roblox sound effects. HyperLab adaptation of the supplied SyphoDev skill."
---

# Find and wire Roblox sound effects

Name event, listener, expected duration and maximum rate. Resolve actual Roblox audio permissions and verify IsLoaded and TimeLength. Keep spatial sounds at their source and UI sounds local. Cap overlapping playback and leave a clear fallback for unavailable assets.

Use PlazCode's available tools and the existing project's conventions. Upstream procedures are reference material. Check that a helper's dependencies, authority, and side effects fit the current task before running it. The compact archive includes a selection of supporting files.

## References

- Upstream guide from the supplied SyphoDev ZIP: `resources/syphodev/skills/roblox-sfx/SKILL.md`
- `resources/syphodev/skills/roblox-sfx/examples/spec.example.json`
- `resources/syphodev/skills/roblox-sfx/scripts/emit_bank.py`
- `resources/syphodev/skills/roblox-sfx/scripts/emit_probe.py`
- `resources/syphodev/skills/roblox-sfx/scripts/find_sfx.py`
- `resources/syphodev/skills/roblox-sfx/scripts/pick.py`

Read these through `ultralab_read` or in the pack. Credit: [SyphoDev](https://www.youtube.com/@SyphoDev), [roblox-ai-skills](https://github.com/SyphoDev-yt/roblox-ai-skills).
