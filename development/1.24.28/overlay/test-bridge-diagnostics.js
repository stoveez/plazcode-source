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
  vm.createContext(box);
  vm.runInContext(src, box);
  const I = box.PlazCodeIntegrity;
  await I.check();                                   // intact files pass
  failReads = 1; now += 31_000;                      // cache expired; one file read fails once
  await assert.rejects(I.check(), /official version/, "a failed read is reported");
  const before = reads;
  now += 5_000;
  await assert.rejects(I.check(), /official version/, "within 10 s the failure is reused (no re-hashing loop)");
  assert.equal(reads, before, "no new reads within the 10 s hold");
  now += 6_000;
  await I.check();                                   // was stuck forever before 1.24.27
  console.log("PASS extension self-check: a one-off failed read clears after 10 s instead of blocking every reconnect");

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
})().catch((e) => { console.error(e); process.exit(1); });
