// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// 1.24.34 control rework: the enlarged live view (side panel or docked window) of the tab PlazCode works in.
(() => {
  const tabId = Number(new URLSearchParams(location.search).get("tab"));
  const view = document.getElementById("view"), note = document.getElementById("note"), state = document.getElementById("state"), site = document.getElementById("site");
  const pause = document.getElementById("pause"), stop = document.getElementById("stop");
  let paused = false, drawing = false, next = null;
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
  const setPaused = (value) => { paused = value; document.body.classList.toggle("paused", value); state.textContent = value ? "Paused, you're in control" : "PlazCode is working"; pause.textContent = value ? "Resume" : "Pause"; };
  port.onMessage.addListener((m) => {
    if (!m || m.tabId !== tabId) return;
    if (m.type === "rs-control-end") { document.body.classList.add("ended"); state.textContent = "PlazCode has finished here"; if (view.hidden) { note.textContent = "Nothing to show."; } return; }
    if (m.type !== "rs-control-frame") return;
    document.body.classList.remove("ended");
    if (m.title || m.url) { document.title = "PlazCode live: " + (m.title || m.url); site.textContent = m.title ? m.title + " · " + (m.url ? new URL(m.url).host : "") : m.url; }
    if (/^#[0-9a-f]{6}$/i.test(m.accent || "")) document.documentElement.style.setProperty("--a", m.accent);
    if (!!m.paused !== paused) setPaused(!!m.paused);
    if (m.data) draw(m); else if (m.note) { note.textContent = m.note; note.hidden = false; }
  });
  pause.addEventListener("click", () => { setPaused(!paused); port.postMessage({ action: paused ? "pause" : "resume" }); });
  stop.addEventListener("click", () => { port.postMessage({ action: "stop" }); document.body.classList.add("ended"); state.textContent = "Stopped"; });
})();
