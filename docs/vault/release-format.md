---
title: Release description format
updated: 2026-10-26
---
# Release description format (owner, 2026-10-25)

The text shown on the release page and posted to Discord. Write it for people who do not read code: everyday words, short lines, say what the person saw and what changed for them. Cover everything new and every fix since the previous update.

**Rules**
- Under **2,000 characters** in total (the publish tool refuses 2,000 or more). Count before publishing.
- Discord bold marks: `***word***` is bold and italic, `**word**` is bold. Headline, the one-line summary and the four section titles use `***...***`.
- Sections, in this order: What's new, What's fixed, What was checked, How to update. Every item is its own `- ` line (no loose lines).
- Never put a role mention (`<@&...>`) in it. The owner adds that himself.
- Always include the signing line (Windows unsigned, Mac not notarized) under What was checked.
- Be honest about checks: say what was tested live and what only on practice pages.
- Mention the big visible things first (for example a reworked app look or a new page).

**Template** (replace the version number and the lines)

```
✨ **PlazCode 1.24.25**
***One plain sentence on what this update is about.***

***✨ What's new***
- Each new thing, one short line, in everyday words.

***🛠️ What's fixed***
- Each fix, one short line. Say what the person saw before and that it no longer happens.

***🧪 What was checked***
- What was tested and where. Say plainly what was not tried live.
- The Windows app is unsigned and the Mac app is not notarized, as before. Your computer may ask you to confirm opening it.

***📥 How to update***
- Open PlazCode, or choose Updates → Update now.
- Manual downloads: PlazCode-1.24.25.zip for Windows, PlazCode-macOS-1.24.25.zip for Mac, or PlazCode-Firefox-1.24.25.zip for Firefox.
- Reload your extension and refresh your AI tabs. Firefox users: reload the temporary add-on after restarting Firefox.
- Your settings, memory and connections are kept.
```

Where it goes in the repo: the `github` block of `development/1.24.25/release-entry.json` (`summary`, `sections`). `publish_release.py` turns it into the page text and adds the How to update section itself; keep the final text matching this template and under 2,000 characters. See [releasing](releasing.md).

**1.24.30 owner rule (2026-11-01): no source ZIP distribution.** Packaging/promotion create no source archive and CI excludes source ZIP uploads. Hash-only `source-proof.json` reports bind prepared source to Windows/Mac validation; promotion reconstructs from the exact checkout and checks both. Keep `PLAZCODE_PUBLISH_SOURCE=0`. Preserve old releases and licence notices; retained GPL corresponding-source obligations remain unresolved before a public release.

**Latest licensing decision (2026-11-01, supersedes earlier GPL-gap status):** owner confirmed ownership of all first-party code and rejected future GPL terms. First-party 1.24.30 is now proprietary (LICENSE / LicenseRef-PlazCode-Proprietary); current headers/Rust metadata/root/browser notices updated, normal user content/use retained. Old GPL releases and third-party licences remain. Root package notices now come from current source; dependency notices ship in runtime. No source ZIP distribution; no Luraph. See license-and-branding-review.md. Full replacement validation/test ZIPs pending.

## Show release notes before every release (owner, 2026-11-02)
Before any real release, send the owner the exact release-note text intended for it, in the required format, before publishing. If the text changes, show the revised text first. Keep it under 2,000 UTF-16 characters and use the actual publisher formatter when drafting. A request for a draft or a test build does not authorize publishing. This standing rule applies to every future release.
