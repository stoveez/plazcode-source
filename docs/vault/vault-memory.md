---
title: Native vault (PlazCode's own Memory feature)
updated: 2026-10-24
---
# Native vault: the app's Memory feature

**Two vaults, do not mix them up.** The *PlazCode vault* is `docs/vault`: notes for the AIs that BUILD PlazCode. The *native vault* is this note's subject: the feature inside the PlazCode app where the AI on a chat site (ChatGPT, Claude and others) keeps long-term memory about the owner's Roblox and coding work. Internals: [native-vault-internals](native-vault-internals.md). Design: `development/1.24.21/VAULT-MEMORY-DESIGN.md`.

## What it is
A folder of linked Markdown notes (Obsidian-compatible, Obsidian is optional). Default folder: `Vault` next to the app's data; the owner can pick another folder in Memory settings, and an existing folder is adopted as it is.

Numbered folders: `00 Start Here` (Home, Glossary, Index, Log, **Now**), `01 About You`, `02 How We Work`, `03 Coding Style`, `04 Models And Styles`, `05 Projects`, `06 Journeys`, `07 Lessons And Decisions`, `08 References` (pictures in `refs`), `09 How To`, `10 Inbox`, `_Archive`, `_Templates`.

## What the AI gets
- At the start of each chat: the Home note, the live note (`Now.md`), and a brain map of every note and link. It then searches and reads other notes only when needed.
- It writes notes itself when the owner corrects it, a job finishes, or it hits a trap, and rewrites `Now.md` after every job (max 1,500 characters; never overwritten at startup).
- Pictures the owner attaches with PlazCode's media button can be stored with `add_image` ("add this picture to memory"). Pictures pasted straight into the AI site's own box are not seen.

## How the owner uses it
Memory settings in the desktop app: **Open vault** (Obsidian-style window: file tree, links, graph, search, edit, pictures, backlinks, move to archive), **Open vault folder**, **Open in Obsidian** (only if installed), **Let the AI write notes** switch, **Use a different folder**. Quick notes (the older short-fact list) still exist next to it.

## Honest status
Not tried in the real app on Windows or Mac. The score-and-redo critic loop (`plazcode_critic`, a separate chat) is not tried on real AI sites and costs extra usage per redo; keep it off unless wanted. Live note and attached-picture storage need the desktop app replaced and the extension reloaded.
