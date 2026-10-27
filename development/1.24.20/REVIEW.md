# PlazCode 1.24.20 — ClickUp Ask Brain startup fix

Status: private branch; not published. Stable `main`, releases and update feeds are unchanged until validation passes and the publish step runs.

## What changed
- One file of program logic: `providers/clickup.js`.
- In a new ClickUp Ask Brain chat, ClickUp moves the page from `.../brain` to `.../brain?conversationId=<id>` once the first message is sent. PlazCode captured the chat key before the send and compared it afterwards, so the response watcher saw a "different chat", logged `response.ownerChanged` / `start.aborted` and stopped startup right after Brain's first reply.
- The provider now keeps one stable key for the blank Ask Brain chat that actually sent a message, and keeps it after ClickUp assigns the saved address. A blank chat that sent nothing is never merged with another chat.
- ClickUp agent-thread keys are unchanged (not reproduced live, so intentionally not touched).
- Version bump only otherwise: `manifest.json`, `agent/Cargo.toml`/`Cargo.lock`, version assertions in two existing tests.

## Evidence
- Live (real ClickUp account, AgentScript mode, official 1.24.19 package plus this one file): 1.24.19 stopped after the first reply every time; with the fix all five startup parts were sent and PlazCode reported ready (83 tools).
- Browser fixture `test-clickup-browser.cjs` now asserts the Ask Brain key is unchanged after the saved address appears; it fails on 1.24.19 and passes here. All six ClickUp fixtures pass locally in Chromium.
- Not tested live: ClickUp agent chats, Firefox, the Edge binary, other AI sites.
- Native Windows/macOS builds, Firefox and the packaged Mac lifetime checks come from the hosted validation run.

## Not part of this release
The unpublished Vani/Ultra/Claude-delivery work lives on `codex/plazcode-1.24.20` and is intentionally excluded. It will need renumbering when it is released.
