"use strict";
// app_do (owner, 2026-11-17): control another desktop app by the names of its buttons and fields. Extension side: risky steps
// (send / delete / pay buttons, Enter after typing in a chat app) ask for approval unless approvals are off; the approval card
// says what will happen; the start-up text for Full PC access tells the AI to prefer app_do. Run: node test-app-do.js
const assert = require("node:assert/strict"), fs = require("fs");
const A = require("./core/approval.js"), S = require("./core/safety.js");
const chat = { app: "Discord", steps: [{ type: "hi", into: "Message" }, "Enter", { click: "Delete Message" }, { click: "Settings" }] };
assert.deepEqual(A.appStepsRisk(chat), ["press Enter after typing (sends the message)", 'click "Delete Message"']);
assert.equal(A.commandDecision("auto", "app_do", chat, "local", S), "ask", "Approve for me still asks before sending or deleting");
assert.equal(A.commandDecision("bypass", "app_do", chat, "local", S), "allow", "Bypass approval does not ask");
const notepad = { app: "Notepad", steps: [{ type: "hi" }, { key: "Enter" }, { click: "File" }, { click: "Save" }] };
assert.deepEqual(A.appStepsRisk(notepad), [], "Enter in Notepad and Save are not risky");
assert.equal(A.commandDecision("auto", "app_do", notepad, "local", S), "allow");
assert.equal(A.commandDecision("ask", "app_do", notepad, "local", S), "ask", "Ask for approval asks before every change, app_do included");
assert.deepEqual(A.appStepsRisk({ app: "Store", steps: [{ click: "Buy now" }, { click: "Resend code" }] }), ['click "Buy now"'], "whole words: Resend is not Send");
assert.match(A.describe("app_do", chat, "local", S).summary, /^Uses Discord for you: 4 steps, including press Enter/);
assert.equal(S.isChange("app_do", "local"), true, "app_do counts as a change (Read-only mode blocks it)");
const cfg = fs.readFileSync(__dirname + "/core/config.js", "utf8");
assert.match(cfg, /OTHER APPS: app_do \{app, steps\}/, "the Full PC access start-up text points the AI to app_do");
const rs = fs.readFileSync(__dirname + "/agent/src/app_steps.rs", "utf8");
for (const w of ["send", "delete", "buy", "pay", "checkout"]) assert(rs.includes('"' + w + '"'), "the app keeps the same risky words: " + w);
console.log("PASS app_do approvals and start-up text.");
