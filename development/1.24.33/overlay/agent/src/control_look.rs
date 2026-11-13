//! AgentScript control rework (1.24.33), step 5b: the look on screen while PlazCode controls the desktop (Windows and
//! Mac). Two app windows, both always on top, out of the taskbar, never taking focus: a see-through, click-through
//! layer over the main screen with the glow in the PlazCode theme colour and PlazCode's cursor; and a small label at
//! the top of the screen ("PlazCode is working here" / "Paused, you're in control") with Stop and Resume, the only
//! clickable part. Built and updated from the app's event loop (gui.rs) from desktop_control::look().
use tao::event_loop::EventLoopWindowTarget;
use tao::window::{Window, WindowBuilder};
use wry::{WebView, WebViewBuilder};

const GLOW: &str = r##"<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:transparent;overflow:hidden}
:root{--a:#8b5cf6}
.glow{position:fixed;inset:0;box-shadow:inset 0 0 0 3px var(--a),inset 0 0 28px 6px color-mix(in srgb,var(--a) 70%,transparent),inset 0 0 90px 18px color-mix(in srgb,var(--a) 30%,transparent);transition:box-shadow .3s}
.paused .glow{box-shadow:inset 0 0 0 3px color-mix(in srgb,var(--a) 50%,#888),inset 0 0 30px 6px color-mix(in srgb,var(--a) 22%,transparent)}
svg{position:fixed;left:0;top:0;width:30px;height:30px;opacity:0;transition:transform .38s cubic-bezier(.3,.7,.25,1),opacity .2s;filter:drop-shadow(0 2px 6px color-mix(in srgb,var(--a) 70%,transparent))}
.seen svg{opacity:1}
@media (prefers-reduced-motion:reduce){svg,.glow{transition:none}}
</style></head><body><div class="glow"></div><svg viewBox="0 0 26 26" aria-hidden="true"><path d="M3 2l19 9.5-8.2 2.3L10 22z" fill="var(--a)" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>
<script>window.__pz=function(s){var r=document.documentElement;if(/^#[0-9a-f]{6}$/i.test(s.accent||''))r.style.setProperty('--a',s.accent);document.body.classList.toggle('paused',!!s.paused);
if(s.point){document.body.classList.add('seen');document.querySelector('svg').style.transform='translate('+s.point[0]+'px,'+s.point[1]+'px)';}};</script></body></html>"##;

const LABEL: &str = r##"<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:transparent;overflow:hidden;font:600 13px system-ui,-apple-system,"Segoe UI",sans-serif}
:root{--a:#8b5cf6}
.label{position:absolute;left:0;right:0;top:0;bottom:6px;display:flex;align-items:center;justify-content:center;gap:10px;color:#fff;border-radius:0 0 12px 12px;background:linear-gradient(135deg,var(--a),color-mix(in srgb,var(--a) 62%,#000));box-shadow:0 4px 14px color-mix(in srgb,var(--a) 45%,transparent)}
.dot{width:8px;height:8px;border-radius:50%;background:#fff;box-shadow:0 0 8px #fff}.paused .dot{background:transparent;border:2px solid #fff;box-shadow:none}
button{all:unset;cursor:pointer;padding:4px 10px;border-radius:8px;background:rgba(255,255,255,.2);font-size:12px}button:hover{background:rgba(255,255,255,.32)}
#resume{display:none}.paused #resume{display:inline-block}
</style></head><body><div class="label"><span class="dot"></span><span id="t">PlazCode is working here</span><button id="resume">Resume</button><button id="stop">Stop</button></div>
<script>document.getElementById('stop').onclick=function(){window.ipc.postMessage('control:stop')};document.getElementById('resume').onclick=function(){window.ipc.postMessage('control:resume')};
window.__pz=function(s){var r=document.documentElement;if(/^#[0-9a-f]{6}$/i.test(s.accent||''))r.style.setProperty('--a',s.accent);document.body.classList.toggle('paused',!!s.paused);var w=s.words||{};document.getElementById('t').textContent=s.paused?(w.paused||"Paused, you're in control"):(w.working||'PlazCode is working here');if(w.resume)document.getElementById('resume').textContent=w.resume;if(w.stop)document.getElementById('stop').textContent=w.stop;};</script></body></html>"##;

pub struct ControlLook { glow: Window, glow_view: WebView, label: Window, label_view: WebView, origin: (i32, i32), scale: f64, shown: Option<crate::desktop_control::Look> }

fn base() -> WindowBuilder {
    let builder = WindowBuilder::new().with_decorations(false).with_transparent(true).with_always_on_top(true).with_focused(false).with_focusable(false).with_resizable(false).with_visible(false).with_title("PlazCode control");
    #[cfg(windows)]
    let builder = { use tao::platform::windows::WindowBuilderExtWindows; builder.with_skip_taskbar(true).with_undecorated_shadow(false) };
    #[cfg(target_os = "macos")]
    let builder = { use tao::platform::macos::WindowBuilderExtMacOS; builder.with_has_shadow(false) };
    builder
}

impl ControlLook {
    pub fn new<T: 'static>(target: &EventLoopWindowTarget<T>) -> anyhow::Result<Self> {
        let monitor = target.primary_monitor().or_else(|| target.available_monitors().next()).ok_or_else(|| anyhow::anyhow!("no screen found"))?;
        let (position, size, scale) = (monitor.position(), monitor.size(), monitor.scale_factor());
        let glow = base().with_position(position).with_inner_size(size).build(target).map_err(|e| anyhow::anyhow!("control layer window: {e}"))?;
        // The layer lets every click and key through to the apps below it.
        let _ = glow.set_ignore_cursor_events(true);
        let glow_view = WebViewBuilder::new().with_transparent(true).with_focused(false).with_html(GLOW).build(&glow).map_err(|e| anyhow::anyhow!("control layer page: {e}"))?;
        let width = (380.0 * scale).round() as u32;
        let label_position = tao::dpi::PhysicalPosition::new(position.x + (size.width as i32 - width as i32) / 2, position.y);
        let label = base().with_position(label_position).with_inner_size(tao::dpi::PhysicalSize::new(width, (46.0 * scale).round() as u32)).build(target).map_err(|e| anyhow::anyhow!("control label window: {e}"))?;
        let label_view = WebViewBuilder::new().with_transparent(true).with_focused(false).with_html(LABEL)
            .with_ipc_handler(|request| {
                // Stop and Resume on the screen go straight to the control state; the extension passes Stop on to the AI chat.
                let action = match request.body().as_str() { "control:stop" => "stop", "control:resume" => "resume", _ => return };
                let _ = crate::desktop_control::act(action);
            })
            .build(&label).map_err(|e| anyhow::anyhow!("control label page: {e}"))?;
        Ok(Self { glow, glow_view, label, label_view, origin: (position.x, position.y), scale, shown: None })
    }
    /// Show, update or hide the look to match the control state.
    pub fn sync(&mut self, look: Option<crate::desktop_control::Look>) {
        if look == self.shown { return; }
        match &look {
            Some(look) => {
                let script = crate::desktop_control::look_script(look, self.origin, self.scale);
                let _ = self.glow_view.evaluate_script(&script);
                let _ = self.label_view.evaluate_script(&script);
                if self.shown.is_none() { self.glow.set_visible(true); self.label.set_visible(true); self.glow.set_always_on_top(true); self.label.set_always_on_top(true); }
            }
            None => { self.glow.set_visible(false); self.label.set_visible(false); }
        }
        self.shown = look;
    }
}
