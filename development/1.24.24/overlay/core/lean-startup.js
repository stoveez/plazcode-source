// SPDX-License-Identifier: GPL-3.0-or-later
// core/lean-startup.js - the SHORT startup message and the on-demand help behind it ("lean startup").
//
// Today every chat starts with up to ~42,500 characters (Roblox, full) or ~14,000 (compact) that the AI mostly never
// needs. This module holds the replacement, and it is NOT wired into anything yet:
//   - buildLeanCore({engine, provider, siteName, fullAccess}) : the short message (identity + marker first, how to write
//     a command, the ###LUA### format, the few safety rules that must never be missed, the command families, a pointer to
//     plazcode_help, and the startup handshake).
//   - helpFor({topic, command, engine}) : what the AI gets from the plazcode_help tool. Topics are cut out of the REAL
//     prompt builders (core/config.js and friends) at call time, so the wording cannot drift from the full prompt. An
//     unknown topic or command never dead-ends: it returns the topic list.
//   - routeTopics(request) / createTracker() / pushFor(): which topics to attach to a user request, once per chat.
//   - ANCHORS / coverage(): key phrases of the full prompt, so a test can prove nothing was lost.
// Load order: after core/config.js (and luau-knowledge, chat-creators, clarification, ultracode). Nothing here touches the
// page or the network.
(function (root, factory) {
  const api = factory(root);
  if (root) root.PlazCodeLeanStartup = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  const SYS_MARKER = "⟦RS-SYS⟧"; // same marker as RS.SYS_MARKER (core/config.js); the message must start with it
  const CORE_MAX_CHARS = 4500;     // size cap for buildLeanCore (a test enforces it)
  const HELP_MAX_CHARS = 32000;    // no plazcode_help reply may be longer than this
  const DEFAULT_SITE = "this AI site";
  const BT = "```";

  // ── Where the real text lives ──────────────────────────────────────────────────────────────────────────────────
  // Everything is looked up when it is needed (never copied at load time) so a later edit to the full prompt flows
  // straight into the help topics. `use()` lets a node test that load the file with require() hand the pieces over.
  let injected = {};
  function use(sources) { injected = sources && typeof sources === "object" ? { ...sources } : {}; }
  function pick(name, probe) {
    if (injected[name]) return injected[name];
    try { return probe(); } catch { return null; }
  }
  const getRS = () => pick("RS", () => (typeof RS !== "undefined" ? RS : null));
  const getClarification = () => pick("Clarification", () => (typeof PlazCodeClarification !== "undefined" ? PlazCodeClarification : null));
  const getUltracode = () => pick("Ultracode", () => (typeof PlazCodeUltracode !== "undefined" ? PlazCodeUltracode : null));
  const getWindow = () => pick("window", () => (typeof window !== "undefined" ? window : null));

  // The full builders are asked for the COMPLETE text on purpose: leanStartup:false is the contract with the (later)
  // wiring in config.js, so these topics stay the real full text even once lean mode is switched on for chats.
  function reference(kind, siteName) {
    const rs = getRS();
    if (!rs || typeof rs.buildSystemPrompt !== "function") return "";
    const base = { siteName: siteName || DEFAULT_SITE, leanStartup: false, customPrompt: "", providerNotes: "" };
    try {
      if (kind === "roblox") return rs.buildSystemPrompt({ ...base, engine: "roblox", maxChars: 0 });
      // maxChars below the full size makes the builder return its compact text (it picks the shorter one).
      if (kind === "compact") return rs.buildSystemPrompt({ ...base, engine: "roblox", maxChars: 1000 });
      if (kind === "local") return rs.buildSystemPrompt({ ...base, engine: "local", maxChars: 0 });
      if (kind === "localAccess") return rs.buildSystemPrompt({ ...base, engine: "local", maxChars: 0, fullAccess: true });
      if (kind === "blender") {
        // The Blender text is only in the prompt while the Blender mode hook says so: borrow the hook for one call.
        const w = getWindow();
        if (!w) return "";
        const had = Object.prototype.hasOwnProperty.call(w, "__rsBlender"), previous = w.__rsBlender;
        w.__rsBlender = () => true;
        try { return rs.buildSystemPrompt({ ...base, engine: "roblox", maxChars: 0 }); }
        finally { if (had) w.__rsBlender = previous; else delete w.__rsBlender; }
      }
    } catch { /* fall through */ }
    return "";
  }

  // Text cutting helpers. They return "" when an anchor is missing, so drift shows up as an empty piece (a test fails)
  // instead of the cut silently swallowing the rest of the prompt.
  function cut(text, from, to) {
    const a = text.indexOf(from);
    if (a < 0) return "";
    let b = text.length;
    if (to) { b = text.indexOf(to, a + from.length); if (b < 0) return ""; }
    return text.slice(a, b).trim();
  }
  function para(text, from) { // from `from` to the next blank line (or the end)
    const a = text.indexOf(from);
    if (a < 0) return "";
    const b = text.indexOf("\n\n", a);
    return text.slice(a, b < 0 ? text.length : b).trim();
  }
  function line(text, from) { // one bullet: from `from` to the end of its line
    const a = text.indexOf(from);
    if (a < 0) return "";
    const b = text.indexOf("\n", a);
    return text.slice(a, b < 0 ? text.length : b).trim();
  }
  const join = (...parts) => parts.filter(Boolean).join("\n\n");

  // Lazy, per-call memo of the reference texts.
  function sources(siteName) {
    const memo = {};
    const lazy = (key, make) => () => (key in memo ? memo[key] : (memo[key] = make()));
    return {
      full: lazy("full", () => reference("roblox", siteName)),
      compact: lazy("compact", () => reference("compact", siteName)),
      local: lazy("local", () => reference("local", siteName)),
      localAccess: lazy("localAccess", () => reference("localAccess", siteName)),
      blender: lazy("blender", () => reference("blender", siteName)),
      clarify: lazy("clarify", () => { const c = getClarification(); return c && c.INSTRUCTION ? String(c.INSTRUCTION).trim() : ""; }),
      ultra: lazy("ultra", () => {
        const u = getUltracode();
        if (!u || typeof u.build !== "function") return "";
        try { return String(u.build("roblox", "", 0) || "").trim(); } catch { return ""; }
      }),
    };
  }

  // ── Topics ─────────────────────────────────────────────────────────────────────────────────────────────────────
  // engines: where the topic applies. build(s): the text, cut from the real prompt. must: phrases the text has to
  // contain (the test checks them, so a reworded section is noticed). aliases: other names, already normalised.
  const R = "roblox", L = "local", BOTH = [R, L];
  const TOPIC_DEFS = [
    {
      name: "rules", engines: [R], aliases: ["safety", "core", "core-rules", "rule"],
      title: "the command, safety and finishing rules in full",
      must: ["NEVER HALLUCINATE a Studio", "PERFECT CREATION", "UNDERSTAND THE REQUEST", "NEVER DELETE", "NEVER CLAIM THE BRIDGE", "ONE command block per reply", "YOU CAN ACT DIRECTLY IN THE USER'S PROJECT"],
      build: s => join(cut(s.full(), "- ONE command block per reply", "- execute_luau: wrap code in BOTH markers"), cut(s.full(), "- BUILD UI/OBJECTS FIRST", "━━━ PROJECT MEMORY"), cut(s.full(), "━━━ YOU CAN ACT DIRECTLY", "STUDIO SKILLS & VIRTUAL TOOLS")),
    },
    {
      name: "play-mode", engines: [R], aliases: ["play", "playtest", "execute-luau", "luau-markers"],
      title: "execute_luau markers and what to do while Studio is playing",
      must: ["PLAY-MODE RULE", "###LUA:Server###", "start_stop_play"],
      build: s => cut(s.full(), "- execute_luau: wrap code in BOTH markers", "- BUILD UI/OBJECTS FIRST"),
    },
    {
      name: "luau", engines: [R], aliases: ["code", "coding", "scripting", "doctrine", "luau-doctrine", "scripts"],
      title: "Roblox/Luau engineering doctrine (structure, cleanup, performance, style)",
      must: ["UNIVERSAL ROBLOX/LUAU ENGINEERING DOCTRINE", "SCOPE CONTAINMENT + EVIDENCE", "LIFECYCLE + RESOURCE OWNERSHIP", "NATIVE-FIRST ARCHITECTURE", "PRESENTATION DIVIDE", "luau_guidance"],
      build: s => cut(s.full(), "━━━ UNIVERSAL ROBLOX/LUAU ENGINEERING DOCTRINE", "PlazCode MOTION/VFX RULES:"),
    },
    {
      name: "studio-gui", engines: [R], aliases: ["ui", "gui", "hud", "interface", "screengui", "ui-rules"],
      title: "building and restyling UI / HUD / ScreenGuis",
      must: ["MODERN UI & HUD", "GUI MUTATION", "ui_build", "ui_set_property"],
      build: s => join(cut(s.full(), "- MODERN UI & HUD", "- FX & PARTICLES"), cut(s.full(), "- GUI MUTATION", "- ASSET BRIDGE:"), cut(s.full(), "For new UI and reference reconstruction", "PRESENTATION DIVIDE")),
    },
    {
      name: "animation", engines: [R], aliases: ["anim", "animations", "animation-tools", "keyframes"],
      title: "animation_* tools: build, pose, preview and fix real animations",
      must: ["ANIMATION TOOLS", "animation_test", "animation_set_pose", "animation_rebuild"],
      build: s => cut(s.full(), "ANIMATION TOOLS:", "IMPORTANT: Your very first action"),
    },
    {
      name: "motion", engines: [R], aliases: ["vfx", "motion-vfx", "effects", "fx-rules"],
      title: "wiring animation IDs, finding and copying existing VFX",
      must: ["MOTION/VFX RULES", "motion_scan", "motion_bundle_copy", "motion_integrate"],
      build: s => cut(s.full(), "PlazCode MOTION/VFX RULES:", "- ONE command block per reply"),
    },
    {
      name: "studio-skills", engines: [R], aliases: ["skills", "studio", "virtual-tools", "production-tools"],
      title: "lighting, FX, audio, terrain, camera, data, networking, gameplay, plugins, asset bridge",
      must: ["STUDIO SKILLS & VIRTUAL TOOLS", "lighting_set_preset", "fx_create_emitter", "datastore_setup", "npc_spawn_pathfinding", "script_analysis", "ASSET BRIDGE"],
      build: s => join(cut(s.full(), "STUDIO SKILLS & VIRTUAL TOOLS", "- MODERN UI & HUD"), cut(s.full(), "- FX & PARTICLES", "- WEB:"), cut(s.full(), "- STUDIO PLUGINS:", "- GUI MUTATION"), cut(s.full(), "- ASSET BRIDGE:", "ANIMATION TOOLS:")),
    },
    {
      name: "web", engines: [R], aliases: ["search", "web-search", "web-fetch", "fetch"],
      title: "web_search and web_fetch",
      must: ["web_search", "web_fetch"],
      build: s => cut(s.full(), "- WEB:", "- SCREENSHOT:"),
    },
    {
      name: "screenshots", engines: [R], aliases: ["screenshot", "images", "image", "attach", "vision"],
      title: "taking screenshots and attaching images",
      must: ["plazcode_screenshot", "attach_feedback"],
      build: s => cut(s.full(), "- SCREENSHOT:", "- STUDIO PLUGINS:"),
    },
    {
      name: "creators", engines: [R], aliases: ["chat-creators", "creation", "model-creation", "creator"],
      title: "making Roblox models and UI with creation_preview / creation_insert",
      must: ["CHAT MODEL/UI CREATION", "creation_insert", "headless_build"],
      build: s => para(s.full(), "CHAT MODEL/UI CREATION:"),
    },
    {
      name: "blender", engines: [R], aliases: ["bpy", "blender-mcp"],
      title: "Blender tools and the Blender-to-Studio pipeline",
      must: ["BLENDER MCP IS CONNECTED", "blender_send_to_studio", "blender_material_create"],
      build: s => para(s.blender(), "━━━ BLENDER MCP IS CONNECTED"),
    },
    {
      name: "debug-agents", engines: [R], aliases: ["debug", "agents", "agent", "auto-debug"],
      title: "plazcode_debug, plazcode_agent and the automatic debugger",
      must: ["plazcode_debug", "plazcode_agent"],
      build: s => join(line(s.compact(), "- DEBUG & AGENTS:"), para(s.full(), "━━━ AUTOMATIC DEBUGGER")),
    },
    {
      name: "developer-products", engines: [R], aliases: ["products", "devproducts", "developer-product", "robux"],
      title: "creating Developer Products on the published universe",
      must: ["DEVELOPER PRODUCTS", "developer_product_create"],
      build: s => line(s.compact(), "- DEVELOPER PRODUCTS:"),
    },
    {
      name: "modes", engines: [R], aliases: ["mode-lock", "system-state", "engine", "state"],
      title: "SYSTEM_STATE and staying on the current engine",
      must: ["MODE LOCK", "SYSTEM_STATE", "plazcode_status"],
      build: s => line(s.compact(), "- MODE LOCK:"),
    },
    {
      name: "agentscript", engines: [L], aliases: ["local", "files", "workspace", "terminal", "local-rules"],
      title: "AgentScript: workspace files, terminal, editing and error-recovery rules",
      must: ["AGENTSCRIPT", "AUTO-ACTION PROTOCOL", "SILENT ERROR RECOVERY", "DIFF-FIRST EDITING", "STATE LINE", "DESTRUCTIVE ACTIONS", "WORK LIKE A REAL DEVELOPER", "read_file_base64"],
      build: s => join(cut(s.local(), "AGENTSCRIPT gives you FULL control", "⚠️ FORMATTING RULE"), cut(s.local(), "━━━ AUTO-ACTION PROTOCOL", "YOU CAN ACT DIRECTLY ON THE USER")),
    },
    {
      name: "full-access", engines: [L], aliases: ["fullaccess", "pc-access", "full-pc-access"],
      title: "what FULL PC ACCESS adds (absolute paths, processes) and what still needs confirming",
      must: ["FULL PC ACCESS IS ON", "process_kill"],
      build: s => cut(s.localAccess(), "━━━ FULL PC ACCESS IS ON", "YOU CAN ACT DIRECTLY ON THE USER"),
    },
    {
      name: "memory", engines: BOTH, aliases: ["project-memory", "notes", "handoff"],
      title: "the project memory: when to read it, how to create and update it",
      must: ["PROJECT MEMORY", "READ IT WHEN THE WORK NEEDS IT", "KEEP IT UPDATED", "IF SOMETHING CONTRADICTS THE MEMORY", "NEVER PERSIST A GUESS AS A FACT", "PLAZCODE_MEMORY.md"],
      build: s => cut(s.full(), "━━━ PROJECT MEMORY", "━━━ YOU CAN ACT DIRECTLY"),
    },
    {
      name: "checklist", engines: BOTH, aliases: ["tasks", "task", "goal", "goals", "todo", "task-checklist"],
      title: "plazcode_checklist, the Goal line and progress notes",
      must: ["TASK CHECKLIST", "plazcode_checklist", "plazcode_skills"],
      build: s => para(s.full(), "TASK CHECKLIST:"),
    },
    {
      name: "scope", engines: BOTH, aliases: ["request-scope", "conversation", "greeting"],
      title: "which messages are conversation and which are tracked work",
      must: ["REQUEST SCOPE"],
      build: s => para(s.full(), "REQUEST SCOPE:"),
    },
    {
      name: "mcp", engines: BOTH, aliases: ["mcp-use", "servers", "contextual-mcp"],
      title: "using other connected MCP servers (Sequential Thinking, Context7, Memory)",
      must: ["CONTEXTUAL MCP USE", "list_mcp_servers", "Other MCP servers may ALSO be connected"],
      build: s => join(cut(s.full(), "Other MCP servers may ALSO be connected", "You do not need any special capability"), para(s.full(), "CONTEXTUAL MCP USE:")),
    },
    {
      name: "clarify", engines: BOTH, aliases: ["clarification", "ask", "before-acting"],
      title: "asking the user to choose with plazcode_clarify",
      must: ["BEFORE ACTING", "plazcode_clarify"],
      build: s => s.clarify(),
    },
    {
      name: "ultra", engines: BOTH, aliases: ["ultracode", "ultralab"],
      title: "Ultra working mode and its skill index",
      must: ["ULTRA"],
      build: s => s.ultra(),
    },
  ];

  const TOPICS = {};   // name -> () => text, built from the real prompt on each call
  const BY_NAME = {};
  const ALIASES = {};
  for (const def of TOPIC_DEFS) {
    BY_NAME[def.name] = def;
    ALIASES[def.name] = def.name;
    for (const alias of def.aliases) { if (!ALIASES[alias]) ALIASES[alias] = def.name; }
  }
  const normalise = value => String(value == null ? "" : value).toLowerCase().trim().replace(/[\s_/\\]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const normEngine = engine => (engine === "local" ? L : R); // unreal / anim fold into roblox, like the rest of PlazCode
  const available = (def, engine) => def.engines.includes(normEngine(engine));

  function topicText(name, siteName) {
    const def = BY_NAME[name];
    if (!def) return "";
    let text = "";
    try { text = def.build(sources(siteName)) || ""; } catch { text = ""; }
    return text.trim();
  }
  // TOPICS is a live view: TOPICS.luau is the current text of that topic ("topic -> text").
  for (const def of TOPIC_DEFS) Object.defineProperty(TOPICS, def.name, { enumerable: true, get: () => topicText(def.name) });
  Object.freeze(TOPICS);

  function listTopics(engine) {
    return TOPIC_DEFS.filter(def => available(def, engine || R)).map(def => ({ name: def.name, aliases: def.aliases.slice(), title: def.title }));
  }
  function topicListText(engine) {
    const rows = listTopics(engine).map(t => `- ${t.name}: ${t.title}`);
    return "Topics for plazcode_help {topic}:\n" + rows.join("\n") + "\nAlso: plazcode_help {command:\"command_name\"} shows what is known about one command. list_commands always has the exact parameters.";
  }
  function resolveTopic(name) {
    const key = normalise(name);
    return key && ALIASES[key] ? ALIASES[key] : "";
  }

  // ── Help (the plazcode_help tool) ──────────────────────────────────────────────────────────────────────────────
  const COMMAND_TOPIC = [
    [/^animation_/, "animation"], [/^(?:ui_|decal_set$|mesh_set_texture$|surface_gui_create$)/, "studio-gui"], [/^(?:motion_|vfx_)/, "motion"],
    [/^(?:lighting_|fx_|audio_|terrain_|camera_|diagnostics_|datastore_|leaderboard_|remote_setup$|teams_setup$|npc_|proximity_|tween_|marketplace_|plugin_|script_analysis$|asset_bridge)/, "studio-skills"],
    [/^blender_/, "blender"], [/^web_/, "web"], [/^(?:creation_|headless_)/, "creators"], [/^(?:plazcode_screenshot$|attach_|take_screenshot$|screenshot$)/, "screenshots"],
    [/^plazcode_checklist$/, "checklist"], [/^developer_product|^create_dev/, "developer-products"], [/^plazcode_(?:debug|agent)$/, "debug-agents"],
    [/^plazcode_clarify$/, "clarify"], [/^(?:start_stop_play|execute_luau)$/, "play-mode"], [/^plazcode_status$/, "modes"], [/^luau_guidance$/, "luau"],
  ];
  const escapeRe = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function capReply(text) {
    if (text.length <= HELP_MAX_CHARS) return text;
    return text.slice(0, HELP_MAX_CHARS - 80).trimEnd() + "\n[Shortened to fit one reply. Ask for a narrower topic.]";
  }

  function commandHelp(rawName, engine, siteName) {
    const name = String(rawName == null ? "" : rawName).trim().replace(/^`+|`+$/g, "");
    if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(name)) return "";
    const rs = getRS();
    const notes = rs && rs.TOOL_NOTES && typeof rs.TOOL_NOTES[name] === "string" ? rs.TOOL_NOTES[name] : "";
    const matcher = new RegExp("(?<![A-Za-z0-9_])" + escapeRe(name) + "(?![A-Za-z0-9_])");
    const s = sources(siteName);
    const found = [];
    for (const def of TOPIC_DEFS) {
      if (!available(def, engine)) continue;
      let text = "";
      try { text = (def.build(s) || "").trim(); } catch { text = ""; }
      const lines = text.split("\n").filter(line => matcher.test(line));
      for (const line of lines) {
        let shown = line;
        if (line.length > 3000) { // one huge paragraph: show a window around the first mention
          const at = line.search(matcher);
          shown = (at > 600 ? "..." : "") + line.slice(Math.max(0, at - 600), at + 1400) + (at + 1400 < line.length ? "..." : "");
        }
        found.push(`From topic "${def.name}":\n${shown.trim()}`);
        if (found.length >= 4) break;
      }
      if (found.length >= 4) break;
    }
    const prefixTopic = (COMMAND_TOPIC.find(([pattern]) => pattern.test(name)) || [])[1];
    if (!found.length && !notes) {
      if (prefixTopic && BY_NAME[prefixTopic] && available(BY_NAME[prefixTopic], engine)) {
        const text = topicText(prefixTopic, siteName);
        if (text) return `PlazCode help - command "${name}" belongs to topic "${prefixTopic}":\n\n${text}\n\nlist_commands has its exact parameters.`;
      }
      return "";
    }
    return [`PlazCode help - command "${name}"`, notes ? "Notes: " + notes : "", ...found, "list_commands has the exact parameters. Related topic" + (prefixTopic ? `: ${prefixTopic}` : "s: see the topic list.")].filter(Boolean).join("\n\n");
  }

  // helpFor({topic, command, engine, siteName}) -> text for the AI. Never empty, never an error object.
  function helpFor(args) {
    const a = args && typeof args === "object" ? args : (typeof args === "string" ? { topic: args } : {});
    const engine = normEngine(a.engine), siteName = a.siteName || DEFAULT_SITE;
    const wantTopic = a.topic != null && String(a.topic).trim() !== "";
    const wantCommand = a.command != null && String(a.command).trim() !== "";
    const parts = [];
    if (wantCommand) {
      const text = commandHelp(a.command, engine, siteName);
      if (text) parts.push(text);
      else if (!wantTopic) return capReply(`No built-in reference for command "${String(a.command).trim().slice(0, 80)}". It may not exist: use only names from list_commands, and never invent one.\n\n${topicListText(engine)}`);
    }
    if (wantTopic) {
      const name = resolveTopic(a.topic);
      const shown = String(a.topic).trim().slice(0, 60);
      if (!name) {
        const key = normalise(a.topic);
        const near = key ? TOPIC_DEFS.filter(def => available(def, engine) && (def.name.includes(key) || key.includes(def.name))).map(def => def.name) : [];
        parts.push(`Unknown topic "${shown}".` + (near.length ? ` Did you mean: ${near.join(", ")}?` : "") + "\n\n" + topicListText(engine));
      } else if (!available(BY_NAME[name], engine)) {
        const other = engine === L ? "Roblox Studio" : "AgentScript (local files)";
        parts.push(`Topic "${name}" is for ${other}, not this mode.\n\n${topicListText(engine)}`);
      } else {
        const text = topicText(name, siteName);
        if (!text) parts.push(`Topic "${name}" could not be loaded right now. Continue with list_commands for exact parameters and the rules already given.\n\n${topicListText(engine)}`);
        else parts.push(`PlazCode help - topic "${name}"\n\n${text}`);
      }
    }
    if (!parts.length) return capReply(topicListText(engine));
    return capReply(parts.join("\n\n"));
  }

  // ── The lean core ──────────────────────────────────────────────────────────────────────────────────────────────
  function robloxCore(site) {
    return [
      SYS_MARKER,
      "PlazCode is a browser extension running in this page. It reads your replies, runs any command you write against the user's live Roblox Studio through a local bridge, and sends the real result back as the next message (success or ERROR). " +
        `This site's own tools cannot reach Studio: commands are plain text in your normal reply, the only channel that works. Internal reasoning is fine. Do not use ${site}'s own features unless the user asks.`,
      "",
      "FORMATTING RULE (MANDATORY): every command goes inside a fenced code block, or this page's Markdown corrupts it. ONE command block per reply; wait for its result. Never end a turn only announcing a command: write it, or give the final answer.",
      BT + "json",
      '{"command": "name", "params": {"key": "value"}}',
      BT,
      "execute_luau never uses JSON. Put the markers and the code inside one fenced block, no escaping:",
      BT,
      "###LUA###",
      "-- Luau code",
      'return "result"',
      "###END_LUA###",
      BT,
      'Bare ###LUA### runs in Edit mode only and fails while Studio is playing; ###LUA:Server### / ###LUA:Client### are for temporary live tests. Use return for output (print is not captured), never yield (about 20s budget), and always WaitForChild("X", 5) with a timeout.',
      "",
      "RULES:",
      "- Use ONLY command names and parameters that list_commands shows. A command not listed DOES NOT EXIST: never invent one.",
      "- NEVER HALLUCINATE a Studio ID: there is one auto-connected place. Never ask for studio_id/place ID or call list_roblox_studios and the like.",
      '- PLAY-MODE RULE: while Play runs, bare execute_luau fails. To keep a change, call start_stop_play {"is_start": false}, edit, then restart Play.',
      "- NEVER DELETE broadly: before any Destroy, ClearAllChildren or script removal, make sure the target is exactly what the user named; ask when unsure.",
      "- NEVER CLAIM THE BRIDGE IS OFFLINE without running a command this turn; an old error proves nothing.",
      "- UNDERSTAND THE REQUEST: the latest user message is the spec; do not gold-plate. PERFECT CREATION: done means it exists in Studio, named, styled, playable and verified (inspect_instance / ui_list_tree / script_analysis), not a grey stub or TODO.",
      "- On ERROR read it and adapt; on a property or enum error list the valid options before retrying. Every result ends with SYSTEM_STATE: stay on that engine.",
      "- Act directly: run commands yourself rather than giving the user instructions; show code only if asked.",
      "- Final answers: one short plain-text sentence, no Markdown or fences, then stop. A greeting, thanks, question or command list is conversation, not a task: answer briefly, no checklist.",
      '- A multi-step task: call plazcode_checklist first and start that reply with "Goal: <at most 8 words>". Unclear scope: plazcode_clarify before changing anything.',
      "- Project memory: the first time a task needs project understanding, script_read game.ServerStorage.RobloxScript.Memory (PLAZCODE_MEMORY.md for local files).",
      "- If the user names another app (Blender, Sketchfab...), run list_mcp_servers FIRST, before replying.",
      "",
      "COMMANDS (parameters come from list_commands): execute_luau, multi_edit, script_read, inspect_instance, start_stop_play | ui_build, ui_set_*, ui_list_tree | lighting_*, fx_*, audio_*, terrain_*, camera_set_style, diagnostics_*, datastore_setup, remote_setup, teams_setup, npc_spawn_pathfinding, proximity_setup, tween_create, marketplace_setup, script_analysis | animation_*, motion_*, vfx_build | web_search, web_fetch, plazcode_screenshot, attach_feedback | plazcode_status, plazcode_debug, plazcode_agent, plazcode_checklist, plazcode_clarify, plazcode_skills | list_mcp_servers.",
      "",
      "HELP ON DEMAND: before an area you have no rules for, call plazcode_help {topic} (or {command:\"name\"}). Topics: luau, studio-gui (UI/HUD), animation, motion (VFX), studio-skills, play-mode, rules, memory, checklist, scope, mcp, creators, web, screenshots, blender, debug-agents, modes. An unknown topic returns the list.",
      "",
      'IMPORTANT: Your very first action is to write `list_commands` with no params and never guess a command or parameter that is not in its result. Do NOT call `list_mcp_servers` at startup. After the list_commands result, reply with exactly "PlazCode is ready." and nothing else, then wait for the first request (do not read or create project memory yet). If that first list_commands comes back Studio-offline, run `list_mcp_servers` once, tell the user in one short sentence that Roblox is offline, list what else is connected, then ask what they want to do and wait.',
    ].join("\n");
  }

  function localCore(site, fullAccess) {
    return [
      SYS_MARKER,
      "PlazCode is a browser extension running in this page, in AGENTSCRIPT mode. It reads your replies, runs any command you write against the connected local engine (the user's project folder, called the workspace: files, search, terminal, system tools) and sends the real result back as the next message (success or ERROR). " +
        `Do not use ${site}'s own features unless the user asks.`,
      "",
      "FORMATTING RULE (MANDATORY): every command goes inside a fenced code block, or this page's Markdown corrupts it. ONE command per reply; wait for its result.",
      BT + "json",
      '{"command": "name", "params": {"key": "value"}}',
      BT,
      "",
      "RULES:",
      "- Use ONLY command names and parameters that list_commands shows, with every required parameter.",
      "- AUTO-ACTION PROTOCOL: when the goal is clear, ACT NOW and write the command in the same reply; never only announce intent. Pipeline: read_file, then edit_file, then VERIFY with run_command (tests, build), read the output, fix, rerun.",
      "- SILENT ERROR RECOVERY: run_command returns stdout, stderr and the exit code to you. Never ask the user to paste terminal output; fix it yourself and ask only when truly blocked.",
      "- DIFF-FIRST EDITING: change existing files only with edit_file (old_string to new_string patches); write_file is for NEW files. Read the file first so old_string matches exactly.",
      "- STATE LINE: every result ends with [SYSTEM_STATE: ...], the ground truth about connection, workspace root and sandbox. If it is missing the engine is offline: say so in one sentence and stop.",
      "- Paths are relative to the workspace; absolute paths are refused unless FULL PC ACCESS is on." + (fullAccess ? " FULL PC ACCESS IS ON now: absolute paths, process_kill, open_path and download_file work anywhere, but confirm before destructive actions outside the project." : ""),
      "- DESTRUCTIVE ACTIONS: delete_path cannot be undone. Before deleting more than the one file the user named, confirm the scope.",
      "- WORK LIKE A REAL DEVELOPER: explore first (tree, grep_files), read before editing, make focused edits, ship a finished change, stay on THIS request.",
      "- Images and binaries: read_file_base64 {path}; attach_feedback {path} puts a file or the latest screenshot in the chat.",
      "- Final answers: short and plain. A greeting, thanks or question is conversation, not a task.",
      '- A multi-step task: call plazcode_checklist first and start that reply with "Goal: <at most 8 words>". Unclear scope: plazcode_clarify before changing anything.',
      "",
      "COMMANDS (parameters come from list_commands): tree, list_directory, search_files, grep_files, read_file, read_file_base64, write_file, edit_file, append_file, copy_file, move_path, delete_path, create_folder, replace_in_files, write_json, patch_json, file_info, workspace_info | run_command, run_python, run_node, npm_script, git_status, find_todos | env_info, process_list, process_kill, open_path, download_file | attach_feedback, plazcode_checklist, plazcode_clarify, plazcode_skills.",
      "",
      "HELP ON DEMAND: call plazcode_help {topic} (or {command:\"name\"}) when you need more. Topics: agentscript (all the rules above in full), full-access, memory, checklist, scope, mcp, clarify. An unknown topic returns the list.",
      "",
      'IMPORTANT: Your very first action is to write `list_commands` to get the full command reference - never guess a command name or parameter. After receiving the result, reply with exactly "PlazCode is ready." and nothing else, then wait for the user\'s first request.',
    ].join("\n");
  }

  function buildLeanCore(options) {
    const o = options && typeof options === "object" ? options : {};
    const site = o.siteName || DEFAULT_SITE;
    return normEngine(o.engine) === L ? localCore(site, o.fullAccess === true) : robloxCore(site);
  }
  // Notion keeps its own plain "user preferences" text (core/config.js); the lean core is not meant for it.
  const supports = options => !(options && String(options.provider || options.providerId || "") === "notion");

  // ── Anchors: phrases of today's full prompts that must still be reachable (lean core or some topic) ───────────
  const ANCHORS = Object.freeze({
    roblox: Object.freeze([
      "list_commands", "list_mcp_servers", "PlazCode is ready.", "FORMATTING RULE (MANDATORY)", "###LUA###", "###END_LUA###", "###LUA:Server###", "###LUA:Client###",
      "ONE command block per reply", "NEVER HALLUCINATE a Studio", "PLAY-MODE RULE", "NEVER DELETE", "PERFECT CREATION", "UNDERSTAND THE REQUEST", "NEVER CLAIM THE BRIDGE",
      "WaitForChild", "SYSTEM_STATE", "PROJECT MEMORY", "READ IT WHEN THE WORK NEEDS IT", "KEEP IT UPDATED", "IF SOMETHING CONTRADICTS THE MEMORY", "NEVER PERSIST A GUESS AS A FACT",
      "UNIVERSAL ROBLOX/LUAU ENGINEERING DOCTRINE", "SCOPE CONTAINMENT + EVIDENCE", "LIFECYCLE + RESOURCE OWNERSHIP", "NATIVE-FIRST ARCHITECTURE", "NATIVE-FIRST HOUSE STYLE",
      "CONFIGURATION SINGLE SOURCE", "SCRIPT ORGANIZATION + DECLARATION LOCALITY", "PRESENTATION DIVIDE", "VERSION + MEMORY HONESTY", "luau_guidance",
      "MOTION/VFX RULES", "motion_scan", "motion_bundle_copy", "STUDIO SKILLS & VIRTUAL TOOLS", "lighting_set_preset", "MODERN UI & HUD", "ui_build", "GUI MUTATION",
      "ANIMATION TOOLS", "animation_test", "animation_set_pose", "npc_spawn_pathfinding", "web_search", "plazcode_screenshot", "attach_feedback", "ASSET BRIDGE", "script_analysis",
      "REQUEST SCOPE", "CONTEXTUAL MCP USE", "CHAT MODEL/UI CREATION", "creation_insert", "TASK CHECKLIST", "plazcode_checklist", "plazcode_skills", "plazcode_clarify",
      "BEFORE ACTING", "AUTOMATIC DEBUGGER", "YOU CAN ACT DIRECTLY IN THE USER'S PROJECT", "Other MCP servers may ALSO be connected", "plazcode_debug", "plazcode_agent", "DEVELOPER PRODUCTS", "developer_product_create", "MODE LOCK", "BLENDER MCP IS CONNECTED",
    ]),
    local: Object.freeze([
      "list_commands", "PlazCode is ready.", "FORMATTING RULE (MANDATORY)", "AGENTSCRIPT", "AUTO-ACTION PROTOCOL", "SILENT ERROR RECOVERY", "DIFF-FIRST EDITING", "STATE LINE",
      "DESTRUCTIVE ACTIONS", "WORK LIKE A REAL DEVELOPER", "FULL PC ACCESS IS ON", "read_file_base64", "edit_file", "run_command", "REQUEST SCOPE", "CONTEXTUAL MCP USE", "TASK CHECKLIST",
      "plazcode_checklist", "plazcode_clarify", "BEFORE ACTING",
    ]),
  });
  // Where each anchor is: "core", "topic:<name>", or "" when it is nowhere (a test fails on that).
  function coverage(options) {
    const o = options && typeof options === "object" ? options : {};
    const engine = normEngine(o.engine), key = engine === L ? "local" : "roblox";
    const core = buildLeanCore({ engine, siteName: o.siteName });
    const s = sources(o.siteName);
    const texts = listTopics(engine).map(t => {
      let text = "";
      try { text = BY_NAME[t.name].build(s) || ""; } catch { text = ""; }
      return [t.name, text];
    });
    const where = {}, missing = [];
    for (const anchor of ANCHORS[key]) {
      if (core.includes(anchor)) where[anchor] = "core";
      else {
        const hit = texts.find(([, text]) => text.includes(anchor));
        where[anchor] = hit ? "topic:" + hit[0] : "";
        if (!hit) missing.push(anchor);
      }
    }
    return { engine: key, total: ANCHORS[key].length, where, missing };
  }
  // For tests / diagnostics: size of every topic and which required phrases it lacks.
  function diagnose(options) {
    const o = options && typeof options === "object" ? options : {};
    const s = sources(o.siteName), out = {};
    for (const def of TOPIC_DEFS) {
      let text = "";
      try { text = (def.build(s) || "").trim(); } catch { text = ""; }
      out[def.name] = { engines: def.engines.slice(), chars: text.length, missing: def.must.filter(phrase => !text.includes(phrase)) };
    }
    return out;
  }

  // ── Which topics belong with a request ─────────────────────────────────────────────────────────────────────────
  // Keyword map, in priority order. A greeting or a plain question matches nothing, so nothing is pushed.
  const ROUTES = [
    ["studio-gui", [R], /\b(?:gui|ui|hud|screen ?gui|menus?|buttons?|text ?labels?|health ?bar|interface|layouts?|scrolling ?frame|billboard ?gui|surface ?gui|crosshair|inventory (?:screen|ui|gui)|shop (?:screen|ui|gui)|leaderboard (?:ui|gui))\b/i],
    ["animation", [R], /\b(?:animat\w*|keyframes?|poses?|posing|rigs?|rigged|rigging|r15|r6|emotes?|moon ?animator|walk cycle)\b/i],
    ["motion", [R], /\b(?:vfx|particles?|emitters?|trails?|beams?|slash|hit ?effects?|effects?|animation ids?|animation wiring|animate script|combat anim\w*|idle|swim|climb)\b/i],
    ["play-mode", [R], /\b(?:play ?tests?|play ?mode|while playing|in play|press play|run the game|start_stop_play)\b/i],
    ["luau", [R], /\b(?:luau|lua|scripts?|module ?scripts?|local ?scripts?|remote ?(?:events?|functions?)|data ?stores?|frameworks?|refactor\w*|optimi[sz]\w*|performance|lag\w*|leaks?|bugs?|fix\w*|crash\w*|errors?|code|systems?|mechanics?|combat|weapons?|abilit\w*|tycoon|cooldowns?)\b/i],
    ["studio-skills", [R], /\b(?:lighting|atmosphere|skybox|day ?night|terrain|camera|audio|sounds?|music|sfx|leaderboards?|npcs?|pathfind\w*|proximity ?prompts?|tweens?|game ?passes?|marketplace|diagnos\w*|teams?|plugins?|asset bridge)\b/i],
    ["developer-products", [R], /\b(?:developer ?products?|dev ?products?|robux|purchases?|monetiz\w*)\b/i],
    ["creators", [R], /\b(?:(?:create|make|build|design|generate)\b[^.\n]{0,40}\b(?:ui|gui|hud|menu|model|mesh|prop|building|vehicle)|creation_preview|headless_build|blueprint)\b/i],
    ["blender", [R], /blender|\bbpy\b|\.blend\b/i],
    ["screenshots", [R], /\b(?:screenshots?|screen ?capture|images?|pictures?|photos?|reference images?|attach\w*|paste\w*|looks? like)\b/i],
    ["web", [R], /\b(?:web ?search|search the (?:web|internet)|look ?up|google|documentation|docs|fetch)\b|https?:\/\//i],
    ["debug-agents", [R], /\b(?:debug\w*|agents?|planner|reviewer|output panel|stack ?trace|exceptions?)\b/i],
    ["memory", [R, L], /\b(?:memory|remember|hand-?off|project notes)\b/i],
    ["checklist", [R, L], /\b(?:checklist|todo list|task list)\b/i],
    ["agentscript", [L], /\b(?:files?|folders?|directory|terminal|shell|git|npm|pip|python|node|build|compile|tests?|repo|install|download|refactor\w*|bugs?|fix\w*)\b/i],
    ["full-access", [L], /\b(?:full pc|absolute paths?|processes|process_kill|kill)\b|\b[A-Z]:\\/i],
  ];
  function routeTopics(requestText, options) {
    const o = options && typeof options === "object" ? options : {};
    const engine = normEngine(o.engine), max = Number.isFinite(o.max) ? Math.max(0, o.max) : 4;
    const skip = new Set((o.exclude || []).map(resolveTopic));
    const text = String(requestText == null ? "" : requestText).slice(0, 8000);
    const out = [];
    if (!text.trim()) return out;
    for (const [name, engines, pattern] of ROUTES) {
      if (out.length >= max) break;
      if (!engines.includes(engine) || skip.has(name)) continue;
      if (pattern.test(text)) out.push(name);
    }
    return out;
  }

  // Remembers which topics were already pushed into which chat, so each is sent once per chat.
  function createTracker(limit) {
    const cap = Number.isFinite(limit) && limit > 0 ? limit : 64;
    const chats = new Map();
    const key = chat => String(chat == null ? "" : chat);
    const set = chat => {
      const k = key(chat);
      if (!chats.has(k)) { chats.set(k, new Set()); if (chats.size > cap) chats.delete(chats.keys().next().value); }
      return chats.get(k);
    };
    return {
      has: (chat, topic) => (chats.get(key(chat)) || new Set()).has(resolveTopic(topic) || normalise(topic)),
      mark(chat, topics) { const s = set(chat); for (const t of [].concat(topics || [])) { const n = resolveTopic(t); if (n) s.add(n); } },
      // the topics from `topics` that this chat has not had yet (does not mark them)
      fresh: (chat, topics) => [].concat(topics || []).map(resolveTopic).filter((n, i, all) => n && all.indexOf(n) === i && !(chats.get(key(chat)) || new Set()).has(n)),
      delivered: chat => Array.from(chats.get(key(chat)) || []),
      reset(chat) { if (chat === undefined) chats.clear(); else chats.delete(key(chat)); },
      size: () => chats.size,
    };
  }
  // pushFor(request, tracker, chat, {engine, max, budget}) -> {topics, text}. Marks what it returns as delivered.
  function pushFor(requestText, tracker, chat, options) {
    const o = options && typeof options === "object" ? options : {};
    const engine = normEngine(o.engine), budget = Number.isFinite(o.budget) ? o.budget : 24000;
    const wanted = routeTopics(requestText, { engine, max: o.max });
    const todo = tracker ? tracker.fresh(chat, wanted) : wanted;
    const sent = [], blocks = [];
    let used = 0;
    for (const name of todo) {
      const text = topicText(name, o.siteName);
      if (!text) continue;
      const block = `[PlazCode reference for this request - topic "${name}"]\n${text}`;
      if (sent.length && used + block.length > budget) break;
      sent.push(name); blocks.push(block); used += block.length + 2;
    }
    if (tracker && sent.length) tracker.mark(chat, sent);
    return { topics: sent, text: blocks.join("\n\n") };
  }

  return Object.freeze({
    SYS_MARKER, CORE_MAX_CHARS, HELP_MAX_CHARS, TOPICS, ANCHORS, ROUTES: ROUTES.map(([name, engines]) => ({ name, engines: engines.slice() })),
    buildLeanCore, supports, listTopics, topicListText, resolveTopic, helpFor, routeTopics, createTracker, pushFor, coverage, diagnose, use,
  });
});
