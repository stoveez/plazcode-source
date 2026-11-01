PlazCode maintainer source (1.24.30)

First-party PlazCode is proprietary; see the root LICENSE. Third-party components retain their own terms. Earlier releases and historical snapshots keep their original licences. No source ZIP is generated or distributed by the current packaging/publish workflows.

Use development/1.24.30/prepare.py and the pinned validate-1.24.30.yml workflow for current production checks. Desktop builds use cargo build --release --locked in agent; Windows requires its Rust build tools, and universal Mac builds require both x86_64 and arm64 targets.

Current packaging uses development/1.24.30/protection.mjs with the same configured release variant as the native build, signed program/update manifests, sealed text and private encrypted decoder maps. The older minify.mjs helper remains for historical reference and is not the current release pipeline. Never put signing keys or decoder maps in downloads.

Windows remains unsigned and Mac is not notarized. Integrity signatures are distinct from publisher signing. Do not change feed URLs, schemas or updater behavior when editing packaging. Source proofs contain file hashes and lengths only.
