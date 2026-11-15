# NOW
Updated: 2026-11-14 evening (Ask PlazCode History). Branch `claude/plazcode-dev`, newest commit `fd0ec08`. Version 1.24.32 is published; 1.24.33 is built here and NOT published (publishing needs the owner's clear yes).

**Where the work is:** the owner is field-testing 1.24.33 and sends bug reports; fix each in `development/1.24.33/overlay`, run `python3 development/1.24.33/prepare.py`, run the tests, push. Everything below is fixed in source; most is NOT in a test build yet.

**Test build:** CI run 43661441393 on `fd0ec08` (in progress when this was written; check `gh run list --branch claude/plazcode-dev`). Earlier runs for newer commits were cancelled by the next push. When a run is green, send the owner the Windows zip first, then the Mac one (inner `-test-lean` zips, `plazcode-1.24.33-Windows-test-lean`, `plazcode-1.24.33-macOS-test-lean`). The repo is PUBLIC for the build: remind the owner to set it back to Private (https://github.com/stoveez/plazcode-source/settings) and check `gh api repos/stoveez/plazcode-source --jq .visibility` before stopping.

**Done on 2026-11-14 (details: `docs/vault/now-archive-2026-11-14.md`, items 1 to 27):** desktop app polish (fonts, glow, motion, custom colour kept, page turns); ChatGPT chat-mode start, Kimi, Freebuff (ready detection, `?thread=` address, cards), Gemini (card anchor, compact bar), Claude and DeepSeek startup/upload fixes; Ask PlazCode rebuilt: side-panel or docked window, DeepSeek in a minimised background window for every site, whole screen shared by default, works in a copy of the tab, signed-out message ("DeepSeek is not signed in..."), and the new **History menu** (three-line button top right: every Ask chat kept on this computer, New chat, delete, reopens into the same AI chat; `background.js` askArchive/askOpenChat/askNewChat/askDeleteChat, `core/ask.js`, `core/ask.html`, `test-ask-history.js`). The owner decided NOT to add a DeepSeek API key mode.

**Needs the NEW APP (desktop page / Rust):** `agent/src/desktop.html` changes (fonts, glow, rainbow, motion, custom colour restore), `gui.rs`, `preferences.rs`, `account_sync.rs`. **Extension reload is enough for** everything else, including all Ask PlazCode work.

**Not verified live (owner field test):** real Kimi (.com and .ai), Freebuff, Gemini; Ask PlazCode end to end on real DeepSeek (answering while minimised, History reopening an old chat, sign-in message); real Chrome side panel and Windows window sizes; Mac; Notion bar lag and "Offline" cause (hardened, not reproduced); serif font on Windows.

**Other open items:** antivirus: VirusTotal hits on 1.24.32's PlazCode.exe (2 of 70) have no proven cause, hooks already removed from the 1.24.33 source; Connections rework step 8 waits for the owner's go; Linux rework and macOS 10.15 support are done locally, owner field test pending. Plans: `development/1.24.33/` (AGENTSCRIPT-REWORK-PLAN.md, BAR-REDESIGN-PLAN.md, LINUX-REWORK-PLAN.md). Known unrelated test failures on the Linux box: test-bridges, test-design-visual, test-v115, test-notion-startup-small-paste (slow).

**Next step:** wait for the owner's reports; when they ask for a test build, run the public-then-private plan in `CLAUDE.md`. Release notes draft: `development/1.24.33/release-notes-preview.md`.

**Rules reminders:** commits as stoveez, no Co-Authored-By or session lines; push after every finished step; tell the owner branch + short commit ID after each push; never publish or change repo visibility without the owner.
