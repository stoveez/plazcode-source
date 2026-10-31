use axum::response::IntoResponse;
use axum::http::HeaderMap;

pub fn valid_key(key: &str) -> bool {
    key.len() == 64 && key.bytes().all(|b| b.is_ascii_hexdigit())
}

pub fn allowed_authority(headers: &HeaderMap) -> bool {
    let Some(host)=headers.get("host") else {return true;};
    let Ok(text)=host.to_str() else {return false;};
    let Ok(authority)=text.parse::<axum::http::uri::Authority>() else {return false;};
    let host=authority.host().trim_start_matches('[').trim_end_matches(']');
    host.eq_ignore_ascii_case("localhost") || host.eq_ignore_ascii_case("plazcode.localhost") ||
        host.parse::<std::net::IpAddr>().map(|ip|ip.is_loopback()).unwrap_or(false)
}

fn chromium_id(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|c| (b'a'..=b'p').contains(&c))
}

fn firefox_uuid(id: &str) -> bool {
    id.len() == 36 && id.bytes().enumerate().all(|(i, c)| {
        if matches!(i, 8 | 13 | 18 | 23) { c == b'-' } else { c.is_ascii_hexdigit() }
    })
}

/// 1.24.30 (owner, 2026-10-31: someone edited PlazCode's extension with an AI and it still worked with the
/// app). Chrome, Edge and Brave give an unpacked extension an ID derived from the folder it was loaded from
/// (SHA-256 of the absolute path; UTF-16 on Windows with an upper-case drive letter, UTF-8 elsewhere; the
/// first 16 bytes as letters a-p). The app verifies its own installation folder at startup, so it accepts
/// only the IDs of that verified folder (PlazCode-Extension, plus the legacy root copy). An edited copy in
/// any other folder gets another ID and is refused. Firefox gives random IDs, so it is unchanged.
/// Calculation checked against the real IDs Chrome gave the owner's two PlazCode folders on 2026-10-31.
pub fn chromium_id_for_path(path: &std::path::Path) -> String {
    use sha2::Digest;
    #[cfg(windows)]
    let bytes: Vec<u8> = {
        use std::os::windows::ffi::OsStrExt;
        let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
        if wide.len() > 1 && wide[1] == u16::from(b':') && (u16::from(b'a')..=u16::from(b'z')).contains(&wide[0]) { wide[0] -= 32; }
        wide.iter().flat_map(|unit| unit.to_le_bytes()).collect()
    };
    #[cfg(not(windows))]
    let bytes: Vec<u8> = { use std::os::unix::ffi::OsStrExt; path.as_os_str().as_bytes().to_vec() };
    sha2::Sha256::digest(&bytes)[..16].iter().flat_map(|b| [b >> 4, b & 15]).map(|n| char::from(b'a' + n)).collect()
}
/// The folder forms a browser may have recorded: as the app sees it, and the real on-disk form (symlinks
/// resolved on Mac/Linux, exact letter case on Windows), each without a \\?\ prefix.
fn folder_forms(folder: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut forms = vec![folder.to_path_buf()];
    if let Ok(real) = std::fs::canonicalize(folder) {
        let text = real.to_string_lossy();
        let plain = text.strip_prefix(r"\\?\UNC\").map(|rest| std::path::PathBuf::from(format!(r"\\{rest}")))
            .or_else(|| text.strip_prefix(r"\\?\").map(std::path::PathBuf::from)).unwrap_or(real.clone());
        forms.push(plain);
    }
    forms.dedup();
    forms
}
pub fn official_extension_ids_for(root: &std::path::Path) -> Vec<String> {
    let mut folders = vec![root.join("PlazCode-Extension")];
    if root.join("manifest.json").is_file() { folders.push(root.to_path_buf()); }
    let mut ids: Vec<String> = folders.iter().flat_map(|folder| folder_forms(folder)).map(|path| chromium_id_for_path(&path)).collect();
    ids.sort(); ids.dedup();
    ids
}
static OFFICIAL_IDS: std::sync::OnceLock<Option<Vec<String>>> = std::sync::OnceLock::new();
/// Called once by the app after its installation passed the signed check, before the bridge starts.
/// Never set (unprotected development builds, unit tests) = every well-formed ID is accepted.
pub fn set_official_extension_ids(ids: Option<Vec<String>>) { let _ = OFFICIAL_IDS.set(ids); }
fn official_extension_ids() -> &'static Option<Vec<String>> {
    OFFICIAL_IDS.get().unwrap_or(&None)
}
fn official_chromium(id: &str, official: &Option<Vec<String>>) -> bool {
    chromium_id(id) && official.as_ref().map_or(true, |ids| ids.iter().any(|known| known == id))
}
pub const UNOFFICIAL_EXTENSION: &str = "This PlazCode extension is not the official one from this PlazCode folder, so the app will not connect to it. Load the PlazCode-Extension folder from the PlazCode folder you downloaded (Remove the old one first), or download the complete official version from https://github.com/stoveez/PlazCode/releases .";
/// True when the request names a Chromium extension that is not this installation's official one.
pub fn unofficial_extension(headers: &HeaderMap) -> bool {
    unofficial_extension_with(headers, official_extension_ids())
}
fn unofficial_extension_with(headers: &HeaderMap, official: &Option<Vec<String>>) -> bool {
    let named = headers.get("x-plazcode-extension").and_then(|v| v.to_str().ok()).map(str::to_owned);
    let origin = headers.get("origin").and_then(|v| v.to_str().ok()).and_then(|v| v.strip_prefix("chrome-extension://")).map(str::to_owned);
    [named, origin].into_iter().flatten().any(|id| chromium_id(&id) && !official_chromium(&id, official))
}
pub fn can_auto_pair(headers: &HeaderMap) -> bool {
    can_auto_pair_with(headers, official_extension_ids())
}
fn can_auto_pair_with(headers: &HeaderMap, official: &Option<Vec<String>>) -> bool {
    if !allowed_authority(headers) {return false;}
    let Some(id) = headers.get("x-plazcode-extension").and_then(|v| v.to_str().ok()) else { return false; };
    let scheme = if official_chromium(id, official) { "chrome-extension" }
        else if firefox_uuid(id) { "moz-extension" } else { return false; };
    if headers.get("content-type").and_then(|v| v.to_str().ok()) != Some("application/json") { return false; }
    match headers.get("origin") {
        Some(origin) => origin.to_str().ok().map(|v| v == format!("{scheme}://{id}")).unwrap_or(false),
        None => true,
    }
}

pub fn allowed_origin(headers: &HeaderMap) -> bool {
    allowed_origin_with(headers, official_extension_ids())
}
fn allowed_origin_with(headers: &HeaderMap, official: &Option<Vec<String>>) -> bool {
    match headers.get("origin") {
        None => true,
        Some(value) => {
            let Ok(origin) = value.to_str() else { return false; };
            if matches!(origin, "http://127.0.0.1:3000" | "http://localhost:3000" | "http://plazcode.localhost") {
                return true;
            }
            origin.strip_prefix("chrome-extension://").map(|id| official_chromium(id, official)).unwrap_or(false)
                || origin.strip_prefix("moz-extension://").map(firefox_uuid).unwrap_or(false)
        }
    }
}

pub fn authorized(headers: &HeaderMap, key: &str) -> bool {
    if !valid_key(key) || !allowed_origin(headers) || !allowed_authority(headers) { return false; }
    let bearer = headers.get("authorization").and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));
    let protocol = headers.get("sec-websocket-protocol").and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').find_map(|p| p.trim().strip_prefix("plazcode-auth.")));
    bearer.or(protocol).map(|candidate| {
        candidate.len() == key.len() && candidate.bytes().zip(key.bytes()).fold(0u8, |d, (a, b)| d | (a ^ b)) == 0
    }).unwrap_or(false)
}

pub fn load_key() -> anyhow::Result<String> {
    use std::io::Write;
    let base = std::env::var_os("LOCALAPPDATA").or_else(|| std::env::var_os("XDG_CONFIG_HOME"))
        .map(std::path::PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|p| std::path::PathBuf::from(p).join(".config")))
        .ok_or_else(|| anyhow::anyhow!("Cannot locate the user's pairing-key directory"))?;
    let dir = base.join("PlazCode");
    std::fs::create_dir_all(&dir)?;
    #[cfg(unix)] {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700))?;
    }
    let path = dir.join("bridge-key");
    if path.exists() {
        anyhow::ensure!(!std::fs::symlink_metadata(&path)?.file_type().is_symlink(), "Pairing key must not be a symlink");
        #[cfg(unix)] {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path,std::fs::Permissions::from_mode(0o600))?;
        }
        let key = std::fs::read_to_string(&path)?;
        anyhow::ensure!(valid_key(&key), "Invalid pairing key: {}", path.display());
        return Ok(key);
    }
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).map_err(|e| anyhow::anyhow!("Cannot generate pairing key: {e}"))?;
    let key: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)] {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(&path)?.write_all(key.as_bytes())?;
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn only_this_installations_extension_folder_may_pair() {
        // The calculation matches IDs Chrome really assigned (owner's PC, 2026-10-31).
        #[cfg(windows)] {
            assert_eq!(chromium_id_for_path(std::path::Path::new(r"C:\Users\plazm\OneDrive\Desktop\PlazCode\PlazCode\PlazCode-Extension")),"fhpndafcglkjdkdnjfmjahbbapgpkdcb");
            assert_eq!(chromium_id_for_path(std::path::Path::new(r"c:\Users\plazm\Downloads\PlazCode-1.24.28\PlazCode\PlazCode-Extension")),"gplplbmkpgoinjckfhgbkjmifdeoglmj");
        }
        #[cfg(not(windows))] assert_eq!(chromium_id_for_path(std::path::Path::new("/a")),{
            use sha2::Digest; sha2::Sha256::digest(b"/a")[..16].iter().flat_map(|b|[b>>4,b&15]).map(|n|char::from(b'a'+n)).collect::<String>()});
        let root=std::env::temp_dir().join(format!("plazcode-ext-ids-{}",std::process::id()));let _=std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("PlazCode-Extension")).unwrap();
        let ids=official_extension_ids_for(&root);
        let official=chromium_id_for_path(&std::fs::canonicalize(root.join("PlazCode-Extension")).unwrap());
        assert!(ids.contains(&official));
        let legacy=chromium_id_for_path(&root);assert!(!ids.contains(&legacy),"no root copy, no root ID");
        std::fs::write(root.join("manifest.json"),"{}").unwrap();
        assert!(official_extension_ids_for(&root).iter().any(|id|*id==legacy||*id==chromium_id_for_path(&std::fs::canonicalize(&root).unwrap())),"legacy root copy accepted");
        let pinned=Some(ids);let copy="b".repeat(32);
        let headers=|id:&str|{let mut h=HeaderMap::new();h.insert("host","127.0.0.1:3000".parse().unwrap());h.insert("content-type","application/json".parse().unwrap());
            h.insert("x-plazcode-extension",id.parse().unwrap());h.insert("origin",format!("chrome-extension://{id}").parse().unwrap());h};
        assert!(can_auto_pair_with(&headers(&official),&pinned)&&allowed_origin_with(&headers(&official),&pinned)&&!unofficial_extension_with(&headers(&official),&pinned));
        assert!(!can_auto_pair_with(&headers(&copy),&pinned)&&!allowed_origin_with(&headers(&copy),&pinned)&&unofficial_extension_with(&headers(&copy),&pinned));
        // Firefox (random IDs) and the desktop page are unchanged; unprotected development builds accept any ID.
        let firefox="12345678-1234-1234-1234-123456789abc";let mut h=headers(firefox);h.insert("origin",format!("moz-extension://{firefox}").parse().unwrap());
        assert!(can_auto_pair_with(&h,&pinned)&&!unofficial_extension_with(&h,&pinned));
        let mut page=HeaderMap::new();page.insert("origin","http://127.0.0.1:3000".parse().unwrap());assert!(allowed_origin_with(&page,&pinned));
        assert!(can_auto_pair_with(&headers(&copy),&None)&&!unofficial_extension_with(&headers(&copy),&None));
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test] fn rejects_rebound_hosts_and_preserves_loopback_pairing() {
        let mut h=HeaderMap::new();
        for host in ["127.0.0.1:3000","localhost:17613","[::1]:17615","plazcode.localhost"] {
            h.insert("host",host.parse().unwrap());assert!(allowed_authority(&h));
        }
        for host in ["evil.example:3000","127.0.0.1.evil.example","192.168.1.1:3000","localhost@evil.example","null"] {
            h.insert("host",host.parse().unwrap());assert!(!allowed_authority(&h),"{host}");
        }
        for (scheme,id) in [("chrome-extension","a".repeat(32)),("moz-extension","12345678-1234-1234-1234-123456789abc".to_string())] {
            h.insert("host","127.0.0.1:3000".parse().unwrap());h.insert("content-type","application/json".parse().unwrap());
            h.insert("x-plazcode-extension",id.parse().unwrap());h.insert("origin",format!("{scheme}://{id}").parse().unwrap());
            assert!(can_auto_pair(&h));h.insert("origin","https://evil.example".parse().unwrap());assert!(!can_auto_pair(&h));
        }
    }
    #[test]
    fn rejects_missing_wrong_and_web_origin_credentials() {
        let key = "a".repeat(64);
        let mut h = HeaderMap::new();
        assert!(!authorized(&h, &key));
        h.insert("authorization", format!("Bearer {}", "b".repeat(64)).parse().unwrap());
        assert!(!authorized(&h, &key));
        h.insert("authorization", format!("Bearer {key}").parse().unwrap());
        assert!(authorized(&h, &key));
        h.insert("origin", "https://example.com".parse().unwrap());
        assert!(!authorized(&h, &key));
        h.insert("origin", format!("chrome-extension://{}", "a".repeat(32)).parse().unwrap());
        assert!(authorized(&h, &key));
        h.remove("authorization");
        h.insert("sec-websocket-protocol", format!("plazcode, plazcode-auth.{key}").parse().unwrap());
        assert!(authorized(&h, &key));
        h.insert("origin", "null".parse().unwrap());
        assert!(!authorized(&h, &key));
        h.insert("origin", "http://plazcode.localhost".parse().unwrap());
        assert!(authorized(&h, &key));
    }
}

pub async fn require_pairing(
    axum::extract::State(key): axum::extract::State<std::sync::Arc<String>>,
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    if request.uri().path() == "/api/pair" && request.method() == axum::http::Method::POST {
        if !can_auto_pair(request.headers()) {
            if unofficial_extension(request.headers()) {
                tracing::warn!("Refused to pair with an extension that is not this installation's official PlazCode-Extension");
                return (axum::http::StatusCode::FORBIDDEN, UNOFFICIAL_EXTENSION).into_response();
            }
            return (axum::http::StatusCode::FORBIDDEN, "Browser extension pairing required").into_response();
        }
        let mut response = axum::Json(serde_json::json!({ "key": key.as_str() })).into_response();
        response.headers_mut().insert("cache-control", "no-store".parse().unwrap());
        return response;
    }
    if unofficial_extension(request.headers()) {
        return (axum::http::StatusCode::FORBIDDEN, UNOFFICIAL_EXTENSION).into_response();
    }
    if !authorized(request.headers(), &key) {
        return (axum::http::StatusCode::UNAUTHORIZED, "Pair PlazCode using the key in the agent window").into_response();
    }
    next.run(request).await
}
