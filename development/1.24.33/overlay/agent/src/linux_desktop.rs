//! Linux uses the installed browser for the same desktop UI, avoiding a
//! distribution-specific WebKit dependency. Only a short-lived, single-use
//! launch ticket enters the URL; the permanent bridge key never does.
use std::{collections::HashMap, sync::Mutex, time::{Duration, Instant}};
use axum::{extract::State, http::{HeaderMap, StatusCode}, response::{Html, IntoResponse}, Json};
use once_cell::sync::Lazy;

static TICKETS: Lazy<Mutex<HashMap<String, Instant>>> = Lazy::new(|| Mutex::new(HashMap::new()));
const LIFETIME: Duration = Duration::from_secs(60);

fn issue() -> anyhow::Result<String> {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).map_err(|e| anyhow::anyhow!("Cannot prepare desktop launch: {e}"))?;
    let ticket: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    let mut tickets = TICKETS.lock().unwrap_or_else(|e| e.into_inner());
    tickets.retain(|_, at| at.elapsed() < LIFETIME);
    anyhow::ensure!(tickets.len() < 32, "Too many pending desktop launches; retry in a minute");
    tickets.insert(ticket.clone(), Instant::now());
    Ok(ticket)
}

fn consume(tickets: &mut HashMap<String, Instant>, ticket: &str, now: Instant) -> bool {
    tickets.remove(ticket).is_some_and(|at| now.duration_since(at) < LIFETIME)
}

// 1.24.33 (owner, Linux rework: "open PlazCode in its own window"). A Chromium-family browser can show a page as an
// app window (no tabs, no address bar) with --app=. The first one found is used; otherwise the default browser opens
// a normal tab as before. Flatpak browsers are started through `flatpak run`.
const APP_BROWSERS: &[&str] = &["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "brave-browser", "brave", "microsoft-edge", "microsoft-edge-stable", "vivaldi", "vivaldi-stable"];
const FLATPAK_BROWSERS: &[&str] = &["com.google.Chrome", "org.chromium.Chromium", "com.brave.Browser", "com.microsoft.Edge", "io.github.ungoogled_software.ungoogled_chromium", "com.vivaldi.Vivaldi"];

fn in_path(name: &str, path: &std::ffi::OsStr) -> Option<std::path::PathBuf> {
    use std::os::unix::fs::PermissionsExt;
    std::env::split_paths(path).map(|dir| dir.join(name))
        .find(|file| std::fs::metadata(file).is_ok_and(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0))
}

/// The program and arguments that open `url` as an app window, if a suitable browser is installed.
fn app_window(url: &str, path: &std::ffi::OsStr, flatpak_roots: &[std::path::PathBuf]) -> Option<(std::path::PathBuf, Vec<String>)> {
    let app = format!("--app={url}");
    if let Some(program) = APP_BROWSERS.iter().find_map(|name| in_path(name, path)) {
        return Some((program, vec![app]));
    }
    let flatpak = in_path("flatpak", path)?;
    FLATPAK_BROWSERS.iter().find(|id| flatpak_roots.iter().any(|root| root.join(id).join("current").exists()))
        .map(|id| (flatpak, vec!["run".to_string(), id.to_string(), app]))
}

fn flatpak_roots() -> Vec<std::path::PathBuf> {
    let mut roots = vec![std::path::PathBuf::from("/var/lib/flatpak/app")];
    if let Some(home) = std::env::var_os("HOME") { roots.insert(0, std::path::PathBuf::from(home).join(".local/share/flatpak/app")); }
    roots
}

fn quiet(command: &mut std::process::Command) -> &mut std::process::Command {
    command.stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null())
}

pub fn open(addr: std::net::SocketAddr) -> anyhow::Result<()> {
    let ticket = issue()?;
    let url = format!("http://{addr}/desktop-start#{ticket}");
    // Never log launch arguments: even the temporary ticket is a credential.
    let window = (!std::env::var("PLAZCODE_LINUX_WINDOW").is_ok_and(|value| value == "tab"))
        .then(|| app_window(&url, &std::env::var_os("PATH").unwrap_or_default(), &flatpak_roots())).flatten();
    let mut child = window.and_then(|(program, args)| quiet(std::process::Command::new(program).args(args)).spawn().ok())
        .map(Ok)
        .unwrap_or_else(|| quiet(std::process::Command::new("xdg-open").arg(&url)).spawn()
            .or_else(|_| quiet(std::process::Command::new("gio").args(["open", &url])).spawn()))?;
    std::thread::spawn(move || {
        if !child.wait().is_ok_and(|status| status.success()) {
            eprintln!("PlazCode could not open the default browser. Check that a browser is installed and a graphical desktop session is running, then open PlazCode again.");
            tracing::error!("Linux desktop browser launch failed; bridge remains available");
        }
    });
    Ok(())
}

pub async fn start() -> impl IntoResponse {
    ([("Cache-Control", "no-store"), ("Referrer-Policy", "no-referrer"),
      ("X-Frame-Options", "DENY"), ("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'")], Html(include_str!("linux-start.html")))
}

#[derive(serde::Deserialize)]
pub struct Launch { ticket: String }

pub async fn exchange(State(state): State<crate::AppState>, headers: HeaderMap, Json(launch): Json<Launch>) -> axum::response::Response {
    let host = headers.get("host").and_then(|h| h.to_str().ok()).unwrap_or("");
    let same_origin = headers.get("origin").and_then(|h| h.to_str().ok()) == Some(format!("http://{host}").as_str());
    if !same_origin || !crate::security::allowed_authority(&headers) || !crate::security::valid_key(&launch.ticket) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let valid = consume(&mut TICKETS.lock().unwrap_or_else(|e| e.into_inner()), &launch.ticket, Instant::now());
    if !valid { return StatusCode::UNAUTHORIZED.into_response(); }
    ([("Cache-Control", "no-store")], Json(serde_json::json!({"key":state.pairing_key.as_str(),"profiles":state.accounts.required()}))).into_response()
}

pub async fn action(State(state): State<crate::AppState>, Json(value): Json<serde_json::Value>) -> axum::response::Response {
    let message = value["message"].as_str().unwrap_or("");
    if message == "quit" { state.ui.request_quit(); }
    else if let Some(url) = crate::gui::external_url(message) {
        if std::process::Command::new("xdg-open").arg(url).stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).spawn().is_err() {
            return (StatusCode::SERVICE_UNAVAILABLE, "Could not open the default browser").into_response();
        }
    } else { return StatusCode::BAD_REQUEST.into_response(); }
    Json(serde_json::json!({"ok":true})).into_response()
}

pub const BOOT: &str = r#"
  if (!window.__PLAZCODE_BOOT__) {
    try { window.__PLAZCODE_BOOT__ = JSON.parse(sessionStorage.getItem('plazcode-linux-desktop') || '{}'); } catch (_) {}
  }
  window.ipc = {postMessage: function(message) {
    if (message === 'hide' || message === 'minimize') { window.close(); return; }
    if (message === 'maximize' || message === 'drag' || message === 'ui-ready' || message.startsWith('js-error:')) return;
    var boot = window.__PLAZCODE_BOOT__ || {};
    fetch('/api/desktop/browser-action', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+(boot.key||'')}, body:JSON.stringify({message:message})})
      .then(function(response){ if(!response.ok) throw Error('Desktop action failed'); if(message==='quit'){sessionStorage.removeItem('plazcode-linux-desktop');document.body.textContent='PlazCode has closed. You can close this tab.';} })
      .catch(function(error){console.error(error);});
  }};
  // The browser owns window controls. Keep the app's explicit Quit action.
  document.querySelectorAll('[data-ipc="hide"],[data-ipc="minimize"],[data-ipc="maximize"]').forEach(function(node){node.hidden=true;node.style.display='none';});
"#;

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn tickets_are_random_short_lived_and_single_use() {
        let a=issue().unwrap(); let b=issue().unwrap();
        assert_ne!(a,b); assert!(crate::security::valid_key(&a));
        let now=Instant::now(); let mut values=HashMap::from([(a.clone(),now),(b.clone(),now)]);
        assert!(!consume(&mut values,"invalid",now));
        assert!(consume(&mut values,&a,now)); assert!(!consume(&mut values,&a,now));
        assert!(!consume(&mut values,&b,now+LIFETIME));
    }
    #[test] fn boot_does_not_put_pairing_keys_in_urls() {
        let html=include_str!("linux-start.html");
        assert!(html.contains("history.replaceState")); assert!(html.contains("location.hash.slice(1)"));
        assert!(html.contains("method:'POST'")); assert!(!html.contains("?key="));
        assert!(BOOT.contains("Authorization")); assert!(!BOOT.contains("localStorage"));
    }
    #[test] fn opens_an_app_window_when_a_chromium_browser_is_installed() {
        use std::os::unix::fs::PermissionsExt;
        let dir=std::env::temp_dir().join(format!("plazcode-window-{}",std::process::id()));let _=std::fs::remove_dir_all(&dir);
        let (bin,other,flat)=(dir.join("bin"),dir.join("other"),dir.join("flatpak"));for d in [&bin,&other,&flat]{std::fs::create_dir_all(d).unwrap();}
        let tool=|folder:&std::path::Path,name:&str,mode:u32|{let file=folder.join(name);std::fs::write(&file,"#!/bin/sh\n").unwrap();std::fs::set_permissions(&file,std::fs::Permissions::from_mode(mode)).unwrap();file};
        let path=std::env::join_paths([&bin,&other]).unwrap();
        assert!(app_window("http://x/",&path,&[flat.clone()]).is_none(),"no browser: the default browser opens a tab");
        tool(&bin,"chromium",0o644);
        assert!(app_window("http://x/",&path,&[flat.clone()]).is_none(),"a file that cannot run is not a browser");
        let brave=tool(&other,"brave-browser",0o755);
        assert_eq!(app_window("http://x/#t",&path,&[flat.clone()]),Some((brave.clone(),vec!["--app=http://x/#t".to_string()])));
        let chrome=tool(&other,"google-chrome",0o755);
        assert_eq!(app_window("http://x/",&path,&[flat.clone()]).unwrap().0,chrome,"Chrome comes first");
        std::fs::remove_file(&chrome).unwrap();std::fs::remove_file(&brave).unwrap();
        let flatpak=tool(&other,"flatpak",0o755);std::fs::create_dir_all(flat.join("com.brave.Browser/current")).unwrap();
        assert_eq!(app_window("http://x/",&path,&[flat.clone()]),Some((flatpak,vec!["run".into(),"com.brave.Browser".into(),"--app=http://x/".into()])));
        let _=std::fs::remove_dir_all(&dir);
    }
}
