// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.25.0/ts/core/pref-sync.ts (TypeScript): edit that file, then run node development/1.25.0/ts/build.cjs.
// Settings shared between the extension and the PlazCode app (moved out of background.js, split as you go, 2026-11-20).
// Owner: "settings from the extension don't sync well / sync to the app". What went wrong, and what this does now:
// - A change made while the app was closed (or the bridge was down) only lived in memory; when the browser put the background
//   worker to sleep it was lost, and the next read of the app's settings put the old value back. Changes waiting to be sent
//   are now kept in storage ("rs-desktop-pending") and sent first, before anything is read from the app.
// - A read of the app's settings that started before a change finished after it, and put the old value back for a few
//   seconds (the setting flipped back and forth). A read now never touches a setting changed after the read began.
// - Monotonic epoch/revision and edit timestamps prevent stale WebSocket/HTTP snapshots from regressing newer state, and
//   prevent a waking secondary browser from overwriting newer desktop or primary-browser settings.
// - A failed send was retried every half second for ever; it now waits longer each time (up to 10 s).
// - The extension's own switches (Automatic Debugger, Stop playtest on error, Multi-Agent, Playtest when done, Check UI
//   when done) were never shared; they are now, so they show in the app and reach every browser with PlazCode.
// - A setting the app never had a choice for (it only has its default, see `_plazcodeSaved`) keeps the extension's value.
const PlazCodePrefSync = (() => {
  const KEYS = [
    "rsLanguage", "rsReadOnly", "rsConfirmDelete", "rsApprovalMode", "rsAllowedFolders", "rsWorkMode", "rsPermMode", "rsSounds", "rsStopMode",
    "rsInputLimitEnabled", "rsInputCharLimit", "rsOutputLimitEnabled", "rsOutputCharLimit", "rsRunLimitsEnabled", "rsToolBudget", "rsTaskMinutes",
    "rsVisualCheck", "rsContinuationOffer", "rsCommandCooldown", "rsFullStartup", "rsExtraThinking", "rsShowApproach", "rsPlanMode", "rsThinkingLevel",
    "rsForgeMode", "rsAutoFix", "rsBgMode", "rsTabKeepAwake", "rsCustomPrompt", "rsAppearance",
    "rsSidebarCollapsed", "rsExplorerAutoSync", "rsSkillAutoLearn", "rsSharedLearning", "rsAutoUpdate", "rsLuauCheck", "rsLuauMode",
    "rsAutoDebug", "rsAutoFixStopPlay", "rsMultiAgent", "rsPlaytestCheck", "rsUiCheck",
    "rsCompactOutputs", "rsParallelReads", "rsTaskLedger",
  ];
  const PENDING_KEY = "rs-desktop-pending";
  const META_KEY = "rs-desktop-pending-meta";
  type Prefs = Record<string, unknown>;
  type EditMeta = { at: number; baseEpoch: string; baseRev: number };
  type Store = { get(keys: string | string[]): Promise<Prefs>; set(items: Prefs): Promise<void>; remove(keys: string | string[]): Promise<void> };
  type Deps = {
    fetch: (url: string, init?: any) => Promise<{ ok: boolean; json(): Promise<any> }>;
    storage: Store;
    url: string;
    later?: (fn: () => void, ms: number) => unknown;
    cancel?: (id: unknown) => void;
    now?: () => number;
  };
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  function create(d: Deps) {
    const later = d.later || ((fn: () => void, ms: number) => setTimeout(fn, ms));
    const cancel = d.cancel || ((id: unknown) => clearTimeout(id as any));
    const wallNow = d.now || (() => Date.now());
    const pending = new Map<string, unknown>();        // local changes not yet confirmed by the app
    const pendingMeta = new Map<string, EditMeta>();   // edit timestamps + base epoch/revision per pending key
    const remoteWrites = new Map<string, string>();    // values PlazCode itself just wrote from the app (not local changes)
    const editedAt = new Map<string, number>();        // when each setting was last changed here (a counter)
    let edits = 0, quiet = 0, timer: unknown = null, inFlight = false, retry = 500, loaded: Promise<void> | null = null;
    let remoteEpoch = "", remoteRev = 0, lastEditAtMs = 0;
    const remoteKeyUpdatedAt: Record<string, number> = {};
    const nextTs = () => { lastEditAtMs = Math.max(wallNow(), lastEditAtMs + 1); return lastEditAtMs; };
    const timeout = () => { try { return AbortSignal.timeout(5000); } catch { return undefined; } };
    function load() {
      if (!loaded) loaded = (async () => {
        try {
          const got = await d.storage.get([PENDING_KEY, META_KEY]);
          const saved = got[PENDING_KEY];
          const meta = got[META_KEY] as { epoch?: unknown; rev?: unknown; edits?: Record<string, Partial<EditMeta>> } | undefined;
          if (meta && typeof meta === "object") {
            if (!remoteEpoch && typeof meta.epoch === "string") remoteEpoch = meta.epoch;
            if (!remoteRev && typeof meta.rev === "number" && Number.isFinite(meta.rev)) remoteRev = meta.rev;
          }
          if (saved && typeof saved === "object") for (const key of KEYS) if (key in (saved as Prefs) && !pending.has(key)) {
            pending.set(key, (saved as Prefs)[key]);
            const m = meta && meta.edits && meta.edits[key];
            if (m && typeof m === "object") {
              const at = typeof m.at === "number" && Number.isFinite(m.at) ? m.at : 0;
              const baseEpoch = typeof m.baseEpoch === "string" ? m.baseEpoch : remoteEpoch;
              const baseRev = typeof m.baseRev === "number" && Number.isFinite(m.baseRev) ? m.baseRev : remoteRev;
              pendingMeta.set(key, { at, baseEpoch, baseRev });
              if (at > lastEditAtMs) lastEditAtMs = at;
            }
          }
        } catch {}
      })();
      return loaded;
    }
    async function remember() {
      try {
        if (pending.size) {
          const editsMeta: Record<string, EditMeta> = {};
          for (const key of pending.keys()) {
            editsMeta[key] = pendingMeta.get(key) || { at: 0, baseEpoch: remoteEpoch, baseRev: remoteRev };
          }
          await d.storage.set({
            [PENDING_KEY]: Object.fromEntries(pending),
            [META_KEY]: { epoch: remoteEpoch, rev: remoteRev, edits: editsMeta },
          });
        } else {
          await d.storage.remove([PENDING_KEY, META_KEY]);
        }
      } catch {}
    }
    function schedule(ms: number) { if (timer) cancel(timer); timer = later(() => { timer = null; void push(); }, ms); }
    // From chrome.storage.onChanged (local area): a setting changed in the extension.
    function noteLocal(changes: Record<string, { newValue?: unknown }>) {
      if (quiet) return;
      let changed = false;
      for (const key of KEYS) {
        if (!changes[key]) continue;
        const value = changes[key].newValue;
        if (remoteWrites.has(key)) {
          const expected = remoteWrites.get(key);
          remoteWrites.delete(key);
          if (expected === JSON.stringify(value)) continue;
        }
        pending.set(key, value);
        pendingMeta.set(key, { at: nextTs(), baseEpoch: remoteEpoch, baseRev: remoteRev });
        editedAt.set(key, ++edits);
        changed = true;
      }
      if (changed) { retry = 500; void remember(); schedule(50); }
    }
    // The app's settings into the extension. `since`: the change counter when the read began; a setting changed later is left alone.
    async function apply(remote: unknown, since = Infinity): Promise<boolean> {
      await load();
      if (!remote || typeof remote !== "object") return false;
      const r = remote as Prefs;
      const incomingEpoch = typeof r._plazcodeEpoch === "string" ? r._plazcodeEpoch : "";
      const incomingRev = typeof r._plazcodeRev === "number" && Number.isFinite(r._plazcodeRev) ? r._plazcodeRev : null;
      if (incomingEpoch && incomingRev !== null) {
        if (remoteEpoch && incomingEpoch === remoteEpoch && incomingRev < remoteRev) return true;
        remoteEpoch = incomingEpoch;
        remoteRev = incomingRev;
      } else if (incomingRev !== null && !remoteEpoch) {
        if (incomingRev < remoteRev) return true;
        remoteRev = incomingRev;
      }
      if (r._plazcodeKeyUpdatedAt && typeof r._plazcodeKeyUpdatedAt === "object") {
        for (const [k, v] of Object.entries(r._plazcodeKeyUpdatedAt as Record<string, unknown>)) {
          if (typeof v === "number" && Number.isFinite(v)) remoteKeyUpdatedAt[k] = v;
        }
      }
      const chosen = Array.isArray(r._plazcodeSaved) ? new Set(r._plazcodeSaved as string[]) : null;
      const local = await d.storage.get(KEYS);
      const updates: Prefs = {};
      let keepLocal = false;
      for (const key of KEYS) {
        if (!(key in r) || pending.has(key) || (editedAt.get(key) || 0) > since) continue;
        // The app only has its default for this one: the extension's own choice wins and is sent to the app.
        if (chosen && !chosen.has(key) && local[key] !== undefined) {
          if (!same(local[key], r[key])) {
            pending.set(key, local[key]);
            pendingMeta.set(key, { at: nextTs(), baseEpoch: remoteEpoch, baseRev: remoteRev });
            keepLocal = true;
          }
          continue;
        }
        if (!same(local[key], r[key])) updates[key] = r[key];
      }
      if (Object.keys(updates).length) {
        for (const [key, value] of Object.entries(updates)) remoteWrites.set(key, JSON.stringify(value));
        try { await d.storage.set(updates); } catch (error) { for (const key of Object.keys(updates)) remoteWrites.delete(key); throw error; }
      }
      if (keepLocal) { void remember(); schedule(50); }
      return true;
    }
    async function push(all = false): Promise<boolean> {
      if (inFlight) return false;
      inFlight = true;
      let ok = false;
      try {
        await load();
        const prefs = all ? await d.storage.get(KEYS) : Object.fromEntries(pending);
        if (!Object.keys(prefs).length) { ok = true; return true; }
        const pushEdits = edits;
        const payload: Prefs = { ...prefs };
        const keyTimestamps: Record<string, number> = {};
        const keyBaseRev: Record<string, number> = {};
        const keyBaseEpoch: Record<string, string> = {};
        for (const key of Object.keys(prefs)) {
          const m = pendingMeta.get(key);
          keyTimestamps[key] = m ? m.at : 0;
          keyBaseRev[key] = m ? m.baseRev : remoteRev;
          if (m && m.baseEpoch) keyBaseEpoch[key] = m.baseEpoch;
        }
        payload._plazcodeBaseEpoch = remoteEpoch;
        payload._plazcodeBaseRev = remoteRev;
        payload._plazcodeKeyTimestamps = keyTimestamps;
        payload._plazcodeKeyBaseRev = keyBaseRev;
        if (Object.keys(keyBaseEpoch).length) payload._plazcodeKeyBaseEpoch = keyBaseEpoch;
        const response = await d.fetch(d.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: timeout() });
        ok = !!response && response.ok;
        if (ok) {
          let body: any = null;
          try { body = await response.json(); } catch {}
          const rejected = new Set<string>(Array.isArray(body && body._plazcodeRejected) ? body._plazcodeRejected : []);
          for (const [key, value] of Object.entries(prefs)) {
            if (!pending.has(key)) continue;
            const changedDuringPush = (editedAt.get(key) || 0) > pushEdits;
            if (!changedDuringPush && (same(pending.get(key), value) || rejected.has(key))) {
              pending.delete(key);
              pendingMeta.delete(key);
            }
          }
          retry = 500;
          await remember();
          const serverPrefs = body && (body.preferences || (body._plazcodeRev !== undefined ? body : null));
          if (serverPrefs && typeof serverPrefs === "object") {
            await apply(serverPrefs, pushEdits);
          }
        }
        return ok;
      } catch { return false; } finally {
        inFlight = false;
        if (pending.size) { const wait = ok ? 50 : retry; if (!ok) retry = Math.min(10000, retry * 2); schedule(wait); }
      }
    }
    async function parseJson(response: { ok: boolean; json(): Promise<any>; text?: () => Promise<string> } | null | undefined): Promise<any> {
      if (!response) return null;
      if (typeof response.text === "function") {
        const raw = await response.text();
        if (!raw.trim()) return {};
        try { return JSON.parse(raw); } catch { return null; }
      }
      if (typeof response.json === "function") {
        try { return await response.json(); } catch { return null; }
      }
      return null;
    }
    async function read(): Promise<Prefs | null> {
      const response = await d.fetch(d.url, { method: "GET", signal: timeout() });
      if (!response || !response.ok) return null;
      const body = await parseJson(response as any);
      return body && typeof body === "object" ? (body as Prefs) : null;
    }
    // Regular read (every health check). Changes waiting to be sent go first.
    async function pull(): Promise<boolean> {
      try {
        await load();
        if (pending.size && !(await push())) return false;
        const since = edits, remote = await read();
        return remote ? await apply(remote, since) : false;
      } catch { return false; }
    }
    // First contact with the app after the extension starts.
    async function initial(): Promise<boolean> {
      try {
        await load();
        if (pending.size && !(await push())) return false;
        const since = edits, remote = await read();
        if (!remote) return false;
        if (remote._plazcodeProfile || remote._plazcodePersisted === true || (typeof remote._plazcodeRev === "number" && remote._plazcodeRev > 0)) {
          if (typeof remote.rsCustomPrompt !== "string") {
            const existing = await d.storage.get("rsCustomPrompt");
            if (typeof existing.rsCustomPrompt === "string") {
              const seeded = await d.fetch(d.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
                rsCustomPrompt: existing.rsCustomPrompt,
                _plazcodeBaseEpoch: typeof remote._plazcodeEpoch === "string" ? remote._plazcodeEpoch : remoteEpoch,
                _plazcodeBaseRev: typeof remote._plazcodeRev === "number" ? remote._plazcodeRev : remoteRev,
                _plazcodeKeyTimestamps: { rsCustomPrompt: nextTs() },
              }), signal: timeout() });
              if (!seeded || !seeded.ok) return false;
              const saved = await parseJson(seeded as any);
              if (!saved || typeof saved !== "object") return false;
              return await apply({ _plazcodeSaved: remote._plazcodeSaved, ...(saved.preferences || saved) }, since);
            }
          }
          return await apply(remote, since);
        }
        const local = await d.storage.get(KEYS);
        if (KEYS.some((key) => local[key] !== undefined)) return await push(true);
        if (!(await apply(remote, since))) return false;
        return await push(true);
      } catch { return false; }
    }
    // Profile switch: everything waiting belongs to the old profile (its saved copy moves with that profile's data; the
    // extension restarts right after and reads the new profile's own).
    function reset() {
      pending.clear(); pendingMeta.clear(); remoteWrites.clear(); editedAt.clear();
      remoteEpoch = ""; remoteRev = 0; for (const k of Object.keys(remoteKeyUpdatedAt)) delete remoteKeyUpdatedAt[k];
      if (timer) cancel(timer); timer = null; retry = 500; loaded = Promise.resolve();
    }
    // Storage writes that are not the person's changes (profile switch): not sent to the app.
    async function silently<T>(work: () => Promise<T>): Promise<T> { quiet++; try { return await work(); } finally { later(() => { quiet--; }, 1000); } }
    return { apply, push, pull, initial, noteLocal, reset, silently, ready: () => load(), get pending() { return pending; } };
  }
  return { create, KEYS, PENDING_KEY, META_KEY };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodePrefSync;
