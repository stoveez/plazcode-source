# Release descriptions

Future GitHub release descriptions must contain fewer than 2,000 characters, including Markdown, whitespace and update instructions. Keep the existing title, summary bullet, New additions, Improvements, Bug fixes, Validation and limitations, and Update sections; omit empty change categories as before.

Write concise bullets before publishing. For a longer in-app changelog, give its release entry an optional `github` object containing shorter `summary`, `added`, `improved`, `fixed` and `notes` fields. This changes only the GitHub release copy. Full changelog details remain intact. The publisher refuses descriptions of 2,000 characters or more rather than cutting off Markdown or silently dropping details.

Published releases and archives remain immutable. This rule applies to future updates.

Update feeds must remain below the 64 KiB installed-client limit. Use release_feed.compact_feed when generating them: at most five recent entries, with a 48 KiB budget. Preserve the complete history in release-notes.json. Run test-release-feed.py before publishing; never solve oversize feeds solely by increasing the new client limit.

Automatic-learning releases must verify observation names against the exported native tool catalog. Unsupported observations must continue to fail closed.
