"use strict";
// 1.24.27 (owner, 2026-10-30): a tester's link between the extension and the app dropped every 15-70 minutes and
// came back about 20 s later; the Terminal only said "client disconnected". Checks:
//  1. a failed extension self-check is retried after 10 s instead of blocking pairing until the worker restarts;
//  2. the extension remembers why its last connection ended and whether the browser restarted its worker, and
//     reports it on the next connection;
//  3. the app logs every disconnect with its reason, does not re-hash the installation on status polls, and refuses
//     a request on a failed program check instead of silently dropping the connection.
// Run: node test-bridge-diagnostics.js
const fs = require("fs"), vm = require("vm"), assert = require("node:assert/strict"), nodeCrypto = require("crypto");
const dir = __dirname;

(async () => {
  // ── 1. protection.js: no sticky failure ───────────────────────────────────────────────────────────
  const KEY = "a".repeat(64);
  const src = fs.readFileSync(dir + "/protection.js", "utf8")
    .replace('"UNCONFIGURED_RELEASE_PUBLIC_KEY"', JSON.stringify(KEY)).replace('"UNCONFIGURED_RELEASE_CHANNEL"', '"release"');
  const body = new TextEncoder().encode("abc");
  const sha = nodeCrypto.createHash("sha256").update(Buffer.from(body)).digest("hex");
  const files = Object.fromEntries(["background.js", "manifest.json", "protection.js"].map((n) => [n, { bytes: 3, sha256: sha }]));
  const signed = { payload: JSON.stringify({ schema: 1, kind: "files", platform: "extension", channel: "release", version: "1.24.27", files }), signature: "b".repeat(128) };
  let now = 1_000_000, failReads = 0, reads = 0;
  const box = {
    globalThis: null, TextDecoder, TextEncoder, Uint8Array, Array, Object, JSON, Number, Promise, Error, URL,
    Date: { now: () => now },
    AbortSignal: { timeout: () => undefined },
    chrome: { runtime: { getURL: (n) => "chrome-extension://abc/" + n, getManifest: () => ({ version: "1.24.27" }) } },
    crypto: { subtle: { importKey: async () => ({}), verify: async () => true, digest: (alg, data) => nodeCrypto.webcrypto.subtle.digest(alg, data) } },
    fetch: async (url) => {
      reads++;
      if (String(url).endsWith("background.js") && failReads > 0) { failReads--; throw new Error("file busy"); }
      const bytes = String(url).endsWith("plazcode-extension-integrity.json") ? new TextEncoder().encode(JSON.stringify(signed)) : body;
      return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    },
  };
  box.globalThis = box;
  box.setTimeout = setTimeout;
  vm.createContext(box);
  vm.runInContext(src, box);
  const I = box.PlazCodeIntegrity;
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  await I.check();                                   // intact files pass (the first check waits for the files)
  // 1.24.30: a passed check never makes requests wait again; files are re-checked in the background every 5 minutes.
  let reads0 = reads; now += 31_000;
  await I.check(); await settle();
  assert.equal(reads, reads0, "no re-hashing every 30 s");
  now += 5 * 60_000;
  failReads = 1;                                     // the background re-check meets one busy file
  await I.check();                                   // resolves at once; the re-check runs behind it
  for (let i = 0; i < 5; i++) await settle();
  assert(reads > reads0, "files are re-checked in the background after 5 minutes");
  await I.check();                                   // a one-off busy file: the full blocking re-check passes
  // Really changed files fail like before, and a failure is held 10 s, then checked again.
  now += 5 * 60_000; failReads = 2;
  await I.check(); for (let i = 0; i < 5; i++) await settle();
  await assert.rejects(I.check(), /official version/, "a failed read is reported");
  const before = reads;
  now += 5_000;
  await assert.rejects(I.check(), /official version/, "within 10 s the failure is reused (no re-hashing loop)");
  assert.equal(reads, before, "no new reads within the 10 s hold");
  now += 6_000;
  await I.check();                                   // was stuck forever before 1.24.27
  // After 1.24.32: a worker the browser restarted does not make its first message wait for the full files check
  // when the files passed earlier in this browser session; the check runs behind it and a failure still stops work.
  const restarted = (saved, opts = {}) => {
    const kept = { ...saved }; let held = [], count = 0;
    const b = { ...box, Date: { now: () => now }, chrome: { ...box.chrome, storage: { session: {
      get: async (k) => (k in kept ? { [k]: kept[k] } : {}), set: async (v) => { Object.assign(kept, v); }, remove: async (k) => { delete kept[k]; } } } },
      fetch: async (url) => {
        count++;
        if (opts.hold) await new Promise((resolve) => held.push(resolve));
        if (opts.changed && String(url).endsWith("background.js")) { const other = new TextEncoder().encode("abd"); return { ok: true, arrayBuffer: async () => other.buffer.slice(0) }; }
        const bytes = String(url).endsWith("plazcode-extension-integrity.json") ? new TextEncoder().encode(JSON.stringify(signed)) : body;
        return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
      } };
    b.globalThis = b; vm.createContext(b); vm.runInContext(src, b);
    return { I: b.PlazCodeIntegrity, kept, reads: () => count, release: () => { const list = held; held = []; list.forEach((go) => go()); } };
  };
  const drain = async (worker) => { for (let i = 0; i < 12; i++) { worker.release(); await settle(); } };
  {
    const first = restarted({});                                             // nothing noted: the first check waits and then notes the pass
    await first.I.check();
    assert(first.reads() > 0 && first.kept.plazcodeFilesPassedAt === now, "a pass is noted for this browser session");
    const woke = restarted({ plazcodeFilesPassedAt: now - 60_000 }, { hold: true });
    await woke.I.check();                                                    // resolves although no file read has finished
    assert(woke.reads() > 0, "the full check starts at once behind the message");
    await drain(woke); await woke.I.check();
    const tampered = restarted({ plazcodeFilesPassedAt: now - 60_000 }, { changed: true });
    await tampered.I.check();                                                // the first message goes through...
    for (let i = 0; i < 12; i++) await settle();
    await assert.rejects(tampered.I.check(), /official version/, "...and changed files stop work as soon as the check behind it ends");
    assert(!("plazcodeFilesPassedAt" in tampered.kept), "a failed check forgets the noted pass");
    const old = restarted({ plazcodeFilesPassedAt: now - 13 * 60 * 60_000 }, { changed: true });
    await assert.rejects(old.I.check(), /official version/, "an old note is not trusted: the first check waits");
    const future = restarted({ plazcodeFilesPassedAt: now + 60_000 }, { changed: true });
    await assert.rejects(future.I.check(), /official version/, "a note from the future is not trusted");
  }
  console.log("PASS extension self-check: requests never wait for a re-check; a one-off busy file clears; a real failure holds 10 s");

  // ── 2. background.js: close reason and worker-restart note ───────────────────────────────────────
  const bg = fs.readFileSync(dir + "/background.js", "utf8");
  assert(/sock\.onclose = \(event\) => \{/.test(bg) && /lastCloseNote = "the previous connection closed \(code "/.test(bg), "close code is remembered");
  assert(/sock\.send\(JSON\.stringify\(\{ type: "client_note", id: 0, text: note \}\)\)/.test(bg), "the note is sent on the next connection");
  assert(/chrome\.storage\.session\.get\("rsWorkerAliveAt"\)/.test(bg) && (bg.match(/markWorkerAlive\(\);/g) || []).length >= 2, "worker liveness is recorded");
  // Run the real note builder.
  const a = bg.indexOf("const WORKER_STARTED_AT = Date.now();"), b = bg.indexOf("// ── WebSocket lifecycle", a);
  const nbox = { Date: { now: () => 200_000 }, Number, Math, String, chrome: { storage: { session: { get: async () => ({ rsWorkerAliveAt: 170_000 }), set() {} } } } };
  vm.createContext(nbox);
  vm.runInContext(bg.slice(a, b) + ";this.note=connectionNote;this.read=workerGapRead;this.set=(n,t)=>{lastCloseNote=n;lastCloseAt=t;};", nbox);
  await nbox.read;
  assert.equal(nbox.note(), "the browser stopped and restarted PlazCode's background worker; it was last active 30 s before this restart");
  assert.equal(nbox.note(), "", "reported once");
  nbox.set("the previous connection closed (code 1006, not clean)", 180_000);
  assert.equal(nbox.note(), "the previous connection closed (code 1006, not clean); reconnected 20 s later");
  console.log("PASS extension: reports why the last connection ended, and when the browser restarted its worker");

  // ── 3. The app: reasons, no hashing on polls, no silent drop ─────────────────────────────────────
  const rs = fs.readFileSync(dir + "/agent/src/main.rs", "utf8");
  assert(/info!\("legacy WS \[\{engine\}\] client disconnected: \{end_reason\}"\);/.test(rs), "disconnects are logged with a reason");
  assert(/"client_note" => \{/.test(rs) && /info!\("browser \[\{engine\}\]: \{note\}"\);/.test(rs), "browser notes reach the Terminal");
  assert(/"ping"\|"status"\|"get_status"\|"list_tools"\|"stop"\|"cancel"\|"studio_status"\|"mcp_status"\|"list_servers"\|"client_note"/.test(rs), "status polls skip the full program check");
  assert(/tracing::warn!\("program check failed, request refused: \{error:#\}"\);/.test(rs), "a failed check is logged");
  assert(/"kind":"integrity","error":integrity::RECOVERY/.test(rs) && /continue;\n\s*\}\n\s*\}/.test(rs), "a failed check refuses the request and keeps the connection");
  assert(!/integrity::check_work\(\)\.await\.is_err\(\) \{break;\}\n\s*let id = val/.test(rs), "no silent break on the legacy socket");
  console.log("PASS app: every disconnect has a reason in the Terminal; status polls do not re-hash; a failed check refuses instead of disconnecting");
  // ── 4. 1.24.32: no false "Desktop bridge disconnected" ────────────────────────────────────────────
  const gui = fs.readFileSync(dir + "/agent/src/gui.rs", "utf8"), integ = fs.readFileSync(dir + "/agent/src/integrity.rs", "utf8");
  const html = fs.readFileSync(dir + "/agent/src/desktop.html", "utf8");
  assert(/let _socket = state\.ui\.extension_socket\(\);/.test(rs) && /Some\(Some\(Ok\(msg\)\)\) => \{ state\.ui\.mark_socket_frame\(\); msg \}/.test(rs), "an open browser socket and its pings count as connected");
  assert(/fresh\(self\.extension_seen_ms\.load\(Ordering::Relaxed\), 15_000\)/.test(gui) && /fresh\(self\.socket_seen_ms\.load\(Ordering::Relaxed\), 45_000\)/.test(gui), "15 s for requests, 45 s for a socket");
  assert(/"bridge\.quiet"/.test(rs) && /"bridge\.socket_closed"/.test(rs), "bridge changes reach the Logs page");
  assert(/WORK_CHECK_REUSE: std::time::Duration = std::time::Duration::from_secs\(10\)/.test(integ) && /\*passed = None;/.test(integ) && /stamps_unchanged\(&stamps\)/.test(integ), "work checks share one pass, re-check changed files and never reuse a failure");
  assert(/Date\.now\(\)-Bridgelostat>=10000/.test(html), "the desktop warns only after 10 more seconds away");
  assert(/Promise\.race\(\[chrome\.tabs\.sendMessage\(tab\.id, \{ type: "rs-desktop-agent-state" \}\)/.test(bg), "a frozen AI tab cannot stop the desktop report");
  console.log("PASS 1.24.32: open connection counts, shared program checks, 10 s grace before the desktop warns, no stuck desktop report");

  // ── 5. 1.24.32: no message to the worker may take 5 minutes (the browser would stop the worker) ──────
  {
    const start = bg.indexOf("const LONG_MESSAGE_TYPES"), head = bg.indexOf("  (async () => {", start);
    assert(start > 0 && head > start, "long-message relay present");
    // Run the real relay with a 50 ms limit and a handler that answers after 180 ms.
    const relay = bg.slice(start, head).replace("const LONG_REPLY_MS = 240000;", "const LONG_REPLY_MS = 50;");
    const lbox = { setTimeout, clearTimeout, Promise, Map, Set, listener: null, chrome: { runtime: { onMessage: { addListener: (f) => { lbox.listener = f; } } } } };
    vm.createContext(lbox);
    vm.runInContext(relay + "\n    setTimeout(() => sendResponse({ ok: true, text: 'done ' + msg.name }), msg.delay);\n    return true;\n  });", lbox);
    const ask = (m) => new Promise((resolve) => lbox.listener(m, {}, resolve));
    const first = await ask({ type: "call_tool", name: "run_command", delay: 180 });
    assert.equal(first.kind, "still-running", "a long command answers before the limit");
    let answer = first, waits = 0;
    while (answer.kind === "still-running") { waits++; answer = await ask({ type: "job-wait", job: answer.job }); }
    assert.deepEqual({ ...answer }, { ok: true, text: "done run_command" }, "the real answer arrives through job-wait");
    assert(waits >= 2, "asked again while it ran");
    const quick = await ask({ type: "call_tool", name: "read_file", delay: 5 });
    assert.equal(quick.text, "done read_file", "quick commands answer directly");
    const lost = await ask({ type: "job-wait", job: 999 });
    assert.equal(lost.kind, "disconnected", "a job lost with a restarted worker says so");
    const main = fs.readFileSync(dir + "/core/main.js", "utf8");
    assert(/resp\.kind === "still-running" && resp\.job && !settled\) ask\(\{type:"job-wait", job:resp\.job\}\)/.test(main), "the AI tab keeps asking");
    console.log("PASS 1.24.32: commands longer than 4 minutes keep the worker within the browser's 5-minute limit");

    // ── 6. protection review: a missing verifier or a failed files check stops work, but never Stop/status ──
    const pstart = bg.indexOf("const protectionCheck = async"), pend = bg.indexOf("};", pstart) + 2;
    const run = async (verifier) => {
      const pbox = { PlazCodeIntegrity: verifier, Error, Promise };
      vm.createContext(pbox); vm.runInContext(bg.slice(pstart, pend) + ";this.check=protectionCheck;", pbox);
      return pbox.check().then(() => "ok", (e) => e.message);
    };
    assert.match(await run(undefined), /verifier is unavailable/, "no verifier: stops");
    assert.match(await run({}), /verifier is unavailable/, "malformed verifier: stops");
    assert.equal(await run({ check: async () => {} }), "ok");
    assert.match(await run({ check: async () => { throw new Error("files changed"); } }), /files changed/, "a failed check stops");
    assert(/const INTEGRITY_EXEMPT = new Set\(\["immediate-stop", "status", "live-status", "rs-run-beat", "job-wait"\]\)/.test(bg), "Stop and status stay available");
    assert(/if \(!\(msg && INTEGRITY_EXEMPT\.has\(msg\.type\)\)\) \{\n\s+try \{ await protectionCheck\(\); \} catch/.test(bg), "every other message waits for the check");
    assert(/async function send\(obj, timeout = REQUEST_TIMEOUT_DEFAULT\) \{\n[^\n]*\n\s+try \{ await protectionCheck\(\); \}/.test(bg), "an open socket also checks before sending");
    // Overlay folder (development/<v>/overlay) or prepared build (build-src-<v>/PlazCode) both reach protection.mjs.
    const pmPath = [dir + "/../protection.mjs", dir + "/../../development/1.24.33/protection.mjs"].find((p) => fs.existsSync(p));
    const pm = fs.readFileSync(pmPath, "utf8");
    assert(/did not receive the release key and channel/.test(pm), "packaging refuses a verifier without the release key");
    console.log("PASS 1.24.32: a missing or failing verifier stops commands (Stop and status still work); packaging proves the release key is inside");
  }
})().catch((e) => { console.error(e); process.exit(1); });
