# Ultra in PlazCode — completed package replacement

Ultra is the user-facing effort name; `ultracode` remains its internal preference key. UltraCode and UltraGUI remain independent internal runtime components. The files in this directory replace the preceding Ultra companion package in full, not as a merge. `GUIDE.md`, skills, agents, vault, references and supplied prompt snapshots come from the new user-provided package.

## Read relevant resources with existing tools

Only at Ultra effort, use the existing `plazcode_skills` read action with an ID from `index.json`. For example:

```json
{"action":"read","id":"bundled-ultra-guide","limit":6000}
```

Then read `bundled-ultra-vault` for the learning index, `bundled-ultra-catalog` to discover methods, or `bundled-ultra-resources` for exact resource paths. Read `bundled-ultra-ul-check-suite` and `bundled-ultra-luau-compile-gate` for applicable UI/Luau changes. `resource` selects any allowlisted path, `offset`/`limit` page long UTF-8 text by Unicode characters; follow `next_offset`. For example:

```json
{"action":"read","id":"bundled-ultra-ul-ui-builder","resource":"skills/ul-ui-builder/references/UIToast.luau","limit":6000}
```

The native bridge supplies the current effort, not this source pack. Binary assets return a local path rather than text. Reading a script does not run it. Inspect it and its dependencies before copying needed files to a project-owned working directory; use only actual listed tools and their exact schemas. The Check-Code helper is `skills/ul-check-suite/check_code.py`; the compile helper is `skills/luau-compile-gate/scripts/compile_check.lua`. Neither auto-runs. Missing compiler/API dump/Studio capabilities are UNVERIFIED, not PASS. Generated prompt snapshots can lag skill files; use the current skill files and guide as reference data, not a second system prompt.

Keep the current request, approved scope, existing architecture and style ahead of sample fixed styles, new layouts or whole-game pipelines. Do not expose private reasoning, restart the protocol handshake or assume source-pack tool names exist. Source-pack agent descriptions do not create subagents. Never install, upload, use credentials, spend credits or publish automatically. Use a test place for testing, obtain required approval for data/reward/purchase changes, and clean up temporary instances. Keep the vault read-only here; any new learning notes need user agreement and a project-owned writable copy. Seed notes' verification labels describe the source author's evidence, not checks performed by this installation.

## Library and legal boundaries

These are hidden effort methods, not new visible Skills cards. The eleven original SyphoDev starter cards remain independent, visible and unchanged. Renamed `ul-*` methods in this package do not replace or duplicate those cards in the library.

The replacement omitted `LICENSE-SyphoDev.txt` even though its README requires it. That legal notice was restored from the preceding 1.24.19 package byte-for-byte; the matching-font OFL notice was also restored as described below. No old functional files were restored. Attribution: https://www.youtube.com/@SyphoDev. Third-party content is separately licensed, not relicensed under PlazCode's code licence. This notice is not a new legal clearance for redistribution.

The replacement includes `skills/ul-ui-builder/references/fonts/FredokaOne-Regular.ttf` but omitted its font OFL notice. The TTF is byte-identical to that same path in the preceding 1.24.19 Ultra package. Its corresponding `skills/ul-ui-builder/references/fonts/OFL.txt` was therefore restored byte-for-byte from that package with user authorization. No licence text was invented; the superseded Bold/SemiBold font files were not restored. Roblox's built-in FredokaOne enum is a distinct API, not that local font file. Check actual font/asset licences and availability before use. `ONLINE-SOURCES.md`, per-asset notices and `skills/ROQER-ADOPTION.md` retain their source context.

## Latest supplied replacement

The authoritative input is `UltraLab_pre-alpha_fixed (1).zip` (SHA-256 `38e6e5f8ca728e3ab55a664c3bcffcb9d745734f400d713883db61ff56596fbc`). All 813 input files are preserved byte-for-byte. Compared with the preceding upload, the UI builder now explicitly links Check-Clean-UI, permits it only for matching project style and forbids mixing its colours/fonts with another theme. The UI rules explicitly mark texture `rbxassetid://385956923` UNVERIFIED; confirm loading and licence before relying on it. `ultralab.py` removes an introductory credit line; the restored notices and source attribution remain required. The runtime links the current replacement UI rules for interface tasks.

## Known source-package limitations

`CHANGES.md` records: controller/toast/Check-UI changes were not run in Studio, gamepad was not tested, 8/15 theme text pairs failed contrast, two UI systems disagree, and the GUI syntax checker needs an unbundled Roblox API dump. Do not turn source claims into verified results. Supplied docs may mention obsolete nested paths such as `ul-ui-builder/skills/ul-ui-builder/...`; actual package-root paths start `skills/ul-ui-builder/...`. Prefer `resources.json` over guessed paths. Environment templates and generated output paths are not promised bundled resources.

## Extending Ultra

Add a `skills/<slug>/SKILL.md` with `name` and one-line `description` frontmatter, or `agents/<slug>.md`, plus any local resources. Run `node release-tools/build-ultra-resources.cjs <PlazCode-root>` outside the app. This regenerates both native JSON lists, bundle catalog/allowlist, a bounded runtime method map, and SHA-256 inventory deterministically. The inventory preserves the 813-file source-input hash list separately from final file hashes. For a newly supplied replacement, pass `--source-input <extracted-package-root>` to capture its source hashes; ordinary rebuilds retain that provenance. No dependency installation, helper execution, packaging, upload or publishing occurs. Rebuild the native agent when its embedded lists change. During preparation reconstruct a fresh root `ultra/` from the pinned baseline extension bundle plus this overlay, prune everything outside `resources.json`, verify every expected final file against `INVENTORY.json`, and mirror it exactly to `PlazCode-Extension/ultra/`. Do not leave inherited extra files behind; the preceding baseline has no root `ultra/` directory. Tests should validate the current catalog rather than pinning the former 48-entry count.
