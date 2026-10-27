# PlazCode 1.24.12 review

Validation: all exact-source platform CI jobs and the packaged macOS desktop check passed. See release-validation-1.24.12.

Built from the published `PlazCode-source-1.24.11.zip` with `overlay/` applied by `prepare.py`. Retired UltraGUI files are removed; new UltraGUI images are restored byte-exact from `binary/` base64 chunks.

Fixes:
- Memory: note fields keep their own key/clipboard events (paste works); Paste button; import of .md/.json/.txt files, each saved as one note as-is.
- One-time task reference no longer holds the AI's command back; it is appended after the real command result.
- Notion startup: readyPrompt preferences converted to Notion-plain text (`notionPlainText`); `draftLooksWritten` tolerates Notion reformatting only for PlazCode's own startup drafts.
- Plan-then-stop: plans ending with an approval question continue in Plan Mode/Ultracode (max two nudges); real questions still wait; planning/meta tools don't count as work.
- False "Not connected": the running loop's chat is remembered; Notion `/chat/<id>` and `/chat?t=<id>` aliases count as the same session.
- screen_capture: if Notion does not take the image, PlazCode clears its own draft and sends the text once, pointing to the capture viewer.
- Request-file wording: first sentence kept (core/reliability.js relies on it); the rest plainly states why the file is attached.
- Blender: a command waits up to 45 s for a running one (extension and native lock); reconnects once after a short drop; timeouts no longer mark Blender disconnected.
- UltraGUI replaced with the new 8-skill pack (GUI only: ScreenGui/BillboardGui/SurfaceGui); native skill pack v2 migration retires old cards.
- Desktop: Settings → Updates automatic-updates switch (`rsAutoUpdate`, default on); manual Update unaffected.

Tests: `test-1.24.12-fixes.js` plus updated `test-1.24.10/11-fixes`, `test-blender-command-results`, `test-startup-command-status`, `test-provider-preservation`, `test-desktop-regression`, `test-skills-native.py`, Rust unit tests (skills, preferences).

Not verified: live signed-in Notion, real Roblox Studio, live Blender.
