---
title: Continue project across AI websites
updated: 2026-11-02
---
# Continue project across AI websites

Owner report: the Continue project question is inconsistent, especially after switching AI websites.

## Reproduced causes
- The old `rsLastUsedChats` veto included chats that had only startup. Visiting one between actual work and a new website hid the latest valid project. This was explicitly asserted by an old test; that behavior has been corrected, not bypassed in the test.
- `visibilitychange` captured the outgoing chat, but `logChat` only promoted it if the document still had focus or already owned the pointer. Focus is lost by then. Switching before the regular 10-second save left an older provider selected.
- There was no explicit same-chat exclusion. With no recent-chat entries, a fresh-looking destination could offer its own saved work.

## Extension changes
`core/main.js` now uses the latest real-work handoff across providers directly; obsolete startup-visit tracking is removed. Leaving a tab and same-tab navigation (`pagehide`) both force a final capture, publish to shared profile-scoped extension storage before waiting on the native archive, and preserve newer local work while an older archive request is pending. Background periodic captures do not replace a different foreground source.

The question still waits for confirmed startup and an empty composer before a real user request. Opt-out, busy/Stop/session checks and an explicit Yes remain. It never sends or resumes automatically. Missing/invalid/startup-only/self handoffs do not prompt; changed sources close the stale offer and settle before offering the new source.

Continue reads only the selected source chat's note in the active vault. A globally newer unrelated note cannot replace that source's excerpt. Missing/unreadable/own notes retain the source excerpt. Note state changes are shared with already-open AI tabs. Historical context and uncertain-mutation warnings remain.

Choosing a new project saves a null handoff as a deliberate reset. Desktop recovery runs only when local storage genuinely lacks the key; an old native archive cannot resurrect a discarded project. Storage initialization and recovery use a revision check to avoid overwriting a later change. Existing background profile-key swapping and native archive isolation remain unchanged.

## Verification
Before the fix, the actual content-script JSDOM test failed the intervening-startup, lost-focus-save and same-chat cases (3 failures). After the fix, focused tests all pass: ChatGPT→Claude and Claude→ChatGPT, already-open destination updates, stale offer replacement, leaving before save, same-tab pagehide, pending archive write, self exclusion, startup gate/opt-out/real-request, no-history/separate-store, startup-only handoff, native recovery/new-project reset, selected-source notes and active-vault/fallback behavior. Existing continuation/notes/pin checks pass. Full local JS regression pending. No original live AI account or affected device tested. No new UI design; no live preview available through the current connection.

## Delivery
Extension-only source fix, not yet in a new signed test build. Current delivered guest/signup Windows/Mac ZIPs from source 52b9d19 / run 41492949796 lack this and the newer DeepSeek startup-warning fix. Reload updated signed extension + refresh AI tabs when packaged; no native code update needed. No stable publication. Stable already 1.24.30; future stable needs a new version and exact notes shown first. Repo vault updated; PC vault folder is not connected.
