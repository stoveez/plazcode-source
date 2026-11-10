// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// core/parser.js - RobloxScript command parsing. PURE string logic, zero DOM:
// the provider extracts a turn's text from the site's DOM; everything here
// operates on that text. The command formats (###LUA### blocks, {"command":…}
// JSON) are defined by OUR system prompt, so they are the same on every AI site
// - only the way a site's markdown may mangle them differs (the regexes below
// are whitespace/dash tolerant for that reason).
// eslint-disable-next-line no-unused-vars
const RSParse = (() => {
  "use strict";

  const START_M = "###MCP_TOOL###";
  const END_M = "###END_MCP_TOOL###";
  // Whitespace-tolerant markers: site markdown can insert spaces around the
  // hashes (e.g. "### LUA ###") or render END_LUA with a dash. These regexes
  // match those variants so a marker mangled by markdown still parses.
  // The optional `:Edit|:Server|:Client` suffix selects the Roblox datamodel
  // execute_luau runs against (the MCP REQUIRES datamodel_type; a bare
  // ###LUA### defaults to "Edit" so the model never has to think about it
  // outside play-testing).
  const LUA_START_RE = /###\s*lua(?:\s*[:\-_ ]\s*(edit|client|server))?\s*(?:###|---)/i;
  const LUA_END_RE = /###\s*end[_\- ]?lua\s*###/i;
  const LUA_DEFAULT_DM = "Edit";
  const dmName = (m) => (m ? m[0].toUpperCase() + m.slice(1).toLowerCase() : LUA_DEFAULT_DM);

  // Find the first LUA start marker at or after `from`. Returns { pos, len, dm }
  // where len is the marker's own length to skip past it and dm the requested
  // datamodel ("Edit" when unspecified).
  function findLuaStart(text, from = 0) {
    const m = LUA_START_RE.exec(text.slice(from));
    return m ? { pos: from + m.index, len: m[0].length, dm: dmName(m[1]) } : { pos: -1, len: 0, dm: LUA_DEFAULT_DM };
  }

  // Find the first LUA end marker at or after `from`. Returns its start index or -1.
  function findLuaEnd(text, from = 0) {
    const m = LUA_END_RE.exec(text.slice(from));
    return m ? from + m.index : -1;
  }

  // Strip a code-block UI label (the "Copy" button caption, or a leftover fence
  // language token like "json") that some sites bleed into the block's text
  // right after the opening marker. Seen live on Kimi: its code-block chrome
  // renders as `###lua### Copy <code>`, so the bare-marker slice below would
  // capture `Copy task.wait(...)` as the Lua code - not valid Lua, so StudioMCP
  // rejects it with "Failed to parse command code". The JSON path already does
  // this at line ~206; mirror it for the raw ###LUA### extraction. Requires
  // trailing whitespace (\s+) so it never eats a legitimate identifier like
  // `Copy(x)` that a script might genuinely start with.
  function stripCodeChrome(code) {
    return String(code || "")
      .replace(/^[\u200B-\u200D\uFEFF]+/, "")
      .replace(/^(?:json|copy|lua|luau|javascript|js|python|py|text)\s+/i, "");
  }

  // A command is `{"command":"name", ...}` (or "tool"). The params/arguments
  // object is OPTIONAL: paramless commands like list_commands are written as
  // `{"command":"list_commands"}`, so requiring "params" too would MISS them
  // (they'd be shown raw and never executed). We key on the `"command":"…"` /
  // `"tool":"…"` shape instead - a string-valued key, which prose almost never
  // contains - so paramless calls are detected without false-positiving on text.
  const CMD_KEY_RE = /"(?:command|tool)"\s*:\s*"/;

  // DeepSeek's own tool-call markup ("DSML", 1.24.27). DeepSeek sometimes falls
  // back to its built-in format instead of PlazCode's JSON, seen live:
  //   <｜DSML｜tool_calls>
  //   <｜DSML｜invoke name="search_game_tree">
  //   <｜DSML｜parameter name="path" string="true">StarterGui</｜DSML｜parameter>
  //   <｜DSML｜parameter name="head_limit" string="false">80</｜DSML｜parameter>
  //   </｜DSML｜invoke>
  //   </｜DSML｜tool_calls>
  // Before this it was shown as raw text and never ran, so the turn ended dead.
  // The bars are normally the FULLWIDTH "｜" (U+FF5C); the page can also show
  // ASCII "|", doubled bars or spaces, and the wrapper as tool_calls,
  // function_calls or just calls, so every delimiter is matched loosely.
  // string="true" means a raw string; string="false" means a JSON value.
  const DSML_BAR = "[\\s|\\uFF5C\\u2502\\u2223\\u01C0]*";
  const DSML_TAG = (closing, tag) => "<\\s*" + (closing ? "\\/" : "") + DSML_BAR + "DSML" + DSML_BAR + tag;
  const DSML_SIG_RE = new RegExp(DSML_TAG(false, "(?:[a-z_]*calls|invoke)\\b"), "i");
  const DSML_CALLS_OPEN_RE = new RegExp(DSML_TAG(false, "[a-z_]*calls\\s*>"), "gi");
  const DSML_CALLS_CLOSE_RE = new RegExp(DSML_TAG(true, "[a-z_]*calls\\s*>"), "gi");
  const DSML_INVOKE_RE = new RegExp(
    DSML_TAG(false, "invoke\\s+name\\s*=\\s*[\"'\\u201C\\u201D]([^\"'\\u201C\\u201D>]*)[\"'\\u201C\\u201D]\\s*>") +
    "([\\s\\S]*?)" + DSML_TAG(true, "invoke\\s*>"), "gi");
  const DSML_INVOKE_OPEN_RE = new RegExp(DSML_TAG(false, "invoke\\b"), "gi");
  const DSML_INVOKE_CLOSE_RE = new RegExp(DSML_TAG(true, "invoke\\s*>"), "gi");
  const DSML_INVOKE_NAME_RE = new RegExp(DSML_TAG(false, "invoke\\s+name\\s*=\\s*[\"'\\u201C\\u201D]([^\"'\\u201C\\u201D>]*)"), "i");
  const DSML_PARAM_RE = new RegExp(
    DSML_TAG(false, "parameter\\s+name\\s*=\\s*[\"'\\u201C\\u201D]([^\"'\\u201C\\u201D>]*)[\"'\\u201C\\u201D]") +
    "((?:\\s+[a-z_]+\\s*=\\s*[\"'\\u201C\\u201D][^\"'\\u201C\\u201D>]*[\"'\\u201C\\u201D])*)\\s*>" +
    "([\\s\\S]*?)" + DSML_TAG(true, "parameter\\s*>"), "gi");

  const lastIndexOf = (re, text) => {
    re.lastIndex = 0;
    let last = -1, m;
    while ((m = re.exec(text))) { last = m.index; if (m[0].length === 0) re.lastIndex++; }
    return last;
  };

  function hasDsml(r) {
    return DSML_SIG_RE.test(String(r || ""));
  }

  // Native closing tokens alone contain neither a tool nor arguments. Inspect
  // the WHOLE reply, so quoted examples, JSON values and code are never mistaken
  // for a decoder runaway. A partial final closer may still be streaming.
  function closingDsmlTail(r) {
    const text=String(r||'').trim();
    if(!/^[<{`]/.test(text)||!/DSML/i.test(text))return null;
    const token=new RegExp(DSML_TAG(true,'>'),'gi');
    let from=0,start=0,count=0,match;
    while((match=token.exec(text))){
      if(text.slice(from,match.index).trim()){start=match.index;count=0;}
      count++;from=token.lastIndex;
    }
    const tail=text.slice(from).replace(/[\s|\uFF5C\u2502\u2223\u01C0]/g,'').toLowerCase();
    return count&&(!tail||'</dsml>'.startsWith(tail))?{count,prefix:text.slice(0,start).trimEnd()}:null;
  }
  function orphanDsmlClosers(r) {
    const tail=closingDsmlTail(r);
    return tail&&!tail.prefix?tail.count:0;
  }
  function dsmlClosingRun(r) {
    const tail=closingDsmlTail(r);if(!tail)return null;
    if(!tail.prefix)return {closers:tail.count,orphan:true};
    const prefix=tail.prefix;
    const fences=prefix.match(/^ {0,3}(?:`{3,}|~{3,})[^\n]*$/gm)||[];
    if(fences.length%2)return null;
    const fenced=/^```[^\n]*\n([\s\S]*)\n```$/.exec(prefix);
    const body=(fenced?fenced[1]:prefix).trim();
    // A complete JSON envelope can also be followed by native closing debris.
    // Require the ENTIRE envelope, including strings/arguments, to be closed;
    // a tag run inside an unfinished value is data, never a recovery trigger.
    if(body.startsWith('{')&&matchBrace(body,0)===body.length-1){
      try{if(normalizeCall(parseLoose(body))){const calls=parseToolCalls(body);if(calls.length)return {closers:tail.count,orphan:false,calls};}}catch{}
      return null;
    }
    // A trailing run is protocol debris only AFTER a fully closed native call.
    // A parameter still being streamed may legitimately contain literal tags.
    const end=new RegExp(DSML_TAG(true,'(?:[a-z_]*calls|invoke)\\s*>')+'\\s*$','i');
    if(!hasDsml(body)||!end.test(body))return null;
    const opens=body.match(new RegExp(DSML_TAG(false,'parameter\\b'),'gi'))||[];
    const closes=body.match(new RegExp(DSML_TAG(true,'parameter\\s*>'),'gi'))||[];
    if(opens.length!==closes.length)return null;
    const calls=parseDsml(body);
    if(calls.length&&hasOpenDsml(body))return {closers:tail.count,orphan:true,reason:'unclosed_wrapper'};
    return calls.length?{closers:tail.count,orphan:false,calls}:null;
  }

  // A DSML call still being written: the last wrapper or invoke that opened has
  // not closed yet.
  function hasOpenDsml(r) {
    if (!hasDsml(r)) return false;
    const lastOpen = lastIndexOf(DSML_CALLS_OPEN_RE, r);
    if (lastOpen !== -1 && lastIndexOf(DSML_CALLS_CLOSE_RE, r) < lastOpen) {
      // A complete invoke inside an unclosed wrapper is still mid-stream only
      // while another invoke may follow; the wrapper closer is what ends it.
      return true;
    }
    const lastInvoke = lastIndexOf(DSML_INVOKE_OPEN_RE, r);
    return lastInvoke !== -1 && lastIndexOf(DSML_INVOKE_CLOSE_RE, r) < lastInvoke;
  }

  function dsmlValue(raw, attrs) {
    const isString = /string\s*=\s*["'\u201C\u201D]\s*true/i.test(attrs || "");
    const isJson = /string\s*=\s*["'\u201C\u201D]\s*false/i.test(attrs || "");
    const text = String(raw);
    if (isString) return text.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
    const t = text.trim();
    if (isJson || /^(?:[{\[]|-?\d|true$|false$|null$|")/.test(t)) {
      try { return parseLoose(t); } catch {}
    }
    return t;
  }

  // Every COMPLETE DSML invoke in the reply, as {tool, arguments}.
  function parseDsml(r) {
    const text = String(r || "");
    if (!hasDsml(text)) return [];
    const out = [];
    DSML_INVOKE_RE.lastIndex = 0;
    let m;
    while ((m = DSML_INVOKE_RE.exec(text))) {
      const name = String(m[1] || "").trim();
      if (!name) continue;
      const args = {};
      DSML_PARAM_RE.lastIndex = 0;
      let p;
      while ((p = DSML_PARAM_RE.exec(m[2]))) {
        const key = String(p[1] || "").trim();
        if (key) args[key] = dsmlValue(p[3], p[2]);
      }
      // A model may pass the whole argument object as one "params"/"arguments" parameter.
      const keys = Object.keys(args);
      if (keys.length === 1 && (keys[0] === "params" || keys[0] === "arguments") &&
          args[keys[0]] && typeof args[keys[0]] === "object" && !Array.isArray(args[keys[0]])) {
        out.push({ tool: name, arguments: args[keys[0]] });
      } else {
        out.push({ tool: name, arguments: args });
      }
    }
    return out;
  }

  // A returned result is data, even when the assistant echoes its JSON, Luau
  // markers or batch child commands. Skip only complete, explicitly versioned
  // result envelopes; a real command beside one must still be read normally.
  function withoutResultEnvelopes(text) {
    const raw=String(text||'');if(!raw.includes('plazcode-result/1'))return raw;
    let output='',from=0,start=raw.indexOf('{');
    while(start>=0){const end=matchBrace(raw,start);let value;
      if(end<0&&/^\{\s*(?:"result"\s*:\s*\{)?[^{}]*"format"\s*:\s*"plazcode-result\/1"/.test(raw.slice(start))){return output+raw.slice(from,start);}
      if(end>=0)try{value=JSON.parse(raw.slice(start,end+1));}catch{}
      const result=value?.format==='plazcode-result/1'||(!value?.command&&!value?.tool&&value?.result?.format==='plazcode-result/1');
      if(result){output+=raw.slice(from,start)+' ';from=end+1;start=raw.indexOf('{',from);}
      else start=raw.indexOf('{',value&&(typeof value.command==='string'||typeof value.tool==='string')?end+1:start+1);
    }
    return output+raw.slice(from);
  }
  function hasToolSignature(r) {
    r=withoutResultEnvelopes(r);
    return (
      r.includes(START_M) ||
      r.includes("MCP_TOOL") ||
      LUA_START_RE.test(r) ||
      CMD_KEY_RE.test(commandZone(r)) ||
      hasDsml(r)
    );
  }

  // True if the reply contains a tool block that has STARTED but not yet CLOSED
  // (a ###LUA### / ###MCP_TOOL### opener with no matching end marker). Used by the
  // response watcher to avoid finalizing a command that is still being streamed.
  function hasOpenToolBlock(r) {
    r=withoutResultEnvelopes(r);
    if (!r) return false;
    if (hasOpenDsml(r)) return true;
    const { pos: ls, len } = findLuaStart(r);
    if (ls !== -1 && findLuaEnd(r, ls + len) === -1) return true;
    const sm = r.indexOf(START_M);
    if (sm !== -1) {
      const low = r.toLowerCase();
      if (low.indexOf("###end_mcp_tool###", sm) === -1 && low.indexOf("###end-mcp_tool###", sm) === -1) return true;
    }
    // An inline JSON command ({"command"/"tool": …}) whose object has NOT closed yet
    // is still being streamed (a big multi_edit can take many seconds). Treat it as
    // open so the watcher keeps waiting instead of finalizing - and failing to parse -
    // half a command, which would drop the tool and end the turn as plain text.
    for (const key of ['"command"', '"tool"']) {
      const k = r.indexOf(key);
      if (k === -1) continue;
      for (const open of keyOpeners(r, k)) {
        const end = matchBrace(r, open);
        if (end === -1) return true;  // the command object is still streaming
        if (end > k) break;           // the object holding the key is closed
      }
    }
    return false;
  }

  // Normalise a parsed JSON object into { tool, arguments }, accepting both the
  // new RobloxScript schema ("command"/"params") and the legacy/function-calling
  // schema ("tool"/"arguments"/"name"/"args"). Returns null if not a valid call.
  function normalizeCall(o) {
    if (!o || typeof o !== "object") return null;
    const nameKey = o.command != null ? "command" : o.tool != null ? "tool" : "name";
    const name = o[nameKey];
    if (typeof name !== "string" || !name.trim()) return null;
    const wrappers = ["params", "arguments", "args"];
    const present = wrappers.filter(key => o[key] != null);
    const decode = value => {
      if (typeof value === "string") { try { value = parseLoose(value); } catch { return null; } }
      return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    };
    let args = present.length ? decode(o[present[0]]) : {};
    if (!args) return null;
    args = { ...args };
    let argumentError = "";
    // Preserve explicitly supplied fields; never discard a flat path/code or silently choose between conflicting
    // wrappers. Schema-aware repair below still decides whether those fields actually belong to this tool.
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    for (const key of present.slice(1)) {
      const extra = decode(o[key]);
      if (!extra || !same(extra, args)) argumentError = "Conflicting parameter wrappers. Send one params object.";
    }
    for (const [key, value] of Object.entries(o)) {
      if (key === nameKey || wrappers.includes(key)) continue;
      // A flat server is catalogue selection only. Never turn transport metadata into mutation routing.
      if (key === "server" && name !== "list_commands" && name !== "list_tools") continue;
      if (key === "server" && (name === "list_commands" || name === "list_tools") &&
          typeof args[key] === "string" && typeof value === "string" && args[key].trim() === value.trim()) continue;
      if (Object.hasOwn(args, key) && !same(args[key], value)) {
        argumentError = `Conflicting values for ${key}. Send it once inside params.`;
      } else Object.defineProperty(args, key, {value, enumerable:true, configurable:true, writable:true});
    }
    // Keep the catalogue server selector strict (including the existing conflict rejection).
    if ((name === "list_commands" || name === "list_tools") && o.server != null) {
      if (typeof o.server !== "string" || !o.server.trim() || argumentError) return null;
      args.server = o.server.trim();
    }
    return { tool: name, arguments: args, ...(argumentError ? {argumentError} : {}) };
  }

  // String-aware matching-brace finder: index of the "}" that closes the "{" at
  // `start`, SKIPPING braces inside JSON string literals (escaped quotes handled).
  // A naive depth counter miscounts the braces embedded in code passed as a string
  // value (e.g. multi_edit's edits / a Lua snippet), grabs the wrong end, and makes
  // JSON.parse fail - which silently dropped the command, so the tool never ran and
  // the turn was treated as a plain-text answer. Returns -1 if unbalanced.
  function matchBrace(text, start) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") { if (--depth === 0) return i; }
    }
    return -1;
  }

  // JSON.parse with a fallback for RAW control characters inside string
  // literals (tab/newline/CR). Models sometimes emit a literal TAB instead of
  // \t inside a command's string value (seen live on Gemini in a big
  // multi_edit); strict JSON rejects it, the parse failed silently and the
  // command was never executed. The fallback walks the text string-aware and
  // escapes those characters ONLY inside string literals, then re-parses.
  // Second-stage repairs, also outside string literals only (1.19.36): a
  // trailing comma before } or ] (DeepSeek/Qwen habit) and NO-BREAK SPACE
  // between tokens (code blocks copied from rendered DOM text). Both made strict
  // JSON.parse fail, so a complete command cost a parse-error retry turn.
  function parseLoose(raw) {
    try {
      return JSON.parse(raw);
    } catch (e0) {
      let out = "", inStr = false, esc = false;
      for (const c of raw) {
        if (inStr) {
          if (esc) { esc = false; out += c; continue; }
          if (c === "\\") { esc = true; out += c; continue; }
          if (c === '"') { inStr = false; out += c; continue; }
          if (c === "\t") { out += "\\t"; continue; }
          if (c === "\n") { out += "\\n"; continue; }
          if (c === "\r") { out += "\\r"; continue; }
          out += c;
          continue;
        }
        if (c === '"') inStr = true;
        if (c === "\u00a0") { out += " "; continue; }
        if (c === "}" || c === "]") out = out.replace(/,\s*$/, "");
        out += c;
      }
      return JSON.parse(out); // may still throw - callers catch
    }
  }

  function extractJson(raw) {
    raw = raw.trim().replace(/^(?:json|JSON)\s*/, "");
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    const s = raw.indexOf("{");
    if (s === -1) return null;
    const e = matchBrace(raw, s);            // string-aware: not the last "}" in code
    if (e === -1) return null;
    try {
      return parseLoose(raw.slice(s, e + 1));
    } catch {
      return null;
    }
  }

  // Candidate object openers for the command key at `s`, innermost first.
  // Models do not always write the name first: {"params":{…},"command":"x"}
  // put a CLOSED params object between the outer "{" and the key, so taking
  // only the nearest "{" dropped the call (1.19.35). Only JSON-looking openers
  // ({ followed by a quote) are considered, at most a few levels out.
  const MAX_KEY_DEPTH = 6;
  function keyOpeners(text, s) {
    const out = [];
    let start = text.lastIndexOf("{", s);
    while (start !== -1 && out.length < MAX_KEY_DEPTH) {
      if (/^\{\s*"/.test(text.slice(start, start + 24))) out.push(start);
      start = start > 0 ? text.lastIndexOf("{", start - 1) : -1;
    }
    return out;
  }

  function extractToolsAnywhere(text) {
    const out=[];const keys=/"(?:command|tool)"\s*:/g;let key;
    while((key=keys.exec(text)) && out.length<9){
      const starts=keyOpeners(text,key.index);let accepted=false;
      for(const start of starts){
        const end=matchBrace(text,start);
        // Never run nested children from an incomplete enclosing envelope.
        if(end<0)return [];
        if(end<key.index)continue;
        try{const call=normalizeCall(parseLoose(text.slice(start,end+1)));if(call){out.push(call);keys.lastIndex=end+1;accepted=true;break;}}catch{}
      }
      if(!accepted && starts.some(start=>/"(?:command|tool)"\s*:/.test(text.slice(start,key.index+20))))return [];
    }
    return out;
  }
  function extractToolAnywhere(text) {return extractToolsAnywhere(text)[0]||null;}
  function commandDiagnosis(text) {
    text=String(text||'');const key=/"(?:command|tool)"\s*:/.exec(text);
    if(key){const starts=keyOpeners(text,key.index);for(const start of starts){const end=matchBrace(text,start);if(end<0)return "Received "+text.length+" characters. The JSON envelope has an unfinished string or missing closing braces. Nothing ran; the model/site output may be cut off. Split the next attempt into smaller complete edits; do not resend the same large payload unchanged.";try{parseLoose(text.slice(start,end+1));}catch(error){return "Received "+text.length+" characters. JSON parsing reported: "+String(error.message||error).slice(0,200)+". Check quoting/escapes at that position; do not assume a length limit.";}}}
    return "Received "+text.length+" characters. The command markers or argument envelope are incomplete. Nothing ran. Check both markers and use smaller complete commands when output is cut off.";
  }

  // Only an ACTIONABLE command envelope may run from loose JSON. Replies often
  // quote command-shaped JSON as an example, inside a prompt written for someone
  // else, or in inline code; running those executes placeholder commands and
  // sends back error protocol messages. The eligible zone is the reply's
  // TRAILING RUN of command blocks:
  //  - fenced text: the last fenced block (json, untagged or another code label)
  //    whose body is only the command object(s), plus any command fences directly
  //    before it (several commands in one reply run as one batch); fences tagged
  //    text/plaintext/markdown/etc. and inline `code` never count; or
  //  - text with no fence marks (provider text extraction drops them): the last
  //    command object plus the command objects directly before it. It must start
  //    its own line, must not sit under a text/plaintext label, and may be
  //    followed by at most a short closing sentence.
  // 1.24.33: a provider whose transcript is flat textContent (Notion: no line
  // break between the prose block and the code block, and the code block's
  // language label is glued to the JSON) cannot satisfy the own-line and label
  // rules. In 1.24.32 every Notion reply with a sentence before its command was
  // therefore dropped and the turn ended with the card stuck on "processing".
  // Such a provider declares flatTranscript and only the trailing-run and
  // closing-sentence rules apply to it.
  const IGNORED_FENCE = new Set(["text", "plaintext", "plain", "txt", "markdown", "md", "prompt", "quote", "example", "output", "log"]);
  const TEXT_LABEL_RE = /^(?:text|plaintext|plain text|txt|markdown|md|prompt|quote|example)$/i;
  // What may sit on the same line before a command and still mean "a code block starts here". Many sites
  // (DeepSeek, Qwen, Kimi, ...) read the reply as textContent, which glues the code block's header bar onto
  // the code: "jsonCopyDownload{...}", and glues a paragraph straight onto it: "Sure.jsonCopy{...}". 1.24.31
  // and 1.24.32 required the command to start its own line and so dropped every such startup probe
  // ("Startup handshake failed"). Allowed: nothing; a language label; header buttons; and/or the end of a
  // sentence glued on WITHOUT a space. A prose example ("then send {...}") has a word and a space before the
  // brace and stays ignored; a text/plaintext label is two words and stays ignored too.
  const BLOCK_PREFIX_RE = /^(?:.*[.!?:)\]"'\u201d\u2019]|)(?:([A-Za-z][\w+#.-]{0,14}?)(?=Copy|Copied|Download|Run|Edit|Wrap|Collapse|Expand|Preview|Apply|$))?(?:Copy(?: code)?|Copied!?|Download|Run|Edit|Wrap|Collapse|Expand|Preview|Apply)*$/;
  const blockPrefix = (prefix) => {
    if (!prefix.trim()) return true;
    const bare = prefix.replace(/\s+$/, "");
    // A space before the brace is only allowed after a sentence end, a header button or a code language
    // ("Done. {", "jsonCopy {", "json {"); "Use {" or "send {" is prose.
    if (bare !== prefix && !/(?:[.!?:)\]"'\u201d\u2019]|Copy|Copied!?|Download|Run|Edit|Wrap|Collapse|Expand|Preview|Apply|^(?:json|jsonc|json5|lua|luau|js|javascript|ts|typescript|python|py))$/i.test(bare)) return false;
    const m = BLOCK_PREFIX_RE.exec(bare);
    // A code block labelled text/plaintext/markdown/... is quoted material, never a command.
    return !!m && !(m[1] && IGNORED_FENCE.has(m[1].toLowerCase()));
  };
  const ZONE_GAP = 240;   // most prose allowed between two commands of one batch
  // A closing sentence after the command is normal ("I will wait for the result
  // before continuing."); only a reply that carries on at length is prose.
  const ZONE_TAIL = 200;  // most prose allowed after the last command
  let _flatOverride = null;
  function setFlatTranscript(value) { _flatOverride = value == null ? null : !!value; }
  function flatTranscript() {
    if (_flatOverride !== null) return _flatOverride;
    try { return typeof RSProvider !== "undefined" && !!RSProvider && RSProvider.flatTranscript === true; } catch { return false; }
  }
  // Top-level command objects of `text`, in order. An object that has not closed
  // yet (still streaming) is reported with end -1 and ends the list.
  function commandSpans(text) {
    const spans = [], keys = /"(?:command|tool)"\s*:\s*"/g;
    let key;
    while ((key = keys.exec(text)) && spans.length < 16) {
      let found = null;
      for (const start of keyOpeners(text, key.index)) {
        const end = matchBrace(text, start);
        if (end < 0) { found = { start, end: -1 }; continue; }
        if (end < key.index) continue;
        found = { start, end };
        break;
      }
      if (!found) continue;
      spans.push(found);
      if (found.end < 0) break;
      keys.lastIndex = found.end + 1;
    }
    return spans;
  }
  function commandZone(text) {
    const raw = withoutResultEnvelopes(text);
    if (!CMD_KEY_RE.test(raw)) return "";
    const fences = [];
    let outside = "", at = 0, m;
    const fenceRe = /```([^\n`]*)\n([\s\S]*?)(?:```|$)/g;
    const inline = (t) => t.replace(/(?<!`)`[^`\n]+`(?!`)/g, " ");
    while ((m = fenceRe.exec(raw))) {
      outside += inline(raw.slice(at, m.index)) + "\n";
      at = m.index + m[0].length;
      if (!IGNORED_FENCE.has(m[1].trim().toLowerCase())) fences.push({ body: m[2], start: m.index, end: at });
      if (m[0].length === 0) fenceRe.lastIndex++;
    }
    outside += inline(raw.slice(at));
    const withKey = fences.filter(f => CMD_KEY_RE.test(f.body))
      .map(f => ({ ...f, body: f.body.trim().replace(/^(?:json|JSON)\s*/, "") }));
    if (withKey.length) {
      let first = withKey.length - 1;
      if (!/^[\[{]/.test(withKey[first].body)) return "";
      while (first > 0 && /^[\[{]/.test(withKey[first - 1].body) &&
        raw.slice(withKey[first - 1].end, withKey[first].start).trim().length <= ZONE_GAP) first--;
      return withKey.slice(first).map(f => f.body).join("\n");
    }
    // No fence holds the command: the key lives in an ignored (text/plaintext/
    // other) fence or in bare text. Only bare text outside fences can still be
    // a command.
    const spans = commandSpans(outside);
    if (!spans.length) return "";
    const flat = flatTranscript();
    const last = spans[spans.length - 1];
    if (last.end >= 0 && outside.slice(last.end + 1).trim().length > ZONE_TAIL) return "";
    let first = spans.length - 1;
    while (first > 0 && outside.slice(spans[first - 1].end + 1, spans[first].start).trim().length <= ZONE_GAP) first--;
    if (flat) return outside.slice(spans[first].start);
    const eligible = (start) => {
      const lineStart = outside.lastIndexOf("\n", start - 1) + 1;
      if (!blockPrefix(outside.slice(lineStart, start))) return false;
      const before = outside.slice(0, lineStart).split("\n").map(l => l.trim()).filter(Boolean).slice(-3);
      return !before.some(l => TEXT_LABEL_RE.test(l));
    };
    // An example quoted just before the real command must not veto it: drop
    // leading members of the run until one is a proper command block.
    while (first < spans.length && !eligible(spans[first].start)) first++;
    return first < spans.length ? outside.slice(spans[first].start) : "";
  }

  function parseToolCalls(r) {
    r=withoutResultEnvelopes(r);
    // Lowercase for case-insensitive end-marker search. Models write
    // ###end_mcp_tool### (underscore) or ###end-mcp_tool### (dash).
    const rLow = r.toLowerCase();
    const findEndM = (from) => {
      const a = rLow.indexOf("###end_mcp_tool###", from);
      const b = rLow.indexOf("###end-mcp_tool###", from);
      if (a === -1 && b === -1) return -1;
      if (a === -1) return b;
      if (b === -1) return a;
      return Math.min(a, b);
    };
    const out = [];
    let from = 0;
    while (true) {
      const sm = r.indexOf(START_M, from);
      if (sm === -1) break;
      const em = findEndM(sm);
      if (em === -1) break;
      const body = r.slice(sm + START_M.length, em);
      const { pos: ls, len: luaLen, dm } = findLuaStart(body);
      const le = findLuaEnd(body, ls === -1 ? 0 : ls + luaLen);
      if (ls !== -1 && le !== -1 && le > ls) {
        out.push({ tool: "execute_luau", arguments: { code: stripCodeChrome(body.slice(ls + luaLen, le).trim()), datamodel_type: dm } });
        from = em + END_M.length;
        continue;
      }
      for (const sub of body.split(START_M)) {
        const cleaned = sub.trim().replace(/^(?:json|JSON|Copy|copy)\s*/i, "").trim();
        if (!cleaned) continue;
        const p = normalizeCall(extractJson(cleaned));
        if (p) out.push(p);
      }
      from = em + END_M.length;
    }
    // DeepSeek's own DSML markup (see parseDsml). Checked before the loose JSON
    // search so a JSON value inside a DSML parameter is never taken as the call.
    if (out.length === 0) out.push(...parseDsml(r));
    // Prefer a JSON command envelope when one is present: a model may wrap
    // execute_luau as {"command":"execute_luau","params":{"code":"###LUA###…"}},
    // and the bare-marker fallback below would slice the still-ESCAPED JSON
    // source (literal \n, \") instead of the decoded code. extractToolAnywhere
    // JSON-decodes it; cleanLuaCall (applied at the end) then strips the markers.
    if (out.length === 0) {
      out.push(...extractToolsAnywhere(commandZone(r)));
    }
    // Bare ###LUA### … ###END_LUA### block with no JSON envelope at all.
    if (out.length === 0) {
      const { pos: ls, len: luaLen, dm } = findLuaStart(r);
      const le = findLuaEnd(r, ls === -1 ? 0 : ls + luaLen);
      if (ls !== -1 && le !== -1 && le > ls) {
        out.push({ tool: "execute_luau", arguments: { code: stripCodeChrome(r.slice(ls + luaLen, le).trim()), datamodel_type: dm } });
      }
    }
    return out.map(cleanLuaCall);
  }

  // Some models (seen live on GLM) wrap execute_luau in the JSON envelope AND
  // keep the ###LUA### / ###END_LUA### markers INSIDE the code string, e.g.
  //   {"command":"execute_luau","params":{"code":"###LUA###\n<lua>\n###END_LUA###"}}
  // Once JSON-decoded the code still starts with the literal markers, which the
  // MCP rejects ("Failed to parse command code"). Strip a leading start marker
  // and a trailing end marker from execute_luau's code, and adopt the marker's
  // datamodel when none was given. No-op for a clean code string.
  function cleanLuaCall(call) {
    if (!call || call.tool !== "execute_luau") return call;
    const code = call.arguments && call.arguments.code;
    if (typeof code !== "string") return call;
    const s = findLuaStart(code);
    if (s.pos === -1) return call;
    const e = findLuaEnd(code, s.pos + s.len);
    call.arguments.code = code.slice(s.pos + s.len, e === -1 ? code.length : e).trim();
    if (!call.arguments.datamodel_type) call.arguments.datamodel_type = s.dm;
    return call;
  }

  // Last-resort salvage of a CUT-OFF JSON command: the model hit its output
  // limit with the whole payload complete but the trailing closers missing
  // (seen live on Qwen: a big multi_edit missing exactly ONE final "}").
  // Strictly conservative - we only auto-close when it is provably just the
  // closing sequence that was lost, never when actual content was amputated:
  //  - the scan must NOT end inside a string literal (a value cut mid-string
  //    means real content is missing → keep the parse_error);
  //  - the last non-whitespace char must terminate a complete JSON value
  //    (`"`, `}`, `]`, digit, or the tail of true/false/null);
  //  - at most MAX_SALVAGE_CLOSERS closers may be appended. 2 covers the
  //    root-brace and params-brace cases; a deeper deficit usually means the
  //    cut fell between items (e.g. mid-edits-array), where running a partial
  //    command would be dangerous - the retry feedback stays the right call.
  // Callers must only invoke this once generation has ENDED (the watcher's
  // parse_error branch), never on a still-streaming reply.
  const MAX_SALVAGE_CLOSERS = 2;
  function salvageCutOff(text) {
    for (const key of ['"command"', '"tool"']) {
      const k = text.indexOf(key);
      if (k === -1) continue;
      const start = text.lastIndexOf("{", k);
      if (start === -1) continue;
      if (matchBrace(text, start) !== -1) continue; // closed → not our case
      // String-aware bracket stack from the opener to the end of the text.
      const stack = [];
      let inStr = false, esc = false;
      for (let i = start; i < text.length; i++) {
        const c = text[i];
        if (inStr) {
          if (esc) esc = false;
          else if (c === "\\") esc = true;
          else if (c === '"') inStr = false;
        } else if (c === '"') inStr = true;
        else if (c === "{") stack.push("}");
        else if (c === "[") stack.push("]");
        else if (c === "}" || c === "]") {
          if (stack.pop() !== c) return null; // mismatched nesting → hopeless
        }
      }
      if (inStr) return null;                       // cut mid-string value
      if (!stack.length || stack.length > MAX_SALVAGE_CLOSERS) return null;
      const body = text.slice(start).trimEnd();
      if (!/["}\]0-9]$|(?:true|false|null)$/.test(body)) return null; // value incomplete
      try {
        const call = normalizeCall(parseLoose(body + stack.reverse().join("")));
        if (call) return cleanLuaCall(call);
      } catch {}
      return null;
    }
    return null;
  }

  function toolNameFromText(txt) {
    // Match the name even BEFORE its closing quote (`[^"]*`), so the chip shows
    // the real command name AS IT IS TYPED instead of a generic "command"
    // placeholder until the JSON closes. A still-empty value falls through.
    // Trim: while the value is still streaming it can be whitespace-only (e.g.
    // Kimi renders `"tool": "    "` for a beat), which would otherwise show a
    // blank chip label until the loop repaints it. A whitespace value falls
    // through to the placeholder below instead.
    if (hasDsml(txt)) {
      const d = DSML_INVOKE_NAME_RE.exec(txt);
      if (d && d[1].trim()) return d[1].trim();
    }
    const m = txt.match(/"(?:command|tool)"\s*:\s*"([^"]*)/);
    if (m && m[1].trim()) return m[1].trim();
    if (txt.includes("execute_luau") || LUA_START_RE.test(txt)) return "execute_luau";
    return "command";
  }

  // A turn the EXTENSION injected (always sent as a user turn): a tool result, an
  // ERROR, or a "(System note: …)" control message. Matched ONLY by the fixed
  // shapes we emit - never by command-like keywords, since a parse-error note
  // quotes a {"command": …} example that must NOT be read as a real command.
  function isInjectedFeedback(txt) {
    return /^\s*Output of '/.test(txt) ||
           /^\s*\[PlazCode retained the COMPLETE result\. This is the first page, not truncated source\. Read the rest with plazcode_result_read \{id:"[a-f0-9-]{36}",offset:\d+\}/.test(txt) ||
           /^\s*ERROR\b/.test(txt) ||
           /^\s*\(System note:/.test(txt);
  }

  // The assistant emitted a RobloxScript command (JSON or a ###LUA### block).
  function hasCommandShape(txt) {
    txt=withoutResultEnvelopes(txt);
    return txt.includes(START_M) ||
           LUA_START_RE.test(txt) ||
           CMD_KEY_RE.test(commandZone(txt)) || // command/tool with PlazCode without params (e.g. list_commands)
           hasDsml(txt);           // DeepSeek's own DSML tool-call markup
  }

  return {
    START_M, END_M, LUA_START_RE, LUA_END_RE, CMD_KEY_RE, DSML_SIG_RE,
    hasDsml, hasOpenDsml, parseDsml, orphanDsmlClosers, dsmlClosingRun,
    findLuaStart, findLuaEnd, matchBrace, extractJson, normalizeCall,
    hasToolSignature, commandZone, setFlatTranscript, hasOpenToolBlock, parseToolCalls, commandDiagnosis, salvageCutOff, toolNameFromText,
    isInjectedFeedback, hasCommandShape,
  };
})();
