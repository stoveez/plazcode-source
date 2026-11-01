# Licence and branding review
Updated: 2026-11-01. Review of the actual prepared 1.24.30 package and release tooling. No licence text changed.

## Findings
- The package's root `LICENSE` remains GNU GPL version 3. `BRANDING-NOTICE.txt` expressly preserves GPL copying/modification rights, requires retained notices, distinguishes unofficial distributions and does not claim a registered trademark.
- `SOURCE.txt` currently says source for this version is not published. `publish-1.24.30.yml` already sets `PLAZCODE_PUBLISH_SOURCE: 0`; this predated this implementation. Owner confirmed no source ZIP distribution on 2026-11-01. Packaging/promotion no longer generate source ZIPs; hash-only prepared-source proofs retain exact-source validation. CI upload exclusions also block source ZIPs. This does not alter licensing, retract old source ZIPs or change updater URLs.
- Turning off a public source ZIP does not change the software's licence or remove corresponding-source obligations for distributed GPL-covered work. Obfuscation and a release mark do not establish copyright ownership. Before an external release without source, review ownership and GPL compliance; obtain legal advice before changing licence terms. The existing package notice/source-publication mismatch remains unresolved by this technical work.
- Earlier GPL releases remain available under their existing licences. A permitted modification or redistribution is not, by itself, grounds for a takedown. A release mark identifies a likely originating build, not infringement or endorsement.

## Third-party material
- Engram and Ro-Engineer are MIT: retain their copyright/licence notices. Ro-Engineer files remain unchanged and the PlazCode adapter is separate.
- UltraLab/SyphoDev is used under its supplied free licence/permission: no sale or paid bundling; retain the SyphoDev source link. Fredoka fonts retain their SIL OFL notices.
- luau-lsp and official Luau are MIT; retain their notices, including the runtime luau-lsp licence despite first-use downloading.
- Brickwire-derived work requires its MIT notice/credit. Do not copy Multi-Script/TotalScript GPL code or rulebooks into a purportedly proprietary rewrite.
- The supplied notices flag uncertain provenance/licensing for Check-UI components and hat reference artwork. Confirm those rights before making stronger distribution claims; this review does not grant permission.

## Operational rule
Use takedown requests only for specifically identified material and rights the owner can establish. Treat misleading official branding separately from copying permitted by a software licence. Preserve original notices, prior releases and source availability obligations. The owner sends any notice; no automated reports or contact with third parties are authorized here. This note is not legal advice.
