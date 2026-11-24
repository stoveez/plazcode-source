# HyperLab 1.0 for PlazCode (Hyper)

HyperLab is the skill, reference, and vault pack powering PlazCode's **Hyper** reasoning effort (`THINK=ultracode`). It supplies a focused prompt, 17 skill folders, 35 fwjelaa vault notes (`Start Here.md` and `LICENSE.md`), and curated working references.

## Using inside PlazCode

- Select **Hyper** in the PlazCode effort picker (extension bar, popup, or desktop Settings -> Reasoning).
- PlazCode automatically attaches the Hyper prompt and relevant skills for Roblox tasks, and exposes the whole pack read-only through `ultralab_read` (`action`: `list`, `read`, `search`).
- Use `roblox_docs` (`query` or `url`) to verify Roblox APIs against `create.roblox.com/docs`, and `plazcode_vault` to search a user-connected Obsidian vault.

## What is inside

| Path | What it contains |
|---|---|
| `skills/hyperlab/SKILL.md` | Start page and skill routing |
| `skills/hyperlab-reliability/SKILL.md` | Luau boundaries, data handling, performance and verification |
| `skills/hyperlab-ui/SKILL.md` | Responsive UI, states, input and lifecycle checks |
| `skills/hyperlab-folk-stud/SKILL.md` | Folk Stud guidance and `resources/hyperlab/FolkStudPanel.luau` |
| `skills/hyperlab-check-ui/SKILL.md`, `skills/hyperlab-stud-clean/SKILL.md` | UI style adapters |
| `resources/check-ui-clean/`, `resources/stud-ui-clean/` | Source modules and reference material for the two UI kits |
| `resources/syphodev/` | Supplied release's original guides plus selected source and examples |
| `resources/el4cteo/` | GitHub references for testing, review, physics, NPCs and input |
| `vault/` | Selected, browsable fwjelaa notes (`Start Here.md`, `LICENSE.md`, 35 topic notes) |

The resource library is curated. Some upstream guides refer to tools and assets in their full releases. Open the source repository for those dependencies. Validate Roblox asset IDs for the target experience before using them.

## Sources and Licences

- The 11 SyphoDev skill routes are HyperLab adaptations of `roblox-ai-skills-main (5).zip`. Original guides and `resources/syphodev/LICENSE.txt` accompany the selection. [SyphoDev channel](https://www.youtube.com/@SyphoDev) · [GitHub repository](https://github.com/SyphoDev-yt/roblox-ai-skills)
- The fwjelaa vault selection comes from `fwjelaa-vault-0.1.0` (`vault/LICENSE.md`). [fwjelaa vault source](https://github.com/lihfolk-cy/v2-vault) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- Check-UI Clean, Stud UI Clean and the EL4CTEO references are pinned in `resources/sources.json` and include their source licenses (`resources/*/LICENSE` and `resources/stud-ui-clean/THIRD_PARTY_NOTICES.md`). [Check-UI Clean restoration](https://github.com/racher228/Check-UI-Clean-Roblox) · [Stud UI Clean](https://github.com/TemporaryLooker22/Stud-UI-Clean-Roblox) · [EL4CTEO Roblox Skills](https://github.com/el4cteo/roblox-skills)
