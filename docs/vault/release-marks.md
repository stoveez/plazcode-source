# Release provenance marks
Updated: 2026-11-01.

Marks identify a build version, never a user or an account. Nothing is transmitted. They are not encryption keys, copyright proof or proof that a derivative violates its licence.

The build derives a version/channel-specific variant from the existing signing key in memory. Only the descriptor (`schema`, seed SHA-256, mark and layout) enters public build reports. The raw seed and private signing key never enter this table, source archives or public metadata.

| Version | Channel | Mark | Evidence |
|---|---|---|---|
| 1.24.30 | release | Pending final validated build | Require identical Windows/Mac/Linux descriptor reports before delivery/promotion |

After final CI, record the observed production mark and exact source/run here. Do not substitute a validation-key mark. The mark appears in the compiled native descriptor, authenticated text-pack padding and `core/release-variant.json` in all three signed extension mirrors. It is a separately signed program file, preserving the old manifest schema and updater compatibility.
