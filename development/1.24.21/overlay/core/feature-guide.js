// SPDX-License-Identifier: GPL-3.0-or-later
// 1.24.21 feature guide: ONE list of every PlazCode feature (where to click, what
// it does, the steps). The AI reads it through the plazcode_features command and
// the short index in the startup text; the website guides read the same JSON
// between the GUIDE-JSON markers. A test fails when a menu item has no entry.
const PlazCodeFeatureGuide = (() => {
  // Keep this list strict JSON (double quotes, no comments, no trailing commas).
  const ENTRIES = /*GUIDE-JSON-START*/[
 {
  "id": "engine",
  "title": "Switch between Roblox Studio and your computer",
  "group": "Bar",
  "where": "PlazCode bar (top of the chat) > the RS / AS switch",
  "does": "RS means Roblox Studio. AS means AgentScript, which works on files and programs on your computer. The AI only uses the tools of the side you pick.",
  "steps": [
   "Find the RS / AS switch on the bar.",
   "Click it to flip sides.",
   "The bar and the tools the AI sees change to match."
  ],
  "tips": [],
  "related": [
   "access",
   "start"
  ],
  "keywords": [
   "rs",
   "as",
   "agentscript",
   "studio",
   "local",
   "engine",
   "switch",
   "pc",
   "computer"
  ],
  "anchors": [
   "bar:rs-engine"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "start",
  "title": "Start, restart and stop",
  "group": "Bar",
  "where": "PlazCode bar (top of the chat) > the main button and Stop",
  "does": "The main button starts PlazCode in this chat (or restarts it). Stop cancels what the AI is doing right now.",
  "steps": [
   "Click the main button (Start, or Restart if it is already running).",
   "To cancel work, click Stop. It appears while the AI is working.",
   "Choose how Stop behaves in the menu: Automation > Stop mode."
  ],
  "tips": [],
  "related": [
   "stop-mode",
   "undo"
  ],
  "keywords": [
   "start",
   "restart",
   "stop",
   "cancel",
   "halt",
   "kill",
   "begin"
  ],
  "anchors": [
   "bar:rs-action",
   "bar:rs-stop"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "effort",
  "title": "Effort level (how deeply the AI thinks)",
  "group": "Bar",
  "where": "PlazCode bar (top of the chat) > Effort chip, or PlazCode menu (gear button on the bar) > Reasoning",
  "does": "Sets how much the AI plans and checks itself. Higher is slower and more careful. Levels: Default, Low, Mid, High, Max and Ultra.",
  "steps": [
   "Click the Effort chip under the PlazCode name on the bar.",
   "Pick a level from the list. It applies on the next message.",
   "The same choice is in the menu under Reasoning."
  ],
  "tips": [],
  "related": [
   "work-mode",
   "extra-think"
  ],
  "keywords": [
   "effort",
   "reasoning",
   "thinking",
   "level",
   "ultra",
   "ultracode",
   "max",
   "depth",
   "careful"
  ],
  "anchors": [
   "bar:rs-effort",
   "menu:Reasoning"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "work-mode",
  "title": "Fast, Balanced or Thorough",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Effort",
  "does": "Chooses the work style: Fast takes a short path, Balanced plans, builds and checks once, Thorough thinks the most and then verifies.",
  "steps": [
   "Open the PlazCode menu with the gear button.",
   "In the Effort section click Fast, Balanced or Thorough."
  ],
  "tips": [],
  "related": [
   "effort"
  ],
  "keywords": [
   "fast",
   "balanced",
   "thorough",
   "work mode",
   "speed",
   "quality"
  ],
  "anchors": [
   "menu:Effort",
   "work:fast",
   "work:balanced",
   "work:thorough"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "enhance",
  "title": "Enhance a prompt",
  "group": "Bar",
  "where": "PlazCode bar (top of the chat) > Enhance button",
  "does": "Rewrites your request into a clearer one using this AI, then sends it.",
  "steps": [
   "Click Enhance on the bar.",
   "Type your request in the box that opens.",
   "Click Enhance & Send."
  ],
  "tips": [],
  "related": [],
  "keywords": [
   "enhance",
   "improve",
   "rewrite",
   "prompt",
   "clearer"
  ],
  "anchors": [
   "bar:rs-enhance"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "media",
  "title": "Send pictures or videos",
  "group": "Bar",
  "where": "PlazCode bar (top of the chat) > paperclip button",
  "does": "Adds images or videos to your next message.",
  "steps": [
   "Click the paperclip on the bar, or drop or paste a file into the chat.",
   "Check the file is attached, then send your message."
  ],
  "tips": [],
  "related": [
   "image-build"
  ],
  "keywords": [
   "media",
   "image",
   "picture",
   "video",
   "attach",
   "paperclip",
   "upload"
  ],
  "anchors": [
   "bar:rs-media"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "cowork",
  "title": "Co-Work (keep chatting while it works)",
  "group": "Bar",
  "where": "PlazCode bar (top of the chat) > Co-Work button and Pending",
  "does": "With Co-Work on you can send new requests while the AI is busy. They wait in a queue and run in order.",
  "steps": [
   "Click Co-Work on the bar so it says On.",
   "Type new requests as usual.",
   "Click Pending to see or remove the queued ones."
  ],
  "tips": [],
  "related": [],
  "keywords": [
   "cowork",
   "co-work",
   "queue",
   "pending",
   "busy",
   "parallel"
  ],
  "anchors": [
   "bar:rs-cowork",
   "bar:rs-cowork-queue"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "extra-think",
  "title": "Extra Thinking",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Automation > Extra Thinking, or the Extra button on the bar",
  "does": "The AI reviews its own work and keeps improving it until it is satisfied. It is slower but more careful.",
  "steps": [
   "Turn on Extra Thinking in the menu under Automation.",
   "The Extra button appears on the bar. Click it to turn it on or off for the next message."
  ],
  "tips": [],
  "related": [
   "effort"
  ],
  "keywords": [
   "extra",
   "thinking",
   "review",
   "iterate",
   "self-review"
  ],
  "anchors": [
   "mode:extra",
   "bar:rs-extra"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "undo",
  "title": "Undo and checkpoints",
  "group": "Bar",
  "where": "PlazCode bar (top of the chat) > Undo button, and PlazCode menu (gear button on the bar) > Checkpoints",
  "does": "Undo reverses the last Roblox Studio change the AI made. Checkpoints list recent changes; the last 10 are kept.",
  "steps": [
   "Click Undo on the bar to reverse the last change.",
   "See older changes in the menu under Checkpoints and click Undo next to one.",
   "You can also press Ctrl+Z inside Roblox Studio."
  ],
  "tips": [],
  "related": [
   "start"
  ],
  "keywords": [
   "undo",
   "revert",
   "checkpoint",
   "rollback",
   "mistake",
   "restore"
  ],
  "anchors": [
   "bar:rs-undo",
   "menu:Checkpoints"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "discord",
  "title": "Join the Discord",
  "group": "Bar",
  "where": "PlazCode bar (top of the chat) > Discord button",
  "does": "Opens the PlazCode Discord community for help and news.",
  "steps": [
   "Click the Discord icon on the bar."
  ],
  "tips": [],
  "related": [],
  "keywords": [
   "discord",
   "community",
   "chat",
   "help",
   "support"
  ],
  "anchors": [
   "bar:rs-discord"
  ],
  "surfaces": [
   "extension"
  ],
  "index": false
 },
 {
  "id": "settings",
  "title": "Open the PlazCode menu",
  "group": "Bar",
  "where": "PlazCode bar (top of the chat) > gear button",
  "does": "The gear opens the PlazCode menu, where all settings live.",
  "steps": [
   "Click the gear button on the bar.",
   "Click it again, or click outside the menu, to close it."
  ],
  "tips": [],
  "related": [],
  "keywords": [
   "settings",
   "menu",
   "gear",
   "options",
   "preferences"
  ],
  "anchors": [
   "bar:rs-settings-btn"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "hide",
  "title": "Hide the bar",
  "group": "Bar",
  "where": "PlazCode bar (top of the chat) > hide button",
  "does": "Hides the bar to give you more room. PlazCode keeps working while it is hidden.",
  "steps": [
   "Click the hide button on the bar.",
   "Click the tab on the right edge of the page to show it again."
  ],
  "tips": [],
  "related": [],
  "keywords": [
   "hide",
   "bar",
   "minimize",
   "show",
   "tab"
  ],
  "anchors": [
   "bar:rs-hide"
  ],
  "surfaces": [
   "extension"
  ],
  "index": false
 },
 {
  "id": "working",
  "title": "Work details (Working button)",
  "group": "Bar",
  "where": "PlazCode bar (top of the chat) > Working button",
  "does": "While the AI works, the Working button shows what it is doing. Click it to open the work details: the steps so far and the task list.",
  "steps": [
   "Wait for the Working button to appear on the bar.",
   "Click it to open the work details panel.",
   "Click it again to close the panel."
  ],
  "tips": [],
  "related": [
   "run-log",
   "tool-cards"
  ],
  "keywords": [
   "working",
   "progress",
   "status",
   "what is it doing",
   "steps",
   "task list",
   "checklist"
  ],
  "anchors": [
   "bar:rs-activity"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "fix-conn",
  "title": "Fix connection",
  "group": "Bar",
  "where": "PlazCode bar (top of the chat) > Fix connection button",
  "does": "Checks each link between the chat, the PlazCode app and Roblox Studio, shows which one is broken, and offers a fix.",
  "steps": [
   "Click Fix connection on the bar. It appears when something is not connected.",
   "Read the checklist. Click the fix button it offers, if any.",
   "Click Check again to test once more."
  ],
  "tips": [],
  "related": [
   "repair-link",
   "popup"
  ],
  "keywords": [
   "fix connection",
   "connection",
   "not connected",
   "broken",
   "bridge",
   "studio link",
   "check again",
   "offline"
  ],
  "anchors": [
   "bar:rs-fix",
   "bar:rs-fix-go",
   "bar:rs-fix-again",
   "bar:rs-fix-close"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "language",
  "title": "Change the language",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Language",
  "does": "Changes the language of PlazCode's own menus and messages.",
  "steps": [
   "Open the PlazCode menu.",
   "In the Language section pick your language."
  ],
  "tips": [],
  "related": [],
  "keywords": [
   "language",
   "translate",
   "locale",
   "english",
   "spanish"
  ],
  "anchors": [
   "menu:Language"
  ],
  "surfaces": [
   "extension"
  ],
  "index": false
 },
 {
  "id": "models",
  "title": "Choose the AI site",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Models",
  "does": "Lists the AI chat sites PlazCode works with. Click one to open it in a tab.",
  "steps": [
   "Open the PlazCode menu.",
   "In the Models section click the site you want."
  ],
  "tips": [],
  "related": [
   "site-setup"
  ],
  "keywords": [
   "models",
   "site",
   "ai",
   "chatgpt",
   "claude",
   "gemini",
   "provider",
   "website"
  ],
  "anchors": [
   "menu:Models"
  ],
  "surfaces": [
   "extension"
  ],
  "index": false
 },
 {
  "id": "tutorial",
  "title": "Read the tutorial",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Guide",
  "does": "Opens the tutorial: a text walkthrough that is kept up to date.",
  "steps": [
   "Open the PlazCode menu.",
   "In the Guide section click Read the Tutorial."
  ],
  "tips": [],
  "related": [],
  "keywords": [
   "tutorial",
   "guide",
   "help",
   "learn",
   "walkthrough",
   "how to"
  ],
  "anchors": [
   "menu:Guide",
   "ctl:rs-menu-tutorial"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "support",
  "title": "Support PlazCode",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Support",
  "does": "Optional ways to support PlazCode's development. Nothing here is required.",
  "steps": [
   "Open the PlazCode menu.",
   "Look in the Support section."
  ],
  "tips": [],
  "related": [],
  "keywords": [
   "support",
   "donate",
   "robux",
   "pass",
   "pay"
  ],
  "anchors": [
   "menu:Support"
  ],
  "surfaces": [
   "extension"
  ],
  "index": false
 },
 {
  "id": "site-setup",
  "title": "Save a setup for this site",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Setup for this site",
  "does": "Saves how you like to work on this site (engine, effort, access, safety, instructions and more) so you can apply it in one click or every time you open the site.",
  "steps": [
   "Set the menu the way you like.",
   "In Setup for this site click Save current setup.",
   "Click Apply setup later to bring it back, or turn on Apply when I open this site.",
   "Click Remove to delete the saved setup."
  ],
  "tips": [],
  "related": [
   "backup"
  ],
  "keywords": [
   "setup",
   "preset",
   "profile",
   "save",
   "apply",
   "auto",
   "remember settings"
  ],
  "anchors": [
   "menu:Setup for this site",
   "mode:setupauto",
   "ctl:rs-setup-apply",
   "ctl:rs-setup-save",
   "ctl:rs-setup-remove",
   "ctl:rs-setup-save-more"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "access",
  "title": "Access: Sandbox, Ask or Full",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Access",
  "does": "Controls what the AI may touch. Sandbox is Roblox and the project folder only. Ask confirms every change. Full allows the whole computer (AgentScript).",
  "steps": [
   "Open the PlazCode menu.",
   "In Access click Sandbox, Ask or Full.",
   "With Ask, an approval card appears before each change."
  ],
  "tips": [],
  "related": [
   "approval",
   "read-only",
   "folders"
  ],
  "keywords": [
   "access",
   "permission",
   "sandbox",
   "ask",
   "full",
   "safe",
   "allowed",
   "computer"
  ],
  "anchors": [
   "menu:Access",
   "perm:sandbox",
   "perm:ask",
   "perm:full"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "read-only",
  "title": "Read-only mode",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Safety > Read-only mode",
  "does": "The AI can look at files, Studio and tools, but cannot change anything.",
  "steps": [
   "Open the PlazCode menu.",
   "In Safety turn on Read-only mode."
  ],
  "tips": [],
  "related": [
   "access"
  ],
  "keywords": [
   "read-only",
   "readonly",
   "look",
   "no changes",
   "safe"
  ],
  "anchors": [
   "menu:Safety",
   "mode:readonly"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "confirm-del",
  "title": "Confirm before deleting",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Safety > Confirm before deleting",
  "does": "PlazCode asks you before the AI deletes files or runs a delete command. It is on by default.",
  "steps": [
   "Open the PlazCode menu.",
   "In Safety use the Confirm before deleting switch."
  ],
  "tips": [],
  "related": [
   "always-appr",
   "approval"
  ],
  "keywords": [
   "delete",
   "confirm",
   "remove",
   "ask before",
   "safety"
  ],
  "anchors": [
   "mode:confirmdelete"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "always-appr",
  "title": "Always approved actions",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Safety > Always approved",
  "does": "Lists the actions you told PlazCode to stop asking about (from the Always approve button). Remove one to be asked again.",
  "steps": [
   "Open the PlazCode menu and find Safety > Always approved.",
   "Click Remove next to an action, or Remove all."
  ],
  "tips": [],
  "related": [
   "approval"
  ],
  "keywords": [
   "always approve",
   "always approved",
   "stop asking",
   "remove",
   "allow list"
  ],
  "anchors": [
   "ctl:rs-always-clear"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "folders",
  "title": "Allowed folders",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Safety > Allowed folders",
  "does": "With Full access, limits the AI's file work to the folders you list. Leave it empty to allow the whole computer.",
  "steps": [
   "Open the PlazCode menu, then Safety.",
   "Type one folder per line.",
   "Click Save folders."
  ],
  "tips": [],
  "related": [
   "access"
  ],
  "keywords": [
   "folders",
   "allowed",
   "path",
   "directory",
   "restrict",
   "full access"
  ],
  "anchors": [
   "ctl:rs-allowed-save"
  ],
  "surfaces": [
   "extension"
  ],
  "index": false
 },
 {
  "id": "action-log",
  "title": "What happened (action log)",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Safety > What happened",
  "does": "Shows a list of the actions PlazCode took, so you can check what changed.",
  "steps": [
   "Open the PlazCode menu, then Safety.",
   "Click What happened."
  ],
  "tips": [],
  "related": [
   "run-log"
  ],
  "keywords": [
   "log",
   "history",
   "what happened",
   "audit",
   "actions"
  ],
  "anchors": [
   "ctl:rs-action-log-open"
  ],
  "surfaces": [
   "extension"
  ],
  "index": false
 },
 {
  "id": "backup",
  "title": "Back up or restore settings",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Settings backup",
  "does": "Copies your choices as text so you can move them to another browser or restore them later. Passwords, keys and chats are never included.",
  "steps": [
   "Open the PlazCode menu and find Settings backup.",
   "Click Copy backup and keep the text.",
   "To restore, paste the text in the box and click Restore backup."
  ],
  "tips": [],
  "related": [
   "site-setup",
   "mem-transfer"
  ],
  "keywords": [
   "backup",
   "restore",
   "export",
   "import",
   "move settings",
   "copy"
  ],
  "anchors": [
   "menu:Settings backup",
   "ctl:rs-backup-copy",
   "ctl:rs-backup-restore"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "automation",
  "title": "Automation settings",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Automation",
  "does": "The Automation section holds the switches for background tabs, auto-fix, planning, debugging, limits, stopping and sounds. Each has its own entry.",
  "steps": [
   "Open the PlazCode menu.",
   "Scroll to Automation and read each switch's one-line description."
  ],
  "tips": [],
  "related": [
   "bg-tabs",
   "auto-fix",
   "plan-mode",
   "limits",
   "stop-mode",
   "sounds"
  ],
  "keywords": [
   "automation",
   "switches",
   "toggles",
   "options"
  ],
  "anchors": [
   "menu:Automation"
  ],
  "surfaces": [
   "extension"
  ],
  "index": false
 },
 {
  "id": "bg-tabs",
  "title": "Work in background tabs",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Automation > Work in background tabs",
  "does": "Lets the AI keep building while you browse other sites. This tab can stay in the background.",
  "steps": [
   "Open the PlazCode menu, then Automation.",
   "Turn on Work in background tabs."
  ],
  "tips": [],
  "related": [],
  "keywords": [
   "background",
   "tabs",
   "browse",
   "minimize"
  ],
  "anchors": [
   "mode:bgmode"
  ],
  "surfaces": [
   "extension"
  ],
  "index": false
 },
 {
  "id": "auto-fix",
  "title": "Auto-fix playtest errors",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Automation > Auto-fix playtest errors",
  "does": "While you playtest, PlazCode watches Roblox's Output and sends new errors to the AI to fix. The second switch can stop Play when an error is caught.",
  "steps": [
   "Open the PlazCode menu, then Automation.",
   "Turn on Auto-fix playtest errors.",
   "Optionally turn on Stop playtest on error."
  ],
  "tips": [],
  "related": [
   "auto-debug"
  ],
  "keywords": [
   "autofix",
   "auto fix",
   "playtest",
   "errors",
   "output",
   "fix errors"
  ],
  "anchors": [
   "mode:autofix",
   "mode:autofixstop"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "auto-debug",
  "title": "Automatic Debugger",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Automation > Automatic Debugger",
  "does": "After the AI edits in Studio, new Output errors are sent back to it to fix.",
  "steps": [
   "Open the PlazCode menu, then Automation.",
   "Turn on Automatic Debugger."
  ],
  "tips": [],
  "related": [
   "auto-fix"
  ],
  "keywords": [
   "debugger",
   "debug",
   "errors",
   "studio edits"
  ],
  "anchors": [
   "mode:autodebug"
  ],
  "surfaces": [
   "extension"
  ],
  "index": false
 },
 {
  "id": "approach",
  "title": "Show approach summary",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Automation > Show approach summary",
  "does": "Makes the AI write a short explanation before each command. Off by default.",
  "steps": [
   "Open the PlazCode menu, then Automation.",
   "Turn on Show approach summary."
  ],
  "tips": [],
  "related": [],
  "keywords": [
   "approach",
   "summary",
   "explain",
   "reasoning text"
  ],
  "anchors": [
   "mode:approach"
  ],
  "surfaces": [
   "extension"
  ],
  "index": false
 },
 {
  "id": "plan-mode",
  "title": "Plan mode",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Automation > Plan mode",
  "does": "The AI first writes a plan. PlazCode shows it as a card. Nothing changes until you approve it. After approval the AI works through the steps; deletes still ask.",
  "steps": [
   "Open the PlazCode menu, then Automation.",
   "Turn on Plan mode and send your request.",
   "Read the plan card, then click Approve plan, Ask for changes or Deny."
  ],
  "tips": [],
  "related": [
   "plan-card",
   "approval"
  ],
  "keywords": [
   "plan",
   "plan mode",
   "approve plan",
   "steps",
   "review first"
  ],
  "anchors": [
   "mode:plan"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "multi-agent",
  "title": "Multi-Agent",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Automation > Multi-Agent",
  "does": "Splits big jobs between a planner, builder, reviewer and debugger. The AI hands off with the plazcode_agent command.",
  "steps": [
   "Open the PlazCode menu, then Automation.",
   "Turn on Multi-Agent."
  ],
  "tips": [],
  "related": [],
  "keywords": [
   "multi-agent",
   "agents",
   "planner",
   "builder",
   "reviewer",
   "team"
  ],
  "anchors": [
   "mode:multiagent"
  ],
  "surfaces": [
   "extension"
  ],
  "index": false
 },
 {
  "id": "limits",
  "title": "Message and run limits",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Automation > limits",
  "does": "Optional caps: how many characters go in and out per message, how many commands or minutes per run, and a pause between commands. Zero means no limit.",
  "steps": [
   "Open the PlazCode menu, then Automation.",
   "Turn the character limits on or off, and set commands, minutes and seconds between commands.",
   "If a run pauses at a limit, click Resume paused task."
  ],
  "tips": [],
  "related": [
   "continuation"
  ],
  "keywords": [
   "limit",
   "limits",
   "characters",
   "commands",
   "minutes",
   "cooldown",
   "pause",
   "budget",
   "rate"
  ],
  "anchors": [
   "ctl:rs-input-limit-enabled",
   "ctl:rs-output-limit-enabled",
   "ctl:rs-run-limits",
   "ctl:rs-budget-resume"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "visual-check",
  "title": "Automatic visual review",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Automation > Automatic visual review",
  "does": "Sends up to three Studio screenshots to an image-capable AI to check what changed. It does not replace playtesting.",
  "steps": [
   "Open the PlazCode menu, then Automation.",
   "Turn on Automatic visual review."
  ],
  "tips": [],
  "related": [],
  "keywords": [
   "visual",
   "screenshot",
   "review",
   "images",
   "check"
  ],
  "anchors": [
   "ctl:rs-visual-check"
  ],
  "surfaces": [
   "extension"
  ],
  "index": false
 },
 {
  "id": "continuation",
  "title": "Continue a previous chat",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Automation > Offer to continue / Save continuation file",
  "does": "A new chat can offer to continue where your last chat stopped. You can also save a continuation file and load it into a fresh chat.",
  "steps": [
   "Open the PlazCode menu, then Automation.",
   "Use Offer to continue the previous chat to turn the question on or off.",
   "Click Save continuation file to download your unfinished work.",
   "In a new chat open Memory and use Load into selected chat."
  ],
  "tips": [],
  "related": [
   "limits",
   "mem-transfer"
  ],
  "keywords": [
   "continue",
   "continuation",
   "handoff",
   "previous chat",
   "resume",
   "new chat"
  ],
  "anchors": [
   "ctl:rs-continuation-offer",
   "ctl:rs-save-handoff"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "stop-mode",
  "title": "Stop mode",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Automation > Stop mode",
  "does": "Immediate Stop cancels tool waits at once (partial changes may remain). Safe Stop finishes the current step first.",
  "steps": [
   "Open the PlazCode menu, then Automation.",
   "Pick Immediate Stop or Safe Stop."
  ],
  "tips": [],
  "related": [
   "start"
  ],
  "keywords": [
   "stop",
   "safe stop",
   "immediate",
   "cancel"
  ],
  "anchors": [
   "ctl:rs-stop-mode"
  ],
  "surfaces": [
   "extension"
  ],
  "index": false
 },
 {
  "id": "sounds",
  "title": "Sound effects",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Automation > Sound effects",
  "does": "Plays a chime when the AI starts, finishes or hits an error.",
  "steps": [
   "Open the PlazCode menu, then Automation.",
   "Turn Sound effects on or off."
  ],
  "tips": [],
  "related": [],
  "keywords": [
   "sound",
   "sounds",
   "chime",
   "audio",
   "beep"
  ],
  "anchors": [
   "mode:sounds"
  ],
  "surfaces": [
   "extension"
  ],
  "index": false
 },
 {
  "id": "image-build",
  "title": "Build from a picture",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Image Build",
  "does": "Pastes a builder template into the chat. Attach a reference picture and send, and a picture-capable AI studies it, plans, builds and compares screenshots.",
  "steps": [
   "Open the PlazCode menu and find Image Build.",
   "Click Paste builder template.",
   "Attach your reference picture and send."
  ],
  "tips": [],
  "related": [
   "media"
  ],
  "keywords": [
   "image build",
   "picture",
   "build from image",
   "template",
   "reference"
  ],
  "anchors": [
   "menu:Image Build",
   "ctl:rs-i2m-btn"
  ],
  "surfaces": [
   "extension"
  ],
  "index": false
 },
 {
  "id": "instructions",
  "title": "Your own instructions",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Instructions",
  "does": "Text added under PlazCode's built-in prompt in every new session. The built-in prompt itself cannot be edited.",
  "steps": [
   "Open the PlazCode menu and find Instructions.",
   "Type your rules and click Save.",
   "Click Memory summary to open your saved memory."
  ],
  "tips": [],
  "related": [
   "memory"
  ],
  "keywords": [
   "instructions",
   "custom",
   "prompt",
   "rules",
   "system prompt"
  ],
  "anchors": [
   "menu:Instructions",
   "ctl:rs-set-save",
   "ctl:rs-memory-settings"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "blender",
  "title": "Connect Blender",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Connections > Blender MCP",
  "does": "Connects Blender so the AI can model there and export into Studio. It needs the Blender MCP addon running inside Blender.",
  "steps": [
   "Install the Blender MCP addon, open Blender and start its MCP server.",
   "Open the PlazCode menu, Connections.",
   "Click Connect Blender. Click Disconnect to stop."
  ],
  "tips": [],
  "related": [
   "mcp-add"
  ],
  "keywords": [
   "blender",
   "3d",
   "model",
   "addon",
   "mcp"
  ],
  "anchors": [
   "menu:Connections",
   "ctl:rs-mcp-blender",
   "ctl:rs-mcp-blender-off",
   "ctl:rs-blender-site"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "mcp-add",
  "title": "Add an MCP server",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Connections > Add server",
  "does": "Adds another tool server (MCP) the AI can use. It shows with a health dot.",
  "steps": [
   "Open the PlazCode menu, Connections.",
   "Type a name and the start command.",
   "Click Add server."
  ],
  "tips": [],
  "related": [
   "blender"
  ],
  "keywords": [
   "mcp",
   "server",
   "tools",
   "add server",
   "connection"
  ],
  "anchors": [
   "ctl:rs-mcp-add"
  ],
  "surfaces": [
   "extension"
  ],
  "index": false
 },
 {
  "id": "repair-link",
  "title": "Repair the Roblox Studio link",
  "group": "Menu",
  "where": "PlazCode menu (gear button on the bar) > Connections > Repair Studio link",
  "does": "Tries to fix the link between PlazCode and Roblox Studio when it stops working.",
  "steps": [
   "Open the PlazCode menu, Connections.",
   "Click Repair Studio link.",
   "If it still fails use Fix connection in the PlazCode toolbar popup."
  ],
  "tips": [],
  "related": [
   "popup"
  ],
  "keywords": [
   "repair",
   "fix",
   "studio link",
   "not connected",
   "disconnected",
   "connection"
  ],
  "anchors": [
   "ctl:rs-mcp-repair"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "memory",
  "title": "Memory (notes the AI remembers)",
  "group": "Memory",
  "where": "PlazCode menu (gear button on the bar) > Instructions > Memory summary",
  "does": "PlazCode remembers things about you and your projects so you do not repeat yourself. It has two parts: the Vault (a folder of notes) and Quick notes (short facts).",
  "steps": [
   "Open the PlazCode menu, then Instructions, then Memory summary.",
   "Use the Vault card for whole notes and Quick notes for short facts."
  ],
  "tips": [],
  "related": [
   "vault",
   "quick-notes"
  ],
  "keywords": [
   "memory",
   "remember",
   "notes",
   "vault",
   "quick notes"
  ],
  "anchors": [
   "surface:memory-page"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "quick-notes",
  "title": "Quick notes",
  "group": "Memory",
  "where": "Memory page > Quick notes",
  "does": "Short facts the AI reads before each task. Open a note to edit or remove it. Learn as I work lets PlazCode add notes by itself.",
  "steps": [
   "Open the Memory page.",
   "Click Add a note, type a title and the note, then click Add note.",
   "Turn Learn as I work on or off."
  ],
  "tips": [],
  "related": [
   "memory"
  ],
  "keywords": [
   "quick notes",
   "facts",
   "remember",
   "learn as i work",
   "add note"
  ],
  "anchors": [
   "surface:quick-notes"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "vault",
  "title": "Vault (a folder of linked notes)",
  "group": "Memory",
  "where": "Memory page > Vault",
  "does": "A folder of linked notes the AI reads before it starts and keeps up to date. It also opens in Obsidian.",
  "steps": [
   "Open the Memory page.",
   "Click Open vault to browse the notes and the graph.",
   "Turn Let the AI write notes on or off under More options."
  ],
  "tips": [],
  "related": [
   "vault-multi",
   "vault-import",
   "chat-notes"
  ],
  "keywords": [
   "vault",
   "obsidian",
   "notes",
   "folder",
   "graph",
   "brain"
  ],
  "anchors": [
   "surface:vault"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "vault-multi",
  "title": "Several vaults",
  "group": "Memory",
  "where": "Memory page > Vault > More options > Your vaults",
  "does": "Keep more than one vault and choose which one every chat uses. Your files are never deleted: removing only takes a vault off the list.",
  "steps": [
   "Open the Memory page, then Vault > More options.",
   "In Your vaults click Open next to a vault, or add one with a name and folder and click Add and open."
  ],
  "tips": [],
  "related": [
   "vault"
  ],
  "keywords": [
   "vaults",
   "several",
   "switch",
   "multiple",
   "open vault",
   "rename"
  ],
  "anchors": [
   "surface:vault-list"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "vault-import",
  "title": "Import a folder of notes",
  "group": "Memory",
  "where": "Memory page > Vault > Import a folder of notes",
  "does": "Copies the notes from a folder (for example an Obsidian vault) into your open vault. The original folder is never changed.",
  "steps": [
   "Open the Memory page.",
   "Click Import a folder of notes.",
   "Choose the folder, check the summary, then start the import.",
   "Read the Import report note afterwards for anything skipped."
  ],
  "tips": [],
  "related": [
   "vault"
  ],
  "keywords": [
   "import",
   "folder",
   "obsidian",
   "copy notes",
   "bring notes"
  ],
  "anchors": [
   "surface:vault-import"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "chat-notes",
  "title": "Chat notes",
  "group": "Memory",
  "where": "Vault > 11 Chats",
  "does": "Every chat is saved as a note in your vault with a summary, key points and Current tasks, so a new chat can pick up where the last stopped.",
  "steps": [
   "Open the vault and look in the 11 Chats folder.",
   "Open a chat note to read what was done."
  ],
  "tips": [],
  "related": [
   "vault",
   "continuation"
  ],
  "keywords": [
   "chat notes",
   "chats",
   "history",
   "current tasks",
   "summary"
  ],
  "anchors": [
   "surface:chat-notes"
  ],
  "surfaces": [
   "extension"
  ],
  "index": false
 },
 {
  "id": "mem-transfer",
  "title": "Save or move memory and chats",
  "group": "Memory",
  "where": "Memory page > Save or move memory and chats",
  "does": "Exports your memory and chats to a file, or loads them back, including into a fresh chat.",
  "steps": [
   "Open the Memory page.",
   "Open Save or move memory and chats and choose export or import."
  ],
  "tips": [],
  "related": [
   "backup",
   "continuation"
  ],
  "keywords": [
   "export",
   "import",
   "transfer",
   "move",
   "memory file",
   "load into chat"
  ],
  "anchors": [
   "surface:mem-transfer"
  ],
  "surfaces": [
   "extension"
  ],
  "index": false
 },
 {
  "id": "approval",
  "title": "Approval card",
  "group": "Cards",
  "where": "Card above the PlazCode bar",
  "does": "In Ask mode (and Plan mode) PlazCode shows a card before a change. It says what will happen in plain words. Nothing runs until you click Approve.",
  "steps": [
   "Read the card. Click Show details to see exactly what changes.",
   "Click Approve to run it, or Deny (or press Esc) to refuse.",
   "Approve all for this task skips repeats for the current task. Always approve stops asking about that action for good."
  ],
  "tips": [],
  "related": [
   "access",
   "always-appr",
   "plan-card"
  ],
  "keywords": [
   "approval",
   "approve",
   "deny",
   "allow",
   "card",
   "ask mode",
   "confirm",
   "permission"
  ],
  "anchors": [
   "surface:approval-card",
   "surface:approval-always"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "plan-card",
  "title": "Plan card",
  "group": "Cards",
  "where": "Card above the PlazCode bar (Plan mode)",
  "does": "Shows the AI's plan as numbered steps. After you approve, the AI works through them without asking again (deletes still ask).",
  "steps": [
   "Turn on Plan mode in the menu under Automation.",
   "Click Approve plan to start, Ask for changes to adjust it, or Deny to cancel."
  ],
  "tips": [],
  "related": [
   "plan-mode",
   "approval"
  ],
  "keywords": [
   "plan",
   "plan card",
   "steps",
   "approve plan",
   "ask for changes"
  ],
  "anchors": [
   "surface:plan-card"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "tool-cards",
  "title": "Action cards in the chat",
  "group": "Cards",
  "where": "Chat transcript",
  "does": "Each action the AI took shows as a card with the file and the lines added or removed. Open one to see tabs: CHANGES, RAW REQUEST and OUTPUT.",
  "steps": [
   "Click an action card in the chat to open it.",
   "Use the tabs to switch between what changed, the full request and the result."
  ],
  "tips": [],
  "related": [
   "run-log",
   "approval"
  ],
  "keywords": [
   "card",
   "chip",
   "action card",
   "diff",
   "changes",
   "tabs",
   "what did it do"
  ],
  "anchors": [
   "surface:tool-cards"
  ],
  "surfaces": [
   "extension"
  ],
  "index": true
 },
 {
  "id": "run-log",
  "title": "Run Log",
  "group": "Cards",
  "where": "Run Log button near the chat",
  "does": "A list of everything the AI did in this chat, newest first.",
  "steps": [
   "Click the Run Log button near the chat.",
   "Click an item to see its details."
  ],
  "tips": [],
  "related": [
   "action-log",
   "tool-cards"
  ],
  "keywords": [
   "run log",
   "log",
   "activity",
   "history",
   "what did it do"
  ],
  "anchors": [
   "bar:rs-cards-btn",
   "surface:run-log"
  ],
  "surfaces": [
   "extension"
  ],
  "index": false
 },
 {
  "id": "popup",
  "title": "The toolbar popup",
  "group": "Cards",
  "where": "Browser toolbar > PlazCode icon",
  "does": "A small panel with quick switches (engine, access, effort, plan, sounds), connection status and fix buttons.",
  "steps": [
   "Click the PlazCode icon in your browser toolbar.",
   "Use the switches, or Open on-page menu for all settings.",
   "Use Fix connection or Reconnect bridge if the status is red."
  ],
  "tips": [],
  "related": [
   "settings",
   "repair-link"
  ],
  "keywords": [
   "popup",
   "toolbar",
   "icon",
   "extension",
   "status",
   "fix connection",
   "reconnect",
   "restart"
  ],
  "anchors": [
   "surface:popup"
  ],
  "surfaces": [
   "extension"
  ],
  "index": false
 }
]/*GUIDE-JSON-END*/;

  const MAX_ENTRY_CHARS = 1500;
  const INDEX_MAX = 600;
  const byId = new Map(ENTRIES.map((entry) => [entry.id, entry]));

  function get(id) { return byId.get(String(id || "").trim().toLowerCase()) || null; }
  function list() { return ENTRIES.slice(); }
  function oneLine(entry) { return entry.id + ": " + entry.title; }

  function score(entry, words) {
    let total = 0;
    const title = entry.title.toLowerCase();
    const body = (entry.where + " " + entry.does).toLowerCase();
    for (const word of words) {
      if (entry.id === word) total += 10;
      else if (entry.id.indexOf(word) !== -1) total += 5;
      if (title.indexOf(word) !== -1) total += 6;
      if (entry.keywords.some((key) => key.toLowerCase() === word)) total += 4;
      else if (entry.keywords.some((key) => key.toLowerCase().indexOf(word) !== -1)) total += 2;
      if (body.indexOf(word) !== -1) total += 1;
    }
    return total;
  }

  function search(topic, limit) {
    const words = String(topic || "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 1);
    if (!words.length) return [];
    return ENTRIES.map((entry) => ({ entry, score: score(entry, words) }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit || 5)
      .map((hit) => hit.entry);
  }

  function render(entry) {
    const lines = [entry.title + " (" + entry.id + ")", "Where: " + entry.where, entry.does, "Steps:"];
    entry.steps.forEach((step, i) => lines.push((i + 1) + ". " + step));
    if (entry.tips && entry.tips.length) lines.push("Tip: " + entry.tips.join(" "));
    if (entry.related && entry.related.length) lines.push("Related: " + entry.related.join(", "));
    const text = lines.join("\n");
    return text.length > MAX_ENTRY_CHARS ? text.slice(0, MAX_ENTRY_CHARS - 1) + "…" : text;
  }

  const FOOTER = "\n\nAnswer in the user's language, in a few short numbered steps that say where to click. Say so plainly if the feature is not in this list.";

  // What the plazcode_features command returns.
  function answer(topic) {
    const text = String(topic || "").trim();
    if (!text) {
      return "PlazCode features (call plazcode_features {topic} with an id or a few words for the steps):\n" + ENTRIES.map((entry) => oneLine(entry)).join("\n");
    }
    const exact = get(text);
    if (exact) return render(exact) + FOOTER;
    const hits = search(text, 3);
    if (!hits.length) {
      return "No PlazCode feature matches \"" + text.slice(0, 60) + "\". Call plazcode_features with no topic to see the full list." + FOOTER;
    }
    return hits.map((entry) => render(entry)).join("\n\n---\n\n") + FOOTER;
  }

  // Short index for the startup text (the ids the AI can ask for).
  function indexLine(maxChars) {
    const cap = maxChars || INDEX_MAX;
    const ids = [];
    let used = 0;
    for (const entry of ENTRIES) {
      if (entry.index === false) continue;
      const add = (ids.length ? 2 : 0) + entry.id.length;
      if (used + add > cap) break;
      ids.push(entry.id);
      used += add;
    }
    return ids.join(", ");
  }

  return { ENTRIES, MAX_ENTRY_CHARS, INDEX_MAX, get, list, search, answer, indexLine };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodeFeatureGuide;
