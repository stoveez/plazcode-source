# HyperLab guide

HyperLab is PlazCode's working mode for Roblox Studio work (`THINK=ultracode`): Luau code, UI systems,
maps, 3D models, textures, animation, VFX, SFX, and verification. When you talk to the user, call this
effort **Hyper**.

## What the mode asks of you
1. Plan first for multi-script, client/server, persistence, or multi-screen work. Write a short numbered
   plan and keep Studio writes serialized.
2. Verify date-sensitive Roblox APIs and claims against current official documentation with `roblox_docs`
   (`query` searches `create.roblox.com/docs`; `url` reads one docs page) and quote the signature you rely on.
   Mark anything unconfirmed as `UNVERIFIED`.
3. Look before you build. Inspect existing scripts, UI frameworks, and service placement and preserve them.
4. Build one item at a time. Compile exact saved Luau, run available project checks, and test behavior in
   Studio when in scope (exercise rejection paths and multiple clients where relevant).
5. Verify UI at relevant desktop/mobile sizes and across mouse, touch, and gamepad paths. Check asset IDs
   in examples for load and permission in the target experience; keep placeholders visibly identifiable.
6. Report changed files or Explorer paths, distinguish observed behavior from checks that were unavailable,
   and list material verification gaps.

## Where things are
- `skills/` holds the 17 HyperLab skills (`SKILL.md` files). Open any skill with `ultralab_read`.
- `resources/` holds curated reference kits (`check-ui-clean/`, `stud-ui-clean/`, `hyperlab/`, `el4cteo/`,
  `syphodev/`) and `sources.json`.
- `vault/` holds 35 fwjelaa reference notes plus `Start Here.md` and `LICENSE.md`. Open them with
  `ultralab_read` (`prefix: "vault/"`) or search the user's connected vault with `plazcode_vault`.

## Safety rules
- Test in a test place. Never run a purchase, DataStore write, or reward change in a live place without
  the user's approval.
- Stop play and remove any temporary test instances you added.
- Ask before running any upload, install, package manager, or paid service script.
