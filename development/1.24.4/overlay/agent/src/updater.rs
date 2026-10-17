use axum::{Json, response::IntoResponse};
use futures::StreamExt;
use serde::{Serialize, Deserialize};
use serde_json::Value;
use std::{path::PathBuf, sync::Mutex, time::Duration};
use tokio::io::AsyncWriteExt;

const DEFAULT_MAC_FEED: &str = "https://raw.githubusercontent.com/stoveez/PlazCode/main/latest-macos.json";
const DEFAULT_FEED: &str = "https://raw.githubusercontent.com/stoveez/PlazCode/main/latest.json";
#[derive(Clone, Serialize, Deserialize)]
pub struct ReleaseNotes { pub version: String, pub title: String, pub summary: String, #[serde(default)] pub added: Vec<String>, #[serde(default)] pub improved: Vec<String>, #[serde(default)] pub fixed: Vec<String> }
#[derive(Clone, Serialize)]
pub struct Status { desktop_version: String, desktop_latest: Option<String>, installed: String, latest: Option<String>, available: bool, busy: bool, progress: u8, message: String, error: Option<String>, checked_at: u64, check_error: Option<String>, background: bool, release_notes: Vec<ReleaseNotes> }
fn folder() -> PathBuf { crate::platform::installation_root() }
fn installed_at(root: &std::path::Path) -> String {
    ["PlazCode-Extension/manifest.json", "manifest.json"].iter().find_map(|path| {
        std::fs::read(root.join(path)).ok().and_then(|raw| serde_json::from_slice::<Value>(&raw).ok())
            .and_then(|value| value["version"].as_str().map(str::to_owned))
    }).unwrap_or_else(|| env!("CARGO_PKG_VERSION").into())
}
fn installed() -> String { installed_at(&folder()) }
fn stage_helper(root: &std::path::Path, stage: &std::path::Path, windows: bool) -> anyhow::Result<PathBuf> {
    let name = if windows { "Update-PlazCode.ps1" } else { "Update-PlazCode.command" };
    let destination = stage.join(name);
    let source = root.join(name);
    if source.is_file() { std::fs::copy(source, &destination)?; }
    else {
        let translocated = std::env::current_exe().map(|exe| crate::platform::is_translocated(&exe)).unwrap_or(false);
        anyhow::ensure!(!translocated || crate::platform::is_installation_root(root),
            "macOS opened PlazCode from a temporary read-only copy (Gatekeeper App Translocation), so the PlazCode folder could not be found. Quit PlazCode, open the extracted PlazCode folder and double-click MacOS_Setup.command once (or right-click it and choose Open). Then choose Update now again. Your settings are kept.");
        anyhow::ensure!(crate::platform::is_installation_root(root),
            "The application was moved outside its PlazCode installation folder. Extract the complete platform ZIP into a dedicated folder and launch PlazCode there; do not move only the application file.");
        let embedded = if windows { include_str!("../../Update-PlazCode.ps1") } else { include_str!("../../Update-PlazCode.command") };
        std::fs::write(&destination, embedded)?;
    }
    Ok(destination)
}
static STATUS: once_cell::sync::Lazy<Mutex<Status>> = once_cell::sync::Lazy::new(|| Mutex::new(Status { desktop_version: env!("CARGO_PKG_VERSION").into(), desktop_latest: None, installed: installed(), latest: None, available: false, busy: false, progress: 0, message: "Check for the latest published update.".into(), error: None, checked_at: 0, check_error: None, background: false, release_notes: serde_json::from_str(include_str!("../../release-notes.json")).unwrap_or_default() }));
static MANUAL_WAITERS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
struct ManualWaiter;
impl Drop for ManualWaiter { fn drop(&mut self) { MANUAL_WAITERS.fetch_sub(1,std::sync::atomic::Ordering::SeqCst); } }
fn state() -> std::sync::MutexGuard<'static, Status> { STATUS.lock().unwrap_or_else(|e| e.into_inner()) }
fn progress(percent: u8, message: &str) { let mut s=state();if s.background && message=="Checking for updates…" { return; }s.progress=percent;s.message=message.into(); }
fn version(text: &str) -> anyhow::Result<Vec<u32>> {
    let mut parts = text.split('.').map(str::parse::<u32>).collect::<Result<Vec<_>,_>>()?;
    anyhow::ensure!((2..=4).contains(&parts.len()), "Invalid release version."); while parts.len()<4 { parts.push(0); } Ok(parts)
}
fn update_available(latest: &str, extension: &str, desktop_latest: &str, desktop: &str) -> anyhow::Result<bool> {
    anyhow::ensure!(version(desktop_latest)? <= version(latest)?,"Desktop build cannot exceed release version.");
    Ok(version(latest)? > version(extension)? || version(desktop_latest)? > version(desktop)?)
}
fn validate(feed: &Value) -> anyhow::Result<(String,String,String)> {
    let ver=feed["version"].as_str().unwrap_or("");version(ver)?;
    let url=feed["url"].as_str().unwrap_or("");
    anyhow::ensure!(reqwest::Url::parse(url)?.scheme()=="https", "Release download must use HTTPS.");
    let hash=feed["sha256"].as_str().unwrap_or("");
    anyhow::ensure!(hash.len()==64 && hash.bytes().all(|b| b.is_ascii_hexdigit()), "Invalid release checksum.");
    Ok((ver.into(),url.into(),hash.into()))
}
fn verify_official_record(record: &Value, ver: &str, download: &str, hash: &str, macos: bool) -> anyhow::Result<()> {
    version(ver)?;
    let name = format!("PlazCode-{}{ver}.zip", if macos { "macOS-" } else { "" });
    let release_url = format!("https://github.com/stoveez/PlazCode/releases/download/v{ver}/{name}");
    let parsed = reqwest::Url::parse(download)?;
    let raw_ok = parsed.scheme() == "https" && parsed.host_str() == Some("raw.githubusercontent.com") && parsed.username().is_empty() && parsed.password().is_none() && {
        let parts: Vec<_> = parsed.path().split('/').collect();
        parts.len() == 5 && parts[1] == "stoveez" && parts[2] == "PlazCode" && (parts[3] == "main" || (parts[3].len() == 40 && parts[3].bytes().all(|b| b.is_ascii_hexdigit()))) && parts[4] == name
    };
    anyhow::ensure!(download == release_url || raw_ok, "Official update URL does not identify the expected release package.");
    anyhow::ensure!(record["tag_name"].as_str() == Some(format!("v{ver}").as_str()) && record["draft"].as_bool() == Some(false) && record["prerelease"].as_bool() == Some(false), "The official stable release is not published yet. Retry after publication.");
    let asset = record["assets"].as_array().and_then(|assets| assets.iter().find(|asset| asset["name"].as_str() == Some(name.as_str()))).ok_or_else(|| anyhow::anyhow!("The official platform release package is missing."))?;
    anyhow::ensure!(asset["state"].as_str() == Some("uploaded") && asset["browser_download_url"].as_str() == Some(release_url.as_str()), "The official release package is incomplete.");
    let digest = asset["digest"].as_str().unwrap_or("");
    anyhow::ensure!(hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_hexdigit()) && digest.eq_ignore_ascii_case(&format!("sha256:{hash}")), "Release checksum does not match the official GitHub asset. Installed files were not changed.");
    Ok(())
}
fn official_rate_limited(status: u16, remaining: Option<&str>, message: &str) -> bool {
    status == 429 || (status == 403 && (remaining == Some("0") || message.to_ascii_lowercase().contains("rate limit")))
}
fn verified_official_download(status: u16, remaining: Option<&str>, record: &Value, ver: &str, download: &str, hash: &str, macos: bool) -> anyhow::Result<String> {
    version(ver)?;
    if official_rate_limited(status, remaining, record["message"].as_str().unwrap_or("")) {
        // The public metadata API has a shared unauthenticated request quota.
        // Bypass only that quota, using the fixed official release asset rather
        // than the feed's URL. The installer still verifies SHA256 and version.
        anyhow::ensure!(hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_hexdigit()), "Invalid release checksum.");
        return Ok(format!("https://github.com/stoveez/PlazCode/releases/download/v{ver}/PlazCode-{}{ver}.zip", if macos { "macOS-" } else { "" }));
    }
    anyhow::ensure!((200..300).contains(&status), "Official release metadata returned HTTP {status}.");
    verify_official_record(record, ver, download, hash, macos)?;
    Ok(download.to_owned())
}
fn official_asset_fallback(ver: &str, hash: &str, macos: bool) -> anyhow::Result<String> {
    verified_official_download(429, None, &Value::Null, ver, "", hash, macos)
}
async fn verify_official_release(client: &reqwest::Client, ver: &str, download: &str, hash: &str, macos: bool) -> anyhow::Result<String> {
    let url = format!("https://api.github.com/repos/stoveez/PlazCode/releases/tags/v{ver}");
    // 1.20.0: a transport failure (DNS, TLS, proxy, timeout) on the metadata
    // lookup used to abort the update with "error sending request for url".
    // Retry once, then use the fixed official asset; the checksum still gates it.
    let mut response = None;
    for attempt in 0..2u8 {
        match client.get(url.as_str()).header(reqwest::header::USER_AGENT, "PlazCode-Updater").header(reqwest::header::ACCEPT, "application/vnd.github+json").header(reqwest::header::CACHE_CONTROL, "no-cache").timeout(Duration::from_secs(15)).send().await {
            Ok(r) if r.status().is_server_error() && attempt == 0 => { tokio::time::sleep(Duration::from_secs(2)).await; }
            // A second 5xx is a GitHub API outage: use the fixed official asset.
            Ok(r) if r.status().is_server_error() => { break; }
            Ok(r) => { response = Some(r); break; }
            Err(_) if attempt == 0 => { tokio::time::sleep(Duration::from_secs(2)).await; }
            Err(_) => {}
        }
    }
    let Some(response) = response else { return official_asset_fallback(ver, hash, macos); };
    let status = response.status().as_u16();
    let remaining = response.headers().get("x-ratelimit-remaining").and_then(|v| v.to_str().ok()).map(str::to_owned);
    let mut stream = response.bytes_stream(); let mut raw = Vec::new();
    while let Some(chunk) = stream.next().await { let chunk = chunk?; anyhow::ensure!(raw.len() + chunk.len() <= 1024 * 1024, "Official release metadata is too large."); raw.extend_from_slice(&chunk); }
    let record: Value = serde_json::from_slice(&raw).unwrap_or(Value::Null);
    verified_official_download(status, remaining.as_deref(), &record, ver, download, hash, macos)
}
// Keep the connection pool alive across checks instead of repeating DNS/TLS setup.
static HTTP_CLIENT: once_cell::sync::Lazy<Result<reqwest::Client, reqwest::Error>> = once_cell::sync::Lazy::new(||
    reqwest::Client::builder().timeout(Duration::from_secs(180)).pool_idle_timeout(Duration::from_secs(90)).build());
fn feed_timeout(background: bool) -> Duration { Duration::from_secs(if background { 15 } else { 30 }) }
async fn fetch_feed(client: &reqwest::Client, url: reqwest::Url, timeout: Duration) -> anyhow::Result<Vec<u8>> {
    Ok(client.get(url).header(reqwest::header::CACHE_CONTROL,"no-cache, max-age=0")
        .timeout(timeout).send().await?.error_for_status()?.bytes().await?.to_vec())
}
const DEFAULT_REFS: &str = "https://github.com/stoveez/PlazCode.git/info/refs?service=git-upload-pack";
static PINNED_FEED: once_cell::sync::Lazy<Mutex<std::collections::HashMap<String,Vec<u8>>>> = once_cell::sync::Lazy::new(|| Mutex::new(std::collections::HashMap::new()));
fn advertised_main(raw: &[u8]) -> anyhow::Result<String> {
    anyhow::ensure!(raw.len() <= 131072, "Release reference response is too large.");
    let mut at = 0;
    while at < raw.len() {
        anyhow::ensure!(at + 4 <= raw.len(), "Truncated release reference packet.");
        let size = usize::from_str_radix(std::str::from_utf8(&raw[at..at+4])?, 16)?;
        at += 4;
        if size == 0 { continue; }
        anyhow::ensure!(size >= 4 && at + size - 4 <= raw.len(), "Invalid release reference packet.");
        let packet = std::str::from_utf8(&raw[at..at+size-4])?;at += size - 4;
        let record = packet.split('\0').next().unwrap_or("").trim_end();
        if let Some((sha, name)) = record.split_once(' ') {
            if name == "refs/heads/main" {
                anyhow::ensure!(sha.len() == 40 && sha.bytes().all(|byte| byte.is_ascii_hexdigit()), "Invalid release commit.");
                return Ok(sha.to_owned());
            }
        }
    }
    anyhow::bail!("Published release branch is missing.")
}
async fn revision_feed(client: &reqwest::Client, refs: reqwest::Url, raw_base: &str, limit: Duration) -> anyhow::Result<Vec<u8>> {
    revision_feed_named(client,refs,raw_base,"latest.json",limit).await
}
async fn revision_feed_named(client: &reqwest::Client, refs: reqwest::Url, raw_base: &str, name: &str, limit: Duration) -> anyhow::Result<Vec<u8>> {
    anyhow::ensure!(matches!(name,"latest.json"|"latest-macos.json"),"Invalid platform release feed.");
    let bytes = fetch_feed(client, refs, limit.min(Duration::from_secs(5))).await?;
    let sha = advertised_main(&bytes)?;
    let cache_key=format!("{raw_base}/{sha}/{name}");
    {
        let cached = PINNED_FEED.lock().unwrap_or_else(|error| error.into_inner());
        if let Some(raw) = cached.get(&cache_key) { return Ok(raw.clone()); }
    }
    let raw = fetch_feed(client, reqwest::Url::parse(&format!("{raw_base}/{sha}/{name}"))?, limit).await?;
    anyhow::ensure!(raw.len() <= 65536, "Release feed is too large.");
    let feed: Value = serde_json::from_slice(&raw)?;validate(&feed)?;
    {let mut cached=PINNED_FEED.lock().unwrap_or_else(|error| error.into_inner());if cached.len()>=8 {cached.clear();}cached.insert(cache_key,raw.clone());}
    Ok(raw)
}
fn official_feed(url: &str) -> &str {
    match url {
        "https://raw.githubusercontent.com/stoveez/PlazCodeneww/main/latest.json" => DEFAULT_FEED,
        "https://raw.githubusercontent.com/stoveez/PlazCodeneww/main/latest-macos.json" => DEFAULT_MAC_FEED,
        _ => url,
    }
}
async fn current_feed(client: &reqwest::Client, url: &str, limit: Duration) -> anyhow::Result<Vec<u8>> {
    let url=official_feed(url);
    let official=url == DEFAULT_FEED || url == DEFAULT_MAC_FEED;
    // The git-ref revision read and the raw feed each get their own budget, so a
    // slow ref advertisement can no longer starve the fallback and hide a release
    // (1.19.37 was only found after a manual update for this reason).
    if official {
        let name=if url==DEFAULT_MAC_FEED {"latest-macos.json"}else{"latest.json"};
        if let Ok(Ok(raw)) = tokio::time::timeout(limit, revision_feed_named(client, reqwest::Url::parse(DEFAULT_REFS)?, "https://raw.githubusercontent.com/stoveez/PlazCode", name, limit)).await { return Ok(raw); }
    }
    let mut last=anyhow::anyhow!("Release check timed out.");
    for attempt in 0..FEED_ATTEMPTS {
        let mut feed = reqwest::Url::parse(url)?;
        if official { let bucket=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_secs()/2;feed.query_pairs_mut().append_pair("plazcode_check",&format!("{bucket}-{attempt}")); }
        match tokio::time::timeout(limit, fetch_feed(client, feed, limit)).await {
            Ok(Ok(raw)) => return Ok(raw),
            Ok(Err(error)) => last=error,
            Err(_) => last=anyhow::anyhow!("Release check timed out."),
        }
    }
    Err(last)
}
const FEED_ATTEMPTS: u32 = 2;
fn platform_feed(url: &str, macos: bool) -> &str {
    match official_feed(url) {
        DEFAULT_FEED | DEFAULT_MAC_FEED => if macos { DEFAULT_MAC_FEED } else { DEFAULT_FEED },
        custom => custom,
    }
}
const DOWNLOAD_TOTAL_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const DOWNLOAD_STALL_TIMEOUT: Duration = Duration::from_secs(60);
const FAILURE_BACKOFF_BASE_MS: u64 = 10 * 60 * 1000;
const FAILURE_BACKOFF_MAX_MS: u64 = 6 * 60 * 60 * 1000;
fn failure_path(root: &std::path::Path) -> PathBuf { root.join("logs").join("update-failure.json") }
fn read_failure(root: &std::path::Path) -> Option<Value> {
    std::fs::read(failure_path(root)).ok().and_then(|raw| serde_json::from_slice::<Value>(raw.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(&raw)).ok())
}
fn installer_failure(root: &std::path::Path, version: &str, started: u64, log: &std::path::Path, code: Option<i32>) -> String {
    let message = read_failure(root).filter(|r| r["version"].as_str()==Some(version) && r["at"].as_u64().is_some_and(|at| at>=started))
        .and_then(|r| r["message"].as_str().map(str::to_owned));
    let detail = message.unwrap_or_else(|| {
        let tail = std::fs::read(log).unwrap_or_default();
        let tail = &tail[tail.len().saturating_sub(8192)..];
        String::from_utf8_lossy(tail).lines().filter(|line| !line.trim().is_empty()).rev().take(8).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n")
    });
    let detail: String=detail.chars().take(1600).collect();
    format!("Update installation failed (exit {}). {}\nInstaller log: {}", code.map(|c| c.to_string()).unwrap_or_else(|| "unknown".into()), if detail.is_empty() {"The installer did not return a reason."} else {&detail}, log.display())
}
/// Remaining wait before another automatic install of `latest`, if its last
/// install failed. Grows 10, 20, 40… minutes, capped at 6 hours.
fn failure_backoff(record: Option<&Value>, latest: &str, now: u64) -> Option<u64> {
    let record = record?;
    if record["version"].as_str() != Some(latest) { return None; }
    let count = record["count"].as_u64().unwrap_or(1).clamp(1, 16);
    let at = record["at"].as_u64()?;
    let delay = FAILURE_BACKOFF_BASE_MS.saturating_mul(1u64 << (count - 1)).min(FAILURE_BACKOFF_MAX_MS);
    let until = at.saturating_add(delay);
    // A clock moved backwards must not pause updates for longer than the cap.
    if now < at { return Some(delay.min(FAILURE_BACKOFF_MAX_MS)); }
    (now < until).then(|| until - now)
}
fn record_failure(root: &std::path::Path, version: &str, message: &str, now: u64) {
    let previous = read_failure(root);
    // The installer helper records its own failures; never count one twice.
    if let Some(previous) = previous.as_ref() {
        if previous["version"].as_str() == Some(version) && previous["at"].as_u64().is_some_and(|at| now.saturating_sub(at) < 60_000) { return; }
    }
    let count = previous.as_ref().filter(|p| p["version"].as_str() == Some(version)).and_then(|p| p["count"].as_u64()).unwrap_or(0) + 1;
    let path = failure_path(root);
    if let Some(parent) = path.parent() { let _ = std::fs::create_dir_all(parent); }
    let _ = std::fs::write(path, serde_json::json!({"version":version,"count":count,"at":now,"message":message,"installed":false}).to_string());
}
/// Remove downloads left by interrupted or completed updates and files the
/// installer renamed aside while they were locked. Recent folders may still be
/// in use by a running installer and are kept.
fn cleanup_update_leftovers(temp: &std::path::Path, root: &std::path::Path, now: std::time::SystemTime) {
    if let Ok(entries) = std::fs::read_dir(temp) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let keep_for = if name.starts_with("PlazCode-download-") { Duration::from_secs(60 * 60) }
                else if name.starts_with("PlazCode-update-") { Duration::from_secs(7 * 24 * 60 * 60) }
                else { continue };
            let Ok(meta) = entry.metadata() else { continue };
            if !meta.is_dir() { continue; }
            let age = meta.modified().ok().and_then(|modified| now.duration_since(modified).ok()).unwrap_or_default();
            if age >= keep_for { let _ = std::fs::remove_dir_all(entry.path()); }
        }
    }
    let list = root.join("logs").join("update-moved-aside.txt");
    let Ok(raw) = std::fs::read_to_string(&list) else { return };
    let mut remaining = Vec::new();
    for line in raw.lines() {
        let path = PathBuf::from(line.trim().trim_start_matches('\u{feff}'));
        let name = path.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default();
        let owned = name.rsplit_once(".plazcode-old-").is_some_and(|(_, id)| id.len() == 8 && id.bytes().all(|b| b.is_ascii_hexdigit()));
        if !owned || !path.starts_with(root) { continue; }
        if path.exists() && std::fs::remove_file(&path).is_err() { remaining.push(line.trim().to_owned()); }
    }
    if remaining.is_empty() { let _ = std::fs::remove_file(list); } else { let _ = std::fs::write(list, remaining.join("\n")); }
}
async fn run(install: bool, background: bool) -> anyhow::Result<()> {
    let root=folder();
    let source=std::fs::read(root.join("update-source.json")).ok().and_then(|raw| serde_json::from_slice::<Value>(&raw).ok());
    let url=source.as_ref().and_then(|value| value["feedUrl"].as_str()).filter(|url| !url.is_empty()).unwrap_or(if cfg!(target_os="macos") {DEFAULT_MAC_FEED}else{DEFAULT_FEED});
    let url=platform_feed(url, cfg!(target_os="macos"));
    anyhow::ensure!(reqwest::Url::parse(url)?.scheme()=="https", "Update feed must use HTTPS.");
    progress(0,"Checking for updates…");
    let client=HTTP_CLIENT.as_ref().map_err(|error| anyhow::anyhow!("Update client could not start: {error}"))?;
    let raw=current_feed(client, url, feed_timeout(background)).await?;
    anyhow::ensure!(raw.len()<=65536,"Release feed is too large.");
    let feed: Value = serde_json::from_slice(&raw)?;
    let (latest,download,hash)=validate(&feed)?;
    let mut download=download.strip_prefix("https://raw.githubusercontent.com/stoveez/PlazCodeneww/").map(|tail| format!("https://raw.githubusercontent.com/stoveez/PlazCode/{tail}")).unwrap_or(download);
    if let Some(previous) = state().latest.as_ref() { anyhow::ensure!(version(&latest)? >= version(previous)?, "Release source returned an older cached version; retaining the latest known release."); }
    let notes = feed.get("release_notes").and_then(|value| serde_json::from_value::<Vec<ReleaseNotes>>(value.clone()).ok());
    let desktop_latest=feed.get("desktop_version").and_then(Value::as_str).unwrap_or(&latest).to_owned();
    let available=update_available(&latest,&installed(),&desktop_latest,env!("CARGO_PKG_VERSION"))?;
    { let mut s=state();s.installed=installed();s.latest=Some(latest.clone());s.desktop_latest=Some(desktop_latest);s.available=available;s.checked_at=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64;s.check_error=None; if let Some(notes) = notes { s.release_notes = notes; } }
    if !available { progress(100,"Already up to date.");return Ok(()); }
    if !install { progress(0,"A newer version is ready to install.");return Ok(()); }
    // Automatic installs of a version whose installation just failed wait with
    // a growing delay. Without it, a persistent lock relaunches the desktop,
    // the launch check installs again at once and the app restarts every minute.
    if background {
        if let Some(wait) = failure_backoff(read_failure(&root).as_ref(), &latest, now_ms()) {
            let mut s=state();s.progress=0;
            s.message=format!("Update {latest} is ready. The last automatic install failed, so PlazCode retries automatically in about {} minute(s). Choose Update now to retry immediately.", wait.div_ceil(60_000).max(1));
            return Ok(());
        }
    }
    if matches!(official_feed(url), DEFAULT_FEED | DEFAULT_MAC_FEED) {
        download = verify_official_release(client, &latest, &download, &hash, cfg!(target_os="macos")).await?;
    }
    { let mut s=state();s.background=false;s.error=None; }
    #[cfg(not(any(windows, target_os="macos")))] anyhow::bail!("Installing desktop updates requires Windows or macOS.");
    #[cfg(any(windows, target_os="macos"))] {
        #[cfg(windows)]
        use std::os::windows::process::CommandExt;
        let stage=std::env::temp_dir().join(format!("PlazCode-download-{}-{}",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_millis()));
        std::fs::create_dir_all(&stage)?;let path=stage.join("release.zip");
        // Run an immutable helper copy; installing its replacement must not
        // truncate the shell script while it is still executing.
        let helper_copy=stage_helper(&root,&stage,cfg!(windows))?;
        // The shared client's 180 s total timeout would abort every download on a
        // connection slower than about 200 KB/s. Bound the whole transfer
        // generously and treat 60 s without any received bytes as a stall.
        let response=client.get(download).timeout(DOWNLOAD_TOTAL_TIMEOUT).send().await?.error_for_status()?;
        let total=response.content_length().unwrap_or(0);anyhow::ensure!(total<=64*1024*1024,"Release is too large.");
        let mut file=tokio::fs::File::create(&path).await?;let mut stream=response.bytes_stream();let mut bytes=0u64;
        while let Some(chunk)=tokio::time::timeout(DOWNLOAD_STALL_TIMEOUT, stream.next()).await.map_err(|_| anyhow::anyhow!("The update download stalled for {} seconds. Your installation was not changed.", DOWNLOAD_STALL_TIMEOUT.as_secs()))? { let chunk=chunk?;bytes+=chunk.len() as u64;anyhow::ensure!(bytes<=64*1024*1024,"Release exceeds 64 MB.");file.write_all(&chunk).await?;
            progress(if total>0 { ((bytes*85/total).min(85)) as u8 } else { 35 },"Downloading update…"); }
        file.flush().await?;drop(file);progress(90,"Verifying and installing. PlazCode will close and relaunch…");
        let quiet_restart = background && !crate::gui::FOREGROUND.load(std::sync::atomic::Ordering::Relaxed);
        let restore_window = quiet_restart && crate::gui::WINDOW_OPEN.load(std::sync::atomic::Ordering::Relaxed);
        #[cfg(windows)]
        let mut helper_command = std::process::Command::new("powershell.exe");
        #[cfg(windows)]
        {
            let appearance=crate::preferences::PreferencesStore::load().snapshot().appearance;
            helper_command.args(["-NoProfile","-File"]).arg(helper_copy).arg("-InstallRoot").arg(&root).arg("-ZipPath").arg(path).arg("-ExpectedSha256").arg(hash).arg("-ExpectedVersion").arg(&latest).arg("-ShowProgress");
            if quiet_restart { helper_command.arg("-BackgroundUpdate"); }
            if restore_window { helper_command.arg("-RestoreWindow"); }
            if let Some(appearance)=appearance {helper_command.arg("-Theme").arg(appearance.theme).arg("-Glow").arg(appearance.glow);if appearance.gradients=="off" {helper_command.arg("-NoGradients");}}
        }
        let helper_started = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_millis() as u64;
        #[cfg(windows)]
        let log_path = root.join("logs").join("updater.log");
        #[cfg(target_os="macos")]
        let log_path = crate::platform::configuration_root().join("logs").join("updater.log");
        let log_path = if std::fs::create_dir_all(log_path.parent().unwrap()).is_ok() { log_path } else { stage.join("updater.log") };
        let (log_path, log) = match std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
            Ok(log) => (log_path, log),
            Err(_) => { let fallback=stage.join("updater.log");let log=std::fs::OpenOptions::new().create(true).append(true).open(&fallback)?;(fallback,log) }
        };
        #[cfg(windows)]
        let mut helper_process = helper_command.current_dir(&root).stdout(log.try_clone()?).stderr(log).creation_flags(0x08000000).spawn()?;
        #[cfg(target_os="macos")]
        let mut helper_process = {
            // The helper survives the old desktop's exit; keep its diagnostics
            // outside the signed app so a failed relaunch remains inspectable.

            std::process::Command::new("/bin/bash").arg(helper_copy).arg(path).arg(hash).arg(&latest).arg(std::process::id().to_string()).arg(if restore_window {"restore"} else if quiet_restart {"background"} else {"foreground"}).arg(&root).current_dir(&root).stdout(log.try_clone()?).stderr(log).spawn()?
        };
        let result = tokio::task::spawn_blocking(move || helper_process.wait()).await??;
        anyhow::ensure!(result.success(), "{}", installer_failure(&root, &latest, helper_started, &log_path, result.code()));
        progress(100,"Updater finished. Reload the extension and refresh AI chat tabs.");
    }
    Ok(())
}
// Automatic installs restart the desktop bridge. Never do that while PlazCode
// is executing a tool or an agent session was active moments ago; the pending
// update installs on the next idle check. Manual "Update now" is unaffected.
static ACTIVE_WORK: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
static LAST_ACTIVITY_MS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
pub const AUTO_INSTALL_IDLE: Duration = Duration::from_secs(180);
fn now_ms() -> u64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64 }
pub fn touch_activity() { LAST_ACTIVITY_MS.store(now_ms(), std::sync::atomic::Ordering::SeqCst); }
pub struct ActivityGuard(());
impl ActivityGuard { pub fn enter() -> Self { ACTIVE_WORK.fetch_add(1, std::sync::atomic::Ordering::SeqCst); touch_activity(); ActivityGuard(()) } }
impl Drop for ActivityGuard { fn drop(&mut self) { touch_activity(); ACTIVE_WORK.fetch_sub(1, std::sync::atomic::Ordering::SeqCst); } }
fn busy_at(active: usize, last: u64, now: u64) -> bool { active > 0 || (last > 0 && now.saturating_sub(last) < AUTO_INSTALL_IDLE.as_millis() as u64) }
pub fn bridge_busy() -> bool { busy_at(ACTIVE_WORK.load(std::sync::atomic::Ordering::SeqCst), LAST_ACTIVITY_MS.load(std::sync::atomic::Ordering::SeqCst), now_ms()) }
// Constant light activity must not postpone an update forever. After 30 minutes
// of deferral the install proceeds as soon as no tool is actually running.
pub const AUTO_INSTALL_MAX_DEFER: Duration = Duration::from_secs(30 * 60);
static DEFERRED_SINCE_MS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
fn should_defer(active: usize, last: u64, now: u64, since: u64) -> bool {
    if active > 0 { return true; }
    busy_at(0, last, now) && !(since > 0 && now.saturating_sub(since) >= AUTO_INSTALL_MAX_DEFER.as_millis() as u64)
}
fn defer_install() -> bool {
    use std::sync::atomic::Ordering::SeqCst;
    let now=now_ms();
    if !bridge_busy() { DEFERRED_SINCE_MS.store(0, SeqCst); return false; }
    let since=DEFERRED_SINCE_MS.load(SeqCst);
    if since==0 { DEFERRED_SINCE_MS.store(now, SeqCst); }
    let defer=should_defer(ACTIVE_WORK.load(SeqCst), LAST_ACTIVITY_MS.load(SeqCst), now, since);
    if !defer { DEFERRED_SINCE_MS.store(0, SeqCst); }
    defer
}
static AUTO_INSTALL: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static LAUNCH_UPDATE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static CHECK_REQUEST: once_cell::sync::Lazy<tokio::sync::Notify> = once_cell::sync::Lazy::new(tokio::sync::Notify::new);
pub fn request_launch_update() { AUTO_INSTALL.store(true, std::sync::atomic::Ordering::SeqCst);LAUNCH_UPDATE.store(true, std::sync::atomic::Ordering::SeqCst);CHECK_REQUEST.notify_one(); }
pub fn start_checker() {
    tokio::spawn(async {
        { let root=folder(); let _ = tokio::task::spawn_blocking(move || cleanup_update_leftovers(&std::env::temp_dir(), &root, std::time::SystemTime::now())).await; }
        let mut interval = tokio::time::interval(Duration::from_secs(30));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            tokio::select! { _=interval.tick()=>{}, _=CHECK_REQUEST.notified()=>{} }
            { let mut s=state(); if s.busy || MANUAL_WAITERS.load(std::sync::atomic::Ordering::SeqCst)>0 { continue; } s.busy=true; s.background=true; }
            let launch=LAUNCH_UPDATE.swap(false,std::sync::atomic::Ordering::SeqCst);
            let automatic=launch || AUTO_INSTALL.load(std::sync::atomic::Ordering::SeqCst);
            // Busy: only check now, keep the launch request, install once idle.
            let deferred=automatic && defer_install();
            if deferred && launch { LAUNCH_UPDATE.store(true,std::sync::atomic::Ordering::SeqCst); }
            let result=run(automatic && !deferred, true).await;
            // 1.20.0: a ready update clears any earlier failure so the overlay never shows
            // "Update could not finish" next to "Update ready".
            if deferred && result.is_ok() { let mut s=state(); if s.available { s.error=None; s.check_error=None; s.message="Update ready. It installs automatically once PlazCode has been idle for 3 minutes, or choose Update now.".into(); } }
            let mut s=state();
            if let Err(error)=result { s.check_error=Some(error.to_string());if automatic {if s.background { LAUNCH_UPDATE.store(true,std::sync::atomic::Ordering::SeqCst); }else{
                // Keep automatic updates enabled for an unattended desktop. The
                // failure record delays the next automatic attempt (backoff).
                if let Some(version)=s.latest.clone() { record_failure(&folder(), &version, &error.to_string(), now_ms()); }
                s.error=Some(error.to_string());s.message="Automatic update failed. Your current installation remains available and PlazCode retries automatically later; choose Update now to retry immediately.".into();}} }
            s.busy=false;s.background=false;
        }
    });
}
pub async fn get() -> Json<Status> { Json(state().clone()) }
pub async fn post(Json(value): Json<Value>) -> axum::response::Response {
    if value["action"]=="launch" { request_launch_update();return Json(serde_json::json!({"ok":true,"queued":true})).into_response(); }
    let install=match value["action"].as_str() { Some("check")=>false,Some("install")|Some("launch")=>true,_=>return (axum::http::StatusCode::BAD_REQUEST,Json(serde_json::json!({"error":"Unknown update action."}))).into_response() };
    let silent=value["action"]=="launch" || (!install && value["background"].as_bool().unwrap_or(false));
    // A manual request waits for the current background read, rather than competing with it.
    let _manual_waiter=if !silent { MANUAL_WAITERS.fetch_add(1,std::sync::atomic::Ordering::SeqCst);Some(ManualWaiter) } else { None };
    let wait_until=tokio::time::Instant::now()+Duration::from_secs(35);
    while !silent && { let s=state();s.busy && s.background } && tokio::time::Instant::now()<wait_until { tokio::time::sleep(Duration::from_millis(50)).await; }
    { let mut s=state();if s.busy { return (axum::http::StatusCode::CONFLICT,Json(serde_json::json!({"error":"An update is already running."}))).into_response(); }s.busy=true;s.background=silent;if !silent{s.error=None;s.progress=0;s.message="Checking for updates…".into();} }
    tokio::spawn(async move { let result=run(install, silent).await;let mut s=state();if let Err(error)=result { if !install { s.check_error=Some(error.to_string()); }if !silent||!s.background{s.error=Some(error.to_string());s.message="Update failed. Your installed files were not changed by the downloader.".into();} }s.busy=false;s.background=false; });
    Json(serde_json::json!({"ok":true})).into_response()
}
#[cfg(test)] mod tests {
    #[test]
    fn installer_reason_is_preserved_without_reusing_an_old_failure() {
        let root=std::env::temp_dir().join(format!("plazcode-installer-error-{}",std::process::id()));
        std::fs::create_dir_all(root.join("logs")).unwrap();
        let log=root.join("logs/updater.log");std::fs::write(&log,"PowerShell rejected this script.\n").unwrap();
        let record=serde_json::json!({"version":"1.24.4","at":101,"message":"Cannot replace a locked file."});
        let mut bytes=vec![0xEF,0xBB,0xBF];bytes.extend(serde_json::to_vec(&record).unwrap());std::fs::write(failure_path(&root),bytes).unwrap();
        assert!(installer_failure(&root,"1.24.4",100,&log,Some(1)).contains("Cannot replace a locked file."));
        for (version,started) in [("9.99.0",100),("1.24.3",102)] {
            let error=installer_failure(&root,version,started,&log,Some(1));
            assert!(error.contains("PowerShell rejected this script."));assert!(!error.contains("Cannot replace a locked file."));assert!(error.contains("updater.log"));
        }
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test] fn automatic_install_waits_for_idle_bridge() {
        let idle = super::AUTO_INSTALL_IDLE.as_millis() as u64;
        assert!(!super::busy_at(0, 0, 1_000_000), "never-used bridge may install");
        assert!(super::busy_at(1, 0, 1_000_000), "running tool defers install");
        assert!(super::busy_at(0, 1_000_000, 1_000_000 + idle - 1), "recent tool activity defers install");
        assert!(!super::busy_at(0, 1_000_000, 1_000_000 + idle), "idle bridge installs");
        { let _guard = super::ActivityGuard::enter(); assert!(super::bridge_busy()); }
        assert!(super::bridge_busy(), "completed tool keeps the idle window");
    }
    #[test] fn idle_deferral_is_capped_but_never_interrupts_running_work() {
        let idle = super::AUTO_INSTALL_IDLE.as_millis() as u64;
        let cap = super::AUTO_INSTALL_MAX_DEFER.as_millis() as u64;
        let start = 10_000_000u64;
        assert!(super::should_defer(0, start, start + 1, 0), "recent activity defers");
        assert!(super::should_defer(0, start + cap - 1, start + cap - 1, start), "within cap still defers");
        assert!(!super::should_defer(0, start + cap, start + cap, start), "cap reached installs");
        assert!(super::should_defer(1, start, start + cap * 4, start), "running tool always defers");
        assert!(!super::should_defer(0, start, start + idle, 0), "idle installs");
    }
    #[test] fn rate_limited_metadata_uses_only_fixed_official_assets() {
        let hash = "a".repeat(64);
        let limited = serde_json::json!({"message":"API rate limit exceeded"});
        for mac in [false,true] {
            let expected = format!("https://github.com/stoveez/PlazCode/releases/download/v1.19.30/PlazCode-{}1.19.30.zip",if mac {"macOS-"} else {""});
            for (status, remaining, record) in [(403,None,&limited),(403,Some("0"),&serde_json::Value::Null),(429,None,&serde_json::Value::Null)] {
                assert_eq!(super::verified_official_download(status, remaining, record,"1.19.30","https://untrusted.example/file.zip",&hash,mac).unwrap(),expected);
            }
            assert!(super::verified_official_download(403,None,&limited,"bad-version","https://untrusted.example/file.zip",&hash,mac).is_err());
            assert!(super::verified_official_download(429,None,&limited,"1.19.30","https://untrusted.example/file.zip","bad-hash",mac).is_err());
            for status in [200,401,403,404,500] {
                assert!(super::verified_official_download(status,None,&serde_json::json!({"message":"Forbidden"}),"1.19.30","https://untrusted.example/file.zip",&hash,mac).is_err());
            }
        }
    }
    #[test] fn combined_legacy_installations_select_the_current_platform_feed() {
        for source in [super::DEFAULT_FEED,super::DEFAULT_MAC_FEED,"https://raw.githubusercontent.com/stoveez/PlazCodeneww/main/latest.json","https://raw.githubusercontent.com/stoveez/PlazCodeneww/main/latest-macos.json"] {
            assert_eq!(super::platform_feed(source,true),super::DEFAULT_MAC_FEED);
            assert_eq!(super::platform_feed(source,false),super::DEFAULT_FEED);
        }
        assert_eq!(super::platform_feed("https://example.com/custom.json",true),"https://example.com/custom.json");
    }
    #[test] fn official_release_requires_matching_stable_platform_asset() {
        let ver = "1.19.30"; let hash = "a".repeat(64);
        for mac in [false, true] {
            let name = format!("PlazCode-{}{ver}.zip", if mac { "macOS-" } else { "" });
            let url = format!("https://github.com/stoveez/PlazCode/releases/download/v{ver}/{name}");
            let record = serde_json::json!({"tag_name":format!("v{ver}"),"draft":false,"prerelease":false,"assets":[{"name":name,"state":"uploaded","browser_download_url":url,"digest":format!("sha256:{hash}")}]});
            assert!(super::verify_official_record(&record, ver, &url, &hash, mac).is_ok());
            let raw = format!("https://raw.githubusercontent.com/stoveez/PlazCode/main/{name}");
            assert!(super::verify_official_record(&record, ver, &raw, &hash, mac).is_ok());
            for bad in ["https://example.com/release.zip", "https://raw.githubusercontent.com/stoveez/PlazCode/other/release.zip"] { assert!(super::verify_official_record(&record, ver, bad, &hash, mac).is_err()); }
            assert!(super::verify_official_record(&record, ver, &url, &"b".repeat(64), mac).is_err());
            for (field, value) in [("draft",serde_json::json!(true)),("prerelease",serde_json::json!(true)),("tag_name",serde_json::json!("v1.19.29")),("assets",serde_json::json!([]))] { let mut bad = record.clone();bad[field]=value;assert!(super::verify_official_record(&bad, ver, &url, &hash, mac).is_err()); }
            let mut missing=record.clone();missing["assets"][0]["digest"]=serde_json::Value::Null;assert!(super::verify_official_record(&missing, ver, &url, &hash, mac).is_err());
            assert!(super::verify_official_record(&record, ver, &url, &hash, !mac).is_err());
        }
    }
    #[test] fn missing_helper_is_recovered_without_changing_installation() {
        let root=std::env::temp_dir().join(format!("plazcode-helper-test-{}",std::process::id()));
        std::fs::create_dir_all(root.join("stage")).unwrap();
        assert!(super::stage_helper(&root,&root.join("stage"),true).is_err());
        std::fs::write(root.join("manifest.json"),b"{\"version\":\"1.0.0\"}").unwrap();
        for windows in [true,false] {let path=super::stage_helper(&root,&root.join("stage"),windows).unwrap();assert!(std::fs::metadata(path).unwrap().len()>1000);}
        assert!(!root.join("Update-PlazCode.ps1").exists());
        std::fs::write(root.join("Update-PlazCode.ps1"),"fixture helper").unwrap();
        let staged=super::stage_helper(&root,&root.join("stage"),true).unwrap();assert_eq!(std::fs::read_to_string(staged).unwrap(),"fixture helper");
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test] fn renamed_official_feed_preserves_custom_sources() {
        assert_eq!(super::official_feed("https://raw.githubusercontent.com/stoveez/PlazCodeneww/main/latest.json"),super::DEFAULT_FEED);
        assert_eq!(super::official_feed("https://raw.githubusercontent.com/stoveez/PlazCodeneww/main/latest-macos.json"),super::DEFAULT_MAC_FEED);
        assert_eq!(super::official_feed("https://example.com/custom.json"),"https://example.com/custom.json");
    }

    use super::*;
    #[test] fn extension_metadata_cannot_hide_an_old_desktop_build() {
        assert!(update_available("1.19.17","1.19.17","1.19.17","1.19.15").unwrap());
        assert!(!update_available("1.19.18","1.19.18","1.19.17","1.19.17").unwrap());
        assert!(update_available("1.19.18","1.19.17","1.19.17","1.19.17").unwrap());
        assert!(!update_available("1.19.17","1.19.17","1.19.17","1.19.17").unwrap());
        assert!(update_available("1.19.17","1.19.17","1.19.18","1.19.17").is_err());
    }
    #[tokio::test] #[ignore = "live public repository request"] async fn public_revision_feed_is_current() {
        let mut builder=reqwest::Client::builder();
        if let Ok(path)=std::env::var("SSL_CERT_FILE") { builder=builder.add_root_certificate(reqwest::Certificate::from_pem(&std::fs::read(path).unwrap()).unwrap()); }
        let client=builder.build().unwrap();
        let raw=revision_feed(&client,reqwest::Url::parse(DEFAULT_REFS).unwrap(),"https://raw.githubusercontent.com/stoveez/PlazCode",Duration::from_secs(30)).await.unwrap();
        let value:Value=serde_json::from_slice(&raw).unwrap();
        let (latest,_,_)=validate(&value).unwrap();
        assert!(version(&latest).unwrap()>=version("1.18.101").unwrap());
        println!("Live revision feed: {latest}");
    }
    #[test] fn reference_packets_are_exact_and_bounded() {
        let sha="a".repeat(40);let packet=format!("{sha} refs/heads/main\0capabilities\n");
        let raw=format!("001e# service=git-upload-pack\n0000{:04x}{packet}0000",packet.len()+4);
        assert_eq!(advertised_main(raw.as_bytes()).unwrap(),sha);
        assert!(advertised_main(b"0008abc").is_err());assert!(advertised_main(b"0004").is_err());
        assert!(advertised_main(&vec![b'a';131073]).is_err());
        let packet="not-a-sha refs/heads/main\n";assert!(advertised_main(format!("{:04x}{packet}",packet.len()+4).as_bytes()).is_err());
    }
    #[tokio::test] async fn new_revision_bypasses_stale_branch_feed_and_reuses_unchanged_metadata() {
        use tokio::io::{AsyncReadExt,AsyncWriteExt};
        let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();let base=format!("http://{}",listener.local_addr().unwrap());
        let server=tokio::spawn(async move {
            let mut paths=Vec::new();let mut discovery=0;
            for _ in 0..5 {
                let (mut socket,_)=listener.accept().await.unwrap();let mut request=Vec::new();
                while !request.ends_with(b"\r\n\r\n") {let mut byte=[0];assert_eq!(socket.read(&mut byte).await.unwrap(),1);request.push(byte[0]);}
                let request=String::from_utf8(request).unwrap();let path=request.split_whitespace().nth(1).unwrap().to_owned();paths.push(path.clone());
                let body=if path.starts_with("/refs") {
                    discovery+=1;let sha=if discovery<3 {"a".repeat(40)} else {"b".repeat(40)};
                    let record=format!("{sha} refs/heads/main\n");format!("{:04x}{record}0000",record.len()+4)
                } else {
                    assert!(path.contains(&"a".repeat(40)) || path.contains(&"b".repeat(40)));assert!(!path.contains("/main/"));
                    let version=if path.contains(&"a".repeat(40)) {"1.18.101"}else{"1.18.102"};
                    serde_json::json!({"version":version,"url":"https://example.com/update.zip","sha256":"c".repeat(64)}).to_string()
                };
                socket.write_all(format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
            }paths
        });
        let client=reqwest::Client::builder().no_proxy().build().unwrap();let refs=reqwest::Url::parse(&format!("{base}/refs")).unwrap();
        for expected in ["1.18.101","1.18.101","1.18.102"] {
            let raw=revision_feed(&client,refs.clone(),&base,Duration::from_secs(1)).await.unwrap();let value:Value=serde_json::from_slice(&raw).unwrap();assert_eq!(value["version"],expected);
        }
        let paths=server.await.unwrap();assert_eq!(paths.iter().filter(|path|path.starts_with("/refs")).count(),3);assert_eq!(paths.len(),5);
    }
    #[tokio::test] async fn platform_feeds_do_not_share_cached_payloads() {
        use tokio::io::{AsyncReadExt,AsyncWriteExt};
        let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();let base=format!("http://{}",listener.local_addr().unwrap());
        let server=tokio::spawn(async move {
            let mut paths=Vec::new();
            for _ in 0..4 {
                let (mut socket,_)=listener.accept().await.unwrap();let mut request=Vec::new();
                while !request.ends_with(b"\r\n\r\n") {let mut byte=[0];assert_eq!(socket.read(&mut byte).await.unwrap(),1);request.push(byte[0]);}
                let request=String::from_utf8(request).unwrap();let path=request.split_whitespace().nth(1).unwrap().to_owned();paths.push(path.clone());
                let body=if path=="/refs" {let record=format!("{} refs/heads/main\n","d".repeat(40));format!("{:04x}{record}0000",record.len()+4)}else{
                    serde_json::json!({"version":"1.19.16","url":if path.ends_with("latest-macos.json"){"https://example.com/mac.zip"}else{"https://example.com/windows.zip"},"sha256":"e".repeat(64)}).to_string()
                };
                socket.write_all(format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
            }paths
        });
        let client=reqwest::Client::builder().no_proxy().build().unwrap();let refs=reqwest::Url::parse(&format!("{base}/refs")).unwrap();
        for (name,expected) in [("latest.json","https://example.com/windows.zip"),("latest-macos.json","https://example.com/mac.zip")] {
            let raw=revision_feed_named(&client,refs.clone(),&base,name,Duration::from_secs(1)).await.unwrap();let feed:Value=serde_json::from_slice(&raw).unwrap();assert_eq!(feed["url"],expected);
        }
        assert_eq!(server.await.unwrap().len(),4);
    }
    #[test] fn automatic_check_progress_stays_quiet() {
        let previous=state().clone();
        {let mut s=state();s.background=true;s.message="A newer version is ready to install.".into();s.progress=100;}
        progress(0,"Checking for updates…");assert_eq!(state().message,"A newer version is ready to install.");assert_eq!(state().progress,100);
        {state().background=false;}progress(0,"Checking for updates…");assert_eq!(state().message,"Checking for updates…");assert_eq!(state().progress,0);
        *state()=previous;
    }
    #[test] fn installed_version_supports_split_and_legacy_packages() {
        let root=std::env::temp_dir().join(format!("plazcode-layout-{}",std::process::id()));
        std::fs::create_dir_all(root.join("PlazCode-Extension")).unwrap();
        std::fs::write(root.join("manifest.json"),r#"{"version":"1.18.94"}"#).unwrap();
        assert_eq!(installed_at(&root),"1.18.94");
        std::fs::write(root.join("PlazCode-Extension/manifest.json"),r#"{"version":"1.18.95"}"#).unwrap();
        assert_eq!(installed_at(&root),"1.18.95");
        std::fs::remove_file(root.join("manifest.json")).unwrap();
        assert_eq!(installed_at(&root),"1.18.95");
        std::fs::remove_dir_all(root).unwrap();
    }
    #[tokio::test] async fn checks_reuse_connection_and_bound_stalled_feeds() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        assert_eq!(feed_timeout(true),Duration::from_secs(15));
        assert_eq!(feed_timeout(false),Duration::from_secs(30));
        let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url=reqwest::Url::parse(&format!("http://{}/feed",listener.local_addr().unwrap())).unwrap();
        let server=tokio::spawn(async move {
            let (mut socket,_)=listener.accept().await.unwrap();
            for _ in 0..2 {
                let mut request=Vec::new();
                while !request.ends_with(b"\r\n\r\n") {
                    let mut byte=[0];assert_eq!(socket.read(&mut byte).await.unwrap(),1);request.push(byte[0]);
                }
                socket.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: keep-alive\r\n\r\n{}").await.unwrap();
            }
        });
        let client=reqwest::Client::builder().no_proxy().build().unwrap();
        for _ in 0..2 {assert_eq!(fetch_feed(&client,url.clone(),Duration::from_secs(1)).await.unwrap(),b"{}");}
        server.await.unwrap();
        let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url=reqwest::Url::parse(&format!("http://{}/stalled",listener.local_addr().unwrap())).unwrap();
        let server=tokio::spawn(async move {let (_socket,_)=listener.accept().await.unwrap();tokio::time::sleep(Duration::from_secs(2)).await;});
        let started=tokio::time::Instant::now();
        assert!(fetch_feed(&client,url,Duration::from_millis(30)).await.is_err());
        assert!(started.elapsed()<Duration::from_secs(1));server.abort();
    }
    #[test] fn failed_automatic_install_backs_off_instead_of_restart_looping() {
        let minute=60_000u64;
        let record=|count:u64,at:u64| serde_json::json!({"version":"1.19.36","count":count,"at":at,"message":"PlazCode.exe is still locked"});
        assert_eq!(failure_backoff(None,"1.19.36",1_000),None);
        assert_eq!(failure_backoff(Some(&record(1,1_000)),"1.19.36",1_000),Some(10*minute));
        assert_eq!(failure_backoff(Some(&record(1,1_000)),"1.19.36",1_000+10*minute),None,"first retry after 10 minutes");
        assert_eq!(failure_backoff(Some(&record(2,0)),"1.19.36",19*minute),Some(minute),"second failure waits 20 minutes");
        assert_eq!(failure_backoff(Some(&record(12,0)),"1.19.36",6*60*minute-1),Some(1),"capped at six hours");
        assert_eq!(failure_backoff(Some(&record(12,0)),"1.19.36",6*60*minute),None);
        assert_eq!(failure_backoff(Some(&record(3,1_000)),"1.19.37",1_000),None,"a newer release installs immediately");
        assert_eq!(failure_backoff(Some(&record(1,10*minute)),"1.19.36",0),Some(10*minute),"clock skew is bounded");
        assert_eq!(failure_backoff(Some(&serde_json::json!({"version":"1.19.36"})),"1.19.36",5),None,"malformed record never blocks updates");
        let root=std::env::temp_dir().join(format!("plazcode-failure-{}",std::process::id()));let _=std::fs::remove_dir_all(&root);
        record_failure(&root,"1.19.36","download stalled",1_000);
        record_failure(&root,"1.19.36","download stalled",30_000);
        assert_eq!(read_failure(&root).unwrap()["count"],1,"helper/desktop double report counts once");
        record_failure(&root,"1.19.36","download stalled",100_000);
        assert_eq!(read_failure(&root).unwrap()["count"],2);
        std::fs::write(failure_path(&root),b"\xEF\xBB\xBF{\"version\":\"1.19.36\",\"count\":3,\"at\":5}").unwrap();
        assert_eq!(read_failure(&root).unwrap()["count"],3,"PowerShell UTF-8 BOM record is read");
        record_failure(&root,"1.19.37","other",500_000);
        assert_eq!(read_failure(&root).unwrap()["count"],1);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test] fn update_leftovers_are_removed_only_when_stale_and_owned() {
        let base=std::env::temp_dir().join(format!("plazcode-leftovers-{}",std::process::id()));let _=std::fs::remove_dir_all(&base);
        let temp=base.join("temp");let root=base.join("install");
        for name in ["PlazCode-download-1-1","PlazCode-update-abc","Other-folder"] { std::fs::create_dir_all(temp.join(name)).unwrap(); std::fs::write(temp.join(name).join("release.zip"),b"x").unwrap(); }
        std::fs::create_dir_all(root.join("logs")).unwrap();
        let aside=root.join("PlazCode.exe.plazcode-old-0123abcd");std::fs::write(&aside,b"old").unwrap();
        let foreign=base.join("outside.plazcode-old-0123abcd");std::fs::write(&foreign,b"keep").unwrap();
        let unowned=root.join("config.json");std::fs::write(&unowned,b"{}").unwrap();
        std::fs::write(root.join("logs/update-moved-aside.txt"),format!("\u{feff}{}\r\n{}\n{}\n",aside.display(),foreign.display(),unowned.display())).unwrap();
        let now=std::time::SystemTime::now();
        cleanup_update_leftovers(&temp,&root,now);
        assert!(temp.join("PlazCode-download-1-1").exists(),"a running install may still use a fresh download");
        assert!(!aside.exists() && foreign.exists() && unowned.exists());
        assert!(!root.join("logs/update-moved-aside.txt").exists());
        cleanup_update_leftovers(&temp,&root,now+Duration::from_secs(2*60*60));
        assert!(!temp.join("PlazCode-download-1-1").exists() && temp.join("PlazCode-update-abc").exists() && temp.join("Other-folder").exists());
        cleanup_update_leftovers(&temp,&root,now+Duration::from_secs(8*24*60*60));
        assert!(!temp.join("PlazCode-update-abc").exists() && temp.join("Other-folder").exists());
        std::fs::remove_dir_all(base).unwrap();
    }
    #[tokio::test] async fn slow_download_is_not_cut_by_the_metadata_timeout() {
        assert!(DOWNLOAD_TOTAL_TIMEOUT >= Duration::from_secs(1800) && DOWNLOAD_STALL_TIMEOUT == Duration::from_secs(60));
        let source=include_str!("updater.rs");
        assert!(source.contains(".timeout(DOWNLOAD_TOTAL_TIMEOUT).send()"),"download overrides the 180 s client timeout");
        assert!(source.contains("tokio::time::timeout(DOWNLOAD_STALL_TIMEOUT, stream.next())"),"stalled downloads are bounded");
    }
    #[test] fn release_validation_and_versions() {
        assert!(version("1.18.80").unwrap()>version("1.18.79").unwrap());assert_eq!(version("1.18.80").unwrap(),version("1.18.80.0").unwrap());assert!(version("bad").is_err());
        assert!(validate(&serde_json::json!({"version":"1.18.80","url":"http://example.com/a.zip","sha256":"a".repeat(64)})).is_err());
        assert!(validate(&serde_json::json!({"version":"1.18.80","url":"https://example.com/a.zip","sha256":"bad"})).is_err());
        assert!(validate(&serde_json::json!({"version":"1.18.80","url":"https://example.com/a.zip","sha256":"a".repeat(64)})).is_ok());
    }
}

#[cfg(test)]
mod transport_fallback_tests {
    use super::*;
    #[test]
    fn server_error_reply_alone_never_skips_the_record_check() {
        // A 5xx body is not trusted on its own; only the transport loop
        // (after a retry) switches to the fixed official asset.
        let hash = "a".repeat(64);
        assert!(verified_official_download(503, None, &Value::Null, "1.20.0", "x", &hash, false).is_err());
        let url = official_asset_fallback("1.20.0", &hash, false).unwrap();
        assert!(url.ends_with("/v1.20.0/PlazCode-1.20.0.zip"), "{url}");
    }
    #[test]
    fn unreachable_api_uses_fixed_official_asset() {
        let hash = "b".repeat(64);
        let url = official_asset_fallback("1.20.0", &hash, true).unwrap();
        assert!(url.ends_with("/v1.20.0/PlazCode-macOS-1.20.0.zip"), "{url}");
    }
    #[test]
    fn fallback_still_rejects_bad_checksum() {
        assert!(official_asset_fallback("1.20.0", "zz", false).is_err());
    }
}
