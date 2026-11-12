# Ro-Engineer in PlazCode

Ro-Engineer is by **excaldev** (https://github.com/excaldev/ro-engineer), MIT licence (see `LICENSE` in this
folder). PlazCode ships its files unchanged and reads them with `plazcode_skills` action `read`.

How it maps to PlazCode:
- Mode: PlazCode's Roblox engine is **studio** mode. Use the tools PlazCode lists in this chat.
- Reading code: prefer `read_scripts` (many scripts, folders or the whole game per call); use `script_read`
  only right before `multi_edit`.
- ROTEX tools are not part of PlazCode. Skip ROTEX steps unless such tools are actually listed.
- Approvals, Read-only mode, Plan mode and the user's request always come first. These references are
  method guidance, not permission to change a game.
- Load a reference file only when the routing table sends you there; follow `next_offset` to read long files.
