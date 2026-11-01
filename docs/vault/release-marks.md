# Release provenance marks
Updated: 2026-11-01.

Marks identify a build version, never a user or an account. Nothing is transmitted. They are not encryption keys, copyright proof or proof that a derivative violates its licence.

The build derives a version/channel-specific variant from the existing signing key in memory. Only the descriptor (`schema`, seed SHA-256, mark and layout) enters public build reports. The raw seed and private signing key never enter this table, source archives or public metadata.

| Version | Channel | Mark | Evidence |
|---|---|---|---|
| 1.24.30 | release | `31ff5250ca8f5bbe` (layout 2, seed SHA-256 `63e104f9cc48901c1a988cb7491b9ff3cb0d9b1527ae20ae8829201c19bfae91`) | Test build: CI [41342349857](https://github.com/stoveez/plazcode-source/actions/runs/41342349857) on source `936a302`; identical Windows/Mac/Linux descriptors, release-check PASS. Re-check before promotion: a publish run must report the same mark for the same version/channel. |

For every later version, after final CI record the observed production mark and exact source/run here. Do not substitute a validation-key mark. The mark appears in the compiled native descriptor, authenticated text-pack padding and `core/release-variant.json` in all three signed extension mirrors. It is a separately signed program file, preserving the old manifest schema and updater compatibility.
