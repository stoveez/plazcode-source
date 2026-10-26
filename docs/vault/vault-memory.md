---
title: Native vault (PlazCode's own Memory feature)
updated: 2026-10-24
---
# Native vault: the app's Memory feature

**Two vaults, do not mix them up.** The *PlazCode vault* is `docs/vault`: notes for the AIs that BUILD PlazCode. The *native vault* is this note's subject: the feature inside the PlazCode app where the AI on a chat site (ChatGPT, Claude and others) keeps long-term memory about the owner's Roblox and coding work. Internals: [native-vault-internals](native-vault-internals.md). Design: `development/1.24.22/VAULT-MEMORY-DESIGN.md`.

## What it is
A folder of linked Markdown notes (Obsidian-compatible, Obsidian is optional). Default folder: `Vault` next to the app's data; the owner can pick another folder in Memory settings, and an existing folder is adopted as it is.

Numbered folders: `00 Start Here` (Home, Glossary, Index, Log, **Now**), `01 About You`, `02 How We Work`, `03 Coding Style`, `04 Models And Styles`, `05 Projects`, `06 Journeys`, `07 Lessons And Decisions`, `08 References` (pictures in `refs`), `09 How To`, `10 Inbox`, `_Archive`, `_Templates`.

## What the AI gets
- At the start of each chat: the Home note, the live note (`Now.md`), and a brain map of every note and link. It then searches and reads other notes only when needed.
- It writes notes itself when the owner corrects it, a job finishes, or it hits a trap, and rewrites `Now.md` after every job (max 1,500 characters; never overwritten at startup).
- Pictures the owner attaches with PlazCode's media button can be stored with `add_image` ("add this picture to memory"). Pictures pasted straight into the AI site's own box are not seen.

## Chats are saved as notes (new, 2026-10-24)
PlazCode itself (not the AI, no extra usage, works even when "Let the AI write notes" is off) saves every chat as a note in `11 Chats`, named like `2026-10-24 2200 ChatGPT Build-rounds`. It has a Summary, Key points and a section titled **Current tasks:** (done, in progress and pending tasks with times; several at once). It updates when a task starts, changes or finishes, every 10 seconds if the tasks changed, and when the tab is hidden. Notes carry the tag `previous-chat`. They are kept forever and are left out of the AI's startup list and map, but the AI can still search them.

**The continue popup** now appears only after the AI says "PlazCode is ready." and before your first real request. Yes makes the AI read the newest chat note (never the current chat's own); if none exists it falls back to the old short excerpt. No starts fresh. Needs the new desktop app plus an extension reload.

## Several vaults and folder import (new, 2026-10-24, extension only)
**Vaults list:** Memory, Vault, More options, "Your vaults" (shown only in the browser panel; the desktop window gets it with the next app). The list is kept in browser storage (`rsVaults`); the desktop app still holds ONE active vault (`configure {path}`), so every tab and chat uses it. Open switches (and records `rsActiveVault`), Rename changes only the shown name, Remove takes it off the list and never touches files. A vault cannot sit inside another. After a switch every tab drops its cache and the next vault tool result tells the AI to read Home again. Chat notes and the "latest chat" pointer are kept per vault. Code: `vaultRegistry` and `mountVault` in `core/memory.js`; test `test-vault-switcher.js`.

**Import a folder:** the button "Import a folder of notes" opens PlazCode's own page `core/vault-import.html` (the AI site never sees the files). Notes go to `10 Inbox/Imported <folder>/`, subfolders kept, text kept exactly (`write create`, then `save_raw`). Skipped and listed in an `Import report` note (names only): hidden/system folders, pictures, other files, empty, over 60,000 characters, secret-looking, same name, beyond 300 notes. Code: `core/vault-import.js`, `core/vault-import-page.js`; test `test-vault-import.js`. Still for the next desktop app: a native folder picker, real folder renames, fast batch import, pictures.

## How the owner uses it
Memory settings in the desktop app: **Open vault** (Obsidian-style window: file tree, links, graph, search, edit, pictures, backlinks, move to archive), **Open vault folder**, **Open in Obsidian** (only if installed), **Let the AI write notes** switch, **Use a different folder**. Quick notes (the older short-fact list) still exist next to it.

## Honest status
Not tried in the real app on Windows or Mac. The score-and-redo critic loop (`plazcode_critic`, a separate chat) is not tried on real AI sites and costs extra usage per redo; keep it off unless wanted. Live note and attached-picture storage need the desktop app replaced and the extension reloaded.
