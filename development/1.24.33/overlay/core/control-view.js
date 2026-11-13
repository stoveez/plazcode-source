// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// AgentScript control rework (1.24.33): the enlarged live view (side panel or docked window) of the tab PlazCode works in.
(async () => {
  // Step 7: PlazCode's language (the same files and setting as the toolbar menu). t() fills {slots} either way.
  const L = globalThis.PlazCodeI18n;
  const t = (text, values) => L ? L.t(text, values) : (values ? String(text).replace(/\{([A-Za-z0-9_]+)\}/g, (m, k) => k in values ? String(values[k]) : m) : String(text));
  try { const saved = await chrome.storage.local.get("rsLanguage"); if (L) { L.setLanguage((saved && saved.rsLanguage) || "en"); L.mountStatic(document.body); } } catch {}
  document.title = t(document.title);
  const tabId = Number(new URLSearchParams(location.search).get("tab"));
  const view = document.getElementById("view"), note = document.getElementById("note"), state = document.getElementById("state"), site = document.getElementById("site");
  const pause = document.getElementById("pause"), stop = document.getElementById("stop");
  let paused = false, drawing = false, next = null;
  // Bar redesign: the Live / Paused / Ended tag in the header (drawn by the page's style from data-tag), in the person's language.
  const head = document.querySelector("header"), tag = () => { if (head) head.dataset.tag = t(document.body.classList.contains("ended") ? "Ended" : paused ? "Paused" : "Live"); };
  tag();
  const port = chrome.runtime.connect({ name: "plazcode-control-view" });
  port.postMessage({ watch: tabId });
  const blob = (data) => { const bin = atob(data), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new Blob([bytes], { type: "image/jpeg" }); };
  async function draw(frame) {
    if (drawing) { next = frame; return; }
    drawing = true;
    try {
      const bitmap = await createImageBitmap(blob(frame.data));
      if (view.width !== bitmap.width || view.height !== bitmap.height) { view.width = bitmap.width; view.height = bitmap.height; }
      view.getContext("2d").drawImage(bitmap, 0, 0); bitmap.close();
      view.hidden = false; note.hidden = true;
    } catch {}
    drawing = false;
    if (next) { const f = next; next = null; draw(f); }
  }
  const setPaused = (value) => { paused = value; document.body.classList.toggle("paused", value); tag(); state.textContent = t(value ? "Paused, you're in control" : "PlazCode is working"); pause.textContent = t(value ? "Resume" : "Pause"); };
  port.onMessage.addListener((m) => {
    if (!m || m.tabId !== tabId) return;
    if (m.type === "rs-control-end") { document.body.classList.add("ended"); tag(); state.textContent = t("PlazCode has finished here"); if (view.hidden) { note.textContent = t("Nothing to show."); } return; }
    if (m.type !== "rs-control-frame") return;
    document.body.classList.remove("ended"); tag();
    if (m.title || m.url) { const title = tabId === -1 ? t("Your screen") : m.title; document.title = t("PlazCode live: {name}", { name: title || m.url }); site.textContent = title ? title + (m.url ? " · " + new URL(m.url).host : "") : m.url; }
    if (/^#[0-9a-f]{6}$/i.test(m.accent || "")) document.documentElement.style.setProperty("--a", m.accent);
    if (!!m.paused !== paused) setPaused(!!m.paused);
    if (m.data) draw(m); else if (m.note) { note.textContent = t(m.note); note.hidden = false; }
  });
  pause.addEventListener("click", () => { setPaused(!paused); port.postMessage({ action: paused ? "pause" : "resume" }); });
  stop.addEventListener("click", () => { port.postMessage({ action: "stop" }); document.body.classList.add("ended"); tag(); state.textContent = t("Stopped"); });
})();
