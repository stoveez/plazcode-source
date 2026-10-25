---
title: Decision log
updated: 2026-10-24
---
# Decisions (newest first)

- **2026-10-24: the app's vault gets a live note (`00 Start Here/Now.md`).** Same idea as `docs/NOW.md` for the builders: the AI reads where the work stands at startup and rewrites it after every job. Capped at 1,500 characters so small sites stay small; an existing note is never overwritten. Pictures attached with the media button can be stored with `add_image`; pictures pasted straight into an AI site's own box are not seen. See [vault-memory](vault-memory.md).
- **2026-10-24: handoff = short `NOW.md` + linked vault.** The old `HANDOFF.md` grew long; new AIs paid tokens to read all of it. See [how-we-work](how-we-work.md). Old docs are kept, not deleted.
- **2026-10-24: title bar shows no Effort or version text.** Owner tried it back and removed it; the sidebar still shows both.
- **2026-10-24: sidebar scrolls as one column on short windows** (max height 780px).
- **2026-10-23: public-then-private plan.** GitHub billing blocks builds on the private repo, so it is public only during a build or publish. See [test-builds](test-builds.md).
- **2026-10-23: test zip must be 1:1 with the update zip,** still named "test"; send the inner zip.
- **2026-10-23: AIs may push to their own `<ai>/<task>` and `wip/<task>` branches** without asking; everything else needs a yes. See [owner-rules](owner-rules.md).
- **Extension fixes must work by reloading the extension;** app changes are called out separately.
- **Brickwire ideas are added and improved, not copied** (MIT, keep credit). No Multi-Script code.
