// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.25.0/ts/core/control-view.ts (TypeScript): edit that file, then run node development/1.25.0/ts/build.cjs.
// AgentScript control rework (1.25.0): the enlarged live view (side panel or docked window) of the tab PlazCode works in.
(async () => {
  type I18nApi = { t(text: string, values?: Record<string, unknown>): string; setLanguage(lang: string): void; mountStatic(root: Element): void };
  type ControlFrame = { type: string; tabId: number; title?: string; url?: string; accent?: string; paused?: boolean; data?: string; note?: string };
  // Step 7: PlazCode's language (the same files and setting as the toolbar menu). t() fills {slots} either way.
  const L = (globalThis as { PlazCodeI18n?: I18nApi }).PlazCodeI18n;
  const t = (text: string, values?: Record<string, unknown>): string => L ? L.t(text, values) : (values ? String(text).replace(/\{([A-Za-z0-9_]+)\}/g, (m, k) => k in values ? String(values[k]) : m) : String(text));
  try { const saved = await chrome.storage.local.get("rsLanguage"); if (L) { L.setLanguage((saved && saved.rsLanguage) || "en"); L.mountStatic(document.body); } } catch {}
  document.title = t(document.title);
  const tabId = Number(new URLSearchParams(location.search).get("tab"));
  const view = document.getElementById("view") as HTMLCanvasElement, note = document.getElementById("note") as HTMLElement, state = document.getElementById("state") as HTMLElement, site = document.getElementById("site") as HTMLElement;
  const pause = document.getElementById("pause") as HTMLButtonElement, stop = document.getElementById("stop") as HTMLButtonElement;
  let paused = false, drawing = false, next: ControlFrame | null = null;
  // Bar redesign: the Live / Paused / Ended tag in the header (drawn by the page's style from data-tag), in the person's language.
  const head = document.querySelector("header") as HTMLElement | null, tag = () => { if (head) head.dataset.tag = t(document.body.classList.contains("ended") ? "Ended" : paused ? "Paused" : "Live"); };
  tag();
  let port: ChromePort | null = null, reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const blob = (data: string) => { const bin = atob(data), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new Blob([bytes], { type: "image/jpeg" }); };
  async function draw(frame: ControlFrame) {
    if (drawing) { next = frame; return; }
    drawing = true;
    try {
      const bitmap = await createImageBitmap(blob(frame.data as string));
      if (view.width !== bitmap.width || view.height !== bitmap.height) { view.width = bitmap.width; view.height = bitmap.height; }
      (view.getContext("2d") as CanvasRenderingContext2D).drawImage(bitmap, 0, 0); bitmap.close();
      view.hidden = false; note.hidden = true;
    } catch {}
    drawing = false;
    if (next) { const f = next; next = null; draw(f); }
  }
  const setPaused = (value: boolean) => { paused = value; document.body.classList.toggle("paused", value); tag(); state.textContent = t(value ? "Paused, you're in control" : "PlazCode is working"); pause.textContent = t(value ? "Resume" : "Pause"); };
  function onMessage(m: ControlFrame | null | undefined) {
    if (!m || m.tabId !== tabId) return;
    if (m.type === "rs-control-end") { document.body.classList.add("ended"); tag(); state.textContent = t("PlazCode has finished here"); if (view.hidden) { note.textContent = t("Nothing to show."); } return; }
    if (m.type !== "rs-control-frame") return;
    document.body.classList.remove("ended"); tag();
    if (m.title || m.url) {
      const title = tabId === -1 ? t("Your screen") : m.title;
      document.title = t("PlazCode live: {name}", { name: title || m.url });
      let host = "";
      if (m.url) { try { host = new URL(m.url).host; } catch {} }
      site.textContent = title ? title + (host ? " · " + host : "") : (m.url || "");
    }
    if (/^#[0-9a-f]{6}$/i.test(m.accent || "")) document.documentElement.style.setProperty("--a", m.accent as string);
    if (!!m.paused !== paused) setPaused(!!m.paused);
    if (m.data) draw(m); else if (m.note) { note.textContent = t(m.note); note.hidden = false; }
  }
  function connectPort() {
    const p = chrome.runtime.connect({ name: "plazcode-control-view" });
    port = p;
    p.onMessage.addListener(onMessage);
    p.onDisconnect?.addListener?.(() => {
      if (port !== p) return;
      port = null;
      if (!chrome.runtime?.id || document.body.classList.contains("ended")) return;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!port && chrome.runtime?.id && !document.body.classList.contains("ended")) connectPort();
      }, 400);
    });
    try { p.postMessage({ watch: tabId }); } catch (err) { console.warn("[plazcode-control-view] watch failed:", err); }
  }
  function post(msg: Record<string, unknown>) {
    try {
      if (!port) connectPort();
      port?.postMessage(msg);
    } catch (err) {
      console.warn("[plazcode-control-view] postMessage failed:", err);
      port = null;
    }
  }
  connectPort();
  pause.addEventListener("click", () => { setPaused(!paused); post({ action: paused ? "pause" : "resume" }); });
  stop.addEventListener("click", () => { post({ action: "stop" }); document.body.classList.add("ended"); tag(); state.textContent = t("Stopped"); });
})();
