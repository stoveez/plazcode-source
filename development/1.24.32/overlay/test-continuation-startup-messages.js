"use strict";
// 1.24.30 (owner, 2026-11-01: "sometimes i make a new chat or switch ai but the [continue project] pop up never
// pops up"). The offer only shows in a fresh chat that holds no real request yet. PlazCode's own startup messages
// were counted as a request: the saved-memory pages ("PLAZCODE MEMORY, PAGE 1 OF 2: ...", sent whenever the vault
// has notes) and the plain first-person startup used on Notion, Vani, ClickUp and MiMo. So a brand-new chat
// looked already in use and the offer never appeared, and a startup-only chat could be offered for continuing.
const assert = require("assert"), fs = require("fs");
const R = require("./core/reliability.js");
const main = fs.readFileSync("core/main.js", "utf8");
const mimo = fs.readFileSync("providers/mimo.js", "utf8");
// Exact texts PlazCode sends (taken from the source so they cannot drift apart from this test).
const memoryPage = "PLAZCODE MEMORY, PAGE 1 OF 2: your saved vault notes. PlazCode loaded your saved memory at the start of this chat.";
assert(main.includes("PLAZCODE MEMORY, PAGE ${n} OF ${total}: ${what}."), "memory page wording still matches");
const startupRequest = "I clicked Start Agent in my installed PlazCode extension to connect this chat to my own Roblox Studio project. This is my own connection request.";
const followUp = "To be clear, I am not asking for file or tool access. I installed the PlazCode extension in my own browser and clicked Start Agent myself.";
assert(mimo.includes("To be clear, I am not asking for file or tool access. I installed the PlazCode extension"));
const generic = 'PlazCode startup check: reply with exactly one fenced json code block containing {"command":"list_commands"} and nothing else.';
const notion = 'Please use one fenced json code block containing {"command":"list_commands"} for my PlazCode connection request. This requests the command list.';
assert(main.includes(generic.slice(0, 70)) && main.includes(notion.slice(0, 90)));
for (const text of [memoryPage, startupRequest, followUp, generic, notion, "Output of 'list_commands':\nread_file", "⟦RS-SYS⟧\nrules"]) {
  assert.equal(R.userRequest({role: "user", text}), false, "startup message is not a request: " + text.slice(0, 40));
}
// Real requests still count, including ones that mention PlazCode or memory.
for (const text of ["do 15 tool calls 1 per turn as a test", "Use my PlazCode memory notes to fix the shop UI", "I clicked the button in Studio and nothing happened"]) {
  assert.equal(R.userRequest({role: "user", text}), true, text);
}
// A fresh chat after startup with memory pages: the offer scene is open (no real request yet).
const startupOnly = [{role: "user", text: startupRequest}, {role: "assistant", text: '{"command":"list_commands"}'}, {role: "user", text: memoryPage}, {role: "assistant", text: "Read page 1."}, {role: "user", text: "Output of 'list_commands':\nread_file"}, {role: "assistant", text: "PlazCode is ready."}];
const realRequest = startupOnly.some(R.userRequest);
assert.equal(realRequest, false);
assert.equal(R.continuationScene({editor: true, started: true, starting: false, startupOwner: false, conversationKey: "chat/1", realRequest}), true, "offer can show in the fresh chat");
// A chat that only ever had the startup is not offered as something to continue.
assert.equal(R.canContinue(R.handoff({provider: "MiMo", chat: "mimo|chat/1", history: startupOnly})), false);
assert.equal(R.canContinue(R.handoff({provider: "MiMo", chat: "mimo|chat/2", history: [...startupOnly, {role: "user", text: "build a shop"}]})), true);
// The task label skips the same messages.
assert(main.includes("PlazCodeReliability.startupMessage(raw)"));
console.log("PASS continue-project offer: PlazCode's startup request, follow-up and memory pages are not a user request, so fresh chats get the offer and startup-only chats are not offered.");
