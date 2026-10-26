---
title: Release description format
updated: 2026-10-25
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
✨ **PlazCode 1.24.24**
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
- Manual downloads: PlazCode-1.24.24.zip for Windows, PlazCode-macOS-1.24.24.zip for Mac, or PlazCode-Firefox-1.24.24.zip for Firefox.
- Reload your extension and refresh your AI tabs. Firefox users: reload the temporary add-on after restarting Firefox.
- Your settings, memory and connections are kept.
```

Where it goes in the repo: the `github` block of `development/1.24.24/release-entry.json` (`summary`, `sections`). `publish_release.py` turns it into the page text and adds the How to update section itself; keep the final text matching this template and under 2,000 characters. See [releasing](releasing.md).
