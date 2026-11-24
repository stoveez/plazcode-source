---
name: hyperlab
description: "HyperLab entry point for Roblox Studio implementation, debugging and verification in PlazCode. Routes requests to focused skill folders and curated references."
---

# HyperLab workflow

1. Read the feature, its callers and current project structure. Identify the source of truth and the expected player-facing result. Confirm the selected Studio place before any edit.
2. Open the most relevant skill. Use the skill's immediate steps and request the references that match the task. Use PlazCode's `ultralab_read` tool to list, search, and read pack files in pages, and `plazcode_vault` when searching a connected vault.
3. Implement through the normal entry point. Retain current service placement, APIs, and UI framework unless the request changes them. Plan changes that cross the client/server boundary or migrate existing save data.
4. Verify the saved source, dependencies and actual behavior separately. Document exact failures, meaningful observations and remaining verification gaps.

| Task | HyperLab skill folder |
|---|---|
| Luau, architecture, debugging | `roblox-code` |
| Remotes, DataStore, profiling, runtime verification | `hyperlab-reliability` |
| UI flow and quality checks | `hyperlab-ui` and `roblox-ui` for spec-driven generation |
| Folk Stud, Check-UI Clean, Stud UI Clean | `hyperlab-folk-stud`, `hyperlab-check-ui`, `hyperlab-stud-clean` |
| Map, modeling, textures | `roblox-map`, `roblox-3d-model`, `roblox-texture-gen` |
| Animation, VFX, sound | `roblox-animation`, `roblox-vfx`, `roblox-sfx` |
| Whole game, coordination or tool setup | `create-roblox-game`, `roblox-build-orchestrator`, `roblox-skills-setup` |

PlazCode example: `ultralab_read({"action":"read","path":"skills/roblox-code/SKILL.md"})`. Open just the part that covers the task. Pack resources are historical references with their own licenses and dependencies. Follow the user’s current scope for external tooling, uploads and Studio operations.
