// SPDX-License-Identifier: GPL-3.0-or-later
// 1.24.21: chat notes are wired into the live chat: saved on task changes, every 10 s tick, tab hidden and task finish;
// the "continue" popup reads the newest chat note. Source-level checks (the behaviour itself is in test-chat-note.js).
const fs = require("fs"), assert = require("assert");
const main = fs.readFileSync(__dirname + "/core/main.js", "utf8");
const must = (text, why) => assert(main.includes(text), why);
must("PlazCodeReliability.continuationScene(", "popup waits for startup");
must("async function saveChatNote(reason)", "saver exists");
must("PlazCodeMemory.chatNoteSave(state,", "saver writes through the vault");
must("logChat();saveChatNote('tick');", "10 s tick saves");
must("logChat();saveChatNote('hidden');", "tab hidden saves");
must("ui.noteChatSoon('activity')", "task changes save (start and mid-task)");
must("ui.noteChatSoon('finish')", "task finish saves");
must("PlazCodeMemory.chatNoteLatest(", "Yes reads the newest chat note");
must("chatNoteStates[noteKey(P.id+'|'+P.conversationKey())]", "never reads this chat's own note");
assert(!/rsChatNotes\s*===\s*false/.test(main), "always on by default, no switch hides it");
const hidden = fs.readFileSync(__dirname + "/core/memory.js", "utf8");
assert(hidden.includes("graph: withoutChatNotes(graph)") && hidden.includes("reply.notes.filter"), "chat notes stay out of the AI's startup list and map");
console.log("Chat notes are wired: tick, hidden, task change, task finish, Yes reads the newest note, hidden from the startup map.");
