// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Package-time public constants only. The private signing key is never distributed.
globalThis.PlazCodeIntegrity = (() => {
  const key = "UNCONFIGURED_RELEASE_PUBLIC_KEY", channel = "UNCONFIGURED_RELEASE_CHANNEL";
  const recovery = "PlazCode files changed or are incomplete. Download the complete official version from https://github.com/stoveez/PlazCode/releases . Your skills, notes and settings are kept.";
  let pending = null, checkedAt = 0, failedAt = 0, verified = false, revalidating = null;
  const unhex = text => Uint8Array.from(text.match(/../g) || [], byte => parseInt(byte, 16));
  const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,"0")).join("");
  const safe = name => typeof name === "string" && name.length > 0 && name.length <= 512 && !/[\\:\x00-\x1f]/.test(name) && name.split("/").every(p => p && p !== "." && p !== ".." && !/[. ]$/.test(p));
  async function read(name, limit) {
    if (!safe(name)) throw new Error(recovery);
    const response = await fetch(chrome.runtime.getURL(name.split("/").map(encodeURIComponent).join("/")), {cache:"no-store", credentials:"omit", redirect:"error", signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error(recovery);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > limit) throw new Error(recovery);
    return bytes;
  }
  async function verify() {
    // Unconfigured development source is usable for tests. Packaging must replace both constants.
    if (key === "UNCONFIGURED_RELEASE_PUBLIC_KEY") return;
    if (!/^[a-f0-9]{64}$/.test(key) || !["release","validation"].includes(channel)) throw new Error(recovery);
    const signed = JSON.parse(new TextDecoder().decode(await read("plazcode-extension-integrity.json", 4*1024*1024)));
    if (typeof signed.payload !== "string" || !/^[a-f0-9]{128}$/.test(signed.signature)) throw new Error(recovery);
    try {
      const publicKey = await crypto.subtle.importKey("raw",unhex(key),{name:"Ed25519"},false,["verify"]);
      if (!await crypto.subtle.verify("Ed25519",publicKey,unhex(signed.signature),new TextEncoder().encode("PlazCode release v1\n"+signed.payload))) throw new Error(recovery);
    } catch (error) {
      if (!error || error.name !== "NotSupportedError") throw error;
      // Chrome 111-136 has SHA-256 but lacks Ed25519. The native app verifies metadata only.
      const identity = new URL(chrome.runtime.getURL("")).host;
      const unavailable = () => Object.assign(new Error("Open the updated PlazCode app to verify the extension. PlazCode retries automatically; no pairing or browser setup is needed."),{name:"PlazCodeVerificationUnavailable"});
      let response;
      try {response = await fetch("http://127.0.0.1:3000/api/integrity/extension", {method:"POST",credentials:"omit",redirect:"error",headers:{"Content-Type":"application/json","X-PlazCode-Extension":identity},body:JSON.stringify(signed),signal:AbortSignal.timeout(15000)});} catch {throw unavailable();}
      if (response.status===404 || response.status>=500) throw unavailable();
      if (!response.ok || !(await response.json()).ok) throw new Error(recovery);
    }
    const value=JSON.parse(signed.payload), version=chrome.runtime.getManifest().version;
    if (value.schema!==1 || value.kind!=="files" || value.platform!=="extension" || value.channel!==channel || value.version!==version || !value.files) throw new Error(recovery);
    const entries=Object.entries(value.files);
    if (!entries.length || entries.length>12000 || !value.files["background.js"] || !value.files["manifest.json"] || !value.files["protection.js"]) throw new Error(recovery);
    let at=0;
    await Promise.all(Array.from({length:8},async()=>{
      while(at<entries.length) {
        const [name,record]=entries[at++];
        if (!safe(name) || !Number.isSafeInteger(record.bytes) || record.bytes<0 || record.bytes>256*1024*1024 || !/^[a-f0-9]{64}$/.test(record.sha256)) throw new Error(recovery);
        const raw=await read(name,record.bytes);
        if(raw.byteLength!==record.bytes || hex(await crypto.subtle.digest("SHA-256",raw))!==record.sha256) throw new Error(recovery);
      }
    }));
    checkedAt=Date.now();
    remember(true);
  }
  // After 1.24.32 (owner, 2026-11-11: commands must not stall on the link to the app). The browser stops this
  // background worker when it likes and starts it again for the next message; every restart used to make that
  // message (often a command) wait for the full read-and-hash of all files. A pass is now noted in the browser's
  // session memory (pages cannot read it; it is emptied when the extension is reloaded or updated and when the
  // browser closes). A restarted worker that finds a recent pass lets the message through and checks all files
  // again at once, behind it; if that check fails, work stops exactly as before.
  const PASSED_KEY = "plazcodeFilesPassedAt", PASSED_MAX_MS = 12 * 60 * 60 * 1000;
  const session = () => { try { return chrome.storage && chrome.storage.session || null; } catch { return null; } };
  function remember(passed) {
    const area = session(); if (!area) return;
    try { const done = passed ? area.set({[PASSED_KEY]: Date.now()}) : area.remove(PASSED_KEY); if (done && done.catch) done.catch(() => {}); } catch {}
  }
  let resumeTried = false, resuming = null;
  function resume() {
    if (!resuming) resuming = (async () => {
      const area = session(); if (!area) return false;
      try { const saved = await area.get(PASSED_KEY), at = Number(saved && saved[PASSED_KEY]) || 0; return at > 0 && Date.now() >= at && Date.now() - at < PASSED_MAX_MS; } catch { return false; }
    })();
    return resuming;
  }
  // 1.24.27: a failed check used to stay failed until the browser restarted the worker, because the rejected
  // promise was returned forever (checkedAt stayed 0). One unreadable file then blocked pairing and every
  // reconnect. A failure now holds for 10 s and is then checked again; really changed files still fail.
  // 1.24.30 (owner, 2026-10-31: the app kept showing "Desktop bridge disconnected" for no reason): every 30 s the
  // whole extension (about 900 files) was read and hashed again while EVERY request to the app waited for it. On a
  // busy PC (antivirus, cloud sync, Studio, the app's own checks) that wait passed the app's 15 s "browser seen"
  // window. After a passed check, requests now go straight through; the files are checked again in the background
  // every 5 minutes. If that background check fails, the next request runs a full blocking check (a one-off busy
  // file passes then; really changed files fail exactly as before). The app also checks every file before work.
  const RECHECK_MS = 5 * 60 * 1000, FAILURE_HOLD_MS = 10000;
  function blocking() {
    checkedAt = 0;
    pending = verify().then(() => { verified = true; checkedAt = Date.now(); }, error => {
      verified = false;
      if (error && error.name === "PlazCodeVerificationUnavailable") { pending = null; throw error; }
      failedAt = Date.now(); remember(false);
      throw new Error(recovery);
    });
    return pending;
  }
  function check() {
    if (pending && failedAt) {
      if (Date.now() - failedAt < FAILURE_HOLD_MS) return pending;
      pending = null; failedAt = 0;
    }
    if (verified) {
      if (!revalidating && Date.now() - checkedAt >= RECHECK_MS) {
        revalidating = verify().then(() => { checkedAt = Date.now(); }, error => {
          // Still verified when the app is only temporarily unreachable (older Chrome); otherwise re-check in full.
          if (!error || error.name !== "PlazCodeVerificationUnavailable") { verified = false; pending = null; remember(false); }
        }).finally(() => { revalidating = null; });
      }
      return Promise.resolve();
    }
    if (pending) return pending;
    if (resumeTried) return blocking();
    return resume().then(passed => {
      if (verified) return;
      if (pending) return pending;
      if (resumeTried || !passed) { resumeTried = true; return blocking(); }
      resumeTried = true; verified = true; checkedAt = Date.now() - RECHECK_MS;
      return check();
    });
  }
  return {check};
})();
