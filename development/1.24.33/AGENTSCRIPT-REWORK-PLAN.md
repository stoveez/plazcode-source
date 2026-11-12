# Blender in RobloxScript + AgentScript control rework (owner request, 2026-11-12)

Owner's request (2026-11-12): (1) Blender commands must work fully in RobloxScript, as in AgentScript; importing models into Studio should be WAY easier. (2) AgentScript rework, same core features: tab/desktop control like Claude in Chrome (theme glow around the screen edges, a visible AI cursor, works for websites AND desktop apps), a LIVE preview of what it controls shown in the chat (click to enlarge into a side panel), and an "Ask PlazCode" screen-sharing side chat like Chrome's "Ask Gemini". Reference screenshots were Claude in Chrome and Ask Gemini; PlazCode builds its OWN look in the PlazCode theme, not a copy.

## Owner decisions (2026-11-12: "recommended" to all 12 questions)
1. Blender in RobloxScript: reported by users as "can't use Blender tools / can't model while on RobloxScript". Trace and fix whatever blocks it.
2. "Importing is WAY easier" = one command: the AI models in Blender, runs send-to-Studio, and the model lands in Studio as a ready MeshPart (right size, facing the right way, with colours). No saving files, no extra steps.
3. Control both: website tabs (extension: the tab named, or the current one; glow around the page edges in the PlazCode theme colour; "PlazCode is working here" label with Stop; an AI cursor) and desktop apps (the PlazCode app draws the same glow, label and cursor as a see-through, click-through layer over the whole screen).
4. If the person touches the mouse or keyboard while the AI controls: the AI pauses ("Paused, you're in control" + Resume).
5. Live preview: a card in the AI chat with the live picture (a few frames a second); click to enlarge into the browser's side panel. No preview when the AI controls the tab/window the person is looking at, or while already sharing.
6. Approval: the existing approval modes decide (Ask before changes asks before each click/typing; Always approve just goes). Stop always works.
7. "Ask PlazCode" button: Chrome does not let extensions add a title-bar button, so: the pinned PlazCode toolbar icon, a keyboard shortcut (e.g. Alt+P) and a small button in the PlazCode bar, all opening the same side chat in the browser's side panel.
8. The side chat uses the AI site the person already uses with PlazCode (driven in a background tab, like helper agents). No new account or API key.
9. "Live" = every message automatically includes a fresh picture of what is shared; the panel shows the live view the whole time; control on request uses the glow/cursor control (3, 4).
10. Share the current tab by default; "Share my whole screen" for desktop apps (Mac: Screen Recording + Accessibility permission once, PlazCode walks the person through it).
11. Keep every AgentScript tool and feature; rework the control layer, visuals, preview and sharing only. No other page redesign unless asked.
12. Order: first the Blender-in-RobloxScript fix (goes into 1.24.33), then finish Apps & servers steps 6 to 8 (already done by another chat on 2026-11-11/12 when this was written), then the AgentScript rework as its own update (1.24.34).

## Part 1: Blender in RobloxScript (2026-11-12, in progress)
Work in `development/1.24.33/overlay` (the 1.24.33 working tree since 2026-11-11). The traced line numbers below were in the 1.24.32 copy; find the code by name.
**Findings (traced in the real AI-tab code with the browser fixture `release-tools/test-approval-modes-browser.cjs`):** a Blender command the AI sends DOES reach Blender in RobloxScript, the same as in AgentScript. What stops the AI is what it is told:
- `list_commands` in RobloxScript lists only Studio commands; Blender's are only shown for `list_commands {server:"blender"}`, which nothing tells the AI to do.
- With Studio closed, `list_commands` answers "Roblox Studio is currently OFFLINE ... Tell the user ... to open their place" even when Blender is connected, so the AI stops instead of modelling.
- The tab caches its command list; if Blender connects after the chat started, `list_commands {server:"blender"}` answers "no server named blender is connected" until the cache expires.
- The status line says "MODE LOCK: stay on ROBLOXSCRIPT", which an AI can read as "Blender is another mode".
- The old "Connect Blender (N-panel → Start MCP Server)" error text predates Apps & servers.
- The detailed Blender help topic is offered in RobloxScript only (lean-startup `engines: [R]`); AgentScript never gets it.
**Plan (extension only: reloading the extension is enough):** (a) `list_commands` adds a "Blender is connected too" block with Blender's command names whenever Blender is on, in both modes; (b) the Studio-offline answer says Blender work can go ahead now and only the import into Studio needs Studio; (c) a server that the bridge reports alive but the cache lacks forces one fresh tool fetch; (d) the status line says Blender commands belong to this mode when BLENDER ON; (e) Blender help topic in both modes; (f) the old error text points at Apps & servers. Then (g) review `blender_send_to_studio` (owner decision 2) for size, facing and colours, end to end. Test: new browser test in RobloxScript with Studio open and closed, Blender connected before and after the chat started.

## Part 2: AgentScript control rework (NOT STARTED; planned for 1.24.34 after Apps & servers)
Existing pieces to build on (read first): extension tab tools `tab_read` / `tab_click` / `tab_type` / `tab_scroll` (`background.js`), desktop tools `screen_capture`, `mouse_move`, `mouse_click`, `key_type`, `list_windows`, `focus_window`, `window_screenshot` (`agent/src/workspace.rs`, FULL access only). A detailed plan with security review goes here before any code.
