// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// background.js - service worker.
// Owns ONE resilient WebSocket to the local bridge (ws://127.0.0.1:PORT).
// Keeping the socket here (not in the content script) avoids https→ws mixed
// content issues and centralises reconnect / timeout logic.
//
// Contract with content.js: every sendMessage ALWAYS gets a response object,
// even when the bridge is offline. The agentic loop must never hang waiting.

// Passive browser lifecycle only: no request bodies, headers, responses or queries.
// webRequest completes AFTER the response body, even when native Stop is absent.
const deepSeekRequests = (() => {
  const api = chrome.webRequest, store = chrome.storage.session, key = 'rs-deepseek-open-requests';
  if (!api?.onBeforeRequest || !api?.onCompleted || !api?.onErrorOccurred) return null;
  let state = {revision:0, active:[]};
  let chain = Promise.resolve(store?.get(key)).then(saved => {
    const old = saved?.[key];
    if (old && Number.isSafeInteger(old.revision) && Array.isArray(old.active)) state = old;
  }).catch(() => {});
  const enqueue = fn => { chain = chain.then(fn).catch(() => {}); return chain; };
  const sameDocument = (r, tabId, documentId) => r.tabId === tabId && (!documentId || !r.documentId || r.documentId === documentId);
  const view = (tabId, documentId) => ({ok:true, revision:state.revision,
    active:state.active.filter(r => sameDocument(r,tabId,documentId)).map(({id,path,startedAt}) => ({id,path,startedAt}))});
  async function saveAndNotify(record) {
    state.revision++;
    try { await store?.set({[key]:state}); } catch {}
    try {
      const options = record.documentId ? {documentId:record.documentId} : {frameId:0};
      await chrome.tabs.sendMessage(record.tabId,{type:'rs-deepseek-requests',...view(record.tabId,record.documentId)},options);
    } catch {} // A closed/replaced document has no recipient; never forward to another tab.
  }
  const filter = {urls:['https://chat.deepseek.com/api/v0/chat/*'],types:['xmlhttprequest']};
  api.onBeforeRequest.addListener(details => {
    let url, source;
    try { url=new URL(details.url);source=new URL(details.initiator || details.originUrl || details.documentUrl); } catch { return; }
    if (details.frameId !== 0 || details.tabId < 0 || source.origin !== 'https://chat.deepseek.com' ||
        !/^\/api\/v0\/chat\/(?:completion|continue|regenerate)\/?$/.test(url.pathname)) return;
    const startedAt=Date.now();
    void enqueue(async () => {
      let path;
      try { const page=new URL(details.documentUrl || (await chrome.tabs.get(details.tabId)).url);if(page.origin!==source.origin)return;path=page.pathname; } catch { return; }
      const record={id:String(details.requestId),tabId:details.tabId,documentId:details.documentId || '',path,startedAt};
      state.active=state.active.filter(r => r.id!==record.id);
      state.active.push(record);
      await saveAndNotify(record);
    });
  },filter);
  const terminal = details => { void enqueue(async () => {
    const record=state.active.find(r=>r.id===String(details.requestId));if(!record)return;
    state.active=state.active.filter(r=>r.id!==record.id);await saveAndNotify(record);
  }); };
  api.onCompleted.addListener(terminal,filter);
  api.onErrorOccurred.addListener(terminal,filter);
  chrome.tabs.onRemoved.addListener(tabId => { void enqueue(async()=>{
    if(!state.active.some(r=>r.tabId===tabId))return;
    state.active=state.active.filter(r=>r.tabId!==tabId);state.revision++;
    try { await store?.set({[key]:state}); } catch {}
  }); });
  return {snapshot:sender=>enqueue(()=>{
    let url;try{url=new URL(sender.url || sender.tab?.url);}catch{return {ok:false};}
    if(url.origin!=='https://chat.deepseek.com' || sender.frameId && sender.frameId!==0 || !Number.isInteger(sender.tab?.id))return {ok:false};
    return view(sender.tab.id,sender.documentId);
  })};
})();

if (typeof importScripts === "function") importScripts("protection.js");
// 1.24.30 (protection review): a missing or broken verifier now stops work instead of passing; the packaged
// protection.js always carries the release key (an unconfigured key only exists in unpackaged development source).
const protectionCheck = async () => {
  if (typeof PlazCodeIntegrity === "undefined" || !PlazCodeIntegrity || typeof PlazCodeIntegrity.check !== "function")
    throw new Error("PlazCode integrity verifier is unavailable. Reinstall the complete official release.");
  await PlazCodeIntegrity.check();
};
const PAIRING_KEY = "plazcode-pairing-key";
let fullSyncedOnce = false;
let pairingKey = "";
let pairingInFlight = null;
let bridgeError = "";
const pairingReady = chrome.storage.local.get(PAIRING_KEY).then((value) => {
  pairingKey = value[PAIRING_KEY] || "";
}).catch(() => {});
async function ensurePairing(force = false) {
  await protectionCheck();
  await pairingReady;
  if (pairingInFlight) return pairingInFlight;
  if (!force && /^[a-f0-9]{64}$/i.test(pairingKey)) return pairingKey;
  pairingInFlight = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch("http://127.0.0.1:3000/api/pair", {
        method: "POST", mode: "cors", credentials: "omit", redirect: "error",
        headers: { "Content-Type": "application/json", "X-PlazCode-Extension": pairingIdentity() },
        body: "{}", signal: controller.signal,
      });
      if (!response.ok) {
        // 1.24.30: the app pairs only with the PlazCode-Extension folder inside its own verified PlazCode folder.
        const reason = response.status === 403 ? String(await response.text().catch(() => "")).slice(0, 600) : "";
        if (/not the official one/i.test(reason)) throw Object.assign(new Error(reason), { plazcodeUnofficial: true });
        throw new Error("Automatic pairing failed (HTTP "+response.status+"). Update the desktop and extension together, then reload this browser’s extension and AI tab.");
      }
      const data = await response.json();
      if (!/^[a-f0-9]{64}$/i.test(data.key || "")) throw new Error("Agent returned an invalid pairing response");
      pairingKey = data.key;
      try { await chrome.storage.local.set({ [PAIRING_KEY]: pairingKey }); } catch {}
      return pairingKey;
    } catch(error) { if (error && error.plazcodeUnofficial) throw error; throw new Error("Local bridge pairing failed: "+String(error.message || error)+". In Edge or Brave, check that PlazCode is enabled, its site access includes the AI page and localhost, and local-network access is allowed. Browser permission blocks cannot be fixed by restarting Studio."); }
    finally { clearTimeout(timer); }
  })();
  try { return await pairingInFlight; } finally { pairingInFlight = null; }
}
let accountEpoch = '', accountIdentity = null, accountCheck = null;
async function ensureAccountContext(liveStatus){
  if(accountCheck)return accountCheck;
  accountCheck=(async()=>{
    let status=liveStatus;
    if(!status){
      const response=await fetch('http://127.0.0.1:3000/api/status',{headers:{Authorization:'Bearer '+pairingKey},signal:AbortSignal.timeout(5000),redirect:'error'});
      if(!response.ok)throw new Error('Cannot check the PlazCode profile.');
      status=await response.json();
    }
    if(!('profile_required' in status)||status.accounts_enabled===false)return; // Older desktops and account-free headless tools.
    if(status.profile_required||!status.profile){accountEpoch='';throw new Error('Open PlazCode, choose a profile and log in.');}
    const next=status.profile;
    if(accountEpoch&&accountEpoch!==next.epoch){accountEpoch='';chrome.runtime.reload();throw new Error('PlazCode profile changed. Refresh this AI tab.');}
    const saved=await chrome.storage.local.get(null), previous=saved['plazcode-profile-id'];
    if(previous!==next.id){
      const keys=Object.keys(saved).filter(k=>!k.startsWith('plazcode-profile-')&&k!==PAIRING_KEY);
      const outgoing=Object.fromEntries(keys.map(k=>[k,saved[k]]));
      if(previous)await chrome.storage.local.set({['plazcode-profile-data:'+previous]:outgoing});
      const incoming=saved['plazcode-profile-data:'+next.id]||(next.owns_legacy_data&&!previous?outgoing:{});
      desktopPendingPreferences.clear();desktopRemoteWrites.clear();clearTimeout(desktopSyncPushTimer);
      desktopSyncApplying=true;try{await chrome.storage.local.remove(keys);await chrome.storage.local.set({...incoming,'plazcode-profile-id':next.id});}finally{desktopSyncApplying=false;}
      if(typeof chrome.runtime.reload==='function'){chrome.runtime.reload();throw new Error('PlazCode profile selected. Refresh this AI tab.');}
    }
    accountEpoch=next.epoch;accountIdentity=next.id;
  })();
  try{return await accountCheck;}finally{accountCheck=null;}
}
function pairingProtocols() {
  if (!/^[a-f0-9]{64}$/i.test(pairingKey)) throw new Error("Agent pairing is not ready");
  return ["plazcode", "plazcode-auth." + pairingKey,...(accountEpoch?["plazcode-profile."+accountEpoch]:[])];
}
function pairingIdentity() {
  // Firefox's public addon ID differs from its installation-specific origin.
  try {
    const url = new URL(chrome.runtime.getURL(""));
    if (url.protocol === "moz-extension:") return url.hostname;
  } catch {}
  return chrome.runtime.id;
}
// A bridge that accepts a connection but never answers must not hold one of the
// browser's 6 per-host connections forever: queued requests behind it (tools,
// push, status) would stall the agent on "Starting Up". Callers with their own
// signal keep their own (often longer) limit.
const BRIDGE_FETCH_TIMEOUT_MS = 15000;
async function bridgeFetch(url, options = {}) {
  try {
    const response = await bridgeFetchOnce(url, options);
    lastBridgeOkAt = Date.now();
    return response;
  } catch (error) {
    // Recorded for the debug report only; the caller still gets the same error.
    try {
      const path = new URL(String(url)).pathname;
      if (!path.startsWith("/api/debug/")) debugRecord({ source: "extension", level: "warn", kind: "bridge",
        text: "Bridge request " + path + " failed: " + String(error && error.name || "Error") + ": " + String(error && error.message || error),
        where: ["background.js › bridgeFetch"] });
    } catch {}
    throw error;
  }
}
async function bridgeFetchOnce(url, options = {}) {
  await ensurePairing();
  if(!String(url).endsWith("/api/status"))await ensureAccountContext();
  const expectedEpoch=accountEpoch;
  const signal = options.signal || AbortSignal.timeout(BRIDGE_FETCH_TIMEOUT_MS);
  for (let attempt = 0; attempt < 2; attempt++) {
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", "Bearer " + pairingKey);
    if(expectedEpoch)headers.set("X-PlazCode-Profile",expectedEpoch);
    const response = await fetch(url, { ...options, headers, signal, redirect: "error" });
    if (response.status !== 401) return response;
    if (attempt === 0) await ensurePairing(true);
  }
  throw new Error("Agent authentication failed after automatic pairing");
}

// ── Debug report capture ───────────────────────────────────────────────
// PlazCode's own errors, warnings and "[plazcode]" info from this worker and
// from every AI tab (core/debug-capture.js, which also relays the AI site's own
// errors) are kept in capped buffers and forwarded to the desktop app for
// Settings -> Copy debug report. Uploads only happen while the bridge answers,
// are single-flight with a short timeout, and never change any other request.
const DEBUG_PROBLEM_CAP = 300, DEBUG_INFO_CAP = 150, DEBUG_TAB_CAP = 6;
const debugProblems = [], debugInfo = [], debugTabs = new Map();
let debugSeq = 0, debugSentSeq = 0, debugTabsSentAt = 0, debugDirty = false, debugUploading = false, debugLast = null, debugDropped = 0;
let lastBridgeOkAt = 0;
function debugRedact(value) {
  return String(value)
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [hidden]")
    .replace(/\b[a-f0-9]{40,}\b/gi, "[hidden-key]")
    .replace(/\b(?:sk|pk|rk|ghp|gho|ghs|github_pat|xox[abprs]|AIza)[-_A-Za-z0-9]{10,}/g, "[hidden-token]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, "[hidden-jwt]")
    .replace(/((?:api[-_]?key|token|secret|password|passwd|auth|cookie|session|pairing[-_]?key)["']?\s*[:=]\s*["']?)[^\s"',;&]{4,}/gi, "$1[hidden]")
    .replace(/([?&#][^=\s&#]+=)[^&#\s"')]+/g, "$1…")
    .replace(/([A-Za-z]:\\Users\\|\/Users\/|\/home\/)[^\\/\s"']+/g, "$1<user>")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>");
}
function debugWhere(stack) {
  const out = [];
  for (const line of String(stack || "").split("\n")) {
    const file = (line.match(/(?:chrome|moz)-extension:\/\/[^/\s)]+\/([^:\s)]+)/) || [])[1];
    if (!file) continue;
    const fn = (line.match(/^\s*at\s+(?:async\s+)?([^\s(]+)\s+\(/) || line.match(/^\s*([^@\s]+)@/) || [])[1] || "";
    if (/^debug(?:Record|Console)/.test(fn)) continue;
    const item = fn && fn !== "<anonymous>" ? file + " › " + fn : file;
    if (!out.includes(item)) out.push(item);
    if (out.length >= 4) break;
  }
  return out;
}
function debugRecord(entry) {
  try {
    const text = debugRedact(entry.text || "").slice(0, 600);
    const key = (entry.source || "") + "|" + (entry.tab || "") + "|" + entry.level + "|" + text;
    const now = Date.now();
    if (debugLast && debugLast.key === key && now - debugLast.at < 5000) {
      debugLast.item.repeats = (debugLast.item.repeats || 1) + (Number(entry.repeats) || 1); debugLast.at = now; debugDirty = true; return;
    }
    const level = entry.level === "error" || entry.level === "warn" ? entry.level : "info";
    const item = { seq: ++debugSeq, t: Number(entry.t) || now, source: entry.source === "site" ? "site" : "extension", level,
      kind: String(entry.kind || "console").slice(0, 20), text };
    if (entry.tab) item.tab = String(entry.tab).slice(0, 80);
    if (Array.isArray(entry.where) && entry.where.length) item.where = entry.where.slice(0, 4).map((w) => debugRedact(w).slice(0, 120));
    if (entry.file) item.file = debugRedact(entry.file).slice(0, 200);
    if (Number(entry.status)) item.status = Number(entry.status);
    if (Number(entry.repeats) > 1) item.repeats = Number(entry.repeats);
    const list = level === "info" ? debugInfo : debugProblems;
    list.push(item);
    if (list.length > (level === "info" ? DEBUG_INFO_CAP : DEBUG_PROBLEM_CAP)) { list.shift(); debugDropped++; }
    debugLast = { key, at: now, item };
    debugDirty = true;
  } catch {}
}
(() => {
  let inside = false;
  for (const method of ["error", "warn", "info", "log"]) {
    const original = console[method];
    if (typeof original !== "function") continue;
    const level = method === "log" ? "info" : method;
    console[method] = function debugConsole(...args) {
      const result = original.apply(this, args);
      if (!inside && (method !== "log" || (typeof args[0] === "string" && args[0].startsWith("[plazcode")))) {
        inside = true;
        try {
          const err = args.find((a) => a instanceof Error);
          const text = args.map((a) => a instanceof Error ? a.name + ": " + a.message : typeof a === "string" ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })()).join(" ");
          debugRecord({ source: "extension", level, text, where: level === "info" ? [] : debugWhere(err ? err.stack : new Error().stack) });
        } catch {} finally { inside = false; }
      }
      return result;
    };
  }
  try {
    self.addEventListener("error", (event) => debugRecord({ source: "extension", level: "error", kind: "uncaught",
      text: String(event && event.message || "Uncaught error"), where: debugWhere(event && event.error && event.error.stack) }));
    self.addEventListener("unhandledrejection", (event) => {
      const reason = event && event.reason, text = String(reason && (reason.message || reason) || "Unhandled rejection");
      if (/Receiving end does not exist|message port closed/i.test(text)) return;
      debugRecord({ source: "extension", level: "error", kind: "rejection", text, where: debugWhere(reason && reason.stack) });
    });
  } catch {}
})();
function debugAcceptTab(msg, sender) {
  const tabId = sender && sender.tab && sender.tab.id;
  const page = msg.page && typeof msg.page === "object" ? msg.page : {};
  const host = String(page.host || "").slice(0, 80);
  for (const entry of Array.isArray(msg.entries) ? msg.entries.slice(0, 200) : []) {
    if (entry && typeof entry === "object") debugRecord({ ...entry, tab: host });
  }
  if (Number(msg.dropped) > 0) debugDropped += Number(msg.dropped);
  const previous = tabId != null ? debugTabs.get(tabId) : null;
  // 1.24.30: events not yet written to the PlazCode logs on disk (sent once by core/debug-capture.js).
  const fresh = (previous && previous.fresh || []).concat(Array.isArray(msg.diagNew) ? msg.diagNew.slice(-150) : []).slice(-400);
  if ((Array.isArray(msg.diag) || fresh.length) && tabId != null) {
    debugTabs.delete(tabId);
    debugTabs.set(tabId, { host, path: debugRedact(page.path || "").slice(0, 80), at: Date.now(), diag: Array.isArray(msg.diag) ? msg.diag.slice(-40) : (previous && previous.diag || []), fresh });
    while (debugTabs.size > DEBUG_TAB_CAP) debugTabs.delete(debugTabs.keys().next().value);
    debugDirty = true;
  }
}
async function debugUpload() {
  if (!rustMode || debugUploading || !debugDirty || Date.now() - lastBridgeOkAt > 10000) return;
  debugUploading = true;
  try {
    const entries = debugProblems.concat(debugInfo).filter((e) => e.seq > debugSentSeq).sort((a, b) => a.seq - b.seq).slice(0, 200);
    const tabs = [...debugTabs.entries()].filter(([, v]) => v.at > debugTabsSentAt).map(([id, v]) => { const { fresh, ...rest } = v; return { id: String(id), ...rest, diag_new: fresh || [] }; });
    const sentFresh = new Map([...debugTabs.entries()].map(([id, v]) => [id, (v.fresh || []).length]));
    const top = entries.length ? entries[entries.length - 1].seq : debugSentSeq, tabsAt = Date.now();
    let version = "";
    try { version = chrome.runtime.getManifest().version; } catch {}
    const response = await bridgeFetch(RUST_ROBLOX_HTTP + "/api/debug/browser-log", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ browser_id: browserIdentity, extension_version: version, user_agent: String(globalThis.navigator && navigator.userAgent || "").slice(0, 200), dropped: debugDropped, entries, tabs }),
    });
    if (response.ok) {
      for (const [id, count] of sentFresh) { const tab = debugTabs.get(id); if (tab && tab.fresh) tab.fresh = tab.fresh.slice(count); }
      debugSentSeq = top; debugTabsSentAt = tabsAt; debugDropped = 0;
      debugDirty = debugProblems.concat(debugInfo).some((e) => e.seq > debugSentSeq);
    }
  } catch {} finally { debugUploading = false; }
}
setInterval(() => { debugUpload(); }, 5000);

const PORT_ROBLOX = 17613;
const PORT_LOCAL = 17615; // AgentScript — native FS/terminal engine
const BLENDER_ADDON_PORT = 9876;
const RUST_ROBLOX_HTTP = "http://127.0.0.1:3000";
const ENGINE_KEY = "rs-engine";
const DESKTOP_PREF_KEYS = [
  "rsLanguage",
  "rsReadOnly",
  "rsConfirmDelete",
  "rsApprovalMode",
  "rsAllowedFolders",
  "rsWorkMode",
  "rsPermMode",
  "rsSounds",
  "rsStopMode",
  "rsInputLimitEnabled",
  "rsInputCharLimit",
  "rsOutputLimitEnabled",
  "rsOutputCharLimit",
  "rsRunLimitsEnabled",
  "rsToolBudget",
  "rsTaskMinutes",
  "rsVisualCheck",
  "rsContinuationOffer",
  "rsCommandCooldown",
  "rsFullStartup",
  "rsExtraThinking",
  "rsShowApproach",
  "rsPlanMode",
  "rsThinkingLevel",
  "rsForgeMode",
  "rsAutoFix",
  "rsBgMode",
  "rsCustomPrompt",
  "rsAppearance",
];
let desktopSyncApplying = false;
let desktopSyncPushTimer = null;
const desktopPendingPreferences = new Map();
const desktopRemoteWrites = new Map();
let desktopPushInFlight = false;

async function applyDesktopPreferences(remote) {
  if (!remote || typeof remote !== "object") return false;
  const local = await chrome.storage.local.get(DESKTOP_PREF_KEYS);
  const updates = {};
  for (const key of DESKTOP_PREF_KEYS) {
    if (!(key in remote) || desktopPendingPreferences.has(key)) continue;
    if (JSON.stringify(local[key]) !== JSON.stringify(remote[key])) updates[key] = remote[key];
  }
  if (Object.keys(updates).length) {
    desktopSyncApplying = true;
    for (const [key, value] of Object.entries(updates)) desktopRemoteWrites.set(key, JSON.stringify(value));
    try { await chrome.storage.local.set(updates); }
    catch (error) { for (const key of Object.keys(updates)) desktopRemoteWrites.delete(key); throw error; }
    finally { desktopSyncApplying = false; }
  }
  return true;
}

async function pullDesktopPreferences() {
  try {
    const response = await bridgeFetch("http://127.0.0.1:3000/api/preferences", { method: "GET", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return false;
    return await applyDesktopPreferences(await response.json());
  } catch {
    return false;
  }
}

async function pushDesktopPreferences() {
  if (desktopPushInFlight) return false;
  desktopPushInFlight = true;
  try {
    const prefs = desktopPendingPreferences.size
      ? Object.fromEntries(desktopPendingPreferences) : await chrome.storage.local.get(DESKTOP_PREF_KEYS);
    const response = await bridgeFetch("http://127.0.0.1:3000/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      for (const [key, value] of Object.entries(prefs)) {
        if (desktopPendingPreferences.has(key) && JSON.stringify(desktopPendingPreferences.get(key)) === JSON.stringify(value)) desktopPendingPreferences.delete(key);
      }
    }
    return response.ok;
  } catch {
    return false;
  } finally {
    desktopPushInFlight = false;
    if (desktopPendingPreferences.size) {
      clearTimeout(desktopSyncPushTimer);
      desktopSyncPushTimer = setTimeout(() => { pushDesktopPreferences(); }, 500);
    }
  }
}

async function initialDesktopPreferencesSync() {
  try {
    const response = await bridgeFetch("http://127.0.0.1:3000/api/preferences", { method: "GET", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return false;
    const remote = await response.json();
    if(remote&&remote._plazcodeProfile)return await applyDesktopPreferences(remote);
    if (remote && remote._plazcodePersisted === true) {
      if (typeof remote.rsCustomPrompt !== "string") {
        const existing = await chrome.storage.local.get("rsCustomPrompt");
        if (typeof existing.rsCustomPrompt === "string") {
          const seeded = await bridgeFetch("http://127.0.0.1:3000/api/preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rsCustomPrompt: existing.rsCustomPrompt }),
            signal: AbortSignal.timeout(5000),
          });
          if (!seeded.ok) return false;
          const saved = await seeded.json();
          return await applyDesktopPreferences(saved.preferences || saved);
        }
      }
      return await applyDesktopPreferences(remote);
    }

    const local = await chrome.storage.local.get(DESKTOP_PREF_KEYS);
    const hasExisting = DESKTOP_PREF_KEYS.some((key) => local[key] !== undefined);
    if (hasExisting) return await pushDesktopPreferences();

    if (!(await applyDesktopPreferences(remote))) return false;
    return await pushDesktopPreferences();
  } catch {
    return false;
  }
}

function scheduleDesktopPreferencesPush() {
  clearTimeout(desktopSyncPushTimer);
  desktopSyncPushTimer = setTimeout(() => { pushDesktopPreferences(); }, 50);
}

chrome.storage?.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  let changed = false;
  for (const key of DESKTOP_PREF_KEYS) {
    if (!changes[key]) continue;
    const value = changes[key].newValue;
    if (desktopRemoteWrites.has(key) && desktopRemoteWrites.get(key) === JSON.stringify(value)) { desktopRemoteWrites.delete(key); continue; }
    desktopPendingPreferences.set(key, value);
    changed = true;
  }
  if (changed) scheduleDesktopPreferencesPush();
});

// "anim" (Animation mode) is a persona-driven view of the SAME Roblox bridge:
// it maps to 17613 everywhere a port/HTTP target is picked, but keeps its own
// id so prompts, accents and UI state stay engine-isolated.
const ENGINES = ["roblox", "local"];
function normalizeEngine(v) { return v === "local" ? "local" : "roblox"; }
let engine = "roblox"; // "roblox" | "local"
let rustMode = false; // true if Rust agent on 3000 is reachable (preferred)
// Engine selection belongs to a browser tab, never desktop preferences.
const tabEngines = new Map();
async function tabEngine(tabId) {
  if (!Number.isInteger(tabId)) return "roblox";
  if (tabEngines.has(tabId)) return tabEngines.get(tabId);
  try { const key="rs-tab-engine-"+tabId; const saved=await chrome.storage.session.get(key); if (!tabEngines.has(tabId)) tabEngines.set(tabId,normalizeEngine(saved[key])); } catch { if (!tabEngines.has(tabId)) tabEngines.set(tabId,"roblox"); }
  return tabEngines.get(tabId);
}
chrome.tabs.onRemoved?.addListener(tabId=>{tabEngines.delete(tabId);try{chrome.storage.session.remove("rs-tab-engine-"+tabId);}catch{}});
// The single native health reader below handles first discovery and recovery.
// Optional settings synchronization must never gate transport readiness.
function engineUrl() { return `ws://127.0.0.1:${engine === "local" ? PORT_LOCAL : PORT_ROBLOX}`; }
function engineHttpUrl() { return RUST_ROBLOX_HTTP; }
function engineLabel() { return engine === "local" ? "AgentScript" : "Roblox"; }
// The primary Roblox socket stays alive when an individual tab uses AgentScript.

// Chat sites where an PlazCode provider content script runs. Status pushes go
// to every tab matching these. Add the new provider's URL pattern here (and in
// manifest.json content_scripts + host_permissions) when integrating another AI.
const PROVIDER_URLS = ["https://app.clickup.com/*", "https://chat.deepseek.com/*", "https://deepseek.com/*", "https://chatgpt.com/*", "https://chat.openai.com/*", "https://claude.ai/*", "https://www.claude.ai/*", "https://claude.com/*", "https://www.claude.com/*", "https://gemini.google.com/*", "https://www.kimi.com/*", "https://kimi.com/*", "https://kimi.ai/*", "https://www.kimi.ai/*", "https://chat.z.ai/*", "https://chat.qwen.ai/*", "https://arena.ai/*", "https://www.notion.so/*", "https://app.notion.so/*", "https://www.notion.com/*", "https://notion.com/*", "https://*.notion.com/*", "https://freebuff.ai/*", "https://www.freebuff.ai/*", "https://freebuff.com/*", "https://www.freebuff.com/*", "https://gpt.crax.lol/*", "https://use.ai/*", "https://www.use.ai/*", "https://c.vani.ai/*", "https://aistudio.xiaomimimo.com/*", "https://oxalpha.com/*", "https://www.oxalpha.com/*", "https://oxalpha.org/*", "https://www.oxalpha.org/*", "http://localhost/*", "http://127.0.0.1/*", "https://ollama.com/*", "https://*.ollama.com/*"];

const RECONNECT_MIN = 500;
const RECONNECT_MAX = 500;
// Item 9 hang recovery, case 6: an app restart or update is back within a few seconds, so the first attempts stay at
// 500 ms. If the app is still not answering after that, back off 1 s, 2 s, 4 s ... up to 30 s so a stopped app is not hammered.
const RECONNECT_FAST_TRIES = 10;
const RECONNECT_BACKOFF_MAX = 30000;
function reconnectDelayFor(attempt) {
  if (attempt < RECONNECT_FAST_TRIES) return RECONNECT_MIN;
  return Math.min(RECONNECT_BACKOFF_MAX, 1000 * Math.pow(2, attempt - RECONNECT_FAST_TRIES));
}
let reconnectAttempts = 0;
const HEARTBEAT_MS = 10000;
// If no message (incl. pong) arrives within this window while we believe we're
// connected, the socket is half-open: force a reconnect instead of letting
// pending requests slowly time out.
const STALE_SOCKET_MS = 140000; // above 120s tool timeout so a long execute_luau never looks half-open
const REQUEST_TIMEOUT_DEFAULT = 130000; // a bit above the 120s tool timeout

let ws = null;
let connected = false;
let reconnectDelay = RECONNECT_MIN;
let reconnectTimer = null;
let heartbeatTimer = null;
let lastMessageAt = 0; // timestamp of the last frame received from the bridge
let nextId = 1;
const pending = new Map(); // id -> {resolve, timer}
let toolsCache = [];
// 1.24.13: AgentScript's own catalogue. toolsCache follows the shared socket's
// engine, so an AgentScript tab could show Roblox's count and "local (0 tools)".
let localToolsCache = [];
let mcpAlive = false;
let serversCache = [];
// true/false = a PLACE is loaded and usable in Roblox Studio; null = unknown.
// The MCP process stays alive when Studio is closed or its MCP option is off,
// so this is probed separately (bridge "studio_status").
let studioConnected = null;
let studioChecking = false;
// true/false = a Roblox Studio app is connected to the MCP server at all; null =
// unknown. studioApp=true with studioConnected=false means "Studio open but no
// place"; studioApp=false means "Studio closed PlazCode its MCP option disabled".
let studioApp = null;
// true/false = a Roblox Studio WINDOW/PROCESS exists on this machine (checked
// bridge-side via tasklist); null = unknown/old bridge. Distinguishes the two
// studioApp=false sub-cases the UI must word differently: Studio genuinely not
// launched ("open Roblox Studio") vs Studio OPEN but its MCP plugin never
// registered with the bridge - the documented fix for the latter is opening
// Assistant Settings > MCP Servers inside Studio (validated live 3x), which
// "open Roblox Studio" wording completely fails to convey.
let studioProc = null;
let robloxProc = false;
// Editor-backed status. A local bridge socket is not an editor connection.
let robloxEditorConnected = false;
let localReady = false; // agent's workspace is up (from /api/status local_ready)
let bridgeReachable = false;
let profileRequired = false;
let lastNativeHealthAt = 0;
let localFull = false; // AgentScript FULL PC ACCESS (agent is source of truth)
let localRoot = ""; // workspace path, injected into the AI's state line
let blenderSuppressed = false;
let blenderAddon = false; // blender-mcp addon listening on TCP 9876
let blenderError = "";
let blenderScriptsReady = false;
let blenderWasConnected = false; // this browser session reached Blender at least once
const BLENDER_TOOL_NAMES = new Set([
  "get_scene_info", "get_object_info", "execute_blender_code", "get_viewport_screenshot",
  "blender_export_fbx", "blender_import_fbx", "blender_export_obj", "blender_import_obj",
  "blender_mesh_dump", "blender_send_to_studio", "blender_execute_code",
  "blender_get_scene_info", "blender_get_object_info", "blender_screenshot",
  "export_blender_fbx", "import_blender_fbx",
]);
function btool(name, description, props, required) {
  return { name, server: "blender", description, inputSchema: { type: "object", properties: props || {}, required: required || [] } };
}
const BLENDER_TOOLS = [
  btool("get_scene_info", "Inspect the live Blender scene (objects, cameras, lights, collections).", {}, []),
  btool("get_object_info", "Details for one object in the Blender scene.", { name: { type: "string" } }, ["name"]),
  btool("execute_blender_code", "Run Python (bpy) inside Blender. Prefer the named blender_* tools.", { code: { type: "string" } }, ["code"]),
  btool("get_viewport_screenshot", "Capture the Blender 3D viewport.", { max_size: { type: "integer" } }, []),
  btool("blender_send_to_studio", "ONE SHOT: dump the live Blender meshes and import them into Roblox Studio as Workspace.PLAZCODE_Imported. No filepath needed.", { objects: { type: "array", items: { type: "string" } }, dest: { type: "string" }, scale: { type: "number", description: "Size multiplier. Default 1: 1 Blender unit = 1 stud." } }, []),
  btool("blender_export_fbx", "Export meshes to an FBX (Forward -Z, Up Y). filepath optional. Also dumps meshes so blender_send_to_studio / asset_bridge_import can run with no path.", { filepath: { type: "string" }, objects: { type: "array", items: { type: "string" } } }, []),
  btool("blender_import_fbx", "Import an FBX into the live Blender scene. filepath optional — defaults to the last PlazCode export.", { filepath: { type: "string" } }, []),
  btool("blender_export_obj", "Export selected/all meshes to OBJ. filepath optional.", { filepath: { type: "string" }, objects: { type: "array", items: { type: "string" } } }, []),
  btool("blender_import_obj", "Import an OBJ into the live Blender scene.", { filepath: { type: "string" } }, ["filepath"]),
  btool("blender_add_cube", "Add a cube.", { name: { type: "string" }, size: { type: "number" }, location: { type: "array", items: { type: "number" } } }, []),
  btool("blender_add_sphere", "Add a UV sphere.", { name: { type: "string" }, radius: { type: "number" }, location: { type: "array" } }, []),
  btool("blender_add_cylinder", "Add a cylinder.", { name: { type: "string" }, radius: { type: "number" }, depth: { type: "number" }, location: { type: "array" } }, []),
  btool("blender_add_cone", "Add a cone.", { name: { type: "string" }, radius: { type: "number" }, depth: { type: "number" }, location: { type: "array" } }, []),
  btool("blender_add_plane", "Add a plane.", { name: { type: "string" }, size: { type: "number" }, location: { type: "array" } }, []),
  btool("blender_add_torus", "Add a torus.", { name: { type: "string" }, location: { type: "array" } }, []),
  btool("blender_add_monkey", "Add Suzanne (monkey head).", { name: { type: "string" }, location: { type: "array" } }, []),
  btool("blender_add_empty", "Add an Empty (use as a group parent).", { name: { type: "string" }, location: { type: "array" } }, []),
  btool("blender_add_camera", "Add a camera.", { name: { type: "string" }, location: { type: "array" } }, []),
  btool("blender_add_light", "Add a light (SUN/POINT/SPOT/AREA).", { name: { type: "string" }, type: { type: "string" }, location: { type: "array" }, energy: { type: "number" } }, []),
  btool("blender_group", "Group objects: parent them to a new Empty and put them in a collection of the same name.", { name: { type: "string", description: "Group name" }, objects: { type: "array", items: { type: "string" }, description: "Object names; omit = selected/all meshes" } }, []),
  btool("blender_ungroup", "Ungroup: clear parent, keep world transforms, remove the group Empty.", { name: { type: "string" } }, []),
  btool("blender_parent", "Parent objects under an existing object/Empty.", { parent: { type: "string" }, objects: { type: "array", items: { type: "string" } } }, ["parent"]),
  btool("blender_unparent", "Clear parent, keep world transforms.", { objects: { type: "array", items: { type: "string" } } }, []),
  btool("blender_join", "Join mesh objects into one.", { objects: { type: "array", items: { type: "string" } }, name: { type: "string" } }, []),
  btool("blender_move_to_collection", "Move objects into a collection (created if missing).", { collection: { type: "string" }, objects: { type: "array", items: { type: "string" } } }, []),
  btool("blender_list_collections", "List collections and their objects.", {}, []),
  btool("blender_list_objects", "List every object: type, location, parent, collections.", {}, []),
  btool("blender_delete", "Delete objects.", { name: { type: "string" }, objects: { type: "array", items: { type: "string" } } }, []),
  btool("blender_duplicate", "Duplicate objects.", { name: { type: "string" }, objects: { type: "array", items: { type: "string" } } }, []),
  btool("blender_rename", "Rename an object.", { name: { type: "string" }, new_name: { type: "string" } }, ["new_name"]),
  btool("blender_select", "Select objects by name.", { name: { type: "string" }, objects: { type: "array", items: { type: "string" } } }, []),
  btool("blender_transform", "Set location / rotation (radians) / scale.", { name: { type: "string" }, objects: { type: "array" }, location: { type: "array" }, rotation: { type: "array" }, scale: { type: "array" } }, []),
  btool("blender_apply_transforms", "Apply rotation/scale (and optional location).", { objects: { type: "array" }, location: { type: "boolean" }, rotation: { type: "boolean" }, scale: { type: "boolean" } }, []),
  btool("blender_set_origin", "Set object origin (ORIGIN_GEOMETRY, ORIGIN_CURSOR, ORIGIN_CENTER_OF_MASS).", { name: { type: "string" }, type: { type: "string" } }, []),
  btool("blender_shade_smooth", "Shade smooth.", { name: { type: "string" }, objects: { type: "array" } }, []),
  btool("blender_set_material", "Assign a Principled BSDF material. color = [r,g,b] or [r,g,b,a] 0–1.", { name: { type: "string" }, material: { type: "string" }, color: { type: "array" } }, []),
  // ── Material toolkit ──
  btool("blender_material_create", "Create a node-based material (optionally assigning it). Either a preset, explicit PBR values, or both. color = [r,g,b(,a)] 0–1, [r,g,b] 0–255, or '#rrggbb'.", { material: { type: "string" }, preset: { type: "string", description: "metal, steel, iron, chrome, gold, silver, copper, bronze, brass, plastic, rubber, ceramic, concrete, asphalt, wood, marble, fabric, leather, glass, frosted_glass, water, ice, emissive, neon, lava, hologram, ghost, toon, roblox_plastic, roblox_metal, roblox_glass" }, color: { type: "array" }, metallic: { type: "number" }, roughness: { type: "number" }, ior: { type: "number" }, transmission: { type: "number" }, alpha: { type: "number" }, emission: { type: "array" }, emission_strength: { type: "number" }, coat: { type: "number" }, sheen: { type: "number" }, blend: { type: "string", description: "BLEND / HASHED / OPAQUE" }, name: { type: "string", description: "object to assign to" }, objects: { type: "array" }, append_slot: { type: "boolean" } }, ["material"]),
  btool("blender_material_preset", "Create a material from a named preset in one call (see blender_material_create for the list) and assign it.", { material: { type: "string" }, preset: { type: "string" }, name: { type: "string" }, objects: { type: "array" }, color: { type: "array" } }, ["preset"]),
  btool("blender_material_set", "Change values on an EXISTING material (color, metallic, roughness, emission, alpha, ior, transmission, coat, sheen, blend).", { material: { type: "string" }, color: { type: "array" }, metallic: { type: "number" }, roughness: { type: "number" }, emission: { type: "array" }, emission_strength: { type: "number" }, alpha: { type: "number" }, transmission: { type: "number" }, ior: { type: "number" }, coat: { type: "number" }, sheen: { type: "number" }, blend: { type: "string" } }, ["material"]),
  btool("blender_material_assign", "Assign an existing material to objects (all slots, one slot, or append a new slot).", { material: { type: "string" }, name: { type: "string" }, objects: { type: "array" }, slot: { type: "integer" }, append: { type: "boolean" } }, ["material"]),
  btool("blender_material_list", "List every material: users, Principled values, plus the known preset names.", {}, []),
  btool("blender_material_inspect", "Dump one material completely: Principled BSDF inputs, linked inputs, node graph, users.", { material: { type: "string" }, name: { type: "string" } }, []),
  btool("blender_material_remove", "Delete a material from the file.", { material: { type: "string" } }, ["material"]),
  btool("blender_material_noise", "Add a procedural texture to a material (noise, voronoi, wave, checker, brick, gradient) driving bump, base color, roughness or emission.", { material: { type: "string" }, type: { type: "string" }, affect: { type: "string", description: "bump | base_color | roughness | emission" }, scale: { type: "number" }, detail: { type: "number" }, roughness: { type: "number" }, distortion: { type: "number" }, strength: { type: "number" }, color_a: { type: "array" }, color_b: { type: "array" }, replace: { type: "boolean" } }, ["material"]),
  btool("blender_material_image", "Wire an image file into a material slot (base_color, roughness, metallic, normal, emission).", { material: { type: "string" }, path: { type: "string" }, slot: { type: "string" }, strength: { type: "number" }, alpha_to_alpha: { type: "boolean" }, colorspace: { type: "string" } }, ["material", "path"]),
  btool("blender_material_pbr", "Build a full PBR graph from map files (base_color/albedo + optional orm, roughness, metallic, normal, emission) with correct Non-Color colorspaces.", { material: { type: "string" }, base_color: { type: "string" }, albedo: { type: "string" }, orm: { type: "string" }, roughness: { type: "string" }, metallic: { type: "string" }, normal: { type: "string" }, emission: { type: "string" } }, ["material"]),
  btool("blender_add_modifier", "Add a modifier: SUBSURF, BEVEL, SOLIDIFY, MIRROR, ARRAY, BOOLEAN, DECIMATE. apply=true to apply.", { name: { type: "string" }, type: { type: "string" }, levels: { type: "integer" }, apply: { type: "boolean" }, target: { type: "string" } }, []),
  btool("blender_boolean", "Boolean one mesh with another (DIFFERENCE/UNION/INTERSECT) and apply.", { name: { type: "string" }, target: { type: "string" }, operation: { type: "string" } }, ["target"]),
  btool("blender_clear_scene", "Delete objects. keep = names to leave.", { keep: { type: "array", items: { type: "string" } } }, []),
  btool("blender_add_grid", "Add a grid.", { name: { type: "string" }, size: { type: "number" }, location: { type: "array" } }, []),
  btool("blender_add_text", "Add 3D text. text=string, extrude=thickness.", { name: { type: "string" }, text: { type: "string" }, extrude: { type: "number" }, location: { type: "array" } }, []),
  btool("blender_translate", "Move objects by offset [x,y,z] (relative).", { offset: { type: "array" }, name: { type: "string" }, objects: { type: "array" } }, []),
  btool("blender_rotate", "Set rotation in DEGREES [x,y,z]. add=true to add.", { rotation_deg: { type: "array" }, add: { type: "boolean" }, name: { type: "string" }, objects: { type: "array" } }, []),
  btool("blender_set_dimensions", "Set object size in meters [x,y,z].", { dimensions: { type: "array" }, name: { type: "string" } }, []),
  btool("blender_origin_to_bottom", "Put origin at the lowest point (Roblox feet).", { name: { type: "string" }, objects: { type: "array" } }, []),
  btool("blender_drop_to_ground", "Move objects so the lowest vertex sits on Z=0.", { name: { type: "string" }, objects: { type: "array" } }, []),
  btool("blender_array", "Duplicate along offset, count times.", { count: { type: "integer" }, offset: { type: "array" }, objects: { type: "array" } }, []),
  btool("blender_mirror", "Mirror-duplicate across X/Y/Z.", { axis: { type: "string" }, objects: { type: "array" } }, []),
  btool("blender_triangulate", "Convert faces to triangles (needed before Studio).", { objects: { type: "array" } }, []),
  btool("blender_apply_modifiers", "Apply every modifier so dump/export sees the result.", { objects: { type: "array" } }, []),
  btool("blender_merge", "Merge-by-distance (remove doubles).", { distance: { type: "number" }, objects: { type: "array" } }, []),
  btool("blender_recalc_normals", "Recalculate outside normals.", { objects: { type: "array" } }, []),
  btool("blender_hide", "Hide objects.", { name: { type: "string" }, objects: { type: "array" } }, []),
  btool("blender_unhide", "Unhide objects (omit names = all).", { name: { type: "string" }, objects: { type: "array" } }, []),
  btool("blender_undo", "Undo last Blender action.", {}, []),
  btool("blender_stats", "Vertex/face/modifier counts.", { objects: { type: "array" } }, []),
  btool("blender_get_selection", "Names of selected objects.", {}, []),
  btool("blender_uv_unwrap", "Smart UV project.", { objects: { type: "array" } }, []),
  btool("blender_look_at", "Point an object/camera at a target or location.", { name: { type: "string" }, target: { type: "string" }, location: { type: "array" } }, []),
  btool("blender_align_camera", "Align the scene camera to an axis (front/back/left/right/top/bottom/iso) looking at a target or the selection.", { axis: { type: "string" }, distance: { type: "number" }, target: { type: "string" }, name: { type: "string" } }, []),
  btool("blender_align_camera_axis", "Same as blender_align_camera.", { axis: { type: "string" }, distance: { type: "number" }, target: { type: "string" }, name: { type: "string" } }, []),
  btool("blender_view_axis", "Align the 3D viewport to FRONT/BACK/LEFT/RIGHT/TOP/BOTTOM (or iso via camera).", { axis: { type: "string" } }, []),
  btool("blender_camera_to_view", "Move the scene camera to match the current 3D viewport.", {}, []),
  btool("blender_set_camera_lens", "Set camera focal length, clip planes, or orthographic mode.", { name: { type: "string" }, lens: { type: "number" }, clip_start: { type: "number" }, clip_end: { type: "number" }, ortho: { type: "boolean" }, ortho_scale: { type: "number" } }, []),
  btool("blender_scale", "Scale selected/named objects. scale:[x,y,z] or a number. multiply=true multiplies current scale.", { name: { type: "string" }, scale: { type: "array" }, factor: { type: "array" }, multiply: { type: "boolean" } }, []),
  btool("blender_bevel", "Bevel mesh edges in edit mode.", { name: { type: "string" }, width: { type: "number" }, segments: { type: "number" } }, []),
  btool("blender_solidify", "Add a Solidify modifier (thickness).", { name: { type: "string" }, thickness: { type: "number" } }, []),
  btool("blender_extrude", "Extrude the mesh along normals.", { name: { type: "string" }, distance: { type: "number" } }, []),
  btool("blender_add_curve", "Add a Bezier curve.", { name: { type: "string" }, location: { type: "array" } }, []),
  btool("blender_add_armature", "Add an armature (single bone).", { name: { type: "string" }, location: { type: "array" } }, []),
  btool("blender_keyframe_insert", "Insert a keyframe on location/rotation/scale (or data_path) at frame.", { name: { type: "string" }, frame: { type: "number" }, data_path: { type: "string" } }, []),
  btool("blender_set_frame", "Set the current scene frame.", { frame: { type: "number" } }, []),
  btool("blender_set_active_camera", "Make a camera the scene camera.", { name: { type: "string" } }, []),
  btool("blender_track_to", "TRACK_TO constraint from selected objects toward target.", { target: { type: "string" }, name: { type: "string" } }, ["target"]),
  btool("blender_cursor_to_selected", "Move the 3D cursor to the selection midpoint.", { name: { type: "string" } }, []),
  btool("blender_randomize_transform", "Jitter location/rotation/scale of selected objects.", { name: { type: "string" }, location: { type: "number" }, rotation: { type: "number" }, scale: { type: "number" }, seed: { type: "number" } }, []),
  btool("blender_hide_render", "Hide (or unhide) objects from render.", { name: { type: "string" }, hide: { type: "boolean" } }, []),
  btool("blender_subdivision", "Add a Subdivision Surface modifier.", { name: { type: "string" }, levels: { type: "number" }, render_levels: { type: "number" } }, []),
  btool("blender_origin_to_geometry", "Set origin to geometry for selected objects.", { name: { type: "string" } }, []),
];
for (const t of BLENDER_TOOLS) BLENDER_TOOL_NAMES.add(t.name);

// ── Blockbench (1.24.33) ─────────────────────────────────────────────────────
// Two ways, chosen in the PlazCode app (Apps & servers): "In my browser" runs PlazCode's toolset
// (core/blockbench-tools.js) inside the web.blockbench.net tab with the browser's own scripting call;
// "The Blockbench app" sends the same named action to the app, which passes it to PlazCode's helper inside
// Blockbench. Nothing here touches a Blockbench tab before the person pressed Allow in the app
// (blockbench.consent comes from the app's status). There is no free-code action.
let blockbench = { consent: false, mode: "web", connected: false };
let blockbenchWebReady = false, blockbenchWatchedAt = 0, blockbenchReport = "", blockbenchReportAt = 0, blockbenchWatching = false;
const BLOCKBENCH_ORIGIN = "https://web.blockbench.net";
function bbtool(name, description, props, required) {
  return { name, server: "blockbench", description, inputSchema: { type: "object", properties: props || {}, required: required || [] } };
}
const BB_V3 = { type: "array", items: { type: "number" }, description: "[x,y,z]" }, BB_S = { type: "string" }, BB_LIST = { type: "array", items: { type: "string" }, description: "names or ids" };
const BLOCKBENCH_TOOLS = [
  bbtool("blockbench_status", "Blockbench: version and the open model (name, format, how many cubes, groups, meshes, textures, animations)."),
  bbtool("blockbench_formats", "List the model formats this Blockbench offers (ids for blockbench_project_new)."),
  bbtool("blockbench_project_new", "Start a new model. format = a format id (free, bedrock, java_block, ...). Replaces the current view with an empty model.", { format: BB_S, name: BB_S }, []),
  bbtool("blockbench_outline", "The model's parts as a tree: groups, cubes and meshes with id, name, position and rotation."),
  bbtool("blockbench_cube_add", "Add a cube. from = lower corner; give to (upper corner) or size. group = name of the group to put it in.", { name: BB_S, from: BB_V3, to: BB_V3, size: BB_V3, origin: BB_V3, rotation: BB_V3, group: BB_S, texture: BB_S }, []),
  bbtool("blockbench_group_add", "Add a group (a bone). parent = name of the group to put it in.", { name: BB_S, origin: BB_V3, rotation: BB_V3, parent: BB_S }, []),
  bbtool("blockbench_mesh_add", "Add a free-form mesh. vertices = list of [x,y,z]; faces = list of 3 or 4 point numbers (from 0).", { name: BB_S, vertices: { type: "array" }, faces: { type: "array" }, group: BB_S }, ["vertices"]),
  bbtool("blockbench_update", "Change one part: new_name, from, to, origin, rotation, visible, group (\"root\" = top level), texture.", { target: BB_S, new_name: BB_S, from: BB_V3, to: BB_V3, origin: BB_V3, rotation: BB_V3, visible: { type: "boolean" }, group: BB_S, texture: BB_S }, ["target"]),
  bbtool("blockbench_remove", "Remove parts (a group goes with everything inside it).", { targets: BB_LIST }, ["targets"]),
  bbtool("blockbench_duplicate", "Copy parts. offset = [x,y,z] to move the copies.", { targets: BB_LIST, offset: BB_V3 }, ["targets"]),
  bbtool("blockbench_select", "Select parts in Blockbench (an empty list clears the selection).", { targets: BB_LIST }, []),
  bbtool("blockbench_selection", "The parts that are selected in Blockbench now."),
  bbtool("blockbench_texture_list", "List the model's textures."),
  bbtool("blockbench_texture_add", "Add a texture: a plain colour (width, height, color \"#rrggbb\") or a PNG as data_url.", { name: BB_S, width: { type: "integer" }, height: { type: "integer" }, color: BB_S, data_url: BB_S }, []),
  bbtool("blockbench_texture_apply", "Put a texture on cubes or meshes.", { texture: BB_S, targets: BB_LIST }, ["texture", "targets"]),
  bbtool("blockbench_texture_remove", "Remove a texture from the model.", { texture: BB_S }, ["texture"]),
  bbtool("blockbench_animation_list", "List the model's animations."),
  bbtool("blockbench_animation_add", "Add an animation. length in seconds; loop = once, hold or loop.", { name: BB_S, length: { type: "number" }, loop: BB_S }, []),
  bbtool("blockbench_animation_keyframe", "Add a keyframe to a group in an animation. channel = rotation, position or scale; values = [x,y,z]; time in seconds.", { animation: BB_S, target: BB_S, channel: BB_S, time: { type: "number" }, values: BB_V3 }, ["animation", "target", "values"]),
  bbtool("blockbench_animation_remove", "Remove an animation.", { animation: BB_S }, ["animation"]),
  bbtool("blockbench_screenshot", "A picture of Blockbench's 3D view."),
  bbtool("blockbench_export", "The model as text: the .bbmodel project (default) or as: \"format\" for the format's own file.", { as: BB_S }, []),
  bbtool("blockbench_undo", "Undo the last change in Blockbench."),
  bbtool("blockbench_redo", "Redo the last undone change in Blockbench."),
];
const BLOCKBENCH_TOOL_NAMES = new Set(BLOCKBENCH_TOOLS.map((t) => t.name));
function isBlockbenchToolName(name) { return BLOCKBENCH_TOOL_NAMES.has(String(name || "").split("__").pop()); }
function blockbenchLive() { return blockbench.consent === true && (blockbench.mode === "app" ? blockbench.connected === true : blockbenchWebReady); }
async function blockbenchTab() {
  const tabs = (await chrome.tabs.query({ url: BLOCKBENCH_ORIGIN + "/*" })).filter((tab) => { try { return new URL(tab.url).origin === BLOCKBENCH_ORIGIN; } catch { return false; } });
  return tabs.sort((a, b) => (Number(b.active) - Number(a.active)) || ((b.lastAccessed || 0) - (a.lastAccessed || 0)))[0] || null;
}
// Runs in the Blockbench page itself.
function blockbenchPageRun(cmd, args) { const tools = window.__plazcodeBlockbench; return tools && typeof tools.run === "function" ? tools.run(cmd, args) : { missing: true }; }
async function blockbenchInTab(tabId, cmd, args, timeout) {
  // The tab is checked again right before every step: it may have gone to another address since it was found
  // (found by a test: a slow action, then a page change, must never put the toolset into the new page).
  let expired = false;
  const gone = { ok: false, message: "The Blockbench tab was closed or went to another page. Open web.blockbench.net again, then try again." };
  const still = async () => { if (expired) return false; try { return new URL((await chrome.tabs.get(tabId)).url).origin === BLOCKBENCH_ORIGIN; } catch { return false; } };
  const once = async () => { const [frame] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func: blockbenchPageRun, args: [cmd, args || {}] }); return frame && frame.result; };
  const work = (async () => {
    if (!(await still())) return gone;
    let reply = await once().catch(() => null);
    if (!reply || reply.missing) {
      if (!(await still())) return gone;
      await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", files: ["core/blockbench-tools.js"] });
      if (!(await still())) return gone;
      reply = await once();
    }
    return reply && !reply.missing ? reply : { ok: false, message: "PlazCode could not start its tools in the Blockbench tab. Reload the Blockbench tab, then try again." };
  })().catch(() => gone);
  let timer;
  const late = new Promise((resolve) => { timer = setTimeout(() => { expired = true; resolve({ ok: false, message: "Blockbench did not answer within " + Math.round(timeout / 1000) + " seconds. It may still be working: look at the Blockbench tab before trying again." }); }, timeout); });
  try { return await Promise.race([work, late]); } finally { clearTimeout(timer); }
}
// Tell the app whether the Blockbench tab answered, so its checklist ticks itself. Only after Allow, only in the browser way.
async function blockbenchWatch(force) {
  if (!(blockbench.consent && blockbench.mode === "web")) { if (blockbenchWebReady) { blockbenchWebReady = false; broadcastStatus(); } blockbenchReport = ""; return; }
  if (blockbenchWatching || (!force && Date.now() - blockbenchWatchedAt < 5000)) return;
  blockbenchWatching = true; blockbenchWatchedAt = Date.now();
  try {
    let ready = false, version = "";
    try { const tab = await blockbenchTab(); if (tab) { const reply = await blockbenchInTab(tab.id, "status", {}, 5000); ready = !!(reply && reply.ok && reply.result && reply.result.blockbench); version = ready ? String(reply.result.blockbench) : ""; } } catch {}
    if (ready !== blockbenchWebReady) { blockbenchWebReady = ready; broadcastStatus(); }
    const report = ready + "|" + version;
    if (report !== blockbenchReport || Date.now() - blockbenchReportAt > 20000) {
      blockbenchReport = report; blockbenchReportAt = Date.now();
      try { await bridgeFetch(RUST_ROBLOX_HTTP + "/api/blockbench", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "web_report", ready, version }), signal: AbortSignal.timeout(5000) }); } catch {}
    }
  } finally { blockbenchWatching = false; }
}
function setBlockbench(next) {
  const was = blockbenchLive();
  blockbench = { consent: next.consent === true, mode: next.mode === "app" ? "app" : "web", connected: next.connected === true };
  blockbenchWatch(false);
  if (was !== blockbenchLive()) broadcastStatus();
}
async function blockbenchCall(name, args, timeout) {
  const cmd = String(name || "").split("__").pop().replace(/^blockbench_/, "");
  if (!blockbench.consent) return { ok: false, error: "Blockbench is not connected. Open PlazCode, go to Apps & servers and connect Blockbench." };
  const limit = Math.min(120000, Math.max(5000, cmd === "screenshot" || cmd === "export" ? 60000 : Math.min(timeout || 30000, 30000)));
  let reply;
  try {
    if (blockbench.mode === "app") {
      const response = await bridgeFetch(RUST_ROBLOX_HTTP + "/api/blockbench", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cmd, args: args || {}, timeout_seconds: Math.ceil(limit / 1000) }), signal: AbortSignal.timeout(limit + 15000) });
      if (response.status === 404) return { ok: false, error: "Blockbench needs the newer PlazCode desktop app. Update the app (it comes with this extension update), then try again. Nothing was changed." };
      const body = await response.json().catch(() => ({}));
      reply = body.ok ? { ok: true, result: body.result } : { ok: false, message: body.error || "The PlazCode app could not reach Blockbench." };
    } else {
      const tab = await blockbenchTab();
      if (!tab) return { ok: false, error: "Blockbench is not open in this browser. Open web.blockbench.net in a tab, then try again. (To use the Blockbench app instead, change the way in PlazCode under Apps & servers.)" };
      reply = await blockbenchInTab(tab.id, cmd, args, limit);
    }
  } catch (error) { return { ok: false, error: "Blockbench could not be reached (" + String(error && error.message || error).slice(0, 200) + ")." }; }
  if (!reply || reply.ok !== true) return { ok: false, error: String(reply && reply.message || "Blockbench could not do that.").slice(0, 4000) };
  const result = reply.result;
  if (cmd === "screenshot") {
    const match = /^data:(image\/png);base64,([A-Za-z0-9+/=]+)$/.exec(String(result && result.image || ""));
    if (!match) return { ok: false, error: "Blockbench did not give a picture of the 3D view." };
    return { ok: true, text: "Picture of Blockbench's 3D view.", images: [{ mimeType: match[1], data: match[2] }] };
  }
  const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
  const noImages = [];
  return { ok: true, text: text.length > 400000 ? text.slice(0, 400000) + "\n[cut: the answer was longer than PlazCode passes on at once]" : text, images: noImages };
}

// ── Figma (1.24.33) ──────────────────────────────────────────────────────────
// PlazCode's own helper runs inside the Figma desktop app (the person starts it from Figma's Plugins menu) and is
// connected to the PlazCode app. These tools send one named action to the app, which passes it to that helper.
// They are offered to the AI only while the app says the helper is connected (figma.connected in its status),
// which also means the person pressed Allow. There is no free-code action. The older paid "Figma Dev Mode"
// connection is a different server and is not touched here.
let figmaHelper = { consent: false, connected: false };
function fgtool(name, description, props, required) {
  return { name, server: "plazcode-figma", description, inputSchema: { type: "object", properties: props || {}, required: required || [] } };
}
const FG_S = { type: "string" }, FG_N = { type: "number" }, FG_B = { type: "boolean" }, FG_LIST = { type: "array", items: { type: "string" }, description: "part ids or exact names" };
const FG_T = { type: "string", description: "a part's id (like 12:34) or its exact name on the current page" }, FG_C = { type: "string", description: "colour like #ff8800 (or #ff880080 with see-through), or none" };
const FG_PLACE = { name: FG_S, parent: { type: "string", description: "id or name of the frame to put it in (default: the page)" }, x: FG_N, y: FG_N, width: FG_N, height: FG_N };
const FG_LOOK = { fill: FG_C, stroke: FG_C, stroke_width: FG_N, corner_radius: FG_N, opacity: { type: "number", description: "0 to 1" }, rotation: FG_N, visible: FG_B };
const FG_LAYOUT = { direction: { type: "string", description: "row, column or none" }, gap: FG_N, padding: { description: "one number, or [top, right, bottom, left]" }, align: { type: "string", description: "start, center, end or between" }, cross_align: { type: "string", description: "start, center or end" }, hug: { type: "boolean", description: "true = the frame shrinks to fit what is inside" } };
const FIGMA_TOOLS = [
  fgtool("figma_status", "Figma: the open file, the current page, how many parts it has and how many are selected."),
  fgtool("figma_pages", "List the pages of the open Figma file."),
  fgtool("figma_page_set", "Go to another page of the file.", { page: { type: "string", description: "page id or name" } }, ["page"]),
  fgtool("figma_outline", "The parts of the current page (or of one frame: target) as a tree with id, name, type, position and size. depth = how many levels (default 3).", { target: FG_T, depth: { type: "integer" } }, []),
  fgtool("figma_node", "Everything about one part: size, colours, text, font, auto layout, what it sits in.", { target: FG_T }, ["target"]),
  fgtool("figma_find", "Find parts on the current page by part of their name and/or by type (FRAME, TEXT, RECTANGLE, ELLIPSE, GROUP, COMPONENT, INSTANCE).", { name: FG_S, type: FG_S }, []),
  fgtool("figma_selection", "The parts that are selected in Figma now, in detail."),
  fgtool("figma_select", "Select parts in Figma and bring them into view (an empty list clears the selection).", { targets: FG_LIST }, []),
  fgtool("figma_frame_add", "Add a frame (a screen, card or container). Give direction to make it an auto-layout frame.", Object.assign({}, FG_PLACE, FG_LOOK, FG_LAYOUT), []),
  fgtool("figma_rectangle_add", "Add a rectangle.", Object.assign({}, FG_PLACE, FG_LOOK), []),
  fgtool("figma_ellipse_add", "Add an ellipse or circle.", Object.assign({}, FG_PLACE, FG_LOOK), []),
  fgtool("figma_text_add", "Add text. font = family (default Inter), font_style = Regular, Bold, ...", { text: FG_S, name: FG_S, parent: FG_PLACE.parent, x: FG_N, y: FG_N, font: FG_S, font_style: FG_S, font_size: FG_N, fill: FG_C, opacity: FG_LOOK.opacity, rotation: FG_N }, ["text"]),
  fgtool("figma_update", "Change one part: new_name, x, y, width, height, the look (fill, stroke, corner_radius, opacity, rotation, visible), parent (move it into another frame), and for text: text, font, font_style, font_size.", Object.assign({ target: FG_T, new_name: FG_S, parent: FG_PLACE.parent, x: FG_N, y: FG_N, width: FG_N, height: FG_N, text: FG_S, font: FG_S, font_style: FG_S, font_size: FG_N }, FG_LOOK), ["target"]),
  fgtool("figma_auto_layout", "Turn auto layout on a frame on, change it, or turn it off (direction none).", Object.assign({ target: FG_T }, FG_LAYOUT), ["target"]),
  fgtool("figma_remove", "Remove parts (a frame or group goes with everything inside it). Pages are never removed.", { targets: FG_LIST }, ["targets"]),
  fgtool("figma_duplicate", "Copy parts. offset = [x, y] to move the copies (default 20, 20).", { targets: FG_LIST, offset: { type: "array", items: { type: "number" } } }, ["targets"]),
  fgtool("figma_group", "Group parts that sit in the same frame or page.", { targets: FG_LIST, name: FG_S }, ["targets"]),
  fgtool("figma_component_create", "Turn a frame or other part into a component.", { target: FG_T }, ["target"]),
  fgtool("figma_instance_add", "Place a copy (an instance) of a component.", { component: FG_T, name: FG_S, parent: FG_PLACE.parent, x: FG_N, y: FG_N }, ["component"]),
  fgtool("figma_styles", "The file's own colour styles and text styles."),
  fgtool("figma_export", "A picture (PNG) of one part: target, or the first selected part. scale 0.1 to 4 (default 1).", { target: FG_T, scale: FG_N }, []),
  fgtool("figma_undo", "Undo the last change in Figma."),
];
const FIGMA_TOOL_NAMES = new Set(FIGMA_TOOLS.map((t) => t.name));
function isFigmaToolName(name) { return FIGMA_TOOL_NAMES.has(String(name || "").split("__").pop()); }
function figmaLive() { return figmaHelper.consent === true && figmaHelper.connected === true; }
function setFigma(next) {
  const was = figmaLive();
  figmaHelper = { consent: next.consent === true, connected: next.connected === true };
  if (was !== figmaLive()) broadcastStatus();
}
async function figmaCall(name, args, timeout) {
  const cmd = String(name || "").split("__").pop().replace(/^figma_/, "");
  if (!figmaHelper.consent) return { ok: false, error: "Figma is not connected. Open PlazCode, go to Apps & servers and connect Figma." };
  const limit = Math.min(120000, Math.max(5000, cmd === "export" ? 60000 : Math.min(timeout || 30000, 30000)));
  let body;
  try {
    const response = await bridgeFetch(RUST_ROBLOX_HTTP + "/api/figma", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cmd, args: args || {}, timeout_seconds: Math.ceil(limit / 1000) }), signal: AbortSignal.timeout(limit + 15000) });
    if (response.status === 404) return { ok: false, error: "Figma needs the newer PlazCode desktop app. Update the app (it comes with this extension update), then try again. Nothing was changed." };
    body = await response.json().catch(() => ({}));
  } catch (error) { return { ok: false, error: "Figma could not be reached (" + String(error && error.message || error).slice(0, 200) + ")." }; }
  if (!body || body.ok !== true) return { ok: false, error: String(body && body.error || "The PlazCode app could not reach Figma.").slice(0, 4000) };
  const result = body.result;
  if (cmd === "export") {
    const match = /^data:(image\/png);base64,([A-Za-z0-9+/=]+)$/.exec(String(result && result.image || ""));
    if (!match) return { ok: false, error: "Figma did not give a picture." };
    return { ok: true, text: "Picture of \"" + String(result.of && result.of.name || "the part").slice(0, 200) + "\" from Figma.", images: [{ mimeType: match[1], data: match[2] }] };
  }
  const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
  const noPictures = [];
  return { ok: true, text: text.length > 400000 ? text.slice(0, 400000) + "\n[cut: the answer was longer than PlazCode passes on at once]" : text, images: noPictures };
}

function blenderServers(list) {
  const rest = (Array.isArray(list) ? list : []).filter((s) => s && s.id !== "blender" && s.id !== "blockbench" && s.id !== "plazcode-figma");
  if (typeof figmaLive === "function" && figmaLive()) rest.push({ id: "plazcode-figma", name: "Figma (PlazCode helper)", alive: true, tools: FIGMA_TOOLS.length });
  if (typeof blockbenchLive === "function" && blockbenchLive()) rest.push({ id: "blockbench", name: "Blockbench", alive: true, tools: BLOCKBENCH_TOOLS.length });
  if (blenderAddon) {
    rest.push({
      id: "blender", name: "Blender",
      alive: true, tools: BLENDER_TOOLS.length,
    });
  }
  return rest;
}
function mergeBlenderTools(tools) {
  const base = Array.isArray(tools) ? tools.slice() : [];
  if (typeof blockbenchLive === "function" && blockbenchLive()) { const known = new Set(base.map((t) => t && t.name)); for (const t of BLOCKBENCH_TOOLS) if (!known.has(t.name)) base.push(t); }
  if (typeof figmaLive === "function" && figmaLive()) { const known = new Set(base.map((t) => t && t.name)); for (const t of FIGMA_TOOLS) if (!known.has(t.name)) base.push(t); }
  if (!blenderAddon) return base;
  const have = new Set(base.map((t) => t && t.name));
  for (const t of BLENDER_TOOLS) if (!have.has(t.name)) base.push(t);
  return base;
}

function log(...a) {
  console.log("[plazcode-bg]", ...a);
}

// ── Connection diagnostics (1.24.27) ──────────────────────────────────────
// A tester's link to the app dropped every 15-70 minutes and came back about 20 s later, and nothing said why.
// The worker now remembers how its last connection ended, and notices when the browser stopped and restarted
// it (session storage survives a worker restart but not a browser restart). The first message on each new
// connection reports this to the app, which shows it in its Terminal.
const WORKER_STARTED_AT = Date.now();
let workerRestartNote = "";
let lastCloseNote = "", lastCloseAt = 0;
const workerGapRead = (async () => {
  try {
    const saved = await chrome.storage.session.get("rsWorkerAliveAt");
    const at = Number(saved && saved.rsWorkerAliveAt) || 0;
    if (at && WORKER_STARTED_AT - at > 0) workerRestartNote = "the browser stopped and restarted PlazCode's background worker; it was last active " +
      Math.round((WORKER_STARTED_AT - at) / 1000) + " s before this restart";
  } catch {}
})();
function markWorkerAlive() { try { chrome.storage.session.set({ rsWorkerAliveAt: Date.now() }); } catch {} }
function connectionNote() {
  const parts = [];
  if (workerRestartNote) { parts.push(workerRestartNote); workerRestartNote = ""; }
  else if (lastCloseNote) parts.push(lastCloseNote + "; reconnected " + Math.round((Date.now() - lastCloseAt) / 1000) + " s later");
  lastCloseNote = "";
  return parts.join("; ");
}

// ── WebSocket lifecycle ─────────────────────────────────────────────────
let connectInFlight = null;
let socketConnectTimer = null;
const SOCKET_CONNECT_TIMEOUT_MS = 8000;
async function connect() {
  // Claim the attempt BEFORE pairing/profile awaits. Several tabs can wake the
  // worker together; they must not all create a socket after shared auth ends.
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  if (connectInFlight) return connectInFlight;
  connectInFlight = (async () => {
  try { await ensurePairing(true); } catch (error) {
    bridgeError = String(error.message || "Agent unavailable for automatic pairing");
    log(bridgeError);
    broadcastStatus();
    scheduleReconnect();
    return;
  }
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  const url = engineUrl();
  let sock;
  try {
    await ensureAccountContext();
    sock = new WebSocket(url, pairingProtocols());
  } catch (e) {
    bridgeError = String(e.message || e);
    log("WebSocket ctor failed", e);
    broadcastStatus();
    scheduleReconnect();
    return;
  }
  ws = sock;

  sock.onopen = () => {
    if (sock !== ws) return;
    clearTimeout(socketConnectTimer);
    socketConnectTimer = null;
    connected = true;
    bridgeError = "";
    reconnectDelay = RECONNECT_MIN;
    reconnectAttempts = 0;
    lastMessageAt = Date.now();
    lastSocketOpenAt = Date.now();
    log(`connected to ${engineLabel()} bridge (${url})`);
    workerGapRead.then(() => {
      const note = connectionNote();
      if (!note || sock !== ws || sock.readyState !== WebSocket.OPEN) return;
      try { sock.send(JSON.stringify({ type: "client_note", id: 0, text: note })); } catch {}
      try { debugRecord({ source: "extension", level: "warn", kind: "bridge", text: "Bridge reconnected: " + note, where: ["background.js › connect"] }); } catch {}
    });
    markWorkerAlive();
    startHeartbeat();
    studioChecking = engine !== "local";
    refreshProcStatus();
    refreshStudioStatus();
    broadcastStatus();
  };

  sock.onmessage = (ev) => {
    if (sock !== ws) return;
    lastMessageAt = Date.now();
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    handleBridgeMessage(msg);
  };

  sock.onclose = (event) => {
    if (sock !== ws) return;
    clearTimeout(socketConnectTimer);
    socketConnectTimer = null;
    ws = null;
    try {
      const code = event && event.code, reason = event && event.reason ? ", " + String(event.reason).slice(0, 80) : "";
      lastCloseNote = "the previous connection closed (code " + code + reason + (event && event.wasClean ? ", clean" : ", not clean") + ")";
      lastCloseAt = Date.now();
      log("bridge connection closed", code, event && event.reason);
    } catch {}
    connected = false;
    mcpAlive = false;
    studioConnected = null;
    studioApp = null;
    studioProc = null;
    robloxEditorConnected = false;
    toolsCache = [];
    serversCache = [];
    stopHeartbeat();
    failAllPending("bridge connection closed");
    broadcastStatus();
    scheduleReconnect();
  };

  sock.onerror = () => {
    if (sock !== ws) return;
    // onclose will follow; nothing to do here but avoid an unhandled error.
    try { sock.close(); } catch {}
  };
  // Browsers may leave an opening socket CONNECTING for minutes. Bound this
  // handshake only; established sockets and running commands keep their limits.
  socketConnectTimer = setTimeout(() => {
    if (sock !== ws || sock.readyState === WebSocket.OPEN) return;
    ws = null;
    connected = false;
    bridgeError = "PlazCode did not finish opening its local socket. Retrying the connection.";
    try { sock.close(); } catch {}
    broadcastStatus();
    scheduleReconnect();
  }, SOCKET_CONNECT_TIMEOUT_MS);
  })().finally(() => { connectInFlight = null; });
  return connectInFlight;
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, reconnectDelayFor(reconnectAttempts));
  reconnectAttempts++;
  reconnectDelay = Math.min(reconnectDelay * 1.7, RECONNECT_MAX);
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (connected) {
      // Half-open socket: the WS still reports OPEN but nothing comes through.
      // The pong (and every other frame) refreshes lastMessageAt; if it has
      // gone stale, drop the dead socket so onclose triggers a reconnect.
      const toolPending = [...pending.values()].some((p) => p.type === "call_tool");
      if (lastMessageAt && Date.now() - lastMessageAt > STALE_SOCKET_MS) {
        if (toolPending) return; // execute_luau owns the helper — pong resumes after it
        log("socket stale, forcing reconnect");
        try { ws.close(); } catch {}
        return;
      }
      // Keeps the MV3 service worker alive AND detects a half-open socket.
      // Use short timeout so pending ping doesn't leak for 130s
      send({ type: "ping" }, 12000).catch(() => {});
      markWorkerAlive();
      refreshStudioStatus();
      // ── MCP auto-heal (v1.12) ────────────────────────────────────────────
      // The StudioMCP helper the agent spawns can die on its own (Studio
      // update, sleep/resume, crash). The agent only recycles it when a TOOL
      // call proves the helper dead - so between calls the bar kept showing
      // "connected" with a corpse helper and every command failed. If the
      // helper has been dead for two consecutive heartbeats, restart it
      // proactively (max once per 3 min so a legitimately closed Studio can't
      // cause a restart loop - the agent refuses when Studio's MCP option is
      // off, and that answer must win).
      if ((engine === "roblox" || engine === "anim") && !toolPending) {
        // Studio closed / MCP plugin off: do not restart-loop the helper.
        // 1.24.13-fix: never heal while Studio is attaching, already linked, or
        // closed. The old 1-heartbeat/30 s heal killed the helper while Studio's
        // auto-connect was still registering, which dropped the selected Studio
        // ("The selected Studio disconnected") and looped OFFLINE -> reset.
        if (studioProc === false || studioApp === false || studioChecking ||
            robloxEditorConnected === true || studioConnected === true) {
          mcpDownStreak = 0;
        } else if (!mcpAlive) {
          mcpDownStreak++;
          const now = Date.now();
          if (mcpDownStreak >= MCP_HEAL_STREAK && !mcpHealInFlight &&
              now - lastSocketOpenAt > MCP_HEAL_GRACE_MS &&
              now - lastMcpHealAt > MCP_HEAL_COOLDOWN_MS) {
            mcpHealInFlight = true;
            // Confirm with the bridge that the helper is really dead; a stale
            // mcpAlive=false flag alone must not restart a working helper.
            send({ type: "mcp_status" }, 10000).then((st) => {
              if (!st || !st.ok || st.alive !== false || robloxEditorConnected === true) {
                mcpDownStreak = 0;
                return;
              }
              lastMcpHealAt = Date.now();
              mcpDownStreak = 0;
              log("MCP helper confirmed dead - auto-restarting Studio MCP");
              return send({ type: "restart_mcp" }, 30000).then((r) => {
                if (r && r.ok) {
                  send({ type: "list_tools" }, 10000).catch(() => {});
                  refreshStudioStatus();
                }
              });
            }).catch(() => {}).finally(() => { mcpHealInFlight = false; });
          }
        } else {
          mcpDownStreak = 0;
        }
      }
    }
  }, HEARTBEAT_MS);
}
// Auto-heal state (see startHeartbeat).
let mcpDownStreak = 0;
let lastMcpHealAt = 0;
let mcpHealInFlight = false;
let lastSocketOpenAt = 0;
const MCP_HEAL_STREAK = 3;          // 3 heartbeats (~30 s) of a dead helper
const MCP_HEAL_GRACE_MS = 60000;    // let Studio auto-connect settle after (re)connect
const MCP_HEAL_COOLDOWN_MS = 180000; // at most one heal every 3 min

function stopHeartbeat() {
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

// Resolve once the socket is OPEN, or false after `timeout` ms.
function waitForConnection(timeout = 20000) {
  return new Promise((resolve) => {
    if (connected && ws && ws.readyState === WebSocket.OPEN) return resolve(true);
    connect(); // nudge a (re)connection - important after a worker wake-up
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (connected && ws && ws.readyState === WebSocket.OPEN) {
        clearInterval(iv);
        resolve(true);
      } else if (Date.now() - t0 > timeout) {
        clearInterval(iv);
        resolve(false);
      }
    }, 25);
  });
}

// ── request/response over the socket ────────────────────────────────────
async function send(obj, timeout = REQUEST_TIMEOUT_DEFAULT) {
  // Also on an already-open socket: a files check that failed after the connection was made must stop commands.
  try { await protectionCheck(); } catch (error) { return { ok: false, kind: "integrity", error: String(error && error.message || error) }; }
  // The MV3 service worker can be suspended; the first message after a wake-up
  // arrives before the socket has re-opened. Wait for it instead of failing -
  // otherwise Kimi wrongly hears "bridge offline".
  if (!connected || !ws || ws.readyState !== WebSocket.OPEN) {
    await waitForConnection(20000);
  }
  const attempt = () => new Promise((resolve) => {
    if (!connected || !ws || ws.readyState !== WebSocket.OPEN) {
      resolve({ ok: false, kind: "disconnected", error: "bridge not connected" });
      return;
    }
    const id = nextId++;
    const payload = { ...obj, id };
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve({ ok: false, kind: "timeout", error: "bridge did not respond in time" });
      }
    }, timeout);
    pending.set(id, { resolve, timer, type: obj.type });
    try {
      ws.send(JSON.stringify(payload));
    } catch (e) {
      clearTimeout(timer);
      pending.delete(id);
      resolve({ ok: false, kind: "disconnected", error: String(e) });
    }
  });
  let r = await attempt();
  if (r && (r.kind === "disconnected" || (r.kind === "lost" && RESEND_AFTER_LOSS.has(obj.type)))) {
    await waitForConnection(15000);
    r = await attempt();
  }
  return r;
}

// Ask the bridge whether a Roblox Studio instance is actually connected to the
// MCP server. Broadcasts only on change so the UI updates promptly but quietly.
let studioProbing = false;
async function refreshStudioStatus() {
  if (studioProbing || !connected) return;
  if ([...pending.values()].some((p) => p.type === "call_tool")) return;
  studioProbing = true;
  try {
    const r = await send({ type: "studio_status" }, 12000);
    const v = r && r.ok && typeof r.studio === "boolean" ? r.studio : null;
    if (v !== null && (engine === "roblox" || engine === "anim")) robloxEditorConnected = v;
    // local readiness comes from the agent's /api/status (local_ready), not editor probes
    if (v !== null && v !== studioConnected) {
      studioConnected = v;
      broadcastStatus();
    } else {
      // The probe result can change independently of the tri-state cache when a
      // timeout returns null, so still publish the strict editor flag.
      broadcastStatus();
    }
  } finally {
    studioProbing = false;
  }
}

function handleBridgeMessage(msg) {
  if (msg.type === "roblox_status") {
    robloxEditorConnected = msg.studio === true;
    robloxProc = msg.studio_proc === true || robloxEditorConnected;
    if (engine === "roblox" || engine === "anim") {
      studioChecking = false;
      studioConnected = robloxEditorConnected;
      studioProc = robloxProc;
      if (Array.isArray(msg.tools)) toolsCache = msg.tools;
      if (msg.mcp_alive === true) mcpAlive = true;
      const row = { id: "roblox", name: "Roblox Studio MCP", alive: robloxEditorConnected, tools: robloxEditorConnected ? toolsCache.length : 0 };
      serversCache = [...serversCache.filter((server) => server.id !== "roblox"), row];
    }
    broadcastStatus();
    return;
  }
  if (msg.type === "desktop_preferences") {
    applyDesktopPreferences(msg.preferences).catch(() => {});
    return;
  }
  if (msg.type === "desktop_agent_action") {
    dispatchDesktopAgentAction(msg).catch(() => {});
    return;
  }
  if ("studio" in msg && (typeof msg.studio === "boolean" || msg.studio === null)) {
    studioConnected = msg.studio;
  }
  if ("studio_app" in msg && (typeof msg.studio_app === "boolean" || msg.studio_app === null)) {
    studioApp = msg.studio_app;
  }
  if ("studio_proc" in msg && (typeof msg.studio_proc === "boolean" || msg.studio_proc === null)) {
    studioProc = msg.studio_proc;
  }
  if (msg.type === "studio_status") {
    studioChecking = false;
    const online = studioConnected === true;
    if (engine === "roblox" || engine === "anim") robloxEditorConnected = online;
    // 1.24.13: a successful Studio probe proves the helper is alive. Without this,
    // a stale mcpAlive=false made the heartbeat auto-heal restart a working helper,
    // which dropped the verified link and showed "MCP is off".
    if (online && (engine === "roblox" || engine === "anim")) mcpAlive = true;
    resolvePending(msg.id, { ok: true, studio: online });
    broadcastStatus();
    return;
  }
  if (msg.type === "connected") {
    studioChecking = msg.studio_checking === true;
    mcpAlive = !!msg.mcp_alive;
    // The bridge's first frame carries no catalogue yet; keep the last good one.
    if (Array.isArray(msg.tools) && (msg.tools.length || msg.ok === false)) toolsCache = msg.tools;
    if (Array.isArray(msg.servers)) serversCache = msg.servers;
    const online = msg.studio === true;
    if (engine === "roblox" || engine === "anim") robloxEditorConnected = online;
    broadcastStatus();
    return;
  }
  if (msg.type === "pong") {
    resolvePending(msg.id, { ok: true });
    return;
  }
  if (msg.type === "tools") {
    studioChecking = false;
    if (Array.isArray(msg.tools)) toolsCache = msg.tools;
    if (Array.isArray(msg.servers)) serversCache = msg.servers;
    mcpAlive = !!msg.mcp_alive;
    const online = msg.studio === true;
    if (engine === "roblox" || engine === "anim") robloxEditorConnected = online;
    resolvePending(msg.id, { ok: !!msg.ok, tools: toolsCache, studio: online });
    broadcastStatus();
    return;
  }
  if (msg.type === "tool_result") {
    resolvePending(msg.id, msg.ok
      ? { ok: true, text: msg.text, images: msg.images || [] }
      : { ok: false, kind: msg.kind, error: msg.error });
    return;
  }
  if (msg.type === "mcp_status") {
    mcpAlive = !!msg.alive;
    if (Array.isArray(msg.tools)) toolsCache = msg.tools;
    if (Array.isArray(msg.servers)) {
      serversCache = msg.servers;
      const rbx = serversCache.find((x) => x.id === "roblox" || x.id === "studio");
      if (rbx) robloxEditorConnected = !!rbx.alive;
      const loc = serversCache.find((x) => x.id === "local");
      if (loc) localReady = !!loc.alive;
    }
    resolvePending(msg.id, { ok: !!msg.ok, alive: mcpAlive, error: msg.error });
    broadcastStatus();
    return;
  }
  if (msg.type === "server_changed") {
    // The bridge acks, then restarts itself to reload config.json. The socket
    // will drop right after this - the content script shows a spinner until the
    // reconnect lands and a fresh status arrives.
    resolvePending(msg.id, { ok: !!msg.ok, error: msg.error, restarting: !!msg.restarting });
    return;
  }
  if (msg.type === "error") {
    resolvePending(msg.id, { ok: false, error: msg.error });
    return;
  }
}

function resolvePending(id, value) {
  const p = pending.get(id);
  if (!p) return;
  clearTimeout(p.timer);
  pending.delete(id);
  p.resolve(value);
}

// A request in `pending` was already written to the socket. If the socket
// closes now, the bridge may have executed it, so it is "lost", not
// "disconnected": send() must never transparently resend a mutation (a
// restarted or updated desktop would run execute_luau or a file write twice).
// Read-only requests are safe to resend once the bridge is back.
const RESEND_AFTER_LOSS = new Set(["list_tools", "studio_status", "ping", "list_servers", "status", "mcp_status"]);
function failAllPending(reason) {
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    p.resolve({ ok: false, kind: "lost", error: reason });
  }
  pending.clear();
}

// ── status push to any open DeepSeek tab + popup ─────────────────────────
function localTools() {
  if (localToolsCache.length) return localToolsCache;
  return engine === "local" ? toolsCache : [];
}
function statusObj(mode = engine) {
  const ready = !profileRequired && (mode === "local" ? localReady : connected);
  return {
    type: "rs-status", connected: ready, mcpAlive: mode === "local" ? ready : mcpAlive, studio: studioConnected, studioApp, studioProc,
    bridge_reachable: bridgeReachable || connected, profile_required: profileRequired,
    bridge_connecting: !ready && !profileRequired && (bridgeReachable || (!bridgeError && !!(connectInFlight || procStatusReading))),
    robloxProc, roblox_connected: robloxEditorConnected, studio_checking: studioChecking,
    local_connected: localReady && !profileRequired, local_full: localFull,
    local_root: localRoot,
    version_warning: extensionVersionWarning(desktopVersion, loadedExtensionVersion()),
    tools: mergeBlenderTools(mode === "local" ? localTools() : toolsCache).length,
    // Blender (and any other live add-on) is listed in AgentScript too, so the bar,
    // the popup, list_mcp_servers and the startup note all tell the AI it is connected.
    servers: mode === "local" ? blenderServers([{id:"local",name:"Local Filesystem",alive:localReady,tools:localReady ? localTools().length : 0}]) : blenderServers(serversCache), engine: mode,
    blender: blenderAddon, blender_error: blenderError || undefined, bridge_error: bridgeError || undefined,
    control_v2: (typeof CONTROL_V2 !== "undefined" && CONTROL_V2) || undefined,
  };
}

// Read the body once. Axum's missing-route and request-limit replies may be empty/plain text.
async function creatorResponse(response) {
  const text = await response.text();
  let value;
  try { value = JSON.parse(text); } catch {
    if (response.status === 404) throw Error("This running PlazCode app does not provide creation previews. Exit all old PlazCode apps and open the latest complete download.");
    if (response.status === 413) throw Error("Creation draft exceeds the desktop request limit. Send a smaller draft patch.");
    throw Error("Creation service returned " + (response.ok ? "an invalid response" : "HTTP " + response.status) + ". Restart the updated PlazCode app and try again. No Studio changes were made.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Creation service returned an invalid response. Restart the updated PlazCode app.");
  if (!response.ok) return {ok:false,error:typeof value.error === "string" ? value.error : "Creation request failed (HTTP " + response.status + ")."};
  return value;
}
let desktopVersion = "";
function loadedExtensionVersion() {
  try { return chrome.runtime.getManifest().version; } catch { return ""; }
}
function extensionVersionWarning(desktop, extension) {
  if (!/^\d+\.\d+\.\d+$/.test(desktop) || !/^\d+\.\d+\.\d+$/.test(extension) || desktop === extension) return "";
  return "Desktop " + desktop + ", browser extension " + extension + ". Updating only the app cannot update an extension loaded from another folder. Use Update now for the complete update. In your browser's Extensions page, check PlazCode's loaded folder; load PlazCode-Extension from the updated PlazCode folder, reload it, then refresh your AI tabs. In Firefox, load the updated Firefox add-on.";
}
async function refreshProcStatus() {
  if (procStatusReading) return;
  procStatusReading = true;
  lastNativeHealthAt = Date.now();
  try {
    // Bounded by the bridgeFetch default timeout.
    const r = await bridgeFetch(`${RUST_ROBLOX_HTTP}/api/status`, { method: "GET" });
    if (!r.ok) throw new Error("PlazCode status request failed (HTTP " + r.status + ").");
    const j = await r.json();
    const wasUsable = bridgeReachable && !profileRequired;
    bridgeReachable = true;
    profileRequired = j.profile_required === true;
    if (profileRequired) {
      localReady = false;
      robloxEditorConnected = false;
      accountEpoch = "";
      bridgeError = "Choose a profile or Use PlazCode as a guest in the desktop app.";
      broadcastStatus();
      return;
    }
    // Account storage isolation is required BEFORE publishing ready. Reuse this
    // authenticated snapshot instead of fetching the same status a second time.
    await ensureAccountContext(j);
    if (!rustMode) { rustMode = true; readReleaseStatus(); }
    bridgeError = "";
    // The desktop's editor probe is authoritative; a browser socket or a
    // process-name scan alone cannot establish Studio readiness.
    if(j.blockbench && typeof j.blockbench==="object")setBlockbench(j.blockbench);
    if(typeof desktopControlUpdate==="function")desktopControlUpdate(j.desktop_control);
    if(j.figma && typeof j.figma==="object")setFigma(j.figma);
    if(typeof j.blender_connected==="boolean" && !blenderSuppressed && j.blender_connected!==blenderAddon)setBlender(j.blender_connected,j.blender_connected ? "" : "Blender’s last scene check failed. Use Connect Blender for the exact error.");
    const editor = typeof j.roblox_connected === "boolean" ? j.roblox_connected : robloxEditorConnected;
    const nr = j.roblox_proc === true || editor;
    const editorChanged = editor !== robloxEditorConnected;
    robloxEditorConnected = editor;
    const nl = j.local_ready === true;
    const nf = j.local_full === true;
    const nrRoot = typeof j.local_root === "string" ? j.local_root : localRoot;
    const nextDesktopVersion = typeof j.version === "string" ? j.version : "";
    const changed = !wasUsable || nextDesktopVersion !== desktopVersion || editorChanged || nr !== robloxProc || nl !== localReady || nf !== localFull || nrRoot !== localRoot;
    desktopVersion = nextDesktopVersion;
    robloxProc = nr;
    localReady = nl;
    localFull = nf;
    localRoot = nrRoot;
    if (changed) broadcastStatus();
    // Settings are optional background work, not a health-check dependency.
    syncDesktopPreferencesAfterHealth();
    if (!wasUsable) {
      reconnectAttempts = 0;
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
      connect();
    }
    // Full access re-sync (one-shot, only ever turns Full ON). The old code
    // copied a stale "rs-local-full" value from browser storage back to the
    // agent after every extension restart, which could flip the agent's Full
    // switch against what the user chose on the desktop. Now the agent is the
    // source of truth: we only re-apply Full when the user's saved permission
    // choice (rsPermMode) is "full" while the agent reports it OFF, and we
    // never switch it off from here.
    if (!fullSyncedOnce) {
      fullSyncedOnce = true;
      try {
        chrome.storage.local.get("rsPermMode", (o) => {
          const wantFull = o && o.rsPermMode === "full";
          if (wantFull && !localFull) {
            bridgeFetch(`${RUST_ROBLOX_HTTP}/api/local-full`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ enabled: true }), signal: AbortSignal.timeout(5000),
            }).then((r2) => r2.json()).then((j2) => { localFull = j2.local_full === true; broadcastStatus(); }).catch(() => {});
          }
        });
      } catch {}
    }
  } catch (error) {
    const changed = bridgeReachable || localReady || profileRequired;
    bridgeReachable = false;
    profileRequired = false;
    localReady = false;
    bridgeError = String(error.message || error);
    if (changed) broadcastStatus();
  } finally { procStatusReading = false; }
}
// Single-flight: the 5 s interval must never stack status reads on a slow bridge.
let procStatusReading = false;
let desktopPreferencesReading = null;
let desktopPreferencesStarted = false;
function syncDesktopPreferencesAfterHealth() {
  if (desktopPreferencesReading) return desktopPreferencesReading;
  desktopPreferencesReading = (async () => {
    const ok = desktopPreferencesStarted ? await pullDesktopPreferences() : await initialDesktopPreferencesSync();
    if (ok) desktopPreferencesStarted = true;
  })().finally(() => { desktopPreferencesReading = null; });
  return desktopPreferencesReading;
}

const browserIdentity = crypto.randomUUID();
let desktopAgentReporting = false;
let desktopAgentError = null;
let lastTabState = null;
async function reportDesktopAgentState() {
  if (desktopAgentReporting || !rustMode) return;
  desktopAgentReporting = true;
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true, url: PROVIDER_URLS });
    const tab = tabs[0];
    let control = { canStart: false, canStop: false, pageMounted:false, barVisible:false, status: "Select a supported AI chat in your browser." };
    if (tab && Number.isInteger(tab.id)) {
      try {
        // 1.24.30: a frozen or busy AI tab never answers; without a limit this report (every 750 ms) stopped for good.
        // A tab that is only slow keeps its last answer for 15 s instead of flashing "Refresh the AI chat".
        let reply = await Promise.race([chrome.tabs.sendMessage(tab.id, { type: "rs-desktop-agent-state" }),
          new Promise((resolve) => setTimeout(() => resolve(lastTabState), 2500))]);
        if (reply === lastTabState) {
          if (!lastTabState || lastTabState.tabId !== tab.id || Date.now() - lastTabState.at > 15000) throw new Error("The AI tab did not answer.");
          reply = lastTabState.reply;
        } else if (reply) lastTabState = { tabId: tab.id, reply, at: Date.now() };
        if (reply) {
          control = { ...reply, tab_id: tab.id };
          if(reply.barVisible===false && !reply.canStop){control.canStart=false;control.status="PlazCode page bar is hidden. Refresh the AI tab after reloading the extension.";}
        }
      } catch { control.status = "Refresh the selected AI chat to reconnect PlazCode."; }
    }
    control.browser_id=browserIdentity;
    try {control.browser_focused=(await chrome.windows.getLastFocused()).focused===true;}catch{control.browser_focused=false;}
    if (desktopAgentError && Date.now() < desktopAgentError.until) control.status = desktopAgentError.message;
    await bridgeFetch("http://127.0.0.1:3000/api/desktop/browser-agent", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(control), signal: AbortSignal.timeout(3000),
    });
  } catch {} finally { desktopAgentReporting = false; }
}
async function dispatchDesktopAgentAction(msg) {
  if(msg.browser_id && msg.browser_id!==browserIdentity)return;
  let actionResult;
  try {
    if (!Number.isInteger(msg.tab_id) || !["start", "stop", "enhance", "engine-set", "cowork-on", "cowork-off", "cowork-queue", "cowork-resume", "cowork-remove", "memory-export", "memory-import", "media-stage", "handoff-export", "budget-resume", "task-send", "activity-read", "creator-send", "creator-insert"].includes(msg.action)) throw new Error("Invalid desktop agent action.");
    const reply = await chrome.tabs.sendMessage(msg.tab_id, { type: "rs-desktop-agent-action", action: msg.action, prompt: msg.prompt, request_id: msg.request_id });
    actionResult = reply;
    if (!reply || !reply.ok) throw new Error(reply && reply.error || "The AI tab did not accept the action.");
  } catch (error) {
    actionResult = { ok: false, error: String(error.message || error) };
    desktopAgentError = { message: String(error.message || error), until: Date.now() + 5000 };
  }
  if (msg.request_id) {
    try { await bridgeFetch("http://127.0.0.1:3000/api/desktop/agent-result", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request_id: msg.request_id, result: actionResult }) }); } catch {}
  }
  await reportDesktopAgentState();
}
setInterval(() => { reportDesktopAgentState(); }, 750);

// ── Unattended runs ─────────────────────────────────────────────────────────
// A content script with an agent run sends rs-run-beat. While a tab is running:
//  * the browser may not auto-discard it (Edge sleeping tabs, Chrome memory
//    saver), which would silently end an overnight task;
//  * every second the tab gets rs-wake, which resolves only sleeps whose
//    deadline already passed. Hidden or occluded tabs (Studio maximized over
//    the browser, a locked screen) otherwise get one timer wake-up per minute
//    after five minutes, slowing every turn to minutes;
//  * the desktop bridge is told work is in progress, so an automatic desktop
//    update never restarts it during a long model reply with no tool calls.
const RUN_BEAT_TTL_MS = 180000;
const runTabs = new Map();
let lastActivityPost = 0;
function releaseRunTab(tabId) {
  if (!runTabs.delete(tabId)) return;
  try { const p = chrome.tabs.update(tabId, { autoDiscardable: true }); if (p && p.catch) p.catch(() => {}); } catch {}
}
function noteRunBeat(tabId, running) {
  if (!Number.isInteger(tabId)) return;
  if (!running) { releaseRunTab(tabId); return; }
  if (!runTabs.has(tabId)) {
    try { const p = chrome.tabs.update(tabId, { autoDiscardable: false }); if (p && p.catch) p.catch(() => {}); } catch {}
  }
  runTabs.set(tabId, Date.now());
  if (rustMode && Date.now() - lastActivityPost > 30000) {
    lastActivityPost = Date.now();
    bridgeFetch(`${RUST_ROBLOX_HTTP}/api/desktop/activity`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
  }
}
setInterval(() => {
  const now = Date.now();
  for (const [tabId, at] of runTabs) {
    if (now - at > RUN_BEAT_TTL_MS) { releaseRunTab(tabId); continue; }
    try { const p = chrome.tabs.sendMessage(tabId, { type: "rs-wake" }); if (p && p.catch) p.catch(() => {}); } catch {}
  }
}, 1000);
chrome.tabs.onRemoved?.addListener(tabId => { runTabs.delete(tabId); });

function broadcastStatus() {
  chrome.runtime.sendMessage(statusObj()).catch(() => {});
  chrome.tabs.query({ url: PROVIDER_URLS }, (tabs) => {
    for (const t of tabs) tabEngine(t.id).then(mode=>chrome.tabs.sendMessage(t.id, statusObj(mode))).catch(() => {});
  });
}


// ── Web tools (search + fetch) ──────────────────────────────────────────────
// Health notes (why this is not one DDG call anymore):
//  * html.duckduckgo.com/html/ is the endpoint PlazCode used to scrape with a
//    "PlazCode/1.0" UA. DDG now treats that as an anomaly: it answers 202/403 with a
//    challenge page that contains ZERO .result__a anchors, so the old parser
//    returned [] and the tool reported "no results" on every query.
//  * A browser UA + Accept-Language + Referer is required for the same URL to
//    serve real results, and even then DDG rate-limits datacenter IPs.
//  * So: try several independent backends in order, use a REAL browser UA, and
//    fall back to a generic anchor parser per backend (markup drifts; a
//    changed class name must not zero out the whole tool).
// Every backend failure is collected and reported, so "it doesn't work" is
// always accompanied by WHY (status codes included) instead of a bare "no
// results for X".
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const WEB_FETCH_TIMEOUT = 20000;
// Ollama (127.0.0.1:11434) and Roblox web requests use other hosts, so they never
// block the bridge connection pool, but a hung request used to leave the Ollama
// page or a dev-product tool waiting forever. Every one now has a hard deadline.
// Chat gets a long one: a large local model on a CPU can take minutes to answer.
const OLLAMA_TAGS_TIMEOUT_MS = 5000;
const OLLAMA_CHAT_TIMEOUT_MS = 600000;
const ROBLOX_FETCH_TIMEOUT_MS = 20000;
const isTimeoutError = (e) => !!e && (e.name === "TimeoutError" || e.name === "AbortError");
const WEB_SEARCH_TIMEOUT = 12000;

function webHeaders(extra, referer) {
  const h = {
    "User-Agent": BROWSER_UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
  };
  if (referer) h.Referer = referer;
  return Object.assign(h, extra || {});
}

// A hung fetch is worse than a failed one: the content script's bg() has no
// timeout of its own, so an endpoint that never answers used to spin the tool
// forever. AbortController gives every request a hard deadline.
async function fetchWithTimeout(url, opts, ms) {
  const controller = new AbortController();
  const callerSignal = opts && opts.signal;
  const cancel = () => { try { controller.abort(callerSignal.reason); } catch {} };
  if (callerSignal) { if (callerSignal.aborted) cancel(); else callerSignal.addEventListener("abort", cancel, { once: true }); }
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, Object.assign({ redirect: "follow" }, opts || {}, { signal: controller.signal }));
        // Keep the same deadline through the body. Headers alone are not a
        // completed request: a server can stop sending immediately afterward.
        const body = await response.text();
        return { ok: response.ok, status: response.status, headers: response.headers, url: response.url, text: async () => body };
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Web request timed out before its complete response arrived")); }, ms || WEB_FETCH_TIMEOUT); }),
    ]);
  } finally {
    clearTimeout(timer);
    if (callerSignal) callerSignal.removeEventListener("abort", cancel);
  }
}

const ENTITIES = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", "#x27": "'",
  mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
  middot: "·", times: "×", deg: "°", copy: "©", reg: "®", trade: "™", euro: "€", pound: "£",
};
function decodeEntities(s) {
  // Numeric forms first, then named. &amp; is decoded LAST via a single pass so
  // a literal "&amp;lt;" does not turn into "<" (double-decoding).
  return String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return " "; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(Number(d)); } catch { return " "; } })
    .replace(/&([a-z#0-9x]+);/gi, (m, name) => {
      const key = String(name).toLowerCase();
      if (key === "amp") return "&";
      return Object.prototype.hasOwnProperty.call(ENTITIES, key) ? ENTITIES[key] : m;
    });
}

function stripTags(html) {
  return decodeEntities(String(html || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

// DDG wraps every result link as /l/?uddg=<urlencoded>&rut=…
function unwrapDdg(href) {
  let h = String(href || "").trim();
  if (h.startsWith("//")) h = "https:" + h;
  const m = h.match(/[?&]uddg=([^&]+)/);
  if (m) { try { return decodeURIComponent(m[1]); } catch { return h; } }
  const m2 = h.match(/[?&]url=([^&]+)/);
  if (m2 && /duckduckgo\.com\/l\//.test(h)) { try { return decodeURIComponent(m2[1]); } catch {} }
  return h;
}

function cleanHits(list, n, engineHost) {
  const out = [];
  const seen = new Set();
  for (const r of list) {
    let url = String((r && r.url) || "").trim();
    const title = stripTags((r && r.title) || "");
    if (!/^https?:\/\//i.test(url)) continue;
    if (engineHost && url.includes(engineHost)) continue;
    if (!title || title.length < 3) continue;
    const key = url.replace(/[#?].*$/, "").replace(/\/+$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title: title.slice(0, 180), url });
    if (out.length >= n) break;
  }
  return out;
}

// Last-resort parser: ANY anchor with an http(s) href and real text. Used when
// a backend's markup changed (or is unknown) so the tool still returns hits.
function parseGenericAnchors(html, n, engineHost) {
  const hits = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || ""))) !== null) {
    const url = unwrapDdg(m[1]);
    const title = stripTags(m[2]);
    if (!title || title.length < 12 || title.length > 180) continue;
    hits.push({ url, title });
  }
  return cleanHits(hits, n, engineHost);
}

function parseDdgHtml(html, n) {
  const hits = [];
  const re = /<a\b[^>]*class="[^"]*result__a[^"]*"[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || ""))) !== null) hits.push({ url: unwrapDdg(m[1]), title: m[2] });
  // class before href (older markup) — attribute order is not guaranteed.
  if (!hits.length) {
    const re2 = /<a\b[^>]*href=["']([^"']+)["'][^>]*class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = re2.exec(String(html || ""))) !== null) hits.push({ url: unwrapDdg(m[1]), title: m[2] });
  }
  const clean = cleanHits(hits, n, "duckduckgo.com");
  return clean.length ? clean : parseGenericAnchors(html, n, "duckduckgo.com");
}

function parseDdgLite(html, n) {
  const hits = [];
  const re = /<a\b[^>]*class="[^"]*result-link[^"]*"[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || ""))) !== null) hits.push({ url: unwrapDdg(m[1]), title: m[2] });
  const clean = cleanHits(hits, n, "duckduckgo.com");
  return clean.length ? clean : parseGenericAnchors(html, n, "duckduckgo.com");
}

function parseMojeek(html, n) {
  const hits = [];
  const re = /<a\b[^>]*class="[^"]*\bob\b[^"]*"[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || ""))) !== null) hits.push({ url: m[1], title: m[2] });
  if (!hits.length) {
    const re2 = /<h2>\s*<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = re2.exec(String(html || ""))) !== null) hits.push({ url: m[1], title: m[2] });
  }
  const clean = cleanHits(hits, n, "mojeek.com");
  return clean.length ? clean : parseGenericAnchors(html, n, "mojeek.com");
}

// Wikipedia has a real JSON API with CORS — not scraped, so it never breaks.
// Not a general web search, but an excellent last resort for API/property
// questions and it keeps the tool useful when every scraper is blocked.
function parseWikipedia(json, n) {
  const out = [];
  try {
    const rows = (JSON.parse(json).query || {}).search || [];
    for (const r of rows) {
      out.push({
        title: r.title + " — Wikipedia",
        url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(String(r.title).replace(/ /g, "_")),
      });
      if (out.length >= n) break;
    }
  } catch {}
  return out;
}

const SEARCH_BACKENDS = [
  { id: "duckduckgo", url: (q) => "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q), parse: parseDdgHtml, referer: "https://duckduckgo.com/" },
  { id: "ddg-lite", url: (q) => "https://lite.duckduckgo.com/lite/?q=" + encodeURIComponent(q), parse: parseDdgLite, referer: "https://lite.duckduckgo.com/" },
  { id: "mojeek", url: (q) => "https://www.mojeek.com/search?q=" + encodeURIComponent(q), parse: parseMojeek, referer: "https://www.mojeek.com/" },
  { id: "wikipedia", url: (q) => "https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=5&srsearch=" + encodeURIComponent(q), parse: parseWikipedia, json: true, referer: "https://en.wikipedia.org/" },
];

// Try every backend until one yields hits. Returns { hits, backend, notes }.
async function webSearch(query, limit) {
  const q = String(query || "").trim();
  const n = Math.max(1, Math.min(8, Number(limit) || 3));
  if (!q) return { hits: [], backend: null, notes: ["empty query"] };
  const notes = [];
  for (const b of SEARCH_BACKENDS) {
    try {
      const extra = b.json ? { Accept: "application/json,text/plain,*/*" } : null;
      const res = await fetchWithTimeout(b.url(q), { headers: webHeaders(extra, b.referer) }, WEB_SEARCH_TIMEOUT);
      if (!res.ok) { notes.push(`${b.id}: HTTP ${res.status}`); continue; }
      const body = await res.text();
      const hits = b.parse(body, n);
      if (hits.length) return { hits, backend: b.id, notes };
      notes.push(`${b.id}: no results parsed${/anomaly|captcha|unusual traffic/i.test(body) ? " (bot challenge page)" : ""}`);
    } catch (e) {
      notes.push(`${b.id}: ${String((e && e.message) || e).slice(0, 90)}`);
    }
  }
  return { hits: [], backend: null, notes };
}

function htmlToText(html) {
  let s = String(html || "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer|blockquote|pre|ul|ol|table)>/gi, "\n");
  s = s.replace(/<(p|div|h[1-6]|li|tr|section|article|header|footer|blockquote|pre|ul|ol|table)\b[^>]*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
  return s;
}

// A JS-only shell ("enable JavaScript", a few hundred chars) is not a page we
// can read; the reader proxy renders it server-side and returns Markdown.
function looksLikeShell(text) {
  const t = String(text || "");
  if (t.length < 400) return true;
  return /enable javascript|javascript is (required|disabled)|checking your browser|just a moment|cf-browser-verification/i.test(t.slice(0, 600));
}
async function readerFallback(url, maxChars) {
  const res = await fetchWithTimeout("https://r.jina.ai/" + url, { headers: webHeaders() }, WEB_FETCH_TIMEOUT);
  if (!res.ok) throw new Error("reader HTTP " + res.status);
  let text = await res.text();
  if (!text || text.length < 40) throw new Error("reader returned nothing");
  const orig = text.length;
  if (orig > maxChars) text = text.slice(0, maxChars) + `\n\n…[truncated ${orig - maxChars} chars]`;
  return text;
}


// ── Blender (one-shot TCP 9876 via AgentScript) ─────────────────────────
// Native PlazCode.exe rejects add_server/uvx. Chrome cannot open raw TCP.
// Connect is a short PowerShell/Python probe of the blender-mcp addon the
// user already started. Tool calls write a JSON request, run blender_once,
// then read the JSON response. No daemon, so the agent console is not
// flooded with failed `start /B py` / shim-restart loops.
function isBlenderToolName(name) {
  const bare = String(name || "").split("__").pop().split("/").pop().split(".").pop();
  return /^blender__/.test(String(name || "")) || BLENDER_TOOL_NAMES.has(bare) || /^blender_/.test(bare);
}
const BLENDER_KEY = "rs-blender-on";
// Persist intent, not a stale connected flag. Verify an addon response on startup.
try { chrome.storage?.local.get(BLENDER_KEY, o => { if(o?.[BLENDER_KEY]) connectBlender(); }); } catch {}
function setBlender(on, err) {
  const was = blenderAddon;
  blenderAddon = !!on;
  if (on) blenderWasConnected = true;
  blenderError = on ? "" : (err || blenderError);
  try { chrome.storage.local.set({ [BLENDER_KEY]: !!on }); } catch {}
  if (was !== blenderAddon) broadcastStatus();
}

async function sendLocalEngine(obj, timeout = 25000) {
  try { await ensurePairing();await ensureAccountContext(); } catch (error) { return { ok: false, error: error.message }; }
  if (engine === "local" && connected && ws && ws.readyState === WebSocket.OPEN) {
    return send(obj, timeout);
  }
  return await new Promise((resolve) => {
    let sock;
    try { sock = new WebSocket(`ws://127.0.0.1:${PORT_LOCAL}`, pairingProtocols()); }
    catch (e) { resolve({ ok: false, error: "PlazCode.exe is not running" }); return; }
    const id = 800000 + Math.floor(Math.random() * 99999);
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { sock.close(); } catch {}
      resolve(v);
    };
    const timer = setTimeout(() => done({ ok: false, error: "PlazCode.exe did not answer — is it running?" }), timeout);
    sock.onerror = () => done({ ok: false, error: "AgentScript connection failed. Start PlazCode and allow the extension access to localhost in this browser." });
    sock.onopen = () => {
      try { sock.send(JSON.stringify({ ...obj, id })); }
      catch (e) { done({ ok: false, error: String(e) }); }
    };
    sock.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === "connected") {
        if (typeof msg.workspace_root === "string" && msg.workspace_root) localRoot = msg.workspace_root;
        return;
      }
      if (["tools","mcp_status","studio_status"].includes(msg.type) && msg.id === id) { done(msg); return; }
      if (msg.type === "tool_result" && (msg.id == null || msg.id === id)) {
        done(msg.ok ? { ok: true, text: msg.text } : { ok: false, error: msg.error || "tool failed" });
        return;
      }
      if (msg.type === "error" && (msg.id == null || msg.id === id)) {
        done({ ok: false, error: msg.error || "error" });
      }
    };
  });
}

async function extText(name) {
  let timer;
  const controller = new AbortController();
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(chrome.runtime.getURL(name), { signal: controller.signal });
        if (!response.ok) throw new Error("extension file missing: " + name);
        return await response.text();
      })(),
      new Promise((_, reject) => { timer=setTimeout(() => { controller.abort(); reject(new Error("Extension file read timed out: " + name)); }, 15000); }),
    ]);
  } finally { clearTimeout(timer); }
}

async function localWrite(path, content) {
  const r = await sendLocalEngine({
    type: "call_tool", name: "write_file",
    arguments: { path, content },
  }, 20000);
  if (!r || !r.ok) throw new Error((r && r.error) || ("could not write " + path));
  return r.text || "";
}

async function localRead(path, offset) {
  const r = await sendLocalEngine({
    type: "call_tool", name: "read_file",
    arguments: { path, offset: offset || 1, limit: 4000 },
  }, 20000);
  if (!r || !r.ok) throw new Error((r && r.error) || ("could not read " + path));
  const lines = String(r.text || "").split("\n");
  const body = [];
  let more = false;
  let next = offset || 1;
  for (const ln of lines) {
    const cont = ln.match(/\.\.\. lines (\d+)/);
    if (cont) { more = true; next = Number(cont[1]); continue; }
    const m = ln.match(/^\s*\d+\s+\|\s(.*)$/);
    if (m) body.push(m[1]);
  }
  return { text: body.join("\n"), more, next, count: body.length };
}
async function localReadAll(path) {
  let offset = 1, chunks = [];
  for (let i = 0; i < 20; i++) {
    const part = await localRead(path, offset);
    if (part.text) chunks.push(part.text);
    if (!part.more || !part.count) break;
    offset = part.next || (offset + part.count);
  }
  return chunks.join("\n");
}

// Read ANY workspace file as base64 (images/binaries included) through the
// native AgentScript engine. This is the ONLY way browser-side code can get at
// bytes on disk, so it backs every "attach this file / screenshot" feature.
async function localReadBase64(path) {
  const r = await sendLocalEngine({ type: "call_tool", name: "read_file_base64", arguments: { path } }, 30000);
  if (!r || !r.ok) throw new Error((r && r.error) || ("could not read " + path));
  let parsed = null;
  try { parsed = JSON.parse(String(r.text || "")); } catch {}
  if (!parsed || !parsed.data) throw new Error("the bridge returned no file data for " + path);
  return parsed;
}

async function localRun(command, timeoutSeconds = 12) {
  return sendLocalEngine({
    type: "call_tool", name: "run_command",
    arguments: { command, timeout_seconds: timeoutSeconds },
  }, (timeoutSeconds + 8) * 1000);
}

function probeCommands(win) {
  if (win) {
    return [
      "powershell -NoProfile -Command try{$c=New-Object Net.Sockets.TcpClient;$c.ReceiveTimeout=2500;$c.Connect('127.0.0.1',9876);$c.Close();Write-Output BLENDER_UP}catch{Write-Output BLENDER_DOWN}",
    ];
  }
  return [
    "python3 -c \"import socket;s=socket.create_connection(('127.0.0.1',9876),2);s.close();print('BLENDER_UP')\"",
    "python -c \"import socket;s=socket.create_connection(('127.0.0.1',9876),2);s.close();print('BLENDER_UP')\"",
    "(echo >/dev/tcp/127.0.0.1/9876) >/dev/null 2>&1 && echo BLENDER_UP || echo BLENDER_DOWN",
  ];
}

async function probeBlenderTcp() {
  let plat = { os: "win" };
  try { plat = await chrome.runtime.getPlatformInfo(); } catch {}
  const win = plat.os === "win";
  let last = "";
  for (const cmd of probeCommands(win)) {
    const r = await localRun(cmd, 8);
    const text = String((r && (r.text || r.error)) || "");
    last = text;
    if (/BLENDER_UP/.test(text)) return { ok: true };
    if (r && r.ok === false && /not running|not connected|timeout/i.test(text)) {
      return { ok: false, error: "PlazCode.exe is not running — start it, then Connect Blender again." };
    }
  }
  const down = /BLENDER_DOWN/.test(last);
  const err = down
    ? "Blender addon is not on port 9876. In Blender: press N → MCP for Blender → Start MCP Server."
    : (last && last.slice(0, 220)) || "Could not reach Blender. Run PlazCode.exe, then Start MCP Server in Blender.";
  return { ok: false, error: err };
}

// Background Blender may have to start first (first use, or after its idle stop). The app waits up to 60 s for
// that before the request's own time begins, so the extension must outlast it. The app always answers within
// its own limit, so this does not slow the open-window way.
async function blenderRequest(payload, timeout=120000) {
  const BLENDER_START_ALLOWANCE_MS = 65000;
  const response=await bridgeFetch(RUST_ROBLOX_HTTP+"/api/blender",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload,timeout_seconds:Math.ceil(timeout/1000)}),signal:AbortSignal.timeout(timeout+4000+BLENDER_START_ALLOWANCE_MS)});
  if(!response.ok) throw Error("Blender bridge request failed (HTTP "+response.status+"). Update the desktop app and extension together.");
  return response.json();
}
async function connectBlender() {
  blenderSuppressed=false;
  try {
    const ping=await blenderRequest({type:"get_scene_info",params:{}},8000);
    if(!ping.ok) throw Error(ping.error || "Blender did not answer its scene check.");
    setBlender(true,"");broadcastStatus();return {ok:true,blender:true};
  } catch(error) {const message=String(error.message || error);setBlender(false,message);broadcastStatus();return {ok:false,blender:false,error:message};}
}

async function agentWorkspaceRoot() {
  if (localRoot) return localRoot;
  const r = await sendLocalEngine({ type: "call_tool", name: "workspace_info", arguments: {} }, 12000);
  const t = String((r && r.text) || "");
  const m = t.match(/Workspace root:\s*(.+)/);
  if (m) { localRoot = m[1].trim(); return localRoot; }
  return "";
}

function pyLiteral(v) {
  if (v === null || v === undefined) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "0";
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(pyLiteral).join(", ") + "]";
  const parts = [];
  for (const [k, val] of Object.entries(v)) parts.push(JSON.stringify(k) + ": " + pyLiteral(val));
  return "{" + parts.join(", ") + "}";
}

const BLENDER_CMD = {
  blender_export_fbx: "export_fbx", export_blender_fbx: "export_fbx",
  blender_import_fbx: "import_fbx", import_blender_fbx: "import_fbx",
  blender_export_obj: "export_obj", blender_import_obj: "import_obj",
  blender_mesh_dump: "dump", blender_send_to_studio: "dump",
  blender_group: "group", blender_ungroup: "ungroup",
  blender_parent: "parent", blender_unparent: "unparent", blender_join: "join",
  blender_move_to_collection: "move_to_collection",
  blender_list_collections: "list_collections", blender_list_objects: "list_objects",
  blender_delete: "delete", blender_duplicate: "duplicate", blender_rename: "rename",
  blender_select: "select", blender_transform: "transform",
  blender_apply_transforms: "apply_transforms", blender_set_origin: "set_origin",
  blender_shade_smooth: "shade_smooth", blender_set_material: "set_material",
  // ── Material toolkit (node-based; version-safe across Blender 3.x/4.x) ──
  blender_material_create: "material_create", blender_material_new: "material_create",
  blender_make_material: "material_create", blender_material_preset: "material_preset",
  blender_material_apply_preset: "material_preset", blender_material_set: "material_set",
  blender_material_edit: "material_set", blender_material_assign: "material_assign",
  blender_material_apply: "material_assign", blender_material_list: "material_list",
  blender_materials: "material_list", blender_material_inspect: "material_inspect",
  blender_material_info: "material_inspect", blender_material_remove: "material_remove",
  blender_material_delete: "material_remove", blender_material_noise: "material_noise",
  blender_material_texture: "material_noise", blender_material_image: "material_image",
  blender_material_texture_image: "material_image", blender_material_pbr: "material_pbr",
  blender_material_maps: "material_pbr",
  blender_add_modifier: "add_modifier", blender_boolean: "boolean",
  blender_add_cube: "add_cube", blender_add_sphere: "add_sphere",
  blender_add_cylinder: "add_cylinder", blender_add_cone: "add_cone",
  blender_add_plane: "add_plane", blender_add_torus: "add_torus",
  blender_add_monkey: "add_monkey", blender_add_empty: "add_empty",
  blender_add_camera: "add_camera", blender_add_light: "add_light",
  blender_add_ico_sphere: "add_ico_sphere", blender_add_grid: "add_grid",
  blender_add_circle: "add_circle", blender_add_text: "add_text",
  blender_clear_scene: "clear_scene",
  blender_select_all: "select_all", blender_deselect: "deselect",
  blender_invert_selection: "invert_selection", blender_select_children: "select_children",
  blender_get_selection: "get_selection",
  blender_translate: "translate", blender_rotate: "rotate_deg", blender_rotate_deg: "rotate_deg",
  blender_set_dimensions: "set_dimensions",
  blender_origin_to_bottom: "origin_to_bottom", blender_drop_to_ground: "drop_to_ground",
  blender_center: "center", blender_snap_to_grid: "snap_to_grid",
  blender_shade_flat: "shade_flat",
  blender_apply_modifiers: "apply_modifiers", blender_remove_modifier: "remove_modifier",
  blender_triangulate: "triangulate", blender_decimate: "decimate",
  blender_merge: "merge", blender_recalc_normals: "recalc_normals",
  blender_flip_normals: "flip_normals", blender_separate: "separate_loose",
  blender_subdivide: "subdivide", blender_uv_unwrap: "uv_unwrap",
  blender_array: "array", blender_mirror: "mirror",
  blender_hide: "hide", blender_unhide: "unhide", blender_unhide_all: "unhide_all",
  blender_hide_unselected: "hide_unselected",
  blender_undo: "undo", blender_redo: "redo",
  blender_frame_selected: "frame_selected", blender_stats: "stats",
  blender_save: "save_blend", blender_look_at: "look_at",
  blender_convert_to_mesh: "convert_to_mesh",
  blender_align_camera: "align_camera_axis", blender_align_camera_axis: "align_camera_axis",
  blender_view_axis: "view_axis", blender_camera_to_view: "camera_to_view",
  blender_set_camera_lens: "set_camera_lens",
  blender_scale: "scale", blender_bevel: "bevel", blender_solidify: "solidify",
  blender_extrude: "extrude", blender_add_curve: "add_curve", blender_add_armature: "add_armature",
  blender_keyframe: "keyframe_insert", blender_keyframe_insert: "keyframe_insert",
  blender_set_frame: "set_frame", blender_set_active_camera: "set_active_camera",
  blender_track_to: "track_to", blender_cursor_to_selected: "cursor_to_selected",
  blender_randomize: "randomize_transform", blender_randomize_transform: "randomize_transform",
  blender_hide_render: "hide_render", blender_subdivision: "subdivision",
  blender_subsurf: "subdivision", blender_origin_to_geometry: "origin_to_geometry",
};

function wrapBlenderUserCode(code) {
  const src = String(code || "");
  if (!src.trim()) return src;
  if (src.indexOf("_plazcode_items") >= 0 && src.indexOf("_plazcode_src =") >= 0) return src;
  return [
    "import bpy, re as _plazcode_re",
    "_plazcode_src = " + JSON.stringify(src),
    "try:",
    "    _plazcode_items = set(getattr(it, 'identifier', str(it)) for it in bpy.context.scene.render.bl_rna.properties['engine'].enum_items)",
    "except Exception:",
    "    _plazcode_items = set()",
    "if 'BLENDER_EEVEE_NEXT' not in _plazcode_items and 'BLENDER_EEVEE' in _plazcode_items:",
    "    _plazcode_src = _plazcode_src.replace('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE')",
    "elif 'BLENDER_EEVEE' not in _plazcode_items and 'BLENDER_EEVEE_NEXT' in _plazcode_items:",
    "    _plazcode_src = _plazcode_re.sub(r'BLENDER_EEVEE(?!_NEXT)', 'BLENDER_EEVEE_NEXT', _plazcode_src)",
    "if not hasattr(bpy.context.scene, 'eevee_next') and hasattr(bpy.context.scene, 'eevee'):",
    "    _plazcode_src = _plazcode_src.replace('.eevee_next', '.eevee')",
    "exec(compile(_plazcode_src, '<or_blender>', 'exec'))",
  ].join("\n");
}

// Blender pictures and PlazCode's built-in Blender actions are requests to the desktop app ("plazcode_shot",
// "plazcode_op"), not Python text made here. The app runs them in the background Blender, or turns them into
// code for the open-window helper itself (agent/src/blender.rs, agent/blender_shot.py, blender_ops.py). That is
// what lets safe mode tell a built-in action from free Python.
async function blenderPayload(name, args) {
  const bare = String(name || "").split("__").pop().split("/").pop().split(".").pop();
  const a = args || {};
  if (bare === "get_scene_info" || bare === "blender_get_scene_info") return { type: "get_scene_info", params: {} };
  if (bare === "get_object_info" || bare === "blender_get_object_info") return { type: "get_object_info", params: { name: a.name || a.object_name || "" } };
  if (bare === "execute_blender_code" || bare === "execute_code" || bare === "blender_execute_code") return { type: "execute_code", params: { code: wrapBlenderUserCode(a.code || "") } };
  if (bare === "get_viewport_screenshot" || bare === "blender_screenshot") {
    const relativeShot = "plazcode_blender_shot_" + crypto.randomUUID() + ".png";
    let shot = relativeShot;
    const root = await agentWorkspaceRoot();
    if (root) shot = root.replace(/[\\/]+$/, "") + "/" + relativeShot;
    // _orShot: the exact path we asked Blender to write, so blenderCall can read
    // the pixels back (see the screenshot branch there) without guessing.
    return { type: "plazcode_shot", params: { filepath: shot, max_size: Math.max(64, Math.min(4096, Number(a.max_size) || 1000)) }, _orShot: shot, _orReadShot: relativeShot, _orIsShot: true };
  }
  const mapped = BLENDER_CMD[bare];
  if (mapped) return { type: "plazcode_op", params: { cmd: mapped, args: a }, _orStatus: "plazcode_status.json", _orMesh: "plazcode_mesh.json" };
  const params = Object.assign({}, a);
  delete params.user_prompt;
  return { type: bare, params };
}

async function ensureBlenderScripts() {
  if (blenderScriptsReady) return;
  const py = await extText("blender_once.py");
  const ps = await extText("blender_once.ps1");
  await localWrite("blender_once.py", py);
  await localWrite("blender_once.ps1", ps);
  blenderScriptsReady = true;
}

let blenderCallRunning = false;
async function blenderCall(name, args, timeout) {
  // 1.24.12: another tab/chat may be mid-command. Wait for it (Blender runs one
  // command at a time) instead of failing at once; nothing is ever repeated.
  if (!blenderCallRunning && !blenderAddon && !blenderSuppressed && blenderWasConnected) {
    // A short drop (a slow scene check while Studio launches) must not leave
    // the AI stranded: verify the addon once before reporting it offline.
    try { await connectBlender(); } catch {}
  }
  if (blenderCallRunning) {
    const until = Date.now() + 45000;
    while (blenderCallRunning && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 250));
    if (blenderCallRunning) return { ok: false, error: "Blender is still processing another PlazCode command (from this or another chat). Wait for it to finish, then send this command again. Nothing was queued or repeated." };
  }
  if (!blenderAddon) {
    return { ok: false, error: "Blender is not connected. Open PlazCode, go to Apps & servers and connect Blender. (If you use your own open Blender window: N → MCP for Blender → Start MCP Server, then Connect Blender.)" };
  }
  const run = async () => {
    const payload = await blenderPayload(name, args);
    const statusPath = payload._orStatus || "";
    const reply = await blenderRequest({type:payload.type,params:payload.params},payload.type === "get_scene_info" ? 8000 : Math.min(180000,timeout || 120000));
    // An app from before 1.24.33 passes the new request kinds to the Blender helper, which does not know them.
    if(!reply.ok && /^plazcode_/.test(payload.type) && /unknown command/i.test(reply.error || "")) return {ok:false,error:"This Blender action needs the newer PlazCode desktop app. Update the app (it comes with this extension update), then try again. Nothing was run."};
    if(!reply.ok) {if(/not listening|actively refused|connection refused|connection (?:closed|failed)|closed (?:the )?(?:socket|connection)|Blender is not connected/i.test(reply.error || ""))setBlender(false,reply.error);return {ok:false,error:reply.error || "Blender command failed."};}
    const data = reply.data;
    if (data && data.status === "error") {
      const details=[data.message,data.error,data.result?.error,data.result?.message,data.traceback].filter(value=>typeof value==="string"&&value.trim());
      const msg=[...new Set(details)].join(" · ").slice(0,12000)||"Blender addon error";
      if (/not listening|closed|actively refused|10061|Connection refused/i.test(msg)) {
        setBlender(false, "Blender addon dropped. Start MCP Server in Blender, then Connect Blender again.");
      }
      return { ok: false, error: msg };
    }
    let result = (data && Object.prototype.hasOwnProperty.call(data, "result")) ? data.result : data;
    const rawText = typeof result === "string" ? result : typeof result?.result === "string" ? result.result : "";
    const marker = String(rawText).indexOf("PLAZCODE_MESH_JSON:");
    let inlineResult = false;
    if (marker >= 0) {
      try { result = JSON.parse(String(rawText).slice(marker + "PLAZCODE_MESH_JSON:".length).split(/\r?\n/)[0]); inlineResult = true; } catch {}
    }
    if (result && result.ok === false) {
      return { ok: false, error: result.error || "Blender FBX failed" };
    }
    if (statusPath && !inlineResult) {
      return { ok: false, error: "Blender answered but did not return the current PlazCode operation receipt. No cached status file was substituted. The edit may have run; inspect Blender before retrying." };
    }
    if (result && result.ok === false) {
      return { ok: false, error: result.error || "Blender command failed" };
    }
    let meshes = result && result.meshes;
    const mf = (result && result.mesh_file) || "";
    if ((!meshes || !meshes.length) && mf) {
      for (const cand of [mf]) {
        try {
          const rawM = (await localReadAll(cand)).replace(/^\uFEFF/, "").trim();
          if (!rawM) continue;
          const parsed = JSON.parse(rawM);
          meshes = parsed.meshes || (parsed.result && parsed.result.meshes);
          if (meshes && meshes.length) break;
        } catch {}
      }
    }
    if (meshes && meshes.length && result && typeof result === "object") result.meshes = meshes;
    // ── Screenshot → real image bytes ──────────────────────────────────────
    // The blender-mcp addon WRITES the viewport capture to a PNG path and
    // answers with that path as text. A Chrome extension cannot read a local
    // path, so this used to hand back images:[] and plazcode_screenshot silently fell
    // through to a tab capture (the AI got a picture of its own chat window).
    // The path IS inside the AgentScript workspace, so read it back as base64
    // through the bridge and return it as a real attachment.
    let images = [];
    const shotPath = payload._orShot ||
      (result && typeof result === "object" && (result.filepath || result.file_path || result.path)) ||
      "";
    let shotInfo = null;
    if (payload._orIsShot) {
      const m = String(rawText).match(/PLAZCODE_SHOT_JSON:(\{.*\})/);
      if (m) { try { shotInfo = JSON.parse(m[1]); } catch {} }
      if (!shotInfo) return { ok: false, error: "Blender did not confirm a fresh viewport capture. " + String(rawText || "").slice(0, 400) };
    }
    if (shotPath && payload._orIsShot) {
      try {
        // Blender needs an absolute write path; the sandbox read API needs a
        // relative one. Read our own unique requested file, not an addon path.
        const parsed = await localReadBase64(payload._orReadShot || shotPath);
        images = [{ mimeType: parsed.mimeType || "image/png", data: parsed.data }];
        if (result && typeof result === "object") result.bytes = parsed.bytes;
      } catch (e) {
        // Keep the path in the text so the model/user can still open the file;
        // report the reason rather than pretending a capture happened.
        result = typeof result === "object" && result
          ? Object.assign({}, result, { image_error: String((e && e.message) || e).slice(0, 200) })
          : result;
      }
    }
    let textOut = typeof result === "string" ? result : JSON.stringify(result, null, 2);
    if (payload._orIsShot && shotInfo) {
      textOut = "Fresh Blender viewport capture " + (shotInfo.size || []).join("x") + " via " + shotInfo.method +
        " at " + shotInfo.taken + " (sha1 " + shotInfo.sha1 + ", " + shotInfo.bytes + " bytes)" +
        (shotInfo.offscreen_error ? " [off-screen render failed: " + shotInfo.offscreen_error + "]" : "");
    }
    if (payload._orIsShot && !images.length) {
      textOut += "\n\n[PlazCode: the viewport image could not be read back from disk" +
        (shotPath ? ` (${shotPath})` : "") + " — the capture file may be missing or unreadable.]";
    }
    return { ok: true, text: textOut, images, meshFile: mf, filepath: result && result.filepath, meshes: meshes || undefined };
  };
  blenderCallRunning = true;
  try { return await run(); }
  catch (error) {
    const message = String(error.message || error);
    // A slow answer (Blender busy, e.g. while Roblox Studio launches) is not a
    // lost connection; only a refused/closed socket marks Blender offline.
    if (/not listening|closed|actively refused|10061|Connection refused/i.test(message)) setBlender(false, message);
    return { ok: false, error: message + " The command was not automatically repeated; inspect Blender before retrying." };
  }
  finally { blenderCallRunning = false; }
}

async function robloxCsrf() {
  try {
    const r = await fetch("https://auth.roblox.com/v2/logout", { method: "POST", credentials: "include", signal: AbortSignal.timeout(ROBLOX_FETCH_TIMEOUT_MS) });
    return r.headers.get("x-csrf-token") || r.headers.get("X-CSRF-TOKEN") || "";
  } catch {
    return "";
  }
}
async function robloxAuthedFetch(url, opts) {
  opts = opts || {};
  const method = opts.method || "GET";
  const headers = Object.assign({}, method !== "GET" ? { "Content-Type": "application/json" } : {}, opts.headers || {});
  const go = async (token) => {
    const h = Object.assign({}, headers);
    if (token) h["X-CSRF-TOKEN"] = token;
    let r, text;
    try {
      r = await fetch(url, { method, credentials: "include", headers: h, body: opts.body, signal: AbortSignal.timeout(ROBLOX_FETCH_TIMEOUT_MS) });
      text = await r.text();
    } catch (e) {
      if (isTimeoutError(e)) throw new Error("Roblox did not answer within " + (ROBLOX_FETCH_TIMEOUT_MS / 1000) + " s (" + String(url).replace(/[?#].*$/, "") + "). Check the connection to roblox.com, then retry.");
      throw e;
    }
    const csrf = r.headers.get("x-csrf-token") || r.headers.get("X-CSRF-TOKEN") || "";
    return { r, text, csrf };
  };
  let token = await robloxCsrf();
  let res = await go(token);
  if ((res.r.status === 403 || res.r.status === 401) && res.csrf && res.csrf !== token) {
    res = await go(res.csrf);
  }
  let data = null;
  try { data = JSON.parse(res.text); } catch {}
  return { ok: res.r.ok, status: res.r.status, text: res.text, data };
}
async function robloxResolveUniverse(msg) {
  let universeId = Number(msg.universeId || msg.universe_id || msg.gameId || 0) || 0;
  const placeId = Number(msg.placeId || msg.place_id || 0) || 0;
  if (universeId > 0) return { ok: true, universeId, placeId };
  if (placeId > 0) {
    const res = await robloxAuthedFetch("https://apis.roblox.com/universes/v1/places/" + placeId + "/universe", { method: "GET" });
    const id = Number(res.data && (res.data.universeId || res.data.id) || 0) || 0;
    if (id > 0) return { ok: true, universeId: id, placeId };
  }
  const listed = await robloxAuthedFetch("https://develop.roblox.com/v1/user/universes?limit=50&sortOrder=Desc", { method: "GET" });
  const rows = (listed.data && listed.data.data) || [];
  if (placeId > 0) {
    const hit = rows.find((u) => Number(u.rootPlaceId) === placeId || Number(u.id) === placeId);
    if (hit) return { ok: true, universeId: Number(hit.id), placeId, name: hit.name };
  }
  if (rows.length === 1) return { ok: true, universeId: Number(rows[0].id), placeId: Number(rows[0].rootPlaceId) || placeId, name: rows[0].name };
  if (rows.length > 1) {
    const top = rows[0];
    return {
      ok: true,
      universeId: Number(top.id),
      placeId: Number(top.rootPlaceId) || placeId,
      name: top.name,
      candidates: rows.slice(0, 8).map((u) => ({ id: u.id, name: u.name, rootPlaceId: u.rootPlaceId })),
    };
  }
  const who = await robloxAuthedFetch("https://users.roblox.com/v1/users/authenticated", { method: "GET" });
  if (!who.ok) return { ok: false, error: "Could not reach the game. Sign into roblox.com in this Chrome profile, publish the place in Studio, then retry." };
  return { ok: false, error: "Could not reach a universe for this place (GameId/PlaceId empty). Publish the place (File > Publish to Roblox) so it has a Universe ID." };
}
async function robloxCreateDevProduct(msg) {
  const resolved = await robloxResolveUniverse(msg);
  if (!resolved.ok) return resolved;
  const universeId = resolved.universeId;
  const name = String(msg.name || "").trim();
  const description = String(msg.description || name).trim();
  const priceInRobux = Math.floor(Number(msg.priceInRobux || msg.price || 0));
  if (!name) return { ok: false, error: "name required" };
  if (!priceInRobux || priceInRobux < 1) return { ok: false, error: "priceInRobux must be >= 1" };
  const qUrl = "https://apis.roblox.com/developer-products/v1/universes/" + universeId +
    "/developerproducts?name=" + encodeURIComponent(name) +
    "&description=" + encodeURIComponent(description) +
    "&priceInRobux=" + encodeURIComponent(String(priceInRobux));
  let res = await robloxAuthedFetch(qUrl, { method: "POST" });
  if (!res.ok && (res.status === 400 || res.status === 404 || res.status === 415)) {
    res = await robloxAuthedFetch("https://apis.roblox.com/developer-products/v1/universes/" + universeId + "/developerproducts", {
      method: "POST",
      body: JSON.stringify({ name: name, description: description, priceInRobux: priceInRobux }),
    });
  }
  if (!res.ok) {
    let err = res.text.slice(0, 280) || ("HTTP " + res.status);
    try {
      const d = res.data;
      if (d) err = d.message || d.error || (d.errors && d.errors[0] && d.errors[0].message) || err;
    } catch {}
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Not signed into Roblox in this Chrome profile. Open roblox.com, log in, then retry. (" + err + ")" };
    }
    return { ok: false, error: String(err) + " (universe " + universeId + (resolved.name ? " / " + resolved.name : "") + ")", status: res.status, universeId: universeId };
  }
  const product = res.data || {};
  return { ok: true, product: product, productId: product.id || product.productId, universeId: universeId, universeName: resolved.name || "", text: JSON.stringify(product) };
}
async function robloxListDevProducts(msg) {
  const resolved = await robloxResolveUniverse(msg);
  if (!resolved.ok) return resolved;
  const universeId = resolved.universeId;
  const url = "https://apis.roblox.com/developer-products/v1/universes/" + universeId + "/developerproducts?pageNumber=1&pageSize=50";
  const res = await robloxAuthedFetch(url, { method: "GET" });
  if (!res.ok) {
    const err = (res.data && (res.data.message || res.data.error)) || res.text.slice(0, 280) || ("HTTP " + res.status);
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Not signed into Roblox in this Chrome profile. Open roblox.com, log in, then retry. (" + err + ")" };
    }
    return { ok: false, error: String(err), status: res.status };
  }
  return { ok: true, products: res.data, text: typeof res.text === "string" ? res.text.slice(0, 4000) : JSON.stringify(res.data) };
}

// ── messages from content.js / popup.js ─────────────────────────────────
let lastMemorySignature = "", lastReleaseSignature = "", lastReleaseCheck = 0;
async function readPersonalMemory(action) {
  // Reads are polled every 3 s and must give up quickly; explicit memory actions
  // (save, import, delete) get a longer limit.
  const response = await bridgeFetch("http://127.0.0.1:3000/api/memory", action ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action), signal: AbortSignal.timeout(30000) } : { signal: AbortSignal.timeout(10000) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Memory bridge is unavailable.");
  const memory = value.memory || value;
  const signature=JSON.stringify(memory);
  if(signature!==lastMemorySignature){await chrome.storage.local.set({ rsPersonalMemory: memory });lastMemorySignature=signature;}
  return memory;
}
// Single-flight: a 10 s read on a 3 s interval would otherwise overlap up to 4 times.
let memoryPollInFlight = false;
setInterval(() => {
  if (!rustMode || memoryPollInFlight) return;
  memoryPollInFlight = true;
  readPersonalMemory().catch(() => {}).finally(() => { memoryPollInFlight = false; });
}, 3000);
let releaseStatusReading = false, releaseStatusFailures = 0;
async function readReleaseStatus() {
  if (releaseStatusReading) return;
  releaseStatusReading = true;
  try {
    const response = await bridgeFetch(`${RUST_ROBLOX_HTTP}/api/desktop/update`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("Update check unavailable.");
    const value = await response.json();
    releaseStatusFailures = 0;
    const status={latest:value.latest,checked_at:value.checked_at,check_error:value.check_error || null},signature=JSON.stringify(status);
    if(signature!==lastReleaseSignature){await chrome.storage.local.set({rsReleaseStatus:status});lastReleaseSignature=signature;}
  } catch (error) {
    // One slow or dropped read (the app is busy, a brief network blip) is not an outage: only report the
    // bridge as unavailable after 8 failed reads in a row, so the bar never contradicts a live connection.
    if (++releaseStatusFailures < 8) return;
    const previous=await chrome.storage.local.get("rsReleaseStatus").catch(()=>({}));const status={...(previous.rsReleaseStatus||{}),check_error:"Bridge unavailable."},signature=JSON.stringify(status);if(signature!==lastReleaseSignature){await chrome.storage.local.set({rsReleaseStatus:status}).catch(()=>{});lastReleaseSignature=signature;}
  } finally { releaseStatusReading = false; }
}
setInterval(() => { if (rustMode) readReleaseStatus(); }, 1000);
// ── Independent critic window ───────────────────────────────────────────────
// plazcode_critic asks a SEPARATE chat to judge a screenshot. This opens a small window with a fresh chat on the
// same AI site as the builder, hands the question to that tab's content script and returns the reply. Any failure
// comes back as { ok:false, error } and the builder falls back to the same-chat critic.
const CRITIC_NEW_CHAT = [
  [/^(chatgpt\.com|chat\.openai\.com)$/, "https://chatgpt.com/"],
  [/^(claude\.ai|www\.claude\.ai)$/, "https://claude.ai/new"],
  [/^gemini\.google\.com$/, "https://gemini.google.com/app"],
  [/^chat\.deepseek\.com$/, "https://chat.deepseek.com/"],
  [/^(www\.)?kimi\.(com|ai)$/, "https://www.kimi.com/"],
  [/^chat\.qwen\.ai$/, "https://chat.qwen.ai/"],
  [/^chat\.z\.ai$/, "https://chat.z.ai/"],
];
let criticWin = null; // { windowId, tabId, host }
const criticSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function criticClose() {
  const win = criticWin; criticWin = null;
  if (win && win.windowId != null) { try { await chrome.windows.remove(win.windowId); } catch {} }
}
async function criticTabAlive(win) {
  if (!win) return false;
  try { const tab = await chrome.tabs.get(win.tabId); return !!tab; } catch { return false; }
}
async function criticPing(tabId) {
  for (let i = 0; i < 40; i++) {
    try {
      const reply = await chrome.tabs.sendMessage(tabId, { type: "rs-critic-ping" });
      if (reply && reply.ok) return reply;
    } catch {}
    await criticSleep(750);
  }
  return null;
}
async function criticTabReady(tabId) {
  for (let i = 0; i < 60; i++) {
    try { const tab = await chrome.tabs.get(tabId); if (tab.status === "complete") return true; } catch { return false; }
    await criticSleep(500);
  }
  return false;
}
async function runCritic(msg) {
  if (msg.op === "close") { await criticClose(); return { ok: true }; }
  const host = String(msg.host || "");
  const entry = CRITIC_NEW_CHAT.find(([re]) => re.test(host));
  if (!entry) return { ok: false, error: "this AI site has no separate critic chat support yet" };
  const url = entry[1];
  let reuse = !msg.fresh && criticWin && criticWin.host === host && await criticTabAlive(criticWin);
  if (!reuse) {
    await criticClose();
    const created = await chrome.windows.create({ url, type: "popup", focused: false, width: 560, height: 760 });
    const tab = created && created.tabs && created.tabs[0];
    if (!created || !tab) return { ok: false, error: "the critic window could not be opened" };
    criticWin = { windowId: created.id, tabId: tab.id, host };
  }
  if (!(await criticTabReady(criticWin.tabId))) { await criticClose(); return { ok: false, error: "the critic chat did not load" }; }
  const ready = await criticPing(criticWin.tabId);
  if (!ready) { await criticClose(); return { ok: false, error: "PlazCode is not running in the critic window (is the site signed in?)" }; }
  if (!ready.idle) return { ok: false, error: "the critic window is busy" };
  await criticSleep(1500); // let the new chat finish drawing its message box
  const timeoutMs = Math.min(Math.max(Number(msg.timeoutMs) || 180000, 30000), 300000);
  let timer;
  const answer = await Promise.race([
    chrome.tabs.sendMessage(criticWin.tabId, { type: "rs-critic-run", prompt: msg.prompt, images: msg.images, timeoutMs }),
    new Promise((resolve) => { timer = setTimeout(() => resolve({ ok: false, error: "the critic chat did not answer in time" }), timeoutMs + 20000); }),
  ]).catch((error) => ({ ok: false, error: String(error && error.message || error).slice(0, 160) }));
  clearTimeout(timer);
  return answer || { ok: false, error: "no answer from the critic window" };
}
try { if (chrome.windows && chrome.windows.onRemoved) chrome.windows.onRemoved.addListener((windowId) => { if (criticWin && criticWin.windowId === windowId) criticWin = null; }); } catch {}

// ── Helper agents (after 1.24.32) ───────────────────────────────────────────
// The main chat's AI can hand parts of a job to helpers: separate chats on the same AI site, each with its own
// PlazCode session, working at the same time. This worker owns the roster: who asked, which window each helper
// runs in, the queue (two at once per main chat), the edit locks that stop two agents changing the same script
// or file at the same time, and the summaries waiting to go back to the main chat. createHelperRoster is pure
// (no browser calls) so its rules are tested directly.
function createHelperRoster({ limit = 2, maxOpen = 8, now = () => Date.now() } = {}) {
  let seq = 0;
  const rows = new Map();   // id -> helper row
  const locks = new Map();  // parentTab + "|" + key -> { owner, title, at }
  const ACTIVE = new Set(["queued", "starting", "working"]);
  const text = (value, max) => String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
  const view = (r) => ({ id: r.id, title: r.title, area: r.area, status: r.status, step: r.step || "", note: r.note || "",
    steps: r.steps || 0, queuedAt: r.queuedAt, startedAt: r.startedAt || 0, endedAt: r.endedAt || 0, summary: r.summary || "", delivered: !!r.delivered });
  const mine = (parentTab) => [...rows.values()].filter((r) => r.parentTab === parentTab);
  const activeFor = (parentTab) => mine(parentTab).filter((r) => ACTIVE.has(r.status));
  const byTab = (tabId) => [...rows.values()].find((r) => r.tabId === tabId && ACTIVE.has(r.status)) || null;
  function dropLocks(test) { for (const [key, lock] of locks) if (test(key, lock)) locks.delete(key); }
  function add(parent, specs, opts = {}) {
    if (!parent || !Number.isInteger(parent.tabId)) return { ok: false, error: "Helpers can only be started from an AI chat tab." };
    if (byTab(parent.tabId)) return { ok: false, error: "A helper cannot start helpers of its own." };
    if (!Array.isArray(specs) || !specs.length || specs.length > 4) return { ok: false, error: "helpers must be a list of 1 to 4 entries shaped as {title, task, area}." };
    const clean = [];
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i] || {};
      const title = text(spec.title || spec.name, 60), task = String(spec.task || spec.prompt || spec.goal || "").trim().slice(0, 12000), area = text(spec.area || spec.scope, 600);
      if (!title) return { ok: false, error: "helpers[" + i + "] needs a short title." };
      if (task.length < 40) return { ok: false, error: "helpers[" + i + "] needs a complete task: the helper has not seen this chat, so describe the goal, the exact paths and what done means (at least a few sentences)." };
      clean.push({ title, task, area });
    }
    if (activeFor(parent.tabId).length + clean.length > maxOpen) return { ok: false, error: "Too many helpers at once. At most " + maxOpen + " can be working or waiting; wait for some to finish." };
    const made = clean.map((spec) => {
      const row = { id: ++seq, parentTab: parent.tabId, parentChat: String(parent.chat || ""), url: String(opts.url || ""), engine: String(opts.engine || "roblox"),
        title: spec.title, task: spec.task, area: spec.area, status: "queued", queuedAt: now(), tabId: null, windowId: null };
      rows.set(row.id, row);
      return view(row);
    });
    return { ok: true, helpers: made };
  }
  // Queued helpers that may start now (two at a time per main chat); marks them "starting".
  function next(parentTab) {
    const out = [];
    let busy = mine(parentTab).filter((r) => r.status === "starting" || r.status === "working").length;
    for (const row of mine(parentTab)) {
      if (busy >= limit) break;
      if (row.status !== "queued") continue;
      row.status = "starting"; row.startedAt = now(); busy++; out.push(row);
    }
    return out;
  }
  function placed(id, where) { const row = rows.get(id); if (row) { row.tabId = where.tabId; row.windowId = where.windowId; } return row || null; }
  function progress(tabId, info = {}) {
    const row = byTab(tabId);
    if (!row) return null;
    if (row.status === "starting" && info.working) row.status = "working";
    if (info.sent) row.sent = true;
    if (info.step) { row.step = text(info.step, 80); row.steps = (row.steps || 0) + 1; }
    if (info.note !== undefined) row.note = text(info.note, 80);
    return row;
  }
  function finish(id, result = {}) {
    const row = rows.get(id);
    if (!row || !ACTIVE.has(row.status)) return null;
    row.status = ["done", "failed", "stopped"].includes(result.status) ? result.status : "failed";
    row.summary = String(result.summary || "").trim().slice(0, 6000);
    row.endedAt = now(); row.step = ""; row.note = "";
    dropLocks((key, lock) => lock.owner === "h" + row.id);
    if (!activeFor(row.parentTab).length) dropLocks((key) => key.startsWith(row.parentTab + "|"));
    return row;
  }
  // Helpers to stop: one by id, or every working/waiting helper of this main chat.
  const stoppable = (parentTab, id) => activeFor(parentTab).filter((r) => id == null || r.id === Number(id));
  function clear(parentTab) {
    const gone = mine(parentTab).filter((r) => !ACTIVE.has(r.status));
    for (const row of gone) rows.delete(row.id);
    return gone;
  }
  const list = (parentTab) => mine(parentTab).map(view);
  function take(parentTab) {
    const ready = mine(parentTab).filter((r) => !ACTIVE.has(r.status) && !r.delivered);
    for (const row of ready) row.delivered = true;
    return ready.map(view);
  }
  // An agent is about to change these scripts/files. Refused when another agent of the same job is on one.
  function lock(tabId, keys) {
    const helper = byTab(tabId);
    const parentTab = helper ? helper.parentTab : tabId;
    if (!helper && !activeFor(parentTab).length) return { ok: true };
    const owner = helper ? "h" + helper.id : "main", title = helper ? helper.title : "the main agent";
    const wanted = [...new Set((Array.isArray(keys) ? keys : []).map((k) => String(k || "").trim().toLowerCase().replace(/\\/g, "/")).filter(Boolean))].slice(0, 24);
    for (const key of wanted) {
      const held = locks.get(parentTab + "|" + key);
      if (!held || held.owner === owner) continue;
      const holder = held.owner === "main" ? (now() - held.at < 600000) : (rows.get(Number(held.owner.slice(1))) || {}).status;
      if (held.owner === "main" ? holder : ACTIVE.has(holder)) return { ok: false, key, holder: held.title };
    }
    for (const key of wanted) locks.set(parentTab + "|" + key, { owner, title, at: now() });
    return { ok: true };
  }
  // A tab closed: a helper's own window ends that helper; a main chat's tab ends all of its helpers.
  function tabGone(tabId) {
    const helper = byTab(tabId);
    if (helper) return { ended: [finish(helper.id, { status: "stopped", summary: "The helper's window was closed before it finished." })].filter(Boolean), orphans: [] };
    const orphans = mine(tabId);
    for (const row of orphans) rows.delete(row.id);
    dropLocks((key) => key.startsWith(tabId + "|"));
    return { ended: [], orphans };
  }
  const dump = () => ({ seq, rows: [...rows.values()], locks: [...locks.entries()] });
  function load(saved) {
    if (!saved || !Array.isArray(saved.rows)) return;
    seq = Math.max(seq, Number(saved.seq) || 0);
    for (const row of saved.rows) if (row && Number.isInteger(row.id)) rows.set(row.id, row);
    for (const [key, value] of saved.locks || []) locks.set(key, value);
  }
  return { add, next, placed, progress, finish, stoppable, clear, list, take, lock, tabGone, byTab, get: (id) => rows.get(Number(id)) || null, activeFor, dump, load };
}
const helperRoster = createHelperRoster({ limit: 2 });
let helperLoading = null;
function helperLoad() {
  if (!helperLoading) helperLoading = (async () => { try { const saved = await chrome.storage.session.get("rsHelperRoster"); helperRoster.load(saved && saved.rsHelperRoster); } catch {} })();
  return helperLoading;
}
function helperSave() { try { const p = chrome.storage.session.set({ rsHelperRoster: helperRoster.dump() }); if (p && p.catch) p.catch(() => {}); } catch {} }
const helperNotifyAt = new Map();
function helperNotify(parentTab, urgent = true) {
  helperSave();
  const last = helperNotifyAt.get(parentTab) || 0;
  if (!urgent && Date.now() - last < 1000) return;
  helperNotifyAt.set(parentTab, Date.now());
  try { const p = chrome.tabs.sendMessage(parentTab, { type: "rs-helper-update", helpers: helperRoster.list(parentTab) }); if (p && p.catch) p.catch(() => {}); } catch {}
}
async function helperCloseWindow(row) {
  if (row && row.windowId != null) { try { await chrome.windows.remove(row.windowId); } catch {} }
}
async function helperPing(tabId) {
  for (let i = 0; i < 60; i++) {
    try { const reply = await chrome.tabs.sendMessage(tabId, { type: "rs-helper-ping" }); if (reply && reply.ok && reply.ready) return reply; } catch {}
    await criticSleep(750);
  }
  return null;
}
function helperEnd(id, result, close) {
  const row = helperRoster.finish(id, result);
  if (!row) return;
  // A finished helper's window closes by itself; a failed one stays open so the user can look at what happened.
  if (close || row.status === "done" || row.status === "stopped") setTimeout(() => { helperCloseWindow(row); }, row.status === "done" ? 3000 : 0);
  helperNotify(row.parentTab);
  helperPump(row.parentTab);
}
function helperPump(parentTab) {
  const starting = helperRoster.next(parentTab);
  if (starting.length) helperNotify(parentTab);
  for (const row of starting) helperStart(row);
}
async function helperStart(row) {
  const live = () => { const current = helperRoster.get(row.id); return !!current && current.status === "starting"; };
  try {
    let url = row.url;
    try { const parsed = new URL(url); if (parsed.protocol !== "https:") throw new Error("bad address"); } catch { throw new Error("this AI site has no new-chat address for helpers"); }
    const index = helperRoster.activeFor(row.parentTab).filter((r) => r.windowId != null).length;
    const shape = { url, type: "popup", width: 980, height: 820, left: 60 + index * 48, top: 60 + index * 48 };
    let created = null;
    // Open behind the user's window where the browser allows it (Firefox does not accept "focused").
    try { created = await chrome.windows.create({ ...shape, focused: false }); } catch { created = await chrome.windows.create(shape); }
    const tab = created && created.tabs && created.tabs[0];
    if (!created || !tab) throw new Error("the helper window could not be opened");
    helperRoster.placed(row.id, { tabId: tab.id, windowId: created.id });
    // The helper works with the same engine (RobloxScript or AgentScript) as the chat that asked for it.
    tabEngines.set(tab.id, normalizeEngine(row.engine));
    try { await chrome.storage.session.set({ ["rs-tab-engine-" + tab.id]: normalizeEngine(row.engine) }); } catch {}
    helperSave();
    if (!live()) { helperCloseWindow(row); return; }
    if (!(await criticTabReady(tab.id))) throw new Error("the helper chat did not load");
    const ready = await helperPing(tab.id);
    if (!live()) { helperCloseWindow(row); return; }
    if (!ready) throw new Error("PlazCode is not running in the helper window (is the site signed in?)");
    await criticSleep(1500); // let the new chat finish drawing its message box
    const answer = await chrome.tabs.sendMessage(tab.id, { type: "rs-helper-run", helper: { id: row.id, title: row.title, task: row.task, area: row.area, engine: row.engine } });
    if (!answer || !answer.ok) throw new Error(String((answer && answer.error) || "the helper chat did not accept the task").slice(0, 200));
    // From here the helper's own tab reports its progress and its result ("helpers" messages).
  } catch (error) {
    helperEnd(row.id, { status: "failed", summary: "Could not start: " + String(error && error.message || error).slice(0, 200) }, true);
  }
}
async function helperRequest(tabId, request) {
  await helperLoad();
  const action = String(request && request.action || "");
  if (!Number.isInteger(tabId)) return { ok: false, error: "Helpers need an AI chat tab." };
  if (action === "start") {
    const added = helperRoster.add({ tabId, chat: request.chat }, request.helpers, { url: request.url, engine: request.engine });
    if (!added.ok) return added;
    helperPump(tabId); helperNotify(tabId);
    return { ok: true, helpers: helperRoster.list(tabId).filter((h) => added.helpers.some((a) => a.id === h.id)) };
  }
  if (action === "list") { const self = helperRoster.byTab(tabId); return { ok: true, helpers: helperRoster.list(tabId), helper: self ? { id: self.id, title: self.title, task: self.task, area: self.area, engine: self.engine, sent: !!self.sent } : null }; }
  if (action === "take") { const results = helperRoster.take(tabId); helperSave(); return { ok: true, results, pending: helperRoster.activeFor(tabId).length }; }
  if (action === "stop") {
    const targets = helperRoster.stoppable(tabId, request.id);
    for (const row of targets) {
      if (row.tabId != null) { try { const p = chrome.tabs.sendMessage(row.tabId, { type: "rs-helper-stop" }); if (p && p.catch) p.catch(() => {}); } catch {} }
      helperEnd(row.id, { status: "stopped", summary: String(request.reason || "Stopped before finishing.").slice(0, 200) });
    }
    return { ok: true, stopped: targets.length };
  }
  if (action === "clear") { for (const row of helperRoster.clear(tabId)) helperCloseWindow(row); helperNotify(tabId); return { ok: true }; }
  if (action === "open") { const row = helperRoster.get(request.id); if (!row || row.parentTab !== tabId || row.windowId == null) return { ok: false, error: "That helper has no open window." }; try { await chrome.windows.update(row.windowId, { focused: true }); return { ok: true }; } catch { return { ok: false, error: "That helper's window is closed." }; } }
  if (action === "progress") { const row = helperRoster.progress(tabId, request); if (row) helperNotify(row.parentTab, !!(request.working || request.note !== undefined)); return { ok: !!row }; }
  if (action === "report") { const row = helperRoster.byTab(tabId); if (!row) return { ok: false }; helperEnd(row.id, { status: request.status, summary: request.summary }); return { ok: true }; }
  if (action === "lock") return helperRoster.lock(tabId, request.keys);
  return { ok: false, error: "Unknown helpers action." };
}
try {
  chrome.tabs.onRemoved?.addListener((tabId) => { helperLoad().then(() => {
    const { ended, orphans } = helperRoster.tabGone(tabId);
    for (const row of ended) { helperNotify(row.parentTab); helperPump(row.parentTab); }
    for (const row of orphans) helperCloseWindow(row);
    if (ended.length || orphans.length) helperSave();
  }); });
} catch {}

// 1.24.30 (owner, 2026-10-31: PlazCode "disconnects and reconnects for no reason"): Chrome stops an extension's
// background worker when one message takes longer than 5 minutes to answer, which also drops the link to the app.
// A command, a local model reply or a critic review can run up to 10 minutes. Those answer within 4 minutes with
// "still running" and the AI tab asks again ("job-wait"), so no single message ever reaches the limit.
const INTEGRITY_EXEMPT = new Set(["immediate-stop", "status", "live-status", "rs-run-beat", "job-wait"]);
const LONG_MESSAGE_TYPES = new Set(["call_tool", "ollama_chat", "rs-critic"]);
const LONG_REPLY_MS = 240000;
const longReplies = new Map();
let longReplyId = 0;
function answerWithin(final, job, sendResponse) {
  let timer;
  const still = new Promise((resolve) => { timer = setTimeout(() => resolve(longReplies), LONG_REPLY_MS); });
  Promise.race([final, still]).then((value) => {
    clearTimeout(timer);
    try { sendResponse(value === longReplies ? { ok: false, kind: "still-running", job } : value); } catch {}
  });
}
chrome.runtime.onMessage.addListener((msg, _sender, rawSendResponse) => {
  if (msg && msg.type === "deepseek-requests") {
    if (!deepSeekRequests) { rawSendResponse({ok:false}); return; }
    deepSeekRequests.snapshot(_sender).then(rawSendResponse,()=>rawSendResponse({ok:false}));
    return true;
  }
  if (msg && msg.type === "job-wait") {
    const final = longReplies.get(msg.job);
    if (final) answerWithin(final, msg.job, rawSendResponse);
    else rawSendResponse({ ok: false, kind: "disconnected", error: "The browser restarted PlazCode's background worker while this was running. It may have finished; check the current state before retrying." });
    return true;
  }
  let sendResponse = rawSendResponse;
  if (msg && LONG_MESSAGE_TYPES.has(msg.type)) {
    let settle;
    const final = new Promise((resolve) => { settle = resolve; });
    const job = ++longReplyId;
    longReplies.set(job, final);
    final.then(() => setTimeout(() => longReplies.delete(job), 60000));
    sendResponse = (value) => settle(value);
    answerWithin(final, job, rawSendResponse);
  }
  (async () => {
    // 1.24.30: nothing runs while the extension's files fail their check. Stop and the plain status reads stay
    // available so a run can always be ended and the bar can say what is wrong.
    if (!(msg && INTEGRITY_EXEMPT.has(msg.type))) {
      try { await protectionCheck(); } catch (error) { sendResponse({ ok: false, kind: "integrity", error: String(error && error.message || error) }); return; }
    }
    const tabId = _sender.tab?.id ?? msg.tab_id;
    const mode = await tabEngine(tabId);
    const dispatch = (value, timeout) => normalizeEngine(msg.engine ?? mode) === "local" ? sendLocalEngine(value, timeout) : send(value, timeout);
    switch (msg.type) {
      case "provider-pacing": {
        try {
          const origin=new URL(_sender.url || _sender.tab?.url || "");
          if(origin.protocol!=="https:" || !["chat.deepseek.com","deepseek.com"].includes(origin.hostname) || !Number.isInteger(_sender.tab?.id))throw new Error("Request pacing is only available to the DeepSeek chat.");
          const request={...msg.request,provider:"deepseek",owner:pairingIdentity()+":"+_sender.tab.id+":"+String(_sender.documentId || msg.page || "").slice(0,100)};
          const response=await bridgeFetch(`${RUST_ROBLOX_HTTP}/api/provider-pacing`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(request),signal:AbortSignal.timeout(5000)});
          const value=await response.json();sendResponse(response.ok ? value : {ok:false,error:value.error || "The shared request timer could not be reached. Update the complete PlazCode app and extension together."});
        }catch(error){sendResponse({ok:false,error:"DeepSeek send paused: "+String(error.message || error)});}
        break;
      }
      case "release-check":
        try {
          if(Date.now()-lastReleaseCheck>30000){lastReleaseCheck=Date.now();await bridgeFetch(`${RUST_ROBLOX_HTTP}/api/desktop/update`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"check",background:true}),signal:AbortSignal.timeout(5000)});}
          await readReleaseStatus();sendResponse({ok:true});
        } catch(error){sendResponse({ok:false,error:error.message||String(error)});}
        break;
      case "rs-run-beat":
        noteRunBeat(tabId, msg.running === true);
        sendResponse({ ok: true });
        break;
      case "rs-toolkit": {
        const request = msg.request || {};
        if (request.action !== "insert-typed-asset") { sendResponse({ ok: false, error: "Only asset uploads are available here." }); break; }
        try { const response = await bridgeFetch("http://127.0.0.1:3000/api/toolkit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "insert-typed-asset", kind: String(request.kind || ""), asset_id: request.asset_id }), signal: AbortSignal.timeout(120000) }); const value = await response.json(); sendResponse(response.ok ? value : { ok: false, error: value.error || "Studio upload failed." }); } catch (error) { sendResponse({ ok: false, error: error.message || String(error) }); }
        break;
      }
      case "rs-memory":
        try { sendResponse({ ok: true, memory: await readPersonalMemory(msg.action) }); } catch (error) { sendResponse({ ok: false, error: error.message || String(error) }); }
        break;
      case "rs-get-engine":
        sendResponse({engine:mode}); break;
      case "rs-set-engine": {
        const next=normalizeEngine(msg.engine);
        if (!Number.isInteger(tabId)) {sendResponse({ok:false,error:"Select an AI tab before changing its engine."});break;}
        // Leaving AgentScript for Roblox needs a connected Studio: otherwise stay on AgentScript and say why.
        if (next==="roblox" && (tabEngines.get(tabId)||mode)==="local") {
          let studioUp=false;
          try {
            const live=await bridgeFetch(`${RUST_ROBLOX_HTTP}/api/status`,{method:"GET",signal:AbortSignal.timeout(4000)});
            studioUp=live.ok && (await live.json()).roblox_connected===true;
          } catch {}
          if (!studioUp) {sendResponse({ok:false,engine:"local",error:"studio_not_connected",message:"Roblox Studio isn't connected. Open Roblox Studio and connect it to PlazCode, then switch to Roblox again."});break;}
        }
        tabEngines.set(tabId,next);
        try {await chrome.storage.session.set({["rs-tab-engine-"+tabId]:next});}catch{}
        try {await chrome.tabs.sendMessage(tabId,{type:"rs-engine",engine:next});}catch{}
        sendResponse({engine:next}); break;
      }
      case "rs-set-full": {
        // FULL PC ACCESS toggle for the AgentScript engine. The agent process
        // is the source of truth; mirror its answer into the status broadcast.
        const want = !!msg.enabled;
        try {
          const r = await bridgeFetch("http://127.0.0.1:3000/api/local-full", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: want }),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || typeof j.local_full !== "boolean") throw new Error("Agent did not confirm the permission change");
          localFull = j.local_full;
          try { chrome.storage.local.set({ "rs-local-full": localFull }); } catch {}
        } catch (error) {
          sendResponse({ ok: false, enabled: localFull, error: String(error.message || error) });
          break;
        }
        broadcastStatus();
        sendResponse({ ok: true, enabled: localFull });
        break;
      }
      case "rs-get-full":
        sendResponse({ enabled: localFull });
        break;
      case "immediate-stop": {
        try{const response=await bridgeFetch(`${RUST_ROBLOX_HTTP}/api/stop`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({checkpoint_id:msg.checkpoint_id}),signal:AbortSignal.timeout(4000)});sendResponse(await response.json());}
        catch(error){sendResponse({ok:false,error:String(error.message || error)});}break;
      }
      case "media-convert": {
        try {
          if(typeof msg.data!=="string" || msg.data.length>90*1024*1024)throw Error("Local conversion accepts files up to 64 MB.");
          const bytes=Uint8Array.from(atob(msg.data),c=>c.charCodeAt(0));
          const response=await bridgeFetch(`${RUST_ROBLOX_HTTP}/api/media/convert?video=${msg.video===true}`,{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:bytes,signal:AbortSignal.timeout(65000)});
          sendResponse(await response.json());
        }catch(error){sendResponse({ok:false,error:String(error.message || error)});}
        break;
      }
      case "live-status": {
        try {
          const response = await bridgeFetch(`${RUST_ROBLOX_HTTP}/api/status`, {method:"GET",signal:AbortSignal.timeout(4000)});
          if(!response.ok)throw Error("Bridge status request failed.");
          const live=await response.json();
          sendResponse({ok:true,...statusObj(normalizeEngine(msg.engine ?? mode)),connected:normalizeEngine(msg.engine ?? mode)==="local"?live.local_ready===true:connected,local_connected:live.local_ready===true,local_root:live.local_root,local_full:live.local_full===true,roblox_connected:live.roblox_connected===true,blender_connected:live.blender_connected===true,profile_required:live.profile_required===true,bridge_reachable:true});
        }catch(error){sendResponse({ok:false,error:String(error.message || error)});}
        break;
      }
      case "status":
        // A status request wakes native discovery too. The primary Roblox
        // socket may be unavailable while AgentScript is perfectly usable.
        if (Date.now() - lastNativeHealthAt >= 1000) refreshProcStatus();
        if (!connected && !reconnectTimer) connect();
        sendResponse(statusObj(mode));
        break;
      case "desktop_tools_snapshot": {
        try {
          const rows = Array.isArray(msg.tools) ? msg.tools : [];
          const response = await bridgeFetch("http://127.0.0.1:3000/api/tools/browser", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tools: rows }),
          });
          const body = await response.json().catch(() => ({}));
          sendResponse({ ok: response.ok, ...body });
        } catch (error) {
          sendResponse({ ok: false, error: String(error && error.message || error) });
        }
        break;
      }
      case "list_tools": {
        // Prefer a live refresh; fall back to cache so the loop never stalls.
        // 10s, not 25s: a catalogue request only blocks this long when one of the
        // MCP servers is dead (typically Roblox in a degraded, Blender-only
        // session), and in that exact case we already hold a perfectly good cached
        // catalogue. Waiting the full 25s just froze the boot for no new data.
        const r = await dispatch({ type: "list_tools" }, 10000);
        if (mode === "roblox" && r.ok && Array.isArray(r.tools)) toolsCache = r.tools;
        if (mode === "local" && r.ok && Array.isArray(r.tools)) { localToolsCache = r.tools; broadcastStatus(); }
        const tools = mergeBlenderTools(mode === "local" ? (r.tools || localToolsCache) : toolsCache);
        const ok = r.ok || tools.length > 0;
        sendResponse({ ok, tools, fresh:r.ok===true, cached:r.ok!==true && tools.length>0, error: r.ok ? undefined : r.error });
        break;
      }
      case "logs": {
        // 1.24.30: read-only access to the on-disk logs for the plazcode_logs command.
        try{const q=msg.request||{},params=new URLSearchParams({filter:String(q.filter||"all"),q:String(q.q||""),limit:String(q.limit||60)});if(q.day)params.set("day",String(q.day));
          const response=await bridgeFetch(RUST_ROBLOX_HTTP+"/api/logs/day?"+params.toString(),{signal:AbortSignal.timeout(15000)});
          if(!response.ok)throw new Error(response.status===404?"This PlazCode app is older than the extension and has no logs yet. Update the PlazCode app.":"HTTP "+response.status);
          const value=await response.json();sendResponse({ok:true,events:value.events||[],total:value.total||0,day:value.day||""});
        }catch(error){sendResponse({ok:false,error:String(error&&error.message||error)});}
        break;
      }
      case "textPack": {
        // 1.24.30: release builds keep the long instructions inside the PlazCode app (core/text-pack.js).
        // bridgeFetch pairs first, so only the official extension of this installation receives them.
        try{const response=await bridgeFetch(RUST_ROBLOX_HTTP+"/api/text-pack",{signal:AbortSignal.timeout(15000)});
          if(!response.ok){const reason=String(await response.text().catch(()=>"")).slice(0,600);throw new Error(response.status===404?"This PlazCode app is older than the extension. Update the PlazCode app and the extension together, then refresh this AI tab.":reason||("HTTP "+response.status));}
          sendResponse({ok:true,pack:await response.json()});
        }catch(error){sendResponse({ok:false,error:String(error&&error.message||error)});}
        break;
      }
      case "skills": {
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),28000);
        try{const response=await bridgeFetch(RUST_ROBLOX_HTTP+"/api/skills",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(msg.request||{action:"list"}),signal:controller.signal});const value=await response.json();sendResponse(response.ok?value:{ok:false,error:value.error||"Skill request failed."});}catch(error){sendResponse({ok:false,error:error.message||String(error)});}finally{clearTimeout(timer);}break;
      }
      case "creations": {
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
        try{const response=await bridgeFetch(RUST_ROBLOX_HTTP+"/api/creations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(msg.request||{action:"list"}),signal:controller.signal});const value=await creatorResponse(response);sendResponse(response.ok?value:{ok:false,error:value.error||"Creator request failed."});}catch(error){sendResponse({ok:false,error:error.message||String(error)});}finally{clearTimeout(timer);}break;
      }
      case "templates":
        try {
          let request=msg.request || {action:"list"},url=`${RUST_ROBLOX_HTTP}/api/templates`,body,headers={"Content-Type":"application/json"};
          if(request.action==='upload-chunk'){
            if(!/^[a-f0-9]{32}$/.test(request.id)||!Number.isSafeInteger(request.offset)||request.offset<0||typeof request.content!=='string'||request.content.length>2796204)throw Error('Invalid template upload chunk.');
            const binary=atob(request.content);if(!binary.length||binary.length>2097152)throw Error('Template chunk exceeds 2 MB.');body=Uint8Array.from(binary,c=>c.charCodeAt(0));url+='/upload/'+request.id+'?offset='+request.offset;headers={'Content-Type':'application/octet-stream'};
          }else if(['upload-begin','upload-finish','upload-status','upload-cancel'].includes(request.action)){url+='/upload';body=JSON.stringify(request);
          }else           if(request.action==="import"){if(typeof request.content!=="string" || request.content.length>44739244)throw Error("Template file exceeds 32 MB.");const binary=atob(request.content);body=Uint8Array.from(binary,c=>c.charCodeAt(0));url+="/import?name="+encodeURIComponent(request.name)+"&description="+encodeURIComponent(request.description || "");headers={"Content-Type":"application/octet-stream"};}else body=JSON.stringify(request);
          const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);try{const response=await bridgeFetch(url,{method:"POST",headers,body,signal:controller.signal});const value=await response.json();sendResponse(response.ok?value:{ok:false,error:value.error || "Template request failed."});}finally{clearTimeout(timer);}
        }catch(error){sendResponse({ok:false,error:error.message || String(error)});}
        break;
      case "engram": {
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),28000);
        try { const response=await bridgeFetch(RUST_ROBLOX_HTTP+"/api/engram",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(msg.request||{}),signal:controller.signal});sendResponse(await response.json()); }
        catch(error){sendResponse({ok:false,error:error.message||String(error)});}finally{clearTimeout(timer);}break;
      }
      case "helpers": {
        try { sendResponse(await helperRequest(tabId, msg.request || {})); }
        catch (error) { sendResponse({ ok: false, error: String(error && error.message || error).slice(0, 200) }); }
        break;
      }
      case "rs-critic": {
        try { sendResponse(await runCritic(msg)); }
        catch (error) { sendResponse({ ok: false, error: String(error && error.message || error).slice(0, 200) }); }
        break;
      }
      case "rs-open-vault-import": {
        // The import page is a PlazCode page, so an AI site can never see the files that are picked there.
        try { await chrome.tabs.create({ url: chrome.runtime.getURL("core/vault-import.html") }); sendResponse({ ok: true }); }
        catch (error) { sendResponse({ ok: false, error: String(error && error.message || error).slice(0, 160) }); }
        break;
      }
      case "vault": {
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
        try { const response=await bridgeFetch(RUST_ROBLOX_HTTP+"/api/vault",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(msg.request||{}),signal:controller.signal});sendResponse(await response.json()); }
        catch(error){sendResponse({ok:false,error:error.message||String(error)});}finally{clearTimeout(timer);}break;
      }
      case "chat-history": {
        const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5000);
        try{const response=await bridgeFetch(RUST_ROBLOX_HTTP+"/api/chat-history",msg.request?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(msg.request),signal:controller.signal}:{signal:controller.signal});sendResponse(await response.json());}catch(error){sendResponse({ok:false,error:error.message||String(error)});}finally{clearTimeout(timeout);}break;
      }
      case "checkpoints": {
        const timer = new AbortController(); const timeout = setTimeout(() => timer.abort(), 30000);
        try {
          const response = await bridgeFetch("http://127.0.0.1:3000/api/checkpoints", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(msg.request || {action:"list"}), signal:timer.signal });
          const body = await response.json(); sendResponse({ok:response.ok,...body});
        } catch(error) { sendResponse({ok:false,error:String(error.message || error)}); } finally { clearTimeout(timeout); }
        break;
      }
      case "mcp-catalog": {
        // 1.24.21 site setups: which tool add-ons exist and which are on.
        try {
          const response = await bridgeFetch("http://127.0.0.1:3000/api/mcp/catalog", { signal: AbortSignal.timeout(8000) });
          const body = await response.json(); sendResponse({ ok: response.ok, ...body });
        } catch (error) { sendResponse({ ok: false, error: String(error.message || error) }); }
        break;
      }
      case "mcp-toggle": {
        try {
          const id = String(msg.id || "");
          if (!/^[a-z0-9][a-z0-9_-]{0,40}$/i.test(id)) throw new Error("Unknown tool add-on.");
          const response = await bridgeFetch("http://127.0.0.1:3000/api/mcp/toggle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, enabled: msg.enabled === true }), signal: AbortSignal.timeout(8000) });
          const body = await response.json().catch(() => ({})); sendResponse({ ok: response.ok && body.ok !== false, ...body });
        } catch (error) { sendResponse({ ok: false, error: String(error.message || error) }); }
        break;
      }
      case "call_tool": {
        const timeout = (msg.timeout || 120000) + 10000;
        desktopToolCall(msg, _sender);
        if (isBlockbenchToolName(msg.name)) {
          sendResponse(await blockbenchCall(msg.name, msg.arguments, timeout));
          break;
        }
        if (isFigmaToolName(msg.name)) {
          sendResponse(await figmaCall(msg.name, msg.arguments, timeout));
          break;
        }
        if (blenderAddon && isBlenderToolName(msg.name)) {
          sendResponse(await blenderCall(msg.name, msg.arguments, timeout));
          break;
        }
        const r = await dispatch(
          { type: "call_tool", name: msg.name, arguments: msg.arguments, timeout: msg.timeout, checkpoint_id: msg.checkpoint_id, confirmed: msg.confirmed === true },
          timeout
        );
        sendResponse(r);
        break;
      }
      case "restart_mcp": {
        const r = await dispatch({ type: "restart_mcp" }, 30000);
        if (r && r.ok) {
          const tools = await dispatch({ type: "list_tools" }, 10000);
          if (mode === "roblox" && tools && tools.ok && Array.isArray(tools.tools)) toolsCache = tools.tools;
          mcpAlive = true;
        }
        sendResponse(r);
        break;
      }
      case "local_read": {
        try {
          const text = await localReadAll(String(msg.path || ""));
          sendResponse({ ok: true, text });
        } catch (e) {
          sendResponse({ ok: false, error: String(e && e.message || e) });
        }
        break;
      }
      // Base64 read (any file: images, PDFs, binaries) — powers attach_feedback
      // ({"path": ...}), which puts a workspace file into the chat as an
      // attachment instead of pasting its text.
      case "local_read_base64": {
        try {
          const data = await localReadBase64(String(msg.path || ""));
          sendResponse({ ok: true, path: data.path, mimeType: data.mimeType, bytes: data.bytes, data: data.data });
        } catch (e) {
          sendResponse({ ok: false, error: String(e && e.message || e) });
        }
        break;
      }
      case "blender_connect": {
        sendResponse(await connectBlender());
        break;
      }
      case "blender_status": {
        sendResponse({ ok: blenderAddon, blender: blenderAddon, error: blenderError || undefined });
        break;
      }
      case "blender_disconnect": {
        blenderSuppressed=true;
        setBlender(false, "");
        broadcastStatus();
        sendResponse({ ok: true, blender: false });
        break;
      }
      case "add_server": {
        // Blender’s bar shortcut verifies the addon, without spawning a second MCP process.
        if (String(msg.server_id || "").toLowerCase() === "blender") {
          sendResponse(await connectBlender());
          break;
        }
        const r = await send({
          type: "add_server", server_id: msg.server_id,
          command: msg.command, args: msg.args, env: msg.env,
        }, 15000);
        sendResponse(r);
        break;
      }
      case "remove_server": {
        const r = await send({ type: "remove_server", server_id: msg.server_id }, 15000);
        sendResponse(r);
        break;
      }
      case "reconnect":
        reconnectDelay = RECONNECT_MIN;
        reconnectAttempts = 0;
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
        refreshProcStatus();
        connect();
        sendResponse({ ok: true });
        break;
      // ── ZeroScript Rust pipe — CORS bypass via background (content script → background → 127.0.0.1) ──
      case "rs-push":
      case "push_payload": {
        // Content script payload from AI chat (Gemini/ChatGPT/Claude) → local bridge
        // Must go through background to bypass chat site CORS on http://127.0.0.1
        try {
          const target = RUST_ROBLOX_HTTP;
          const res = await bridgeFetch(`${target}/api/push`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(msg.payload || msg),
          });
          const j = await res.json().catch(() => ({}));
          sendResponse({ ok: res.ok, ...j });
        } catch (e) {
          // Fallback to legacy WS if Rust HTTP not reachable
          const r = await send({ type: "call_tool", name: msg.name || "push_payload", arguments: msg.arguments || msg.payload || {} }, 10000);
          sendResponse(r);
        }
        break;
      }
      case "rs-poll": {
        try {
          const target = RUST_ROBLOX_HTTP;
          // /api/poll long-polls for up to 25 s; stay above that so a queued payload is never dropped mid-reply.
          const res = await bridgeFetch(`${target}/api/poll?client_id=${encodeURIComponent(msg.client_id || engine)}`, { signal: AbortSignal.timeout(35000) });
          const j = await res.json().catch(() => ({}));
          sendResponse(j);
        } catch (e) {
          sendResponse({ ok: false, error: String(e && e.message || e) });
        }
        break;
      }
      case "web_fetch": {
        try {
          let url = String(msg.url || "").trim();
          const query = String(msg.query || "").trim();
          if (!url) {
            const q = String(msg.q || query).trim();
            if (/^https?:\/\//i.test(q)) url = q;
          }
          let searchNote = "";
          if (!url) {
            const q = query || String(msg.q || "").trim();
            if (!q) { sendResponse({ ok: false, error: "url or query is required" }); break; }
            const found = await webSearch(q, 3);
            if (!found.hits.length) {
              sendResponse({ ok: false, error: `no search results for: ${q} (tried ${found.notes.join("; ") || "all backends"})` });
              break;
            }
            url = found.hits[0].url;
            searchNote = `Searched "${q}" [${found.backend}]. Top result: ${url}\n` +
              found.hits.map((h, i) => (i + 1) + ". " + h.title + " — " + h.url).join("\n") + "\n\n";
          }
          if (!/^https?:\/\//i.test(url)) { sendResponse({ ok: false, error: "url must start with http:// or https://" }); break; }
          const maxChars = Math.max(500, Math.min(50000, Number(msg.max_chars) || 12000));
          let text = "";
          let directWasHtml = false;
          let status = 0;
          let ctype = "";
          let via = "direct";
          const notes = [];
          try {
            const res = await fetchWithTimeout(url, { headers: webHeaders({}, (() => { try { return new URL(url).origin + "/"; } catch { return undefined; } })()) }, WEB_FETCH_TIMEOUT);
            status = res.status;
            ctype = (res.headers.get("content-type") || "").toLowerCase();
            if (!res.ok) {
              notes.push(`direct HTTP ${res.status}`);
            } else {
              let raw = await res.text();
              const looksHtml = /html|xml/.test(ctype) || /^\s*</.test(raw);
              directWasHtml = looksHtml;
              text = looksHtml ? htmlToText(raw) : raw.trim();
            }
          } catch (e) {
            notes.push("direct: " + String((e && e.message) || e).slice(0, 90));
          }
          // Reader proxy when the direct fetch failed, was blocked, or returned
          // a JavaScript shell we cannot read.
          // Short pages are only suspicious when they were HTML: a 200-char
          // plain-text/JSON answer is a complete document, and re-reading it
          // through a proxy would be wasted time.
          const wasShell = !text || (directWasHtml && looksLikeShell(text));
          if (wasShell) {
            try {
              const viaReader = await readerFallback(url, maxChars);
              if (viaReader) { text = viaReader; via = "reader"; }
            } catch (e) {
              notes.push("reader: " + String((e && e.message) || e).slice(0, 90));
            }
          }
          if (!text) {
            sendResponse({ ok: false, error: `fetch failed for ${url}${notes.length ? " (" + notes.join("; ") + ")" : ""}` });
            break;
          }
          const origLen = text.length;
          const truncated = origLen > maxChars;
          if (truncated) text = text.slice(0, maxChars) + `\n\n…[truncated ${origLen - maxChars} chars]`;
          const suffix = via === "reader"
            ? `\n\n[PlazCode: the page served no readable text directly (${notes.join("; ") || "blocked"}), so it was read through a rendering proxy — layout/menus may be missing.]`
            : (wasShell
              ? `\n\n[PlazCode: this page returned almost no readable text${notes.length ? " (" + notes.join("; ") + ")" : ""} — it is served by JavaScript or blocks non-browser readers, so the text above is all there is. Use web_search for a text source instead of relying on this page.]`
              : "");
          sendResponse({ ok: true, text: searchNote + text + suffix, truncated, status, url, content_type: ctype, via });
        } catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); }
        break;
      }
      case "web_search": {
        try {
          const q = String(msg.query || msg.q || "").trim();
          if (!q) { sendResponse({ ok: false, error: "query is required" }); break; }
          const limit = Math.max(1, Math.min(8, Number(msg.limit) || 3));
          const found = await webSearch(q, limit);
          if (!found.hits.length) {
            sendResponse({ ok: false, error: `no results for '${q}' (tried ${found.notes.join("; ") || "all backends"})`, notes: found.notes });
            break;
          }
          const results = found.hits;
          const txt = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}`).join("\n");
          sendResponse({ ok: true, text: `Searched "${q}" [${found.backend}]\n${txt}`, results, query: q, backend: found.backend, notes: found.notes });
        } catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); }
        break;
      }
      case "ollama_list_models": {
        try {
          const res = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(OLLAMA_TAGS_TIMEOUT_MS) });
          if (!res.ok) { sendResponse({ ok: false, error: `Ollama not running (HTTP ${res.status}) — run 'ollama serve'` }); break; }
          const j = await res.json();
          sendResponse({ ok: true, models: j.models || [] });
        } catch (e) { sendResponse({ ok: false, error: isTimeoutError(e) ? `Ollama did not answer at 127.0.0.1:11434 within ${OLLAMA_TAGS_TIMEOUT_MS / 1000} s — restart 'ollama serve'.` : `Ollama not reachable at 127.0.0.1:11434 — is 'ollama serve' running? ${String(e&&e.message||e)}` }); }
        break;
      }
      // One-click start: ask whichever bridge is connected to spawn `ollama serve`.
      case "ollama_ensure": {
        const ask = (type) => send({ type, timeoutMs: 12000 });
        let r = await ask("start_ollama");
        if (!r || r.error === "bridge not connected") {
          // Engine bridge down? try the other port by flipping engine briefly is
          // too invasive; instead just report so popup can hint to run robloxscript-agent.exe.
          sendResponse({ ok: false, up: false, error: "bridge offline - run PlazCode.exe first" });
          break;
        }
        sendResponse(r);
        break;
      }
      case "ollama_status": {
        const r = await send({ type: "ollama_status" }, 8000);
        if (!r || r.error === "bridge not connected") {
          sendResponse({ ok: false, up: false, error: "bridge offline" });
          break;
        }
        sendResponse(r);
        break;
      }
      case "ollama_chat": {
        try {
          let model = msg.model ? String(msg.model) : "";
          const messages = Array.isArray(msg.messages) ? msg.messages : [{role:"user", content:String(msg.prompt||"")}];
          // Validate the model against what is ACTUALLY installed before calling
          // /api/chat - a stale name (model deleted after being picked, or the
          // hardcoded default no longer pulled) otherwise surfaces as a raw 404
          // body. Return a structured error the page can react to (auto-recover).
          let available = [];
          try {
            const tr = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(OLLAMA_TAGS_TIMEOUT_MS) });
            if (tr.ok) { const tj = await tr.json(); available = (tj.models || []).map(m => m.name); }
          } catch {}
          if (!available.length) {
            sendResponse({ ok:false, errKind:"no_server", error:"ERR: OLLAMA NOT RUNNING - nothing answered on 127.0.0.1:11434." });
            break;
          }
          if (!model || !available.includes(model)) {
            if (model) {
              sendResponse({
                ok: false, errKind: "model_not_found", available,
                error: `ERR: MODEL NOT FOUND - "${model}" is not installed anymore.`
              });
              break;
            }
            // No model given: fall back to a coder model if present, else first.
            const pref = available.find(n => /coder|code/i.test(n));
            model = pref || available[0];
          }
          const res = await fetch("http://127.0.0.1:11434/api/chat", {
            method: "POST",
            headers: { "Content-Type":"application/json" },
            body: JSON.stringify({ model, messages, stream: false }),
            signal: AbortSignal.timeout(OLLAMA_CHAT_TIMEOUT_MS)
          });
          if (!res.ok) {
            const t = await res.text().catch(()=> "");
            sendResponse({ ok: false, errKind:"http_"+res.status, model,
              error: `Ollama chat HTTP ${res.status}: ${t.slice(0,400)}` });
            break;
          }
          const j = await res.json();
          const text = (j.message && j.message.content) || j.response || "";
          sendResponse({ ok: true, text, model, raw: j });
        } catch (e) {
          if (isTimeoutError(e)) sendResponse({ ok: false, errKind: "timeout", error: `ERR: OLLAMA TIMED OUT - no answer within ${OLLAMA_CHAT_TIMEOUT_MS / 60000} min. Try a smaller model or a shorter conversation.` });
          else sendResponse({ ok: false, error: `Ollama chat failed: ${String(e&&e.message||e)} - try OLLAMA_ORIGINS=* ollama serve` });
        }
        break;
      }
      case "resolve_universe": {
        try { sendResponse(await robloxResolveUniverse(msg)); }
        catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); }
        break;
      }
      case "create_dev_product": {
        try { sendResponse(await robloxCreateDevProduct(msg)); }
        catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); }
        break;
      }
      case "list_dev_products": {
        try { sendResponse(await robloxListDevProducts(msg)); }
        catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); }
        break;
      }
      case "capture_tab": {
        try {
          const windowId = (_sender.tab && _sender.tab.windowId) || undefined;
          const dataUrl = await new Promise((resolve, reject) => {
            let settled=false;
            const timer=setTimeout(()=>done(new Error("Browser did not finish the screen capture")),15000);
            const done=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve(value);};
            try {
              chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (url) => {
                try { if (chrome.runtime.lastError) done(new Error(chrome.runtime.lastError.message)); else done(null,url); } catch(error) { done(error); }
              });
            } catch (e) { done(e); }
          });
          const m = String(dataUrl || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
          if (!m) {
            sendResponse({ ok: false, error: "tab capture returned no image" });
            break;
          }
          sendResponse({ ok: true, images: [{ mimeType: m[1], data: m[2] }] });
        } catch (e) {
          sendResponse({ ok: false, error: String(e && e.message || e) });
        }
        break;
      }
      case "tab_read": {
        if (CONTROL_V2) { try { const tab = await resolveTab(msg); const entered = tab ? await controlEnter(tab, msg, _sender) : { error: "no target tab (open a page, or pass url_contains)" }; if (entered.error) { sendResponse({ ok: false, error: entered.error }); break; } } catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); break; } }
        try {
          const tab = await resolveTab(msg);
          if (!tab) { sendResponse({ ok: false, error: "no target tab (open a page, or pass url_contains)" }); break; }
          const [res] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              const safeRead=(read,fallback)=>{try{return read();}catch{return fallback;}};
              const safeQueryAll=(selector)=>safeRead(()=>Array.from(document.querySelectorAll(selector)),[]);
              const isVisible = (el) => safeRead(() => {
                const r = el.getBoundingClientRect();
                const s = getComputedStyle(el);
                return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && r.bottom > 0 && r.top < innerHeight;
              },false);
              const text = safeRead(()=>document.body && document.body.innerText || "", "").replace(/\n{3,}/g, "\n\n").slice(0, 6000);
              const clickable = [];
              const els = safeQueryAll("a, button, input, [role=button], [onclick], summary, select, textarea");
              let i = 0;
              for (const el of els) {
                if (!isVisible(el)) continue;
                try {
                const label = (el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("title") || el.name || "").trim().replace(/\s+/g, " ").slice(0, 80);
                clickable.push({ i, tag: el.tagName.toLowerCase(), type: el.type || "", label, id: el.id || "", cls: (el.className && String(el.className).slice(0, 60)) || "" });
                i++;
                if (i >= 120) break;
                } catch { /* A virtualized row was removed while reading it. */ }
              }
              return { url: safeRead(()=>location.href,""), title: safeRead(()=>document.title,""), text, clickable };
            },
          });
          sendResponse({ ok: true, tab: { id: tab.id, url: tab.url, title: tab.title }, page: res.result });
        } catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); }
        break;
      }
      case "tab_click": {
        if (CONTROL_V2) { try { sendResponse(await controlledTabAction("click", msg, _sender)); } catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); } break; }
        try {
          const tab = await resolveTab(msg);
          if (!tab) { sendResponse({ ok: false, error: "no target tab" }); break; }
          const [res] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            args: [String(msg.selector || ""), String(msg.text || "")],
            func: (selector, text) => {
              const safeRead=(read,fallback)=>{try{return read();}catch{return fallback;}};
              const safeQuery=(value)=>safeRead(()=>document.querySelector(value),null);
              const safeQueryAll=(value)=>safeRead(()=>Array.from(document.querySelectorAll(value)),[]);
              let el = null;
              if (selector) el = safeQuery(selector);
              if (!el && text) {
                const t = text.toLowerCase();
                const cands = safeQueryAll("a, button, input, [role=button], [onclick], summary, select, textarea, label");
                el = cands.find((c) => safeRead(() => ((c.innerText || c.value || c.getAttribute("aria-label") || c.getAttribute("placeholder") || "").toLowerCase().includes(t)),false));
              }
              if (!el) return { clicked: false, error: "element not found" };
              try {
              const receipt={ clicked:true,tag:el.tagName.toLowerCase(),label:(el.innerText || el.value || "").trim().slice(0,60) };
              el.scrollIntoView({ block: "center" });
              el.focus && el.focus();
              el.click();
              return receipt;
              } catch(error) { return {clicked:false,error:String(error.message || error),note:"The click was not repeated; inspect the page before retrying."}; }
            },
          });
          sendResponse({ ok: true, result: res.result });
        } catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); }
        break;
      }
      case "tab_type": {
        if (CONTROL_V2) { try { sendResponse(await controlledTabAction("type", msg, _sender)); } catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); } break; }
        try {
          const tab = await resolveTab(msg);
          if (!tab) { sendResponse({ ok: false, error: "no target tab" }); break; }
          const [res] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            args: [String(msg.selector || ""), String(msg.text || ""), !!msg.submit],
            func: (selector, text, submit) => {
              let el;
              try { el=selector ? document.querySelector(selector) : document.activeElement; } catch { return {typed:false,error:"Invalid selector or unavailable field"}; }
              try {
              if (!el) return { typed: false, error: "no field (pass selector)" };
              el.focus();
              if ("value" in el) {
                el.value = text;
                el.dispatchEvent(new Event("input", { bubbles: true }));
                el.dispatchEvent(new Event("change", { bubbles: true }));
              } else {
                el.textContent = text;
              }
              if (submit) {
                const k = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true });
                el.dispatchEvent(k);
                if (el.form && el.form.requestSubmit) el.form.requestSubmit();
              }
              return { typed: true, tag: el.tagName.toLowerCase() };
              } catch(error) { return {typed:false,error:String(error.message || error),note:"The write was not repeated; inspect the field before retrying."}; }
            },
          });
          sendResponse({ ok: true, result: res.result });
        } catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); }
        break;
      }
      case "tab_scroll": {
        if (CONTROL_V2) { try { sendResponse(await controlledTabAction("scroll", msg, _sender)); } catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); } break; }
        try {
          const tab = await resolveTab(msg);
          if (!tab) { sendResponse({ ok: false, error: "no target tab" }); break; }
          const [res] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            args: [Number(msg.amount) || 600],
            func: (amount) => { window.scrollBy({ top: amount, behavior: "smooth" }); return { scrolled: amount, y: Math.round(window.scrollY) }; },
          });
          sendResponse({ ok: true, result: res.result });
        } catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); }
        break;
      }
      case "tab_screenshot": case "tab_click_at": case "tab_type_text": case "tab_key": case "tab_scroll_at": case "tab_navigate": case "tab_open":
        if (!CONTROL_V2) { sendResponse({ ok: false, error: "This PlazCode version does not have " + msg.type + " yet." }); break; }
        try { sendResponse(await controlV2Tool(msg, _sender)); } catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); }
        break;
      case "control_watch":
        if (!CONTROL_V2 || !Number.isInteger(msg.tabId)) { sendResponse({ ok: false, error: "Nothing to watch." }); break; }
        try { sendResponse(await controlWatch(msg.tabId, _sender)); } catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); }
        break;
      case "ask_open":
        if (!CONTROL_V2) { sendResponse({ ok: false, error: "Not available in this version." }); break; }
        try { sendResponse(await askOpen(Number.isInteger(msg.windowId) ? msg.windowId : _sender && _sender.tab ? _sender.tab.windowId : undefined)); } catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); }
        break;
      case "ask_reply": case "ask_step": case "ask_approve":
        if (!CONTROL_V2) { sendResponse({ ok: false }); break; }
        try { sendResponse(await askFromChat(msg, _sender)); } catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); }
        break;
      case "control_event":
        controlEvent(msg, _sender);
        sendResponse({ ok: true });
        break;
      case "rs-debug-log":
        debugAcceptTab(msg, _sender);
        sendResponse({ ok: true });
        break;
      default:
        sendResponse({ ok: false, kind:"unknown-message", error:"This PlazCode extension worker does not support the request. Reload the extension, then refresh the AI tab." });
    }
  })().catch((error) => {
    // Contract: every message gets an answer, even after an unexpected throw.
    try { sendResponse({ ok: false, error: String(error && error.message || error) }); } catch {}
  });
  return true; // async sendResponse
});

// ── AgentScript control rework (owner, 2026-11-12; ships in 1.24.33, owner 2026-11-13) ─────────────────
// On. The switch stays as an emergency off switch (false = the four old tab tools only, no Ask PlazCode, no live
// pictures); tests also check that state. Plan and security review: development/1.24.33/AGENTSCRIPT-REWORK-PLAN.md.
let CONTROL_V2 = true;
// tabId -> { paused, stoppedAt, by } : what the person did in the controlled tab, and which AI tab is working there.
const controlTabs = new Map();
// Step 7: the overlay's and the desktop label's words in the person's PlazCode language. The AI tab and the
// Ask PlazCode panel translate them (this worker has no language files) and send them along; English until then.
let controlWords = null;
function controlKeepWords(given) {
  if (!given || typeof given !== "object") return;
  const kept = {};
  for (const key of ["working", "paused", "resume", "stop", "shared", "stopSharing"]) if (typeof given[key] === "string" && given[key].trim() && given[key].length <= 80) kept[key] = given[key].trim();
  if (Object.keys(kept).length) controlWords = kept;
}
const CONTROL_STORES = /^https:\/\/(?:chromewebstore\.google\.com|chrome\.google\.com\/webstore|microsoftedge\.microsoft\.com\/addons|addons\.mozilla\.org)(?:\/|$)/i;
function isProviderUrl(url) {
  return PROVIDER_URLS.some((p) => new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")).test(url || ""));
}
// Tabs PlazCode never controls, whatever the approval mode.
function controlRefusal(tab, sender) {
  const url = String(tab && tab.url || "");
  if (!/^(?:https?|file):/i.test(url)) return "PlazCode does not control browser pages, extension pages or empty tabs. Open the website first, then try again.";
  if (CONTROL_STORES.test(url)) return "PlazCode does not control the extension store.";
  if ((sender && sender.tab && sender.tab.id === tab.id) || isProviderUrl(url)) return "PlazCode does not control an AI chat tab. Name the tab to work in (url_contains), or open the page in its own tab.";
  return "";
}
async function controlEnter(tab, msg, sender) {
  const refusal = controlRefusal(tab, sender);
  if (refusal) return { error: refusal };
  const row = controlTabs.get(tab.id) || { paused: false, stoppedAt: 0, by: null };
  if (row.stoppedAt && Date.now() - row.stoppedAt < 15000) return { error: "The person pressed Stop in that tab a moment ago, so PlazCode did nothing. Ask them before working there again." };
  row.stoppedAt = 0; row.by = sender && sender.tab ? sender.tab.id : row.by;
  controlTabs.set(tab.id, row);
  controlLiveStart(tab.id, row.by).catch(() => {});
  const accent = /^#[0-9a-f]{6}$/i.test(String(msg.accent || "").trim()) ? String(msg.accent).trim() : "";
  if (accent) row.accent = accent;
  controlKeepWords(msg.words);
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["core/control-overlay.js"] });
  const [shown] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, args: [accent, controlWords], func: (a, w) => globalThis.__plazcodeControl.show({ accent: a, words: w }) });
  if (shown && shown.result && shown.result.paused) row.paused = true;
  if (row.paused) {
    // The person took over: wait for Resume (or Stop) instead of acting under their hands.
    const until = Date.now() + 90000;
    while (row.paused && !row.stoppedAt && Date.now() < until) await new Promise((r) => setTimeout(r, 250));
    if (row.stoppedAt) return { error: "The person pressed Stop, so PlazCode did nothing." };
    if (row.paused) return { error: "The person is using that tab (PlazCode paused when they moved the mouse or typed). Nothing was done. Ask them whether to continue; they can press Resume in the tab." };
  }
  return { ok: true };
}
// One tab action the controlled way: glow and label on, PlazCode's cursor glides to the target, then the action.
async function controlledTabAction(kind, msg, sender) {
  const tab = await resolveTab(msg);
  if (!tab) return { ok: false, error: "no target tab (open a page, or pass url_contains)" };
  const entered = await controlEnter(tab, msg, sender);
  if (entered.error) return { ok: false, error: entered.error };
  const run = async (func, args) => (await chrome.scripting.executeScript({ target: { tabId: tab.id }, args: args || [], func }))[0].result;
  if (kind === "read") return null; // reading shows the glow; the page is read by the usual code
  if (kind === "scroll") {
    return { ok: true, result: await run((amount) => { window.scrollBy({ top: amount, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); return { scrolled: amount, y: Math.round(window.scrollY + amount) }; }, [Number(msg.amount) || 600]) };
  }
  // Click or type: find the element first (same rules as before), point at it, then act on that very element.
  const found = await run((kind, selector, text) => {
    const control = globalThis.__plazcodeControl;
    let el = null;
    try {
      if (selector) el = document.querySelector(selector);
      else if (kind === "type") el = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
      if (!el && text && kind === "click") {
        const t = text.toLowerCase();
        el = Array.from(document.querySelectorAll("a, button, input, [role=button], [onclick], summary, select, textarea, label"))
          .find((c) => ((c.innerText || c.value || c.getAttribute("aria-label") || c.getAttribute("placeholder") || "").toLowerCase().includes(t)));
      }
    } catch { return { error: "Invalid selector" }; }
    if (!el) return { error: kind === "type" ? "no field (pass selector)" : "element not found" };
    control.target = el;
    el.scrollIntoView({ block: "center", inline: "nearest" });
    const r = el.getBoundingClientRect();
    return { x: r.left + Math.min(r.width / 2, 40), y: r.top + r.height / 2 };
  }, [kind, String(msg.selector || ""), String(msg.text || "")]);
  if (!found || found.error) return { ok: true, result: kind === "type" ? { typed: false, error: found && found.error } : { clicked: false, error: found && found.error } };
  await run((x, y) => globalThis.__plazcodeControl.moveTo(x, y), [found.x, found.y]);
  const row = controlTabs.get(tab.id);
  if (row && (row.paused || row.stoppedAt)) return { ok: false, error: row.stoppedAt ? "The person pressed Stop, so PlazCode did nothing." : "The person took over the tab just before the action, so nothing was done. Ask them whether to continue." };
  if (kind === "click") {
    return { ok: true, result: await run(() => {
      const control = globalThis.__plazcodeControl, el = control.target; control.target = null;
      if (!el || !el.isConnected) return { clicked: false, error: "The element went away before the click; nothing was clicked." };
      try { control.press(); const receipt = { clicked: true, tag: el.tagName.toLowerCase(), label: (el.innerText || el.value || "").trim().slice(0, 60) }; el.focus && el.focus(); el.click(); return receipt; }
      catch (error) { return { clicked: false, error: String(error.message || error), note: "The click was not repeated; inspect the page before retrying." }; }
    }) };
  }
  return { ok: true, result: await run((text, submit) => {
    const control = globalThis.__plazcodeControl, el = control.target; control.target = null;
    if (!el || !el.isConnected) return { typed: false, error: "The field went away before typing; nothing was typed." };
    try {
      control.press(); el.focus();
      if ("value" in el) { el.value = text; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }
      else el.textContent = text;
      if (submit) { el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true })); if (el.form && el.form.requestSubmit) el.form.requestSubmit(); }
      return { typed: true, tag: el.tagName.toLowerCase() };
    } catch (error) { return { typed: false, error: String(error.message || error), note: "The write was not repeated; inspect the field before retrying." }; }
  }, [String(msg.text || ""), !!msg.submit]) };
}
// ── Step 2: real control of web tabs ────────────────────────────────────────
// Chrome/Edge/Brave: real mouse and keyboard through the browser's debugging connection ("debugger" permission in
// manifest.json; Chrome cannot make it optional. Chrome shows its own "started debugging this browser" bar while
// PlazCode works in a tab). Firefox has none: in-page events, which some sites and every canvas app ignore; said in
// each answer.
const controlDebug = new Map(); // tabId -> idle timer
async function canDebug() {
  return !!(chrome.debugger && typeof chrome.debugger.attach === "function");
}
function debugBump(tabId) {
  clearTimeout(controlDebug.get(tabId));
  controlDebug.set(tabId, setTimeout(() => { controlLiveStop(tabId).finally(() => debugDetach(tabId)); }, 20000));
}
async function debugAttach(tabId) {
  if (!controlDebug.has(tabId)) await chrome.debugger.attach({ tabId }, "1.3");
  debugBump(tabId);
}
async function debugDetach(tabId) {
  if (!controlDebug.has(tabId)) return;
  clearTimeout(controlDebug.get(tabId)); controlDebug.delete(tabId);
  try { await chrome.debugger.detach({ tabId }); } catch {}
}
const cdp = (tabId, method, params) => chrome.debugger.sendCommand({ tabId }, method, params || {});
if (chrome.debugger && chrome.debugger.onDetach) {
  chrome.debugger.onDetach.addListener((source, reason) => {
    const tabId = source && source.tabId;
    if (!Number.isInteger(tabId)) return;
    clearTimeout(controlDebug.get(tabId)); controlDebug.delete(tabId);
    // The person pressed Cancel on the browser's "started debugging" bar: that is Stop.
    if (reason === "canceled_by_user") controlEvent({ event: "stop" }, { tab: { id: tabId }, id: chrome.runtime.id });
  });
}
// The fixed always-ask list (whatever the approval mode): typing into a password or card field, and pressing a
// button that pays, buys, sends, deletes or transfers. Runs in the page.
// The always-ask question: English for the AI tab's records, plus a fixed sentence with slots (confirmKey) that the
// AI tab translates for the person (step 7).
function controlConfirm(ask, tab, enter) {
  const page = String(tab.title || tab.url).slice(0, 60);
  const pressed = /^press "(.*)"$/.exec(ask);
  const confirmKey = pressed ? 'PlazCode wants to press "{button}" in "{page}".' : "PlazCode wants to " + (enter ? ask.replace(/^type into /, "press Enter in ") : ask) + ' in "{page}".';
  const confirmValues = pressed ? { button: pressed[1], page } : { page };
  return { ok: false, confirm: confirmKey.replace(/\{(button|page)\}/g, (m, k) => confirmValues[k]), confirmKey, confirmValues };
}
function controlSensitive(kind, x, y) {
  const label = (el) => String(el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("title") || "").trim().replace(/\s+/g, " ").slice(0, 60);
  const field = (el) => {
    if (!el || !el.matches) return "";
    const type = String(el.getAttribute("type") || "").toLowerCase(), auto = String(el.getAttribute("autocomplete") || "").toLowerCase(), name = String((el.name || "") + " " + (el.id || "")).toLowerCase();
    if (type === "password" || /current-password|new-password/.test(auto)) return "type into a password field";
    if (/^cc-|\scc-/.test(auto) || /card.?(number|num|no)|cvc|cvv|security.?code/.test(name)) return "type into a payment card field";
    return "";
  };
  if (kind === "type") return field(document.activeElement);
  const hit = document.elementFromPoint(x, y);
  if (!hit) return "";
  const own = field(hit);
  if (own) return own.replace("type into", "click into");
  const button = hit.closest("button, a, [role=button], input[type=submit], input[type=button]");
  if (button && /\b(pay|buy|purchase|place (?:your )?order|checkout|check out|send|delete|remove|transfer|confirm payment)\b/i.test(label(button))) return 'press "' + label(button) + '"';
  return "";
}
const KEYS = { Enter: [13, "\r"], Tab: [9, ""], Escape: [27, ""], Backspace: [8, ""], Delete: [46, ""], ArrowUp: [38, ""], ArrowDown: [40, ""], ArrowLeft: [37, ""], ArrowRight: [39, ""],
  Home: [36, ""], End: [35, ""], PageUp: [33, ""], PageDown: [34, ""], Space: [32, " "] };
function parseKey(raw) {
  const parts = String(raw || "").split("+").map((p) => p.trim()).filter(Boolean);
  if (!parts.length || parts.length > 4) return null;
  let modifiers = 0, key = parts.pop();
  for (const m of parts) { const l = m.toLowerCase(); if (l === "alt") modifiers |= 1; else if (l === "ctrl" || l === "control") modifiers |= 2; else if (l === "meta" || l === "cmd" || l === "command") modifiers |= 4; else if (l === "shift") modifiers |= 8; else return null; }
  const named = Object.keys(KEYS).find((k) => k.toLowerCase() === key.toLowerCase());
  if (named) return { key: named === "Space" ? " " : named, code: named === "Space" ? "Space" : named, vk: KEYS[named][0], text: modifiers & 7 ? "" : KEYS[named][1], modifiers };
  if (key.length !== 1) return null;
  const upper = key.toUpperCase();
  return { key, code: /[A-Z]/.test(upper) ? "Key" + upper : /[0-9]/.test(key) ? "Digit" + key : "", vk: upper.charCodeAt(0), text: modifiers & 7 ? "" : key, modifiers };
}
// The extension's own rules do not let the worker fetch data: addresses, so pictures are decoded here.
function base64Blob(data, type) {
  const bin = atob(String(data || "")), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
// A picture of the target tab in CSS pixels (so its x/y are the ones tab_click_at takes), at most 1400 wide.
async function controlPicture(tab, debug) {
  const run = async (func, args) => (await chrome.scripting.executeScript({ target: { tabId: tab.id }, args: args || [], func }))[0].result;
  const view = await run(() => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio || 1 }));
  await run((on) => globalThis.__plazcodeControl && globalThis.__plazcodeControl.veil(on), [true]);
  let blob;
  try {
    if (debug) {
      await debugAttach(tab.id);
      const shot = await cdp(tab.id, "Page.captureScreenshot", { format: "png", fromSurface: true });
      blob = base64Blob(shot.data, "image/png");
    } else if (typeof chrome.tabs.captureTab === "function") {
      blob = base64Blob(String(await chrome.tabs.captureTab(tab.id, { format: "png" })).replace(/^data:[^,]*,/, ""), "image/png"); // Firefox: any tab
    } else {
      // Chrome lets an extension take pictures of tabs only through the debugging connection (or right after the
      // person clicks the PlazCode icon); a browser without it gets no picture.
      throw new Error("This browser does not let PlazCode take a picture of the tab. Use tab_read to read the page.");
    }
  } finally { await run((on) => globalThis.__plazcodeControl && globalThis.__plazcodeControl.veil(on), [false]); }
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, 1400 / view.w), w = Math.round(view.w * scale), h = Math.round(view.h * scale);
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  const out = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
  const bytes = new Uint8Array(await out.arrayBuffer());
  let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { data: btoa(bin), w, h, scale, view };
}
const CONTROL_V2_TOOLS = new Set(["tab_screenshot", "tab_click_at", "tab_type_text", "tab_key", "tab_scroll_at", "tab_navigate", "tab_open"]);
async function controlV2Tool(msg, sender) {
  const name = msg.type, debug = await canDebug();
  const how = debug ? "" : " (in-page input: some sites and canvas apps ignore it; this browser gives extensions no real mouse and keyboard)";
  if (name === "tab_open") {
    const url = String(msg.url || "");
    if (!/^https?:\/\//i.test(url) || CONTROL_STORES.test(url)) return { ok: false, error: "tab_open takes a web address starting with http:// or https://." };
    const tab = await chrome.tabs.create({ url, active: false });
    return { ok: true, text: "Opened " + url + " in a new tab (tabId " + tab.id + "). Pass tabId " + tab.id + " to the next tab_* command to work there." };
  }
  const tab = await resolveTab(msg);
  if (!tab) return { ok: false, error: "no target tab (open a page, or pass url_contains or tabId)" };
  const entered = await controlEnter(tab, msg, sender);
  if (entered.error) return { ok: false, error: entered.error };
  const run = async (func, args) => (await chrome.scripting.executeScript({ target: { tabId: tab.id }, args: args || [], func }))[0].result;
  const point = () => { const x = Number(msg.x), y = Number(msg.y); return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 ? [x, y] : null; };
  const askFirst = async (kind, at) => {
    if (msg.confirmed === true) return "";
    return await run(controlSensitive, [kind, at ? at[0] : 0, at ? at[1] : 0]) || "";
  };
  if (name === "tab_navigate") {
    const url = String(msg.url || "");
    if (!/^https?:\/\//i.test(url) || CONTROL_STORES.test(url) || isProviderUrl(url)) return { ok: false, error: "tab_navigate takes a web address starting with http:// or https:// (not an AI chat or the extension store)." };
    await chrome.tabs.update(tab.id, { url });
    const until = Date.now() + 20000;
    while (Date.now() < until) { await new Promise((r) => setTimeout(r, 250)); const now = await chrome.tabs.get(tab.id).catch(() => null); if (!now) break; if (now.status === "complete" && now.url && now.url !== tab.url) break; }
    return { ok: true, text: "Went to " + url + "." };
  }
  if (name === "tab_screenshot") {
    let pic;
    try { pic = await controlPicture(tab, debug); } catch (error) { return { ok: false, error: String(error && error.message || error) }; }
    return { ok: true, text: "Picture of the tab \"" + String(tab.title || "").slice(0, 80) + "\" (" + pic.w + "x" + pic.h + "). For tab_click_at and tab_scroll_at use x/y in this picture's pixels" + (pic.scale < 1 ? " divided by " + pic.scale.toFixed(3) : "") + ".", images: [{ mimeType: "image/jpeg", data: pic.data }], scale: pic.scale };
  }
  if (name === "tab_click_at" || name === "tab_scroll_at") {
    const at = point();
    if (!at) return { ok: false, error: name + " needs x and y (CSS pixels of the visible page, as in tab_screenshot)." };
    if (name === "tab_click_at") { const ask = await askFirst("click", at); if (ask) return controlConfirm(ask, tab, false); }
    const target = await run((x, y) => { const el = document.elementFromPoint(x, y); return el ? (el.tagName.toLowerCase() + (el.innerText ? ' "' + el.innerText.trim().replace(/\s+/g, " ").slice(0, 40) + '"' : "")) : "nothing"; }, at);
    await run((x, y) => globalThis.__plazcodeControl.moveTo(x, y), at);
    const row = controlTabs.get(tab.id);
    if (row && (row.paused || row.stoppedAt)) return { ok: false, error: "The person took over the tab just before the action, so nothing was done." };
    if (name === "tab_scroll_at") {
      const dy = Math.max(-5000, Math.min(5000, Number(msg.dy) || 600)), dx = Math.max(-5000, Math.min(5000, Number(msg.dx) || 0));
      if (debug) { await debugAttach(tab.id); await run((ms) => globalThis.__plazcodeControl.expect(ms), [1500]); await cdp(tab.id, "Input.dispatchMouseEvent", { type: "mouseWheel", x: at[0], y: at[1], deltaX: dx, deltaY: dy }); }
      else await run((x, y, dx, dy) => { let el = document.elementFromPoint(x, y); while (el && el !== document.documentElement && !(el.scrollHeight > el.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement; (el && el !== document.documentElement ? el : window).scrollBy(dx, dy); }, [at[0], at[1], dx, dy]);
      return { ok: true, text: "Scrolled " + dy + " at (" + Math.round(at[0]) + ", " + Math.round(at[1]) + ") over " + target + how + "." };
    }
    const button = msg.button === "right" ? "right" : "left", clicks = msg.double ? 2 : 1;
    await run(() => globalThis.__plazcodeControl.press());
    if (debug) {
      await debugAttach(tab.id);
      await run((ms) => globalThis.__plazcodeControl.expect(ms), [1500]);
      const base = { x: at[0], y: at[1], button, buttons: button === "right" ? 2 : 1 };
      await cdp(tab.id, "Input.dispatchMouseEvent", { type: "mouseMoved", x: at[0], y: at[1] });
      for (let i = 1; i <= clicks; i++) { await cdp(tab.id, "Input.dispatchMouseEvent", { ...base, type: "mousePressed", clickCount: i }); await cdp(tab.id, "Input.dispatchMouseEvent", { ...base, type: "mouseReleased", clickCount: i }); }
    } else {
      await run((x, y, button, clicks) => {
        const el = document.elementFromPoint(x, y); if (!el) return;
        const opts = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: button === "right" ? 2 : 0, view: window };
        for (let i = 1; i <= clicks; i++) {
          el.dispatchEvent(new PointerEvent("pointerdown", opts)); el.dispatchEvent(new MouseEvent("mousedown", { ...opts, detail: i }));
          if (el.focus) el.focus();
          el.dispatchEvent(new PointerEvent("pointerup", opts)); el.dispatchEvent(new MouseEvent("mouseup", { ...opts, detail: i }));
          el.dispatchEvent(new MouseEvent(button === "right" ? "contextmenu" : "click", { ...opts, detail: i }));
        }
        if (clicks === 2) el.dispatchEvent(new MouseEvent("dblclick", { ...opts, detail: 2 }));
      }, [at[0], at[1], button, clicks]);
    }
    return { ok: true, text: (clicks === 2 ? "Double-clicked" : button === "right" ? "Right-clicked" : "Clicked") + " at (" + Math.round(at[0]) + ", " + Math.round(at[1]) + ") on " + target + how + "." };
  }
  if (name === "tab_type_text") {
    const text = String(msg.text == null ? "" : msg.text);
    if (!text || text.length > 20000) return { ok: false, error: "tab_type_text needs text (at most 20,000 characters). Click the field first with tab_click_at." };
    const ask = await askFirst("type");
    if (ask) return controlConfirm(ask, tab, false);
    const into = await run(() => { const el = document.activeElement; return el && el !== document.body ? el.tagName.toLowerCase() : ""; });
    if (!into) return { ok: false, error: "No field is selected in that tab. Click the field first with tab_click_at, then type." };
    await run(() => globalThis.__plazcodeControl.press());
    if (debug) { await debugAttach(tab.id); await run((ms) => globalThis.__plazcodeControl.expect(ms), [Math.min(5000, 800 + text.length * 5)]); await cdp(tab.id, "Input.insertText", { text }); }
    else await run((text) => { const el = document.activeElement; if ("value" in el && typeof el.setRangeText === "function") { try { el.setRangeText(text, el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length, "end"); } catch { el.value += text; } el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" })); el.dispatchEvent(new Event("change", { bubbles: true })); } else document.execCommand("insertText", false, text); }, [text]);
    return { ok: true, text: "Typed " + text.length + " characters into <" + into + ">" + how + "." };
  }
  if (name === "tab_key") {
    const key = parseKey(msg.key);
    if (!key) return { ok: false, error: 'tab_key takes one key, optionally with Ctrl/Shift/Alt/Meta: for example "Enter", "Tab", "Escape", "ArrowDown", "Ctrl+A", "Shift+Tab".' };
    if (key.key === "Enter") { const ask = await askFirst("type"); if (ask) return controlConfirm(ask, tab, true); }
    if (debug) {
      await debugAttach(tab.id); await run((ms) => globalThis.__plazcodeControl.expect(ms), [1500]);
      const base = { key: key.key, code: key.code, windowsVirtualKeyCode: key.vk, nativeVirtualKeyCode: key.vk, modifiers: key.modifiers };
      await cdp(tab.id, "Input.dispatchKeyEvent", { ...base, type: key.text ? "keyDown" : "rawKeyDown", text: key.text || undefined });
      await cdp(tab.id, "Input.dispatchKeyEvent", { ...base, type: "keyUp" });
    } else await run((k) => { const el = document.activeElement || document.body; const o = { key: k.key, code: k.code, keyCode: k.vk, bubbles: true, cancelable: true, ctrlKey: !!(k.modifiers & 2), shiftKey: !!(k.modifiers & 8), altKey: !!(k.modifiers & 1), metaKey: !!(k.modifiers & 4) }; el.dispatchEvent(new KeyboardEvent("keydown", o)); el.dispatchEvent(new KeyboardEvent("keyup", o)); if (k.key === "Enter" && el.form && el.form.requestSubmit) el.form.requestSubmit(); }, [key]);
    return { ok: true, text: "Pressed " + String(msg.key) + how + "." };
  }
  return { ok: false, error: "Unknown tab command." };
}
// ── Step 3: live picture of the controlled tab ─────────────────────────────
// While PlazCode works in a tab, a few pictures a second go to (a) the AI chat that is working there, which shows a
// live card unless the person is already looking at that tab, and (b) any open PlazCode live view (side panel or
// docked window). Chrome/Edge/Brave: the browser's own screen stream over the debugging connection. Firefox:
// tabs.captureTab twice a second. If neither works (for example Chrome refuses the connection): no picture; the card
// says so.
const controlLive = new Map();   // tabId -> { by, lastAt, sentAt, poll }
const controlViewers = new Set(); // ports from core/control-view.html
const FRAME_GAP = 220;            // at most about 4 pictures a second
async function controlLooking(tabId) {
  try { const tab = await chrome.tabs.get(tabId); if (!tab.active) return false; const win = await chrome.windows.get(tab.windowId); return !!win.focused; } catch { return false; }
}
async function controlSendFrame(tabId, data) {
  const live = controlLive.get(tabId);
  if (!live) return;
  const now = Date.now();
  if (now - live.sentAt < FRAME_GAP) return;
  live.sentAt = now;
  let tab = null; try { tab = await chrome.tabs.get(tabId); } catch { return; }
  const row = controlTabs.get(tabId) || {};
  const frame = { type: "rs-control-frame", tabId, data, title: String(tab.title || "").slice(0, 120), url: String(tab.url || "").slice(0, 300), paused: !!row.paused, accent: row.accent || "", at: now };
  for (const port of controlViewers) { if (port.watch === tabId) { try { port.postMessage(frame); } catch {} } }
  // No card while the person is looking at that tab already.
  if (Number.isInteger(live.by) && live.by !== ask.tabId && !(await controlLooking(tabId))) chrome.tabs.sendMessage(live.by, frame).catch(() => {});
}
async function controlLiveStart(tabId, by) {
  let live = controlLive.get(tabId);
  if (live) { live.lastAt = Date.now(); if (Number.isInteger(by)) live.by = by; return; }
  live = { by, lastAt: Date.now(), sentAt: 0, poll: 0, cast: false };
  controlLive.set(tabId, live);
  if (await canDebug()) {
    try {
      await debugAttach(tabId);
      await cdp(tabId, "Page.enable");
      await cdp(tabId, "Page.startScreencast", { format: "jpeg", quality: 55, maxWidth: 960, maxHeight: 720, everyNthFrame: 1 });
      live.cast = true;
    } catch { live.cast = false; }
  }
  if (!live.cast && typeof chrome.tabs.captureTab === "function") {
    live.poll = setInterval(async () => {
      try { const url = await chrome.tabs.captureTab(tabId, { format: "jpeg", quality: 55 }); controlSendFrame(tabId, String(url).replace(/^data:[^,]*,/, "")); } catch {}
    }, 500);
  }
  if (!live.cast && !live.poll && Number.isInteger(by)) {
    chrome.tabs.sendMessage(by, { type: "rs-control-frame", tabId, data: "", note: "No live picture of this tab in this browser.", title: "", url: "", at: Date.now() }).catch(() => {});
  }
}
async function controlLiveStop(tabId) {
  const live = controlLive.get(tabId);
  if (!live) return;
  controlLive.delete(tabId);
  clearInterval(live.poll);
  if (live.cast) { try { await cdp(tabId, "Page.stopScreencast"); } catch {} }
  const end = { type: "rs-control-end", tabId };
  for (const port of controlViewers) { if (port.watch === tabId) { try { port.postMessage(end); } catch {} } }
  if (Number.isInteger(live.by)) chrome.tabs.sendMessage(live.by, end).catch(() => {});
}
if (chrome.debugger && chrome.debugger.onEvent) {
  chrome.debugger.onEvent.addListener((source, method, params) => {
    if (method !== "Page.screencastFrame" || !source || !Number.isInteger(source.tabId)) return;
    cdp(source.tabId, "Page.screencastFrameAck", { sessionId: params.sessionId }).catch(() => {});
    if (controlLive.has(source.tabId)) controlSendFrame(source.tabId, params.data);
  });
}
// The live picture ends 20 s after the last action (when the glow has gone), at Stop and when the tab closes.
if (typeof setInterval === "function") setInterval(() => { for (const [tabId, live] of controlLive) if (Date.now() - live.lastAt > 20000) controlLiveStop(tabId); }, 2000);
if (chrome.runtime && chrome.runtime.onConnect) chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "plazcode-control-view" || !port.sender || port.sender.id !== chrome.runtime.id || !/\/core\/(?:control-view|ask)\.html/.test(String(port.sender.url || ""))) return;
  controlViewers.add(port);
  port.onMessage.addListener((m) => {
    if (!CONTROL_V2 || !m) return;
    if (Number.isInteger(m.watch)) port.watch = m.watch;
    if (port.watch === -1 && m.action) { bridgeFetch(RUST_ROBLOX_HTTP + "/api/desktop/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: m.action }) }).catch(() => {}); return; }
    if (m.action === "stop" && Number.isInteger(port.watch)) { controlEvent({ event: "stop" }, { tab: { id: port.watch }, id: chrome.runtime.id }); chrome.scripting.executeScript({ target: { tabId: port.watch }, func: () => globalThis.__plazcodeControl && globalThis.__plazcodeControl.hide() }).catch(() => {}); }
    if (m.action === "pause" && Number.isInteger(port.watch)) { const row = controlTabs.get(port.watch); if (row) row.paused = true; }
    if (m.action === "resume" && Number.isInteger(port.watch)) { const row = controlTabs.get(port.watch); if (row) row.paused = false; }
  });
  port.onDisconnect.addListener(() => controlViewers.delete(port));
});
// "Enlarge" on the card: the browser's side panel next to the AI chat, or (older Chrome, Firefox, or when the browser
// refuses) a small window docked to the right side of the screen.
async function controlWatch(tabId, sender) {
  const page = "core/control-view.html?tab=" + tabId;
  const from = sender && sender.tab;
  if (chrome.sidePanel && typeof chrome.sidePanel.open === "function" && from && Number.isInteger(from.id)) {
    try {
      await chrome.sidePanel.setOptions({ tabId: from.id, path: page, enabled: true });
      await chrome.sidePanel.open({ tabId: from.id });
      return { ok: true, where: "side panel" };
    } catch {}
  }
  let left, width = 520, height = 720, top;
  try { const win = from ? await chrome.windows.get(from.windowId) : null; if (win) { left = Math.max(0, (win.left || 0) + (win.width || 1200) - width); top = win.top; height = Math.max(400, win.height || height); } } catch {}
  await chrome.windows.create({ url: chrome.runtime.getURL(page), type: "popup", width, height, left, top, focused: false });
  return { ok: true, where: "window" };
}

// ── Step 4: "Ask PlazCode" side chat ───────────────────────────────────────
// The panel (core/ask.html: Chrome's side panel, or a window docked to the right) is the person's chat. Behind it,
// one background chat on the AI site they already use with PlazCode (opened like a helper agent window) does the
// work as an AgentScript session. Every question carries a fresh picture of the shared tab. Control of that tab is
// off unless the person switches it on in the panel; then steps 1 and 2 apply, with approvals shown in the panel.
const ask = { tabId: null, windowId: null, busy: false, approvals: new Map(), seq: 0, share: null };
const askPorts = new Set();
const askPost = (m) => { for (const port of askPorts) { try { port.postMessage(m); } catch {} } };
// The panel translates text that is one of PlazCode's own sentences; key + values carry a sentence with slots.
const askSay = (text, kind, key, values) => askPost({ type: "ask-note", kind: kind || "note", text, key, values });
async function askSiteUrl() {
  const tabs = (await chrome.tabs.query({})).filter((t) => t.url && isProviderUrl(t.url) && t.id !== ask.tabId && !(helperRoster && helperRoster.byTab && helperRoster.byTab(t.id)));
  tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  for (const tab of tabs) {
    try { const reply = await chrome.tabs.sendMessage(tab.id, { type: "rs-ask-site" }); if (reply && reply.ok && /^https:\/\//.test(reply.url || "")) return { url: reply.url, name: String(reply.name || "") }; } catch {}
  }
  return null;
}
async function askEnsure() {
  if (Number.isInteger(ask.tabId)) { try { await chrome.tabs.get(ask.tabId); return { ok: true }; } catch { ask.tabId = null; } }
  const site = await askSiteUrl();
  if (!site) return { ok: false, error: "Open your AI chat (ChatGPT, Claude, Gemini or another site PlazCode works with) in this browser once, then ask again. PlazCode uses that site for this chat." };
  const siteName = site.name || new URL(site.url).host;
  askSay("Opening a PlazCode chat on " + siteName + " in the background…", "note", "Opening a PlazCode chat on {site} in the background…", { site: siteName });
  const shape = { url: site.url, type: "popup", width: 980, height: 820, left: 40, top: 40 };
  let created = null;
  try { created = await chrome.windows.create({ ...shape, focused: false }); } catch { created = await chrome.windows.create(shape); }
  const tab = created && created.tabs && created.tabs[0];
  if (!tab) return { ok: false, error: "The background chat window could not be opened." };
  ask.tabId = tab.id; ask.windowId = created.id;
  tabEngines.set(tab.id, "local");
  try { await chrome.storage.session.set({ ["rs-tab-engine-" + tab.id]: "local" }); } catch {}
  if (!(await criticTabReady(tab.id))) return { ok: false, error: "The AI site did not load in the background chat window." };
  if (!(await helperPing(tab.id))) return { ok: false, error: "PlazCode is not running in the background chat window. Is the AI site signed in there?" };
  await criticSleep(1500);
  return { ok: true };
}
async function askShareTab(tabId) {
  if (!Number.isInteger(tabId)) return null;
  try { const tab = await chrome.tabs.get(tabId); return controlRefusal(tab, null) ? null : tab; } catch { return null; }
}
// Show "Shared with PlazCode" in the shared tab, and stream it to the panel, while sharing is on.
async function askShareMark(tab, on) {
  try {
    if (on) {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["core/control-overlay.js"] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, args: [controlWords], func: (w) => globalThis.__plazcodeControl.share(true, w) });
      const live = controlLive.get(tab.id);
      if (live) live.lastAt = Date.now(); else await controlLiveStart(tab.id, null);
    } else await chrome.scripting.executeScript({ target: { tabId: tab.id }, args: [controlWords], func: (w) => globalThis.__plazcodeControl && globalThis.__plazcodeControl.share(false, w) });
  } catch {}
}
async function askQuestion(m) {
  if (ask.busy) return askSay("PlazCode is still answering. Wait for it, or press Stop.", "error");
  const text = String(m.say || "").trim().slice(0, 8000);
  if (!text) return;
  ask.busy = true; askPost({ type: "ask-busy", busy: true });
  try {
    if (m.share && m.shareTabId === -1) {
      let images = [];
      try { images = [{ mimeType: "image/jpeg", data: await desktopPicture() }]; } catch (error) { askSay(String(error && error.message || error), "error"); }
      const ready = await askEnsure();
      if (!ready.ok) { askSay(ready.error, "error"); return; }
      const reply = await chrome.tabs.sendMessage(ask.tabId, { type: "rs-ask-run", ask: { text, images, control: !!m.control, share: { tabId: -1, title: "Your whole screen", url: "" } } });
      if (!reply || !reply.ok) { askSay(String(reply && reply.error || "The background chat did not take the question."), "error"); return; }
      return;
    }
    const tab = m.share ? await askShareTab(m.shareTabId) : null;
    if (m.share && !tab) askSay("That tab cannot be shared (browser pages, extension pages and AI chats are never shared). Asking without a picture.");
    let images = [];
    if (tab) {
      try { const pic = await controlPicture(tab, await canDebug()); images = [{ mimeType: "image/jpeg", data: pic.data }]; }
      catch (error) { askPost({ type: "ask-permission", text: String(error && error.message || error) }); }
    }
    const ready = await askEnsure();
    if (!ready.ok) { askSay(ready.error, "error"); return; }
    const reply = await chrome.tabs.sendMessage(ask.tabId, { type: "rs-ask-run", ask: { text, images, control: !!(m.control && tab), share: tab ? { tabId: tab.id, title: String(tab.title || "").slice(0, 120), url: String(tab.url || "").slice(0, 300) } : null } });
    if (!reply || !reply.ok) { askSay(String(reply && reply.error || "The background chat did not take the question."), "error"); return; }
    return; // the answer arrives as "ask_reply" from the background chat
  } catch (error) { askSay(String(error && error.message || error).slice(0, 300), "error"); }
  ask.busy = false; askPost({ type: "ask-busy", busy: false });
}
// From the background chat (main.js): the answer, a progress line, or an approval question for the person.
async function askFromChat(msg, sender) {
  if (!sender || !sender.tab || sender.tab.id !== ask.tabId) return { ok: false, error: "Not the Ask PlazCode chat." };
  if (msg.type === "ask_reply") { ask.busy = false; askPost({ type: "ask-reply", status: String(msg.status || "done"), text: String(msg.text || "").slice(0, 60000) }); askPost({ type: "ask-busy", busy: false }); return { ok: true }; }
  if (msg.type === "ask_step") { askPost({ type: "ask-step", text: String(msg.text || "").slice(0, 200) }); return { ok: true }; }
  if (msg.type === "ask_approve") {
    if (!askPorts.size) return { ok: true, allowed: false };
    const id = ++ask.seq;
    const answer = new Promise((resolve) => { ask.approvals.set(id, resolve); setTimeout(() => { if (ask.approvals.delete(id)) resolve(false); }, 300000); });
    askPost({ type: "ask-approve", id, title: String(msg.title || "PlazCode wants to do something").slice(0, 240), detail: String(msg.detail || "").slice(0, 600), kicker: String(msg.kicker || "").slice(0, 80) });
    return { ok: true, allowed: await answer };
  }
  return { ok: false };
}
if (chrome.runtime && chrome.runtime.onConnect) chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "plazcode-ask" || !port.sender || port.sender.id !== chrome.runtime.id || !/\/core\/ask\.html/.test(String(port.sender.url || ""))) return;
  askPorts.add(port);
  port.postMessage({ type: "ask-busy", busy: ask.busy, enabled: CONTROL_V2 });
  port.onMessage.addListener(async (m) => {
    if (!CONTROL_V2 || !m) return;
    controlKeepWords(m.words);
    if (typeof m.say === "string") askQuestion(m);
    if (Number.isInteger(m.approve)) { const resolve = ask.approvals.get(m.approve); if (resolve) { ask.approvals.delete(m.approve); resolve(m.allowed === true); } }
    if (m.stop && Number.isInteger(ask.tabId)) { chrome.tabs.sendMessage(ask.tabId, { type: "rs-ask-stop" }).catch(() => {}); for (const [id, resolve] of ask.approvals) { ask.approvals.delete(id); resolve(false); } }
    if ("sharing" in m && m.sharing && m.shareTabId === -1) {
      // Step 6: the whole screen. The app takes the pictures (Windows, Mac); kept alive while the panel is open.
      if (ask.share && ask.share !== -1) { const old = await askShareTab(ask.share); if (old) askShareMark(old, false); }
      const ok = await askScreenShare(true);
      ask.share = ok.ok ? -1 : null;
      port.postMessage({ type: "ask-share", tabId: ok.ok ? -1 : null, title: ok.ok ? "Your whole screen" : "", url: "", screenRefused: ok.ok ? "" : ok.error });
      return;
    }
    if ("sharing" in m) {
      if (ask.share === -1) { await askScreenShare(false); ask.share = null; }
      const tab = m.sharing ? await askShareTab(m.shareTabId) : null;
      if (ask.share && (!tab || ask.share !== tab.id)) { const old = await askShareTab(ask.share); if (old) askShareMark(old, false); ask.share = null; }
      // The panel says "shared" only once the mark is showing in that tab.
      if (tab) { ask.share = tab.id; await askShareMark(tab, true); }
      port.postMessage({ type: "ask-share", tabId: tab ? tab.id : null, title: tab ? String(tab.title || "") : "", url: tab ? String(tab.url || "") : "", refused: !!(m.sharing && !tab) });
    }
  });
  port.onDisconnect.addListener(async () => {
    askPorts.delete(port);
    if (!askPorts.size) {
      for (const [id, resolve] of ask.approvals) { ask.approvals.delete(id); resolve(false); }
      if (ask.share === -1) await askScreenShare(false);
      else if (ask.share) { const old = await askShareTab(ask.share); if (old) askShareMark(old, false); }
      ask.share = null;
    }
  });
});
// Step 6: share the whole screen. The app keeps sharing on for 30 s after each word from here.
let askScreenTimer = 0;
async function askScreenShare(on) {
  clearInterval(askScreenTimer); askScreenTimer = 0;
  const say = async (action) => { const r = await bridgeFetch(RUST_ROBLOX_HTTP + "/api/desktop/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }); return r.ok ? await r.json().catch(() => ({})) : { ok: false }; };
  if (!on) { try { await say("unshare"); } catch {} askScreenOn = false; desktopControlUpdate({ active: false }); return { ok: true }; }
  let reply = null;
  try { reply = await say("share"); } catch {}
  if (!reply || !reply.ok) return { ok: false, error: "Sharing the whole screen needs the PlazCode app (Windows or Mac) running. You can still share a tab." };
  // A first picture proves the app can see the screen (on a Mac this needs the Screen Recording permission).
  try {
    const test = await bridgeFetch(RUST_ROBLOX_HTTP + "/api/desktop/frame", { signal: AbortSignal.timeout(6000) });
    if (test.status !== 200) { const why = await test.text().catch(() => ""); await say("unshare").catch(() => {}); return { ok: false, error: why || "PlazCode could not take a picture of the screen on this computer." }; }
  } catch { return { ok: false, error: "PlazCode could not take a picture of the screen." }; }
  if (typeof setInterval === "function") askScreenTimer = setInterval(() => { say("share").catch(() => {}); }, 10000);
  askScreenOn = true;
  desktopControlUpdate({ sharing: true });
  return { ok: true };
}
let askScreenOn = false;
async function desktopPicture() {
  const response = await bridgeFetch(RUST_ROBLOX_HTTP + "/api/desktop/frame", { signal: AbortSignal.timeout(6000) });
  if (response.status !== 200) throw new Error((await response.text().catch(() => "")) || "PlazCode could not take a picture of the screen.");
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height); canvas.getContext("2d").drawImage(bitmap, 0, 0);
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 })).arrayBuffer());
  let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
// Open the Ask PlazCode panel: Chrome's side panel where the browser allows it, otherwise a docked window.
async function askOpen(windowId) {
  if (chrome.sidePanel && typeof chrome.sidePanel.open === "function" && Number.isInteger(windowId)) {
    try { await chrome.sidePanel.setOptions({ path: "core/ask.html", enabled: true }); await chrome.sidePanel.open({ windowId }); return { ok: true, where: "side panel" }; } catch {}
  }
  let left, top, width = 440, height = 760;
  try { const win = await chrome.windows.get(windowId); left = Math.max(0, (win.left || 0) + (win.width || 1200) - width); top = win.top; height = Math.max(480, win.height || height); } catch {}
  await chrome.windows.create({ url: chrome.runtime.getURL("core/ask.html?window=" + (Number.isInteger(windowId) ? windowId : "")), type: "popup", width, height, left, top });
  return { ok: true, where: "window" };
}
if (chrome.commands && chrome.commands.onCommand) {
  // The shortcut ("ask-plazcode", Alt+P by default, changeable on the browser's shortcuts page) is in manifest.json.
  chrome.commands.onCommand.addListener((command, tab) => { if (CONTROL_V2 && command === "ask-plazcode") askOpen(tab && tab.windowId).catch(() => {}); });
}

// ── Step 5: desktop apps (the app controls the screen; this worker shows the live picture and passes Stop on) ──
let desktopBy = null, desktopPoll = 0, desktopWasStopped = false, desktopAccentSent = "", desktopWordsSent = "";
const DESKTOP_TOOLS = new Set(["mouse_move", "mouse_click", "key_type", "focus_window", "launch_app", "screen_capture", "screen_record", "window_screenshot", "list_windows"]);
function desktopToolCall(msg, sender) {
  if (!CONTROL_V2 || !DESKTOP_TOOLS.has(String(msg.name || "").split("__").pop())) return;
  if (sender && sender.tab && Number.isInteger(sender.tab.id)) desktopBy = sender.tab.id;
  const accent = /^#[0-9a-f]{6}$/i.test(String(msg.accent || "")) ? msg.accent : "";
  controlKeepWords(msg.words);
  const words = controlWords ? JSON.stringify(controlWords) : "";
  const body = {};
  if (accent && accent !== desktopAccentSent) { desktopAccentSent = accent; body.accent = accent; }
  if (words && words !== desktopWordsSent) { desktopWordsSent = words; body.words = controlWords; }
  if (Object.keys(body).length) bridgeFetch(RUST_ROBLOX_HTTP + "/api/desktop/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
}
async function desktopFrame() {
  try {
    const response = await bridgeFetch(RUST_ROBLOX_HTTP + "/api/desktop/frame", { signal: AbortSignal.timeout(4000) });
    if (response.status !== 200) return;
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/jpeg", quality: 0.6 })).arrayBuffer());
    let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    const frame = { type: "rs-control-frame", tabId: -1, data: btoa(bin), title: "Your screen", url: "", paused: !!desktopPaused, accent: desktopAccentSent, at: Date.now() };
    for (const port of controlViewers) { if (port.watch === -1) { try { port.postMessage(frame); } catch {} } }
    if (Number.isInteger(desktopBy)) chrome.tabs.sendMessage(desktopBy, frame).catch(() => {});
  } catch {}
}
let desktopPaused = false;
// Called with the app's desktop_control status (every status read).
function desktopControlUpdate(dc) {
  if (!CONTROL_V2) return;
  // The screen picture keeps coming while PlazCode controls the desktop or while the whole screen is shared.
  const active = !!(dc && (dc.active || dc.paused || dc.sharing)) || (typeof askScreenOn !== "undefined" && askScreenOn), stopped = !!(dc && dc.stopped);
  desktopPaused = !!(dc && dc.paused);
  if (active && !desktopPoll && typeof setInterval === "function") { desktopFrame(); desktopPoll = setInterval(desktopFrame, 500); }
  if (!active && desktopPoll) {
    clearInterval(desktopPoll); desktopPoll = 0;
    const end = { type: "rs-control-end", tabId: -1 };
    for (const port of controlViewers) { if (port.watch === -1) { try { port.postMessage(end); } catch {} } }
    if (Number.isInteger(desktopBy)) chrome.tabs.sendMessage(desktopBy, end).catch(() => {});
  }
  // Stop on the screen (the app's label) is Stop for the AI chat that was using the computer.
  if (stopped && !desktopWasStopped && Number.isInteger(desktopBy)) chrome.tabs.sendMessage(desktopBy, { type: "rs-control-stop" }).catch(() => {});
  desktopWasStopped = stopped;
}

// What the person did in a controlled tab (sent by core/control-overlay.js from that tab only).
function controlEvent(msg, sender) {
  const tabId = sender && sender.tab && sender.tab.id;
  if (!Number.isInteger(tabId) || sender.id !== chrome.runtime.id) return;
  if (msg.event === "stop_share") {
    // "Stop sharing" in the shared tab itself.
    if (ask.share === tabId) { ask.share = null; askPost({ type: "ask-share", tabId: null, title: "", url: "", stoppedInTab: true }); }
    controlLiveStop(tabId);
    return;
  }
  const row = controlTabs.get(tabId);
  if (!row) return;
  if (msg.event === "paused") row.paused = true;
  else if (msg.event === "resume") row.paused = false;
  else if (msg.event === "stop") {
    row.paused = false; row.stoppedAt = Date.now();
    controlLiveStop(tabId).finally(() => debugDetach(tabId));
    // Stop in the tab is Stop for the AI: the chat that was working there ends its run.
    if (Number.isInteger(row.by)) chrome.tabs.sendMessage(row.by, { type: "rs-control-stop" }).catch(() => {});
  }
}
if (chrome.tabs && chrome.tabs.onRemoved) chrome.tabs.onRemoved.addListener((tabId) => { controlLiveStop(tabId); controlTabs.delete(tabId); clearTimeout(controlDebug.get(tabId)); controlDebug.delete(tabId); });

// Pick the tab a tab_* tool should act on: explicit tabId > a tab whose URL
// contains url_contains > the active tab in any window that is NOT a chat
// provider (so "control my browser" doesn't click the chat itself).
async function resolveTab(msg) {
  try {
    if (msg && msg.tabId != null) {
      const t = await chrome.tabs.get(Number(msg.tabId));
      return t || null;
    }
    const all = await chrome.tabs.query({});
    if (msg && msg.url_contains) {
      const needle = String(msg.url_contains).toLowerCase();
      return all.find((t) => (t.url || "").toLowerCase().includes(needle)) || null;
    }
    const isProvider = (u) => PROVIDER_URLS.some((p) => {
      const rx = new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*"));
      return rx.test(u || "");
    });
    const candidates = all.filter((t) => t.url && !isProvider(t.url));
    const active = candidates.find((t) => t.active);
    return active || candidates[candidates.length - 1] || all.find((t) => t.active) || null;
  } catch (_e) { return null; }
}

// Proc poll — keeps RS availability gated on the live Studio process
refreshProcStatus();
setInterval(refreshProcStatus, 5000);

// Wake/keepalive hooks.
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);

connect();
