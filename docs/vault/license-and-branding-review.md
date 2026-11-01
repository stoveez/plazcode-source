# Licence and branding review
Updated: 2026-11-01. Current terms apply prospectively to first-party PlazCode 1.24.30.

## Owner decision and scope
The owner explicitly rejected GPL terms for future releases and confirmed ownership of all first-party PlazCode code. On that basis, first-party 1.24.30 code now uses LICENSE / LicenseRef-PlazCode-Proprietary. Normal personal/commercial project use remains free; no new account, acceptance dialog or setup is introduced by the licence. User projects, generated code, settings, skills and notes are outside these restrictions.

Root/prepared/browser notices, current first-party SPDX headers, generated locale header, Rust licence-file metadata and package-copy logic are consistent. Root notices are copied from current source instead of the old native baseline. Previous releases and historical test snapshots retain their original GPL terms; their rights cannot be revoked by this change.

## No source ZIP distribution
Owner reconfirmed no source ZIPs on 2026-11-01. CI packaging and promotion no longer generate source archives, uploads defensively exclude them, and the release record does not commit one. Prepared-source hashes/lengths bind both native runners to exact source; promotion reconstructs from the validated checkout and matches both reports. No old release assets removed. Source remains temporarily Public under the owner's separate build-window rule; this change concerns generated/distributed source ZIPs, not removal of old rights or copies.

## Third-party rights retained
- Engram and Ro-Engineer: MIT, original notices retained. Ro-Engineer files are unchanged.
- UltraLab/SyphoDev: supplied licence/permission requires no sale/paid bundling and the source/YouTube credit. Fredoka fonts keep SIL OFL notices.
- luau-lsp and official Luau: MIT. Runtime luau-lsp licence retained despite first-use download.
- Rust dependency terms/notices collected into runtime/THIRD-PARTY-RUST-LICENSES.txt, with exact versions and unmodified MPL-2.0 component source links. This does not make first-party PlazCode GPL/MPL. New GPL/AGPL/LGPL dependency expressions require review rather than relabelling.
- Several crate archives omit their licence files: pinned originals from their recorded upstream commits are in dependency-notices/ with SHA-256 provenance, copied without editing. Third-party code is not relicensed.
- Brickwire-derived work retains MIT credit. No Multi-Script/TotalScript GPL code/rulebooks may be copied into current first-party code.
- Check-UI and hat artwork provenance in the supplied UltraLab pack remains uncertain; confirm rights before stronger distribution claims. The owner's first-party ownership statement does not resolve third-party artwork rights.

## Takedowns and practical limits
Use the template only for material/rights the owner can establish. Earlier GPL-permitted copying is not by itself infringement. A release mark identifies a likely originating build, not ownership or infringement. No registration is claimed, no takedown was sent, and local unsigned-app protection cannot make patching impossible. This review records implementation/owner decisions, not a legal opinion.

**Target dependency audit:** locked metadata collection passed for Linux (236), Windows (274), universal Mac (265). No GPL/AGPL/LGPL expressions were found in these dependency graphs; MPL component terms/source links retained. Output licence files are under 0.8 MB each before ZIP compression. This is a dependency-metadata/notices check, not a legal certification of all upstream provenance.

**Final first-party header sweep:** expanded from selected extensions/exact first-line prefix to all file headers, including BOMs, CSS comments and later header lines. Corrected residual animation/CSS/build-tool/test headers and the old maintainer-source README. Third-party and historical snapshots remain unchanged. Licence/protection/desktop/source-preparation checks pass; final exact-source platform build still required.
