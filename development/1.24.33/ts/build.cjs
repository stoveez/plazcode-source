// TypeScript sources for some extension files (owner, 2026-11-15, step 2 of the move to TypeScript).
// development/1.24.33/ts/<path>.ts is the file to edit; overlay/<path>.js is made from it by erasing the types into spaces
// (ts-blank-space), so the JavaScript keeps exactly the same lines and columns as the TypeScript and everything after it
// (prepare.py, tests, protection, the release) works on plain JavaScript as before. Both files are committed.
//
//   node development/1.24.33/ts/build.cjs           write the .js files
//   node development/1.24.33/ts/build.cjs --check   fail if a .js file is not exactly what its .ts makes
//   node development/1.24.33/ts/build.cjs --types   run TypeScript's checker on every .ts file (each file on its own)
//
// Needs release-tools' node_modules (typescript, ts-blank-space): set NODE_PATH, or run it from a folder where they resolve.
"use strict";
const fs = require("fs"), path = require("path"), cp = require("child_process");
const HERE = __dirname, OVERLAY = path.join(HERE, "..", "overlay");
const req = (name) => require(require.resolve(name, { paths: [process.cwd(), ...(process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean)] }));
function sources() {
  const out = [];
  for (const dir of ["providers", "core"]) {
    const abs = path.join(HERE, dir);
    if (fs.existsSync(abs)) for (const f of fs.readdirSync(abs).sort()) if (f.endsWith(".ts") && !f.endsWith(".d.ts")) out.push(dir + "/" + f);
  }
  return out;
}
function erase(file) {
  const blank = req("ts-blank-space").default;
  const errors = [];
  const js = blank(fs.readFileSync(path.join(HERE, file), "utf8"), (node) => errors.push(node.getText ? node.getText().slice(0, 60) : String(node.kind)));
  if (errors.length) throw new Error(file + ": TypeScript syntax that cannot be erased to JavaScript: " + errors.join(" | "));
  return js;
}
const mode = process.argv[2] || "";
let bad = 0;
if (mode === "--types") {
  const tsc = require.resolve("typescript/bin/tsc", { paths: [process.cwd(), ...(process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean)] });
  const base = JSON.parse(fs.readFileSync(path.join(HERE, "tsconfig.json"), "utf8"));
  for (const file of sources()) {
    const cfg = path.join(require("os").tmpdir(), "plazcode-tsc-" + process.pid + "-" + file.replace(/\W/g, "_") + ".json");
    fs.writeFileSync(cfg, JSON.stringify({ compilerOptions: base.compilerOptions, files: [path.join(HERE, file), path.join(HERE, "types", "provider.d.ts"), path.join(HERE, "types", "globals.d.ts"), ...(file.startsWith("core/") ? [path.join(HERE, "types", "core-env.d.ts")] : [])] }));
    const r = cp.spawnSync(process.execPath, [tsc, "-p", cfg], { encoding: "utf8" });
    fs.unlinkSync(cfg);
    const msgs = (r.stdout || "").split(/\r?\n/).filter((l) => /error TS\d+/.test(l)).map((l) => l.replace(/^.*?[\\/]ts[\\/]/, ""));
    console.log(file + ": " + (msgs.length ? msgs.length + " type error(s)" : "types OK"));
    msgs.forEach((m) => console.log("  " + m));
    bad += msgs.length;
  }
} else {
  for (const file of sources()) {
    const target = path.join(OVERLAY, file.replace(/\.ts$/, ".js"));
    const js = erase(file);
    if (mode === "--check") {
      const now = fs.existsSync(target) ? fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n") : null;
      if (now !== js.replace(/\r\n/g, "\n")) { console.log("OUT OF DATE " + path.relative(OVERLAY, target) + ": run node development/1.24.33/ts/build.cjs"); bad++; }
      else console.log("ok " + path.relative(OVERLAY, target));
    } else { fs.writeFileSync(target, js); console.log("wrote " + path.relative(OVERLAY, target)); }
  }
}
process.exitCode = bad ? 1 : 0;
