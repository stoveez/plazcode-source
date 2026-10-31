"use strict";
// A command card must not spin forever while the bar says finished (seen on Notion):
// the restart watchdog may act when the soft generating signal is stuck on, and a loop
// error must settle the running card.
const fs = require("fs"), path = require("path"), assert = require("assert");
const R = __dirname; let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log("ok", n); } catch (e) { fail++; console.log("FAIL", n, e.message); } }
for (const base of ["", "PlazCode-Extension"]) {
  const file = path.join(R, base, "core/main.js");
  if (!fs.existsSync(file)) continue;
  const main = fs.readFileSync(file, "utf8");
  const start = main.indexOf("rsInterval(() => {\nif (!A.started || A.running");
  const dog = main.slice(start, start + 6000);
  t(base + " watchdog exists", () => assert(start > 0));
  t(base + " stuck soft signal is bypassed only with no Stop button and frozen text", () => {
    assert(/if \(P\.isGenerating\(\)\) \{/.test(dog));
    assert(dog.includes("P.isHardGenerating ? !!P.isHardGenerating() : false"));
    assert(dog.includes("> T.STABLE_MS"));
    assert(/if \(hardOn \|\| !frozen \|\| !norm \|\| RSParse\.hasOpenToolBlock\(liveTxt\)\) return;/.test(dog));
  });
  t(base + " a stuck-signal resume is logged", () => assert(dog.includes('diag("resume.genStuck"')));
  t(base + " blocked resumes are logged for reports", () => { assert(dog.includes("alreadyExecuted")); assert(dog.includes("commandNotParseable")); });
  t(base + " the old stopped/halted guards are still there", () => {
    assert(dog.includes("if (A.userStopped) return;")); assert(dog.includes("P.turnHalted(item)")); assert(dog.includes("A.bootBaselineId"));
  });
  t(base + " a loop error settles the running card", () => {
    const i = main.indexOf('diag("loop.error"'); assert(i > 0);
    const near = main.slice(i, i + 700);
    assert(near.includes("A.toolRunning && A.toolItem") && near.includes('"interrupted"'));
  });
}
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
