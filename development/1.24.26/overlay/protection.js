// SPDX-License-Identifier: GPL-3.0-or-later
// Package-time public constants only. The private signing key is never distributed.
globalThis.PlazCodeIntegrity = (() => {
  const key = "UNCONFIGURED_RELEASE_PUBLIC_KEY", channel = "UNCONFIGURED_RELEASE_CHANNEL";
  const recovery = "PlazCode files changed or are incomplete. Download the complete official version from https://github.com/stoveez/PlazCode/releases . Your skills, notes and settings are kept.";
  let pending = null, checkedAt = 0;
  const unhex = text => Uint8Array.from(text.match(/../g) || [], byte => parseInt(byte, 16));
  const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,"0")).join("");
  const safe = name => typeof name === "string" && name.length > 0 && name.length <= 512 && !/[\\:\x00-\x1f]/.test(name) && name.split("/").every(p => p && p !== "." && p !== ".." && !/[. ]$/.test(p));
  async function read(name, limit) {
    if (!safe(name)) throw new Error(recovery);
    const response = await fetch(chrome.runtime.getURL(name), {cache:"no-store", credentials:"omit", redirect:"error", signal:AbortSignal.timeout(15000)});
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
    const publicKey = await crypto.subtle.importKey("raw",unhex(key),{name:"Ed25519"},false,["verify"]);
    if (!await crypto.subtle.verify("Ed25519",publicKey,unhex(signed.signature),new TextEncoder().encode("PlazCode release v1\n"+signed.payload))) throw new Error(recovery);
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
  }
  function check() {
    if (pending && Date.now()-checkedAt<30000) return pending;
    if (!pending || checkedAt) {
      checkedAt=0;
      pending=verify().catch(()=>{throw new Error(recovery);});
    }
    return pending;
  }
  return {check};
})();
