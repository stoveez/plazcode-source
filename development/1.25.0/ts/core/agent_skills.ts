// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.25.0/ts/core/agent_skills.ts (TypeScript): edit that file, then run node development/1.25.0/ts/build.cjs.
// Extra AgentScript (LOCAL) commands layered on the native workspace tools.
// list_commands advertises them; runTool intercepts and maps onto read/write/run_command.
const AgentScriptSkills = (() => {
  "use strict";

  type SkillParam = { type: string; req: boolean; desc?: string };
  type SkillCommand = { name: string; description: string; params: Record<string, SkillParam> };
  type RunToolFn = (call: { tool: string; arguments: Record<string, unknown> }) => Promise<unknown>;

  const SKILL_COMMANDS: SkillCommand[] = [
    { name: "append_file", description: "Append text to a file (creates it if missing).", params: { path: { type: "string", req: true }, content: { type: "string", req: true } } },
    { name: "copy_file", description: "Copy a text file to a new path (parents created).", params: { source: { type: "string", req: true }, destination: { type: "string", req: true } } },
    { name: "replace_in_files", description: "Replace every occurrence of query with replacement across matching files.", params: { query: { type: "string", req: true }, replacement: { type: "string", req: true }, include: { type: "string", req: false, desc: "glob, default **/*" } } },
    { name: "touch_file", description: "Create an empty file if it does not exist; no-op if it does.", params: { path: { type: "string", req: true } } },
    { name: "file_exists", description: "Check whether a path exists (file or folder).", params: { path: { type: "string", req: true } } },
    { name: "count_lines", description: "Count lines in a text file.", params: { path: { type: "string", req: true } } },
    { name: "find_todos", description: "Search the workspace for TODO/FIXME/HACK comments.", params: { include: { type: "string", req: false } } },
    { name: "write_json", description: "Write pretty JSON to a path. Pass data as an object or a JSON string.", params: { path: { type: "string", req: true }, data: { type: "string", req: false }, content: { type: "string", req: false } } },
    { name: "patch_json", description: "Set a dotted key on a JSON file (creates nested objects as needed) and write it back.", params: { path: { type: "string", req: true }, key: { type: "string", req: true, desc: "a.b.c" }, value: { type: "string", req: false } } },
    { name: "run_python", description: "Run a .py file or an inline snippet with python.", params: { file: { type: "string", req: false }, code: { type: "string", req: false }, timeout_seconds: { type: "number", req: false } } },
    { name: "run_node", description: "Run a .js file or an inline snippet with node.", params: { file: { type: "string", req: false }, code: { type: "string", req: false }, timeout_seconds: { type: "number", req: false } } },
    { name: "git_status", description: "git status -sb in the workspace.", params: {} },
    { name: "git_diff", description: "git diff (optional path).", params: { path: { type: "string", req: false } } },
    { name: "git_log", description: "git log --oneline (limit default 20).", params: { limit: { type: "number", req: false } } },
    { name: "npm_install", description: "npm install, optionally a package name.", params: { pkg: { type: "string", req: false }, timeout_seconds: { type: "number", req: false } } },
    { name: "npm_script", description: "npm run <script>.", params: { script: { type: "string", req: true }, timeout_seconds: { type: "number", req: false } } },
    { name: "dir_size", description: "Sum file sizes under a folder (PowerShell).", params: { path: { type: "string", req: false } } },
    { name: "which_cmd", description: "Locate an executable on PATH (where.exe / command -v).", params: { name: { type: "string", req: true } } },
    { name: "concat_files", description: "Concatenate text files into dest.", params: { paths: { type: "array", req: true }, dest: { type: "string", req: true }, sep: { type: "string", req: false } } },
    { name: "list_by_ext", description: "List files by extension (e.g. js, py, lua).", params: { ext: { type: "string", req: true } } },
    { name: "grep_count", description: "Count grep hits for a query.", params: { query: { type: "string", req: true }, include: { type: "string", req: false }, regex: { type: "boolean", req: false } } },
    { name: "scaffold_file", description: "Write a starter file from a tiny template (js/py/html/md/json/lua) if the path does not exist.", params: { path: { type: "string", req: true }, title: { type: "string", req: false } } },
    { name: "read_range", description: "Read a slice of a text file (1-based start line, inclusive end).", params: { path: { type: "string", req: true }, start: { type: "number", req: true }, end: { type: "number", req: false } } },
    { name: "file_stat", description: "File/folder info (size, type) for a path.", params: { path: { type: "string", req: true } } },
    { name: "replace_once", description: "Replace the first occurrence of query in a file (leaves the rest).", params: { path: { type: "string", req: true }, query: { type: "string", req: true }, replacement: { type: "string", req: true } } },
    { name: "list_recent", description: "List files under a folder (native list_directory).", params: { path: { type: "string", req: false } } },
    // env_info is NOT an extra any more (1.24.27): the desktop app has a real env_info
    // (host, OS, CPU, memory, user, workspace root). The old extra shadowed it and called a
    // command named list_dir that does not exist, so every env_info returned an
    // "unknown command" error glued under a file_info result.
  ];

  // The native command that each extra runs is an implementation detail. Its own
  // "Output of '<inner>':" heading made a result look like it belonged to a command the
  // AI never sent (it reported results as "cross-wired"/"replayed"), so every extra's
  // result is headed with the extra's own name and inner headings are removed.
  const HEAD_RE = /^Output of '[^'\n]*':[ \t]*(?:\r?\n|$)/;
  function plain(raw: unknown) {
    return String(raw == null ? "" : raw).replace(HEAD_RE, "");
  }
  function relabel(name: string, raw: unknown) {
    const text = String(raw == null ? "" : raw);
    if (/^\s*(?:ERROR|\(stopped by user\))/i.test(text)) {
      // Keep errors as errors, but say which extra hit them.
      const inner = /^\s*ERROR calling '([^']*)':\s*/.exec(text);
      return inner && inner[1] !== name
        ? `ERROR in '${name}' (while it ran ${inner[1]}): ` + text.slice(inner[0].length)
        : text;
    }
    const lines = plain(text).split(/\r?\n/).filter((ln) => !/^Output of '[^'\n]*':\s*$/.test(ln));
    return `Output of '${name}':\n` + lines.join("\n");
  }

  function describeCommands() {
    const lines: string[] = [];
    lines.push("— AgentScript extras: file helpers, JSON patch, git, npm, python/node runners (mapped onto the native workspace tools). —");
    for (const c of SKILL_COMMANDS) {
      const compact: string[] = [];
      const detailed: string[] = [];
      for (const [k, v] of Object.entries(c.params) as Array<[string, SkillParam]>) {
        const mark = v.req ? "" : "?";
        if (v.desc && v.desc.length > 45) detailed.push(`    ${k}${mark}: ${v.type} - ${v.desc}`);
        else compact.push(`${k}${mark}:${v.type}${v.desc ? ` "${v.desc}"` : ""}`);
      }
      const paramLines = [compact.length ? `    ${compact.join(", ")}` : "", ...detailed].filter(Boolean).join("\n");
      lines.push(`${c.name}: ${c.description}${paramLines ? "\n" + paramLines : ""}`);
    }
    return lines;
  }

  function parseReadChunk(raw: unknown) {
    const text = String(raw || "");
    const rows: Array<{ lineNum: number; text: string }> = [];
    for (const ln of text.split("\n")) {
      const m = ln.match(/^\s*(\d+)\s+\|\s(.*)$/);
      if (m) rows.push({ lineNum: Number(m[1]), text: m[2] });
    }
    const headerMatch = /\((\d+)\s+lines?,\s*[^)]+\)/i.exec(text);
    const headerTotal = headerMatch ? Number(headerMatch[1]) : null;
    const footerMatch = /\.\.\.\s*lines\s+\d+-\d+\s+continue\s+\(use\s+offset=(\d+)\)/i.exec(text);
    const nextOffset = footerMatch ? Number(footerMatch[1]) : null;
    const clipped = /\.\.\.\s*\[output truncated at \d+ characters\]/i.test(text);
    return { rows, headerTotal, nextOffset, clipped };
  }
  type ReadAllResult = { ok: true; text: string; lines: number } | { ok: false; binary: boolean; error: unknown };
  async function readAllText(path: unknown, call: (tool: string, arguments_: Record<string, unknown>) => Promise<unknown>): Promise<ReadAllResult> {
    const allLines: string[] = [];
    let offset = 1;
    const pageLimit = 1000;
    const maxPages = 250;
    for (let page = 0; page < maxPages; page++) {
      const raw = await call("read_file", { path, offset, limit: pageLimit });
      if (isErr(raw)) return { ok: false, binary: false, error: raw };
      if (/\blooks like a BINARY file\b/i.test(String(raw))) return { ok: false, binary: true, error: raw };
      const parsed = parseReadChunk(raw);
      if (!parsed.rows.length) break;
      if (offset > 1 && parsed.rows[0].lineNum < offset) break;
      if (parsed.clipped && parsed.nextOffset == null) {
        if (parsed.rows.length <= 1) {
          return { ok: false, binary: false, error: `ERROR: line ${offset} in '${path}' exceeds read_file output limit; cannot read without truncation.` };
        }
        const last = parsed.rows.pop()!;
        for (const row of parsed.rows) allLines.push(row.text);
        if (last.lineNum <= offset) break;
        offset = last.lineNum;
        continue;
      }
      for (const row of parsed.rows) allLines.push(row.text);
      const lastLineNum = parsed.rows[parsed.rows.length - 1].lineNum;
      if (parsed.nextOffset != null && parsed.nextOffset > offset) {
        offset = parsed.nextOffset;
        continue;
      }
      if (parsed.headerTotal != null && lastLineNum < parsed.headerTotal && lastLineNum >= offset) {
        offset = lastLineNum + 1;
        continue;
      }
      break;
    }
    if (offset > 1 && allLines.length >= pageLimit * maxPages) {
      return { ok: false, binary: false, error: `ERROR: '${path}' exceeds pagination safety limit (${pageLimit * maxPages} lines).` };
    }
    return { ok: true, text: allLines.join("\n"), lines: allLines.length };
  }
  function encodeBase64(text: string): string {
    if (typeof btoa === "function") return btoa(unescape(encodeURIComponent(text)));
    return (globalThis as any).Buffer.from(text, "utf8").toString("base64");
  }
  function shQuote(value: string): string {
    return "'" + value.replace(/'/g, "'\\''") + "'";
  }
  async function copyBinaryFile(source: string, destination: string, call: (tool: string, arguments_: Record<string, unknown>) => Promise<unknown>): Promise<unknown> {
    if (/[\0\r\n]/.test(source) || /[\0\r\n]/.test(destination)) {
      return "ERROR: invalid path for copy_file.";
    }
    let isWindows = false;
    const env = await call("env_info", {});
    if (!isErr(env)) {
      isWindows = /\bOS:\s*Windows\b/i.test(String(env)) || /uses cmd by default/i.test(String(env));
    } else {
      const proc = (globalThis as any).process;
      isWindows = (proc && proc.platform === "win32") ||
        (typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent || ""));
    }
    if (isWindows) {
      const payload = encodeBase64(JSON.stringify([source, destination]));
      const ps = `$p = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${payload}')) | ConvertFrom-Json; $dir = [System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($p[1])); if ($dir) { [System.IO.Directory]::CreateDirectory($dir) | Out-Null }; [System.IO.File]::Copy($p[0], $p[1], $true)`;
      return await call("run_command", { command: ps, shell: "powershell" });
    }
    const qSrc = shQuote(source);
    const qDst = shQuote(destination);
    return await call("run_command", { command: `d=${qDst}; mkdir -p -- "$(dirname -- "$d")" && cp -f -- ${qSrc} "$d"`, shell: "sh" });
  }
  function isErr(raw: unknown) {
    const s = String(raw || "");
    return /^ERROR/i.test(s) || s.includes("ERROR in") || s.includes("ERROR calling") || s.includes("currently OFFLINE");
  }
  function missing(args: Record<string, unknown>, key: string) {
    if (args[key] === undefined || args[key] === null || args[key] === "") {
      return `ERROR: missing required param '${key}'`;
    }
    return null;
  }

  const TEMPLATES: Record<string, (t: unknown) => string> = {
    js: (t) => `// ${t}\n\nfunction main() {\n  console.log(${JSON.stringify(t)});\n}\n\nmain();\n`,
    py: (t) => `#!/usr/bin/env python3\n\"\"\"${t}\"\"\"\n\ndef main():\n    print(${JSON.stringify(t)})\n\nif __name__ == \"__main__\":\n    main()\n`,
    html: (t) => `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <title>${t}</title>\n</head>\n<body>\n  <h1>${t}</h1>\n</body>\n</html>\n`,
    md: (t) => `# ${t}\n\n`,
    json: () => `{\n}\n`,
    lua: (t) => `-- ${t}\nprint(${JSON.stringify(t)})\n`,
    txt: (t) => `${t}\n`,
  };

  async function run(name: string, args: Record<string, any> | null | undefined, runTool: RunToolFn) {
    return relabel(name, await runExtra(name, args, runTool));
  }

  async function runExtra(name: string, args: Record<string, any> | null | undefined, runTool: RunToolFn): Promise<unknown> {
    args = args || {};
    const call = (tool: string, arguments_: Record<string, unknown>) => runTool({ tool, arguments: arguments_ });

    if (name === "append_file") {
      const m = missing(args, "path") || missing(args, "content");
      if (m) return m;
      // Native append preserves the unread tail, original line endings and
      // concurrent append records. The shared guard requires advertised native
      // append support; an older app must fail before any write, never fall back.
      return await call("write_file", { path: args.path, content: String(args.content), append: true, ensure_newline: true });
    }
    if (name === "copy_file") {
      const m = missing(args, "source") || missing(args, "destination");
      if (m) return m;
      const readRes = await readAllText(args.source, call);
      if (!readRes.ok) {
        if (readRes.binary) {
          return await copyBinaryFile(String(args.source), String(args.destination), call);
        }
        return readRes.error;
      }
      return await call("write_file", { path: args.destination, content: readRes.text });
    }
    if (name === "replace_in_files") {
      const m = missing(args, "query") || missing(args, "replacement");
      if (m) return m;
      const grep = await call("grep_files", { query: args.query, include: args.include || "**/*", regex: false });
      if (isErr(grep)) return grep;
      const paths: string[] = [];
      const seen = new Set<string>();
      for (const ln of String(grep).split("\n")) {
        const mm = ln.match(/^\s+(.+?):(\d+):/);
        if (!mm) continue;
        const p = mm[1];
        if (seen.has(p)) continue;
        seen.add(p);
        paths.push(p);
      }
      if (!paths.length) return `Output of 'replace_in_files':\nNo files matched ${JSON.stringify(args.query)}.`;
      const results: unknown[] = [];
      for (const p of paths) {
        results.push(await call("edit_file", { path: p, old_string: args.query, new_string: args.replacement, replace_all: true }));
      }
      return `Output of 'replace_in_files':\nUpdated ${paths.length} file(s):\n${paths.map((p) => "- " + p).join("\n")}\n\n${results.join("\n")}`;
    }
    if (name === "touch_file") {
      const m = missing(args, "path");
      if (m) return m;
      const info = await call("file_info", { path: args.path });
      if (!isErr(info)) return `Output of 'touch_file':\n${args.path} already exists.\n${info}`;
      return await call("write_file", { path: args.path, content: "" });
    }
    if (name === "file_exists") {
      const m = missing(args, "path");
      if (m) return m;
      const info = await call("file_info", { path: args.path });
      const exists = !isErr(info);
      return `Output of 'file_exists':\n${JSON.stringify({ path: args.path, exists })}\n${exists ? info : "(missing)"}`;
    }
    if (name === "count_lines") {
      const m = missing(args, "path");
      if (m) return m;
      const readRes = await readAllText(args.path, call);
      if (!readRes.ok) return readRes.binary ? `ERROR: ${args.path} is a binary file` : readRes.error;
      const n = readRes.text ? readRes.text.split("\n").length : 0;
      return `Output of 'count_lines':\n${args.path}: ${n} line(s)`;
    }
    if (name === "find_todos") {
      return await call("grep_files", { query: "TODO|FIXME|HACK|XXX", include: args.include || "**/*", regex: true, ignore_case: true });
    }
    if (name === "write_json") {
      const m = missing(args, "path");
      if (m) return m;
      let data = args.data !== undefined ? args.data : args.content;
      if (data === undefined) return "ERROR: missing required param 'data'";
      let text: string;
      if (typeof data === "string") {
        try { text = JSON.stringify(JSON.parse(data), null, 2); }
        catch (e) { text = data; }
      } else {
        try { text = JSON.stringify(data, null, 2); }
        catch (e) { return `ERROR: data is not JSON-serializable: ${e}`; }
      }
      if (!text.endsWith("\n")) text += "\n";
      return await call("write_file", { path: args.path, content: text });
    }
    if (name === "patch_json") {
      const m = missing(args, "path") || missing(args, "key");
      if (m) return m;
      const readRes = await readAllText(args.path, call);
      if (!readRes.ok) return readRes.binary ? `ERROR: ${args.path} is a binary file` : readRes.error;
      let obj: Record<string, any>;
      try { obj = JSON.parse(readRes.text || "{}"); }
      catch (e) { return `ERROR: ${args.path} is not valid JSON: ${e}`; }
      const parts = String(args.key).split(".").filter(Boolean);
      if (!parts.length) return "ERROR: key is empty";
      let cur = obj;
      for (let i = 0; i < parts.length - 1; i++) {
        const k = parts[i];
        if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {};
        cur = cur[k];
      }
      let val = args.value;
      if (typeof val === "string") {
        try { val = JSON.parse(val); } catch (e) { /* keep string */ }
      }
      cur[parts[parts.length - 1]] = val;
      return await call("write_file", { path: args.path, content: JSON.stringify(obj, null, 2) + "\n" });
    }
    if (name === "run_python") {
      const timeout = Number(args.timeout_seconds) || 60;
      if (args.file) return await call("run_command", { command: `python "${args.file}"`, timeout_seconds: timeout });
      if (args.code) {
        const b64 = typeof btoa === "function" ? btoa(unescape(encodeURIComponent(args.code))) : (globalThis as any).Buffer.from(args.code, "utf8").toString("base64");
        return await call("run_command", { command: `python -c "import base64; exec(base64.b64decode('${b64}').decode())"`, timeout_seconds: timeout });
      }
      return "ERROR: missing required param 'file' or 'code'";
    }
    if (name === "run_node") {
      const timeout = Number(args.timeout_seconds) || 60;
      if (args.file) return await call("run_command", { command: `node "${args.file}"`, timeout_seconds: timeout });
      if (args.code) {
        const b64 = typeof btoa === "function" ? btoa(unescape(encodeURIComponent(args.code))) : (globalThis as any).Buffer.from(args.code, "utf8").toString("base64");
        return await call("run_command", { command: `node -e "eval(Buffer.from('${b64}','base64').toString())"`, timeout_seconds: timeout });
      }
      return "ERROR: missing required param 'file' or 'code'";
    }
    if (name === "git_status") return await call("run_command", { command: "git status -sb" });
    if (name === "git_diff") return await call("run_command", { command: args.path ? `git diff -- "${args.path}"` : "git diff" });
    if (name === "git_log") {
      const n = Math.min(100, Math.max(1, Number(args.limit) || 20));
      return await call("run_command", { command: `git log -${n} --oneline` });
    }
    if (name === "npm_install") {
      const timeout = Number(args.timeout_seconds) || 180;
      const cmd = args.pkg ? `npm install ${args.pkg}` : "npm install";
      return await call("run_command", { command: cmd, timeout_seconds: timeout });
    }
    if (name === "npm_script") {
      const m = missing(args, "script");
      if (m) return m;
      return await call("run_command", { command: `npm run ${args.script}`, timeout_seconds: Number(args.timeout_seconds) || 180 });
    }
    if (name === "dir_size") {
      const p = args.path || ".";
      return await call("run_command", { command: `powershell -NoProfile -Command "(Get-ChildItem -LiteralPath '${String(p).replace(/'/g, "''")}' -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum"` });
    }
    if (name === "which_cmd") {
      const m = missing(args, "name");
      if (m) return m;
      const n = String(args.name).replace(/["&|<>]/g, "");
      return await call("run_command", { command: `where ${n}` });
    }
    if (name === "concat_files") {
      if (!Array.isArray(args.paths) || !args.paths.length) return "ERROR: missing required param 'paths'";
      const m = missing(args, "dest");
      if (m) return m;
      const chunks: string[] = [];
      for (const p of args.paths) {
        const readRes = await readAllText(String(p), call);
        if (!readRes.ok) return readRes.binary ? `ERROR: ${p} is a binary file` : readRes.error;
        chunks.push(readRes.text);
      }
      const sep = args.sep == null ? "\n" : String(args.sep);
      return await call("write_file", { path: args.dest, content: chunks.join(sep) });
    }
    if (name === "list_by_ext") {
      const m = missing(args, "ext");
      if (m) return m;
      const ext = String(args.ext).replace(/^\./, "");
      return await call("search_files", { pattern: `**/*.${ext}` });
    }
    if (name === "grep_count") {
      const m = missing(args, "query");
      if (m) return m;
      const grep = await call("grep_files", { query: args.query, include: args.include || "**/*", regex: args.regex === true });
      if (isErr(grep)) return grep;
      const hits = String(grep).split("\n").filter((ln) => /^\s+.+:\d+:/.test(ln)).length;
      return `Output of 'grep_count':\n${hits} hit(s) for ${JSON.stringify(args.query)}\n\n${grep}`;
    }
    if (name === "scaffold_file") {
      const m = missing(args, "path");
      if (m) return m;
      const info = await call("file_info", { path: args.path });
      if (!isErr(info)) return `ERROR: ${args.path} already exists — scaffold_file will not overwrite.`;
      const ext = (String(args.path).split(".").pop() as string).toLowerCase();
      const title = args.title || args.path;
      const fn = TEMPLATES[ext] || TEMPLATES.txt;
      return await call("write_file", { path: args.path, content: fn(title) });
    }
    if (name === "read_range") {
      const m = missing(args, "path") || missing(args, "start");
      if (m) return m;
      const start = Math.max(1, Number(args.start) || 1);
      const end = Math.max(start, Number(args.end) || (start + 80));
      const limit = Math.min(4000, end - start + 1);
      return await call("read_file", { path: args.path, offset: start, limit });
    }
    if (name === "file_stat") {
      const m = missing(args, "path");
      if (m) return m;
      return await call("file_info", { path: args.path });
    }
    if (name === "replace_once") {
      const m = missing(args, "path") || missing(args, "query") || missing(args, "replacement");
      if (m) return m;
      const readRes = await readAllText(args.path, call);
      if (!readRes.ok) return readRes.binary ? `ERROR: ${args.path} is a binary file` : readRes.error;
      const cur = readRes.text;
      const q = String(args.query);
      const i = cur.indexOf(q);
      if (i < 0) return `ERROR: query not found in ${args.path}`;
      const next = cur.slice(0, i) + String(args.replacement) + cur.slice(i + q.length);
      return await call("write_file", { path: args.path, content: next });
    }
    if (name === "list_recent") {
      return await call("list_directory", { path: args.path || "." });
    }
    return `ERROR: unknown AgentScript extra '${name}'`;
  }

  return {
    SKILL_COMMANDS,
    SKILL_OPS: SKILL_COMMANDS.map((c) => c.name),
    describeCommands,
    run,
  };
})();
