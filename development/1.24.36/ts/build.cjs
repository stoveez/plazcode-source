// TypeScript sources for some extension files (owner, 2026-11-15, step 2 of the move to TypeScript).
// development/1.24.36/ts/<path>.ts is the file to edit; overlay/<path>.js is made by erasing types (ts-blank-space)
// and collapsing only the erased horizontal whitespace so lines match 1:1 while preserving JS spacing/test anchors. Both files are committed.
//
//   node development/1.24.36/ts/build.cjs           write the .js files
//   node development/1.24.36/ts/build.cjs --check   fail if a .js file is not exactly what its .ts makes
//   node development/1.24.36/ts/build.cjs --types   run TypeScript's checker on every .ts file (each file on its own)
//   (pass optional relative paths/prefixes like `core/parser.ts` or `providers/` to filter any mode)
//
// Needs release-tools' node_modules (typescript, ts-blank-space): set NODE_PATH, or run it from a folder where they resolve.
"use strict";
const fs = require("fs"), path = require("path"), cp = require("child_process");
const HERE = __dirname, OVERLAY = path.join(HERE, "..", "overlay");
const req = (name) => require(require.resolve(name, { paths: [process.cwd(), ...(process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean)] }));

function sources(filters) {
  const out = [];
  if (fs.existsSync(HERE)) {
    for (const f of fs.readdirSync(HERE).sort()) {
      if (f.endsWith(".ts") && !f.endsWith(".d.ts")) out.push(f);
    }
  }
  for (const dir of ["providers", "core"]) {
    const abs = path.join(HERE, dir);
    if (fs.existsSync(abs)) {
      for (const f of fs.readdirSync(abs).sort()) {
        if (f.endsWith(".ts") && !f.endsWith(".d.ts")) out.push(dir + "/" + f);
      }
    }
  }
  if (!filters || !filters.length) return out;
  const norm = filters.map((x) => x.replace(/\\/g, "/").replace(/^(?:development\/1\.24\.36\/)?ts\//, ""));
  return out.filter((f) => norm.some((p) => f === p || f.startsWith(p.endsWith("/") ? p : p + "/")));
}

function compactBlank(tsSrc, jsSrc) {
  if (tsSrc.length !== jsSrc.length) return jsSrc;
  const tsLines = tsSrc.split("\n");
  const jsLines = jsSrc.split("\n");
  const isId = (c) => /[A-Za-z0-9_$]/.test(c);
  const out = [];
  for (let li = 0; li < tsLines.length; li++) {
    const tFull = tsLines[li];
    const jFull = jsLines[li];
    if (tFull === jFull) { out.push(jFull); continue; }
    const cr = tFull.endsWith("\r") ? "\r" : "";
    const t = cr ? tFull.slice(0, -1) : tFull;
    const j = cr && jFull.endsWith("\r") ? jFull.slice(0, -1) : jFull;
    let i = 0;
    let res = "";
    while (i < t.length) {
      if (t[i] === j[i]) {
        res += j[i++];
        continue;
      }
      // Bridge across horizontal whitespace when another blanked char follows on the same line
      // (e.g. the space after `:` in `: Record<string, any>`).
      const start = i;
      let end = i;
      while (end < t.length) {
        if (t[end] !== j[end]) { end++; continue; }
        let k = end;
        while (k < t.length && (t[k] === " " || t[k] === "\t") && j[k] === t[k]) k++;
        if (k < t.length && t[k] !== j[k]) { end = k; continue; }
        break;
      }
      const origRemoved = t.slice(start, end);
      const jsSlice = j.slice(start, end);
      const rightChar = end < t.length ? t[end] : "";
      const trimLeading = origRemoved.trimStart();
      if ((trimLeading.startsWith(":") || /^(as|satisfies)\b/.test(trimLeading)) && (res.endsWith(" ") || res.endsWith("\t"))) {
        const trimmed = res.replace(/[ \t]+$/, "");
        const newLeft = trimmed.length ? trimmed[trimmed.length - 1] : "";
        res = (!isId(newLeft) || !isId(rightChar)) ? trimmed : trimmed + " ";
      }
      const leftChar = res.length ? res[res.length - 1] : "";
      const nonWs = jsSlice.replace(/[ \t]+/g, "");
      if (nonWs) {
        res += nonWs;
      } else if (isId(leftChar) && isId(rightChar)) {
        res += " ";
      }
      i = end;
    }
    if (/^[ \t]*$/.test(res)) res = "";
    out.push(res + cr);
  }
  return out.join("\n");
}

function erase(file) {
  const blank = req("ts-blank-space").default;
  const tsSrc = fs.readFileSync(path.join(HERE, file), "utf8");
  const errors = [];
  const js = blank(tsSrc, (node) => errors.push(node.getText ? node.getText().slice(0, 60) : String(node.kind)));
  if (errors.length) throw new Error(file + ": TypeScript syntax that cannot be erased to JavaScript: " + errors.join(" | "));
  return compactBlank(tsSrc, js);
}

function collectTopDeclaredNames(ts, sf) {
  const names = new Set();
  const addBinding = (nameNode) => {
    if (!nameNode) return;
    if (ts.isIdentifier(nameNode)) names.add(nameNode.text);
    else if (ts.isObjectBindingPattern(nameNode) || ts.isArrayBindingPattern(nameNode)) {
      for (const el of nameNode.elements) if (ts.isBindingElement(el)) addBinding(el.name);
    }
  };
  for (const stmt of sf.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) addBinding(decl.name);
    } else if ((ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) && stmt.name) {
      names.add(stmt.name.text);
    }
  }
  return names;
}

function filterEnvDeclarationText(ts, text, fileName, ownNames) {
  if (!ownNames.size) return text;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2022, true);
  const ranges = [];
  for (const stmt of sf.statements) {
    let hit = false;
    if (ts.isVariableStatement(stmt)) {
      hit = stmt.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && ownNames.has(d.name.text));
    } else if ((ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) && stmt.name && ownNames.has(stmt.name.text)) {
      hit = true;
    }
    if (hit) ranges.push([stmt.getStart(sf), stmt.getEnd()]);
  }
  if (!ranges.length) return text;
  const chars = text.split("");
  for (const [start, end] of ranges) {
    for (let i = start; i < end; i++) if (chars[i] !== "\n" && chars[i] !== "\r") chars[i] = " ";
  }
  return chars.join("");
}

function envFilesFor(file) {
  const base = [path.join(HERE, "types", "provider.d.ts"), path.join(HERE, "types", "globals.d.ts")];
  if (file.startsWith("core/")) return [...base, path.join(HERE, "types", "core-env.d.ts")];
  if (file.startsWith("providers/")) return [...base, path.join(HERE, "types", "provider-env.d.ts")];
  return [...base, path.join(HERE, "types", "extension-env.d.ts")];
}

const args = process.argv.slice(2);
const mode = args.find((a) => a === "--types" || a === "--check") || "";
const filters = args.filter((a) => a !== "--types" && a !== "--check");
const selected = sources(filters);
if (filters.length && !selected.length) {
  console.error("No matching TypeScript source files for: " + filters.join(", "));
  process.exit(1);
}

let bad = 0;
if (mode === "--types") {
  const ts = req("typescript");
  const base = JSON.parse(fs.readFileSync(path.join(HERE, "tsconfig.json"), "utf8"));
  const parsed = ts.convertCompilerOptionsFromJson(base.compilerOptions, HERE);
  if (parsed.errors && parsed.errors.length) {
    for (const d of parsed.errors) console.error(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
    process.exit(1);
  }
  const baseHost = ts.createCompilerHost(parsed.options, true);
  const libCache = new Map();
  const rawDtsCache = new Map();
  const sfDtsCache = new Map();
  const origGetSourceFile = baseHost.getSourceFile.bind(baseHost);
  const readDtsRaw = (norm) => {
    if (!rawDtsCache.has(norm)) rawDtsCache.set(norm, fs.readFileSync(norm, "utf8"));
    return rawDtsCache.get(norm);
  };
  const typesDir = path.resolve(HERE, "types");

  for (const file of selected) {
    const absTarget = path.resolve(HERE, file);
    const targetSrc = fs.readFileSync(absTarget, "utf8");
    const targetSf = ts.createSourceFile(absTarget, targetSrc, parsed.options.target || ts.ScriptTarget.ES2022, true);
    const ownNames = collectTopDeclaredNames(ts, targetSf);
    const envFiles = envFilesFor(file);
    const virtualDts = new Map();
    for (const envPath of envFiles) {
      const norm = path.resolve(envPath);
      const raw = readDtsRaw(norm);
      const filtered = filterEnvDeclarationText(ts, raw, norm, ownNames);
      if (filtered !== raw) {
        virtualDts.set(norm, ts.createSourceFile(norm, filtered, parsed.options.target || ts.ScriptTarget.ES2022, true));
      }
    }
    const host = {
      ...baseHost,
      getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile) {
        const norm = path.resolve(fileName);
        if (norm === absTarget) return targetSf;
        if (virtualDts.has(norm)) return virtualDts.get(norm);
        if (norm.startsWith(typesDir + path.sep)) {
          if (!sfDtsCache.has(norm)) sfDtsCache.set(norm, ts.createSourceFile(norm, readDtsRaw(norm), languageVersion, true));
          return sfDtsCache.get(norm);
        }
        if (norm.endsWith(".d.ts")) {
          if (!libCache.has(norm)) {
            const sf = origGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
            if (sf) libCache.set(norm, sf);
            return sf;
          }
          return libCache.get(norm);
        }
        return origGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
      },
    };
    const program = ts.createProgram([absTarget, ...envFiles.map((p) => path.resolve(p))], parsed.options, host);
    const diags = ts.getPreEmitDiagnostics(program);
    const msgs = diags.map((d) => {
      const text = ts.flattenDiagnosticMessageText(d.messageText, " ");
      if (!d.file || d.start === undefined) return "error TS" + d.code + ": " + text;
      const pos = d.file.getLineAndCharacterOfPosition(d.start);
      const rel = path.resolve(d.file.fileName).replace(/^.*?[\\/]ts[\\/]/, "").replace(/\\/g, "/");
      return `${rel}(${pos.line + 1},${pos.character + 1}): error TS${d.code}: ${text}`;
    });
    console.log(file + ": " + (msgs.length ? msgs.length + " type error(s)" : "types OK"));
    msgs.forEach((m) => console.log("  " + m));
    bad += msgs.length;
  }
} else {
  for (const file of selected) {
    const target = path.join(OVERLAY, file.replace(/\.ts$/, ".js"));
    const js = erase(file);
    if (mode === "--check") {
      const now = fs.existsSync(target) ? fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n") : null;
      if (now !== js.replace(/\r\n/g, "\n")) { console.log("OUT OF DATE " + path.relative(OVERLAY, target) + ": run node development/1.24.36/ts/build.cjs"); bad++; }
      else console.log("ok " + path.relative(OVERLAY, target));
    } else { fs.writeFileSync(target, js); console.log("wrote " + path.relative(OVERLAY, target)); }
  }
}
process.exitCode = bad ? 1 : 0;
