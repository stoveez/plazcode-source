// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// 1.24.34 AgentScript control look (owner, 2026-11-12). Put into a web tab by the extension's worker while the AI
// works there: a glow around the page edges in the PlazCode theme colour, a "PlazCode is working here" label with
// Stop, and PlazCode's own cursor that glides to each target before a click or typing. Real input from the person
// (mouse movement, click, wheel, key) pauses the AI ("Paused, you're in control" + Resume); Escape stops it.
// Everything sits in a closed shadow root and ignores the mouse, except the label's two buttons, so the page is
// never blocked. Runs in the extension's own isolated world: the page cannot reach this object.
(() => {
  "use strict";
  if (globalThis.__plazcodeControl) return;
  const doc = document;
  const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
  const host = doc.createElement("plazcode-control");
  host.setAttribute("aria-live", "polite");
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:block";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>
  :host{all:initial}
  *{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .glow{position:fixed;inset:0;pointer-events:none;opacity:0;transition:opacity .35s ease;
    box-shadow:inset 0 0 0 2px var(--a),inset 0 0 22px 4px color-mix(in srgb,var(--a) 70%,transparent),inset 0 0 70px 14px color-mix(in srgb,var(--a) 32%,transparent)}
  .on .glow{opacity:1}
  .paused .glow{box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--a) 55%,#888),inset 0 0 26px 4px color-mix(in srgb,var(--a) 25%,transparent)}
  .label{position:fixed;top:0;left:50%;transform:translate(-50%,-110%);transition:transform .35s ease;pointer-events:auto;
    display:flex;align-items:center;gap:10px;padding:8px 10px 8px 16px;border-radius:0 0 12px 12px;color:#fff;font-size:13px;font-weight:600;
    background:linear-gradient(135deg,var(--a),color-mix(in srgb,var(--a) 62%,#000));box-shadow:0 6px 24px color-mix(in srgb,var(--a) 45%,transparent)}
  .on .label{transform:translate(-50%,0)}
  .dot{width:8px;height:8px;border-radius:50%;background:#fff;box-shadow:0 0 8px #fff}
  .paused .dot{background:transparent;border:2px solid #fff;box-shadow:none}
  button{all:unset;cursor:pointer;padding:4px 10px;border-radius:8px;background:rgba(255,255,255,.18);font-size:12px;font-weight:600;color:#fff}
  button:hover{background:rgba(255,255,255,.3)}
  button:focus-visible{outline:2px solid #fff;outline-offset:2px}
  .resume{display:none}.paused .resume{display:inline-block}
  .cursor{position:fixed;left:0;top:0;width:26px;height:26px;pointer-events:none;opacity:0;transform:translate(-100px,-100px);
    transition:transform .38s cubic-bezier(.3,.7,.25,1),opacity .2s ease;filter:drop-shadow(0 2px 6px color-mix(in srgb,var(--a) 70%,transparent))}
  .on .cursor.seen{opacity:1}
  .cursor.press{transition:transform .1s ease}
  .still .glow,.still .label,.still .cursor{transition:none}
  .sharing .glow{opacity:0}
</style>
<div class="frame" part="frame">
  <div class="glow"></div>
  <div class="label" role="status"><span class="dot"></span><span class="text">PlazCode is working here</span>
    <button class="resume" type="button">Resume</button><button class="stop" type="button">Stop</button></div>
  <svg class="cursor" viewBox="0 0 26 26" aria-hidden="true"><path d="M3 2l19 9.5-8.2 2.3L10 22z" fill="var(--a)" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>
</div>`;
  const frame = root.querySelector(".frame"), text = root.querySelector(".text"), cursor = root.querySelector(".cursor"), stopButton = root.querySelector(".stop");
  const state = { active: false, paused: false, stopped: false, x: -100, y: -100, idle: 0, expectUntil: 0 };
  const tell = (event) => { try { chrome.runtime.sendMessage({ type: "control_event", event }); } catch {} };
  const mount = () => { if (!host.isConnected) (doc.documentElement || doc.body).appendChild(host); };
  const idle = () => { clearTimeout(state.idle); state.idle = setTimeout(() => { if (!state.paused) api.hide(); }, 8000); };
  function setPaused(paused) {
    state.paused = paused;
    frame.classList.toggle("paused", paused);
    text.textContent = paused ? "Paused, you're in control" : "PlazCode is working here";
    if (paused) clearTimeout(state.idle); else idle();
  }
  // Only the person's own input counts. The AI's in-page events are not "trusted"; its real input (debugging
  // connection, step 2) is announced first with expect(), so it never pauses itself.
  function personal(event) {
    if (!state.active || state.paused || !event.isTrusted || Date.now() < state.expectUntil) return false;
    if (event.composedPath && event.composedPath().includes(host)) return false;
    if (event.type === "pointermove" || event.type === "mousemove") return Math.abs(event.movementX || 0) + Math.abs(event.movementY || 0) > 2;
    return true;
  }
  const onInput = (event) => {
    if (event.type === "keydown" && event.key === "Escape" && event.isTrusted && state.active && Date.now() >= state.expectUntil) { api.hide(); state.stopped = true; tell("stop"); return; }
    if (personal(event)) { setPaused(true); tell("paused"); }
  };
  for (const type of ["pointermove", "pointerdown", "wheel", "keydown"]) addEventListener(type, onInput, { capture: true, passive: true });
  root.querySelector(".stop").addEventListener("click", (event) => {
    if (!event.isTrusted) return;
    if (state.sharing && !state.active) { api.share(false); tell("stop_share"); return; }
    api.hide(); state.stopped = true; tell("stop");
  });
  root.querySelector(".resume").addEventListener("click", (event) => { if (!event.isTrusted) return; setPaused(false); tell("resume"); });
  const api = {
    show(options) {
      const o = options || {};
      if (typeof o.accent === "string" && /^#[0-9a-f]{6}$/i.test(o.accent.trim())) host.style.setProperty("--a", o.accent.trim());
      else if (!host.style.getPropertyValue("--a")) host.style.setProperty("--a", "#8b5cf6");
      mount();
      frame.classList.toggle("still", reduced());
      state.active = true; state.stopped = false;
      frame.classList.remove("sharing"); text.textContent = state.paused ? "Paused, you're in control" : "PlazCode is working here"; stopButton.textContent = "Stop";
      // A frame later, so the glow fades in instead of appearing at once.
      requestAnimationFrame(() => frame.classList.add("on"));
      idle();
      return api.state();
    },
    // Glide PlazCode's cursor to a point of the visible page (CSS pixels). Resolves when it has arrived.
    moveTo(x, y) {
      const px = Math.max(0, Math.min(innerWidth - 4, Number(x) || 0)), py = Math.max(0, Math.min(innerHeight - 4, Number(y) || 0));
      const first = !cursor.classList.contains("seen");
      cursor.classList.add("seen");
      if (first) { cursor.style.transition = "none"; cursor.style.transform = `translate(${innerWidth / 2}px,${innerHeight / 2}px)`; void cursor.getBoundingClientRect(); cursor.style.transition = ""; }
      cursor.style.transform = `translate(${px}px,${py}px)`;
      state.x = px; state.y = py; idle();
      const wait = reduced() ? 0 : 400;
      return new Promise((resolve) => setTimeout(() => resolve({ x: px, y: py }), wait));
    },
    press() { cursor.classList.add("press"); cursor.style.transform = `translate(${state.x}px,${state.y}px) scale(.82)`; setTimeout(() => { cursor.style.transform = `translate(${state.x}px,${state.y}px)`; cursor.classList.remove("press"); }, 140); idle(); },
    // Hidden for the moment a picture of the tab is taken, so the AI sees the page, not PlazCode's glow.
    veil(on) { host.style.visibility = on ? "hidden" : "visible"; return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); },
    expect(ms) { state.expectUntil = Date.now() + Math.max(0, Math.min(5000, Number(ms) || 0)); },
    hide() { if (state.sharing) { state.active = false; clearTimeout(state.idle); setPaused(false); api.share(true); cursor.classList.remove("seen"); return; } state.active = false; clearTimeout(state.idle); setPaused(false); clearTimeout(state.idle); frame.classList.remove("on"); cursor.classList.remove("seen"); },
    // "Shared with PlazCode": the quiet mark while this tab is shared in Ask PlazCode (no glow, no cursor).
    share(on) {
      if (on) { mount(); if (!state.active) { frame.classList.add("on", "sharing"); text.textContent = "Shared with PlazCode"; stopButton.textContent = "Stop sharing"; } state.sharing = true; }
      else { state.sharing = false; frame.classList.remove("sharing"); stopButton.textContent = "Stop"; if (!state.active) frame.classList.remove("on"); else text.textContent = "PlazCode is working here"; }
      return api.state();
    },
    state() { return { sharing: !!state.sharing, label: text.textContent, active: state.active, paused: state.paused, stopped: state.stopped, x: state.x, y: state.y, accent: host.style.getPropertyValue("--a"), shown: host.isConnected && frame.classList.contains("on") }; },
    target: null,
  };
  Object.defineProperty(globalThis, "__plazcodeControl", { value: api, configurable: false, writable: false });
})();
