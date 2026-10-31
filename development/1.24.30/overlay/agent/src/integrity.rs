//! Offline release integrity. Only a pinned public key is shipped; no browser claim grants trust.
use anyhow::{ensure, Context, Result};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, io::Read, path::Path};

const DOMAIN: &[u8] = b"PlazCode release v1\n";
pub const RECOVERY: &str = "PlazCode program files changed or are incomplete. Download the complete official version from https://github.com/stoveez/PlazCode/releases . Your skills, notes and settings are not part of this check.";
const MAX_MANIFEST: u64 = 4 * 1024 * 1024;
const MAX_FILE: u64 = 256 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope { payload: String, signature: String }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FileRecord { sha256: String, bytes: u64, #[serde(default)] mode: Option<u32> }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Files { schema: u32, kind: String, version: String, platform: String, channel: String, files: BTreeMap<String,FileRecord> }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Update { schema: u32, kind: String, channel: String, version: String, platform: String, sha256: String }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Bootstrap {files:BTreeMap<String,String>,blobs:BTreeMap<String,String>}

fn unhex(text: &str) -> Result<Vec<u8>> {
    ensure!(text.len()%2==0 && text.bytes().all(|b| b.is_ascii_hexdigit()), "Invalid signed metadata encoding");
    (0..text.len()).step_by(2).map(|i| Ok(u8::from_str_radix(&text[i..i+2],16)?)).collect()
}
pub fn channel() -> &'static str { option_env!("PLAZCODE_PROTECTION_CHANNEL").unwrap_or("release") }
pub fn public_key() -> Result<Option<Vec<u8>>> {
    if cfg!(debug_assertions) { return Ok(None); }
    let hex = option_env!("PLAZCODE_RELEASE_PUBLIC_KEY").unwrap_or(include_str!("../../release-public-key.hex")).trim();
    if hex.is_empty() && cfg!(debug_assertions) { return Ok(None); }
    let key=unhex(hex)?;
    ensure!(key.len()==32 && matches!(channel(),"release"|"validation"), "Release protection is not configured; unsigned release builds must not ship");
    Ok(Some(key))
}
fn signed_payload(key: &[u8], raw: &[u8]) -> Result<String> {
    ensure!(raw.len() as u64 <= MAX_MANIFEST, "Signed manifest is too large");
    let signed: Envelope=serde_json::from_slice(raw)?;
    let signature=unhex(&signed.signature)?;
    ensure!(key.len()==32 && signature.len()==64,"Invalid signature size");
    let mut message=DOMAIN.to_vec(); message.extend_from_slice(signed.payload.as_bytes());
    ring::signature::UnparsedPublicKey::new(&ring::signature::ED25519,key).verify(&message,&signature)
        .map_err(|_| anyhow::anyhow!("Invalid release signature"))?;
    Ok(signed.payload)
}
pub fn safe_path(name: &str) -> bool {
    !name.is_empty() && name.len()<=512 && !name.bytes().any(|b| b==b'\\' || b==b':' || b<32) &&
        name.split('/').all(|p| !p.is_empty() && p!="." && p!=".." && !p.ends_with('.') && !p.ends_with(' '))
}
// 1.24.28 (owner, 2026-10-31: "Update failed: Release signature or file verification failed",
// only sometimes). The published package verified cleanly; on Windows, antivirus and indexers
// briefly open freshly unpacked files (above all new .exe/.dll/.ps1 files) in a way that makes
// other programs' opens fail with "access denied" or "file in use". Only those passing OS
// errors are retried, for about 7 seconds. A wrong size, wrong content, missing file or symlink
// still fails at once, so no check is relaxed.
const TRANSIENT_WAITS_MS: [u64; 5] = [250, 500, 1000, 2000, 3000];
fn transient_code(code: i32) -> bool { matches!(code, 5 | 32 | 33) } // ERROR_ACCESS_DENIED, SHARING_VIOLATION, LOCK_VIOLATION
fn transient_io(error: &anyhow::Error) -> bool {
    cfg!(windows) && error.chain().filter_map(|e| e.downcast_ref::<std::io::Error>()).any(|e| e.raw_os_error().is_some_and(transient_code))
}
fn retry_transient<T>(waits: &[u64], is_transient: impl Fn(&anyhow::Error) -> bool, mut sleep: impl FnMut(u64), mut attempt: impl FnMut() -> Result<T>) -> Result<T> {
    let mut waits = waits.iter();
    loop {
        match attempt() {
            Err(error) if is_transient(&error) => match waits.next() { Some(ms) => sleep(*ms), None => return Err(error) },
            other => return other,
        }
    }
}
fn hash_file(root: &Path, name: &str, record: &FileRecord) -> Result<()> {
    retry_transient(&TRANSIENT_WAITS_MS, transient_io, |ms| std::thread::sleep(std::time::Duration::from_millis(ms)), || hash_file_once(root, name, record))
}
fn hash_file_once(root: &Path, name: &str, record: &FileRecord) -> Result<()> {
    ensure!(safe_path(name) && record.bytes<=MAX_FILE,"Unsafe manifest file");
    let mut path=root.to_owned();
    for part in name.split('/') {
        path.push(part);
        ensure!(!std::fs::symlink_metadata(&path)?.file_type().is_symlink(),"Symlink in program path");
    }
    let mut file=std::fs::File::open(&path)?;
    ensure!(file.metadata()?.is_file() && file.metadata()?.len()==record.bytes,"Program file size changed: {name}");
    let mut digest=Sha256::new(); let mut buffer=[0u8;65536]; let mut total=0u64;
    loop { let size=file.read(&mut buffer)?; if size==0 { break; } total+=size as u64;ensure!(total<=record.bytes,"Program file grew during verification");digest.update(&buffer[..size]); }
    ensure!(total==record.bytes && format!("{:x}",digest.finalize())==record.sha256,"Program file changed: {name}");
    Ok(())
}
fn manifest(root: &Path, key: &[u8], version: &str, platform: &str, channel: &str) -> Result<Files> {
    let path=root.join("PlazCode-Extension/plazcode-installation-integrity.json");
    let meta=std::fs::symlink_metadata(&path)?;
    ensure!(!meta.file_type().is_symlink() && meta.len()<=MAX_MANIFEST,"Unsafe file manifest");
    manifest_from(&std::fs::read(path)?,key,version,platform,channel)
}
fn manifest_from(raw: &[u8], key: &[u8], version: &str, platform: &str, channel: &str) -> Result<Files> {
    let value: Files=serde_json::from_str(&signed_payload(key,raw)?)?;
    ensure!(value.schema==1 && value.kind=="files" && value.version==version && value.platform==platform && value.channel==channel,"Wrong file manifest version/platform/channel");
    ensure!(!value.files.is_empty() && value.files.len()<=12000,"Invalid signed file list");
    for required in ["manifest.json","background.js","core/main.js","PlazCode-Extension/manifest.json"] {
        ensure!(value.files.contains_key(required),"Required program file missing from manifest");
    }
    let native=match platform {"windows"=>"PlazCode.exe","macos"=>"PlazCode.app/Contents/MacOS/PlazCode",_=>"PlazCode"};
    ensure!(value.files.contains_key(native),"Native executable missing from manifest");
    Ok(value)
}
fn verify_tree_with(root: &Path, key: &[u8], version: &str, platform: &str, channel: &str) -> Result<()> {
    let value=manifest(root,key,version,platform,channel)?;
    verify_files(root,&value.files)
}
// Bounded parallel reads avoid serializing thousands of filesystem/antivirus
// round trips before the desktop opens. Every signed entry still goes through
// the same path, size and SHA-256 checks; nothing is cached or trusted by mtime.
fn verify_files(root: &Path, files: &BTreeMap<String,FileRecord>) -> Result<()> {
    if files.len()<32 {
        for (name,record) in files {hash_file(root,name,record)?;}
        return Ok(());
    }
    let entries:Vec<_>=files.iter().collect();
    let next=std::sync::atomic::AtomicUsize::new(0);
    std::thread::scope(|scope| {
        let workers:Vec<_>=(0..4).map(|_|scope.spawn(|| -> Result<()> {
            loop {
                let index=next.fetch_add(1,std::sync::atomic::Ordering::Relaxed);
                let Some((name,record))=entries.get(index) else {return Ok(());};
                hash_file(root,name,record).with_context(||format!("Program check failed: {name}"))?;
            }
        })).collect();
        // Join every worker before allowing startup or returning any failure.
        let outcomes:Vec<_>=workers.into_iter().map(|worker|worker.join()).collect();
        for outcome in outcomes {outcome.map_err(|_|anyhow::anyhow!("Program verification worker failed"))??;}
        Ok(())
    })
}
fn bootstrap_path(name: &str) -> bool {
    if !safe_path(name) || name.starts_with("PlazCode-Extension/") || name.starts_with("PlazCode.app/") || matches!(name,"PlazCode"|"PlazCode.exe") {return false;}
    let first=name.split('/').next().unwrap_or("");
    if matches!(first,"core"|"providers"|"ui"|"runtime"|"macos"|"agent"|"PlazCode-Extension-Firefox") {return true;}
    !name.contains('/') && (matches!(name,"manifest.json"|"plazcode-extension-integrity.json"|"overlay.css"|"popup.html"|"ollama.html"|"icon.png") || [".js",".py",".cjs",".cs",".dll",".ps1",".bat",".cmd",".command"].iter().any(|suffix|name.ends_with(suffix)))
}
fn bootstrap_legacy(root: &Path, key: &[u8], version: &str, platform: &str, channel: &str) -> Result<()> {
    use base64::Engine;
    let value=manifest(root,key,version,platform,channel)?;
    // Older installers refresh the native executable and Chromium directory, but skip legacy mirrors.
    // Authenticate those authoritative bytes before restoring mirrors from a signed bootstrap blob.
    let blob="PlazCode-Extension/plazcode-bootstrap.json";
    for (name,record) in &value.files {if !bootstrap_path(name) {hash_file(root,name,record)?;}}
    let raw=std::fs::read(root.join(blob))?;
    ensure!(raw.len()<=128*1024*1024,"Bootstrap is too large");
    let encoded:Bootstrap=serde_json::from_slice(&raw)?;
    ensure!(encoded.files.len()<=12000 && encoded.blobs.len()<=12000,"Invalid bootstrap file count");
    let mut pending=Vec::new();let mut total=0usize;
    for (name,hash) in encoded.files {
        ensure!(bootstrap_path(&name),"User data or an unsafe path in bootstrap");
        let expected=value.files.get(&name).context("Bootstrap file is not signed")?;
        ensure!(hash==expected.sha256,"Bootstrap hash is not signed");
        let text=encoded.blobs.get(&hash).context("Missing bootstrap bytes")?;
        let bytes=base64::engine::general_purpose::STANDARD.decode(text)?;total+=bytes.len();
        ensure!(total<=128*1024*1024 && bytes.len() as u64==expected.bytes && format!("{:x}",Sha256::digest(&bytes))==expected.sha256,"Bootstrap bytes do not match signed files");
        let mut path=root.to_owned();for part in name.split('/') {path.push(part);if let Ok(meta)=std::fs::symlink_metadata(&path) {ensure!(!meta.file_type().is_symlink(),"Symlink in migration path");}}
        if let Some(mode)=expected.mode {ensure!(mode<=0o777,"Unsafe bootstrap permissions");}
        if hash_file(root,&name,expected).is_err() {pending.push((path,bytes,expected.mode));}
    }
    for (path,bytes,mode) in pending {
        std::fs::create_dir_all(path.parent().context("Invalid migration parent")?)?;
        let temporary=path.with_extension(format!("plazcode-stage-{}",std::process::id()));
        let mut file=std::fs::OpenOptions::new().write(true).create_new(true).open(&temporary)?;
        std::io::Write::write_all(&mut file,&bytes)?;file.sync_all()?;drop(file);
        #[cfg(unix)] {
            use std::os::unix::fs::PermissionsExt;
            let permissions=mode.or_else(||std::fs::metadata(&path).ok().map(|meta|meta.permissions().mode()&0o777)).unwrap_or(0o644);
            std::fs::set_permissions(&temporary,std::fs::Permissions::from_mode(permissions))?;
        }
        #[cfg(not(unix))] let _=mode;
        std::fs::rename(temporary,path)?;
    }
    verify_tree_with(root,key,version,platform,channel)
}
pub fn platform() -> &'static str {
    if cfg!(windows) {"windows"} else if cfg!(target_os="macos") {"macos"} else {"linux"}
}
fn verify_running_executable(executable:&Path,value:&Files,platform:&str)->Result<()> {
    let name=match platform {"windows"=>"PlazCode.exe","macos"=>"PlazCode.app/Contents/MacOS/PlazCode",_=>"PlazCode"};
    let expected=value.files.get(name).context("Native fingerprint missing")?;
    let parent=executable.parent().context("Executable parent missing")?;
    let filename=executable.file_name().and_then(|s|s.to_str()).context("Executable filename missing")?;
    hash_file(parent,filename,expected)
}
pub fn verify_package(root: &Path, version: &str) -> Result<()> {
    let key=public_key()?.context("Signed-package verification requires a configured public key")?;
    verify_tree_with(root,&key,version,platform(),channel()).context(RECOVERY)
}
// 1.24.29 (owner, 2026-10-31: updates still failed "Release signature or file verification failed"
// on some testers' PCs). The published packages verify perfectly; what failed was re-reading ~3,000
// files just unpacked into %TEMP%, which security software scans and holds (PowerShell unpacking an
// unsigned .exe into Temp is a classic malware pattern to them). The updater now checks the SAME signed
// file list against the downloaded ZIP itself, before anything is unpacked: same signature, same
// version/platform/channel, every listed file present with its exact size and SHA-256. Unsafe or
// duplicate names, links, encryption and ZIP64 are refused. Nothing is relaxed.
struct ZipEntry { method: u16, flags: u16, compressed: u64, size: u64, offset: u64, link: bool }
fn le16(b: &[u8], at: usize) -> Result<u16> { Ok(u16::from_le_bytes(b.get(at..at+2).context("Truncated ZIP")?.try_into()?)) }
fn le32(b: &[u8], at: usize) -> Result<u32> { Ok(u32::from_le_bytes(b.get(at..at+4).context("Truncated ZIP")?.try_into()?)) }
fn zip_entries(zip: &[u8]) -> Result<BTreeMap<String,ZipEntry>> {
    ensure!(zip.len()>=22,"Not a ZIP package");
    let lowest=zip.len().saturating_sub(22+65535);
    let end=(lowest..=zip.len()-22).rev().find(|&at| zip[at..at+4]==[0x50,0x4b,0x05,0x06] && at+22+le16(zip,at+20).unwrap_or(u16::MAX) as usize==zip.len()).context("ZIP directory not found")?;
    let (count,cd_size,cd_offset)=(le16(zip,end+10)?,le32(zip,end+12)? as usize,le32(zip,end+16)? as usize);
    ensure!(le16(zip,end+4)?==0 && le16(zip,end+6)?==0 && le16(zip,end+8)?==count && count!=u16::MAX && cd_offset!=u32::MAX as usize,"Unsupported ZIP layout");
    ensure!(cd_offset.checked_add(cd_size).is_some_and(|stop| stop<=end),"Invalid ZIP directory");
    let (mut entries,mut lower)=(BTreeMap::new(),std::collections::BTreeSet::new());
    let mut at=cd_offset;
    for _ in 0..count {
        ensure!(le32(zip,at)?==0x02014b50,"Invalid ZIP directory entry");
        let (made,flags,method)=(le16(zip,at+4)?,le16(zip,at+8)?,le16(zip,at+10)?);
        let (compressed,size,offset)=(le32(zip,at+20)? as u64,le32(zip,at+24)? as u64,le32(zip,at+42)? as u64);
        let (name_len,extra_len,comment_len)=(le16(zip,at+28)? as usize,le16(zip,at+30)? as usize,le16(zip,at+32)? as usize);
        ensure!(compressed!=u32::MAX as u64 && size!=u32::MAX as u64 && offset!=u32::MAX as u64,"ZIP64 packages are not supported");
        let name=std::str::from_utf8(zip.get(at+46..at+46+name_len).context("Truncated ZIP name")?).context("ZIP name is not UTF-8")?.to_owned();
        let link=made>>8==3 && (le32(zip,at+38)?>>16)&0o170000==0o120000;
        // Windows extraction is case-insensitive: two names differing only by case are refused.
        ensure!(lower.insert(name.to_lowercase()),"Duplicate ZIP entry: {name}");
        entries.insert(name,ZipEntry{method,flags,compressed,size,offset,link});
        at+=46+name_len+extra_len+comment_len;
    }
    Ok(entries)
}
fn zip_read(zip: &[u8], name: &str, entry: &ZipEntry, limit: u64) -> Result<Vec<u8>> {
    ensure!(entry.flags&1==0 && !entry.link && entry.size<=limit,"Unsafe ZIP entry: {name}");
    let at=entry.offset as usize;
    ensure!(le32(zip,at)?==0x04034b50 && zip.get(at+30..at+30+le16(zip,at+26)? as usize)==Some(name.as_bytes()),"ZIP entry header does not match: {name}");
    let start=at+30+le16(zip,at+26)? as usize+le16(zip,at+28)? as usize;
    let data=zip.get(start..start.checked_add(entry.compressed as usize).context("Invalid ZIP size")?).context("Truncated ZIP data")?;
    let mut out=Vec::with_capacity(entry.size as usize);
    match entry.method {
        0 => out.extend_from_slice(data),
        8 => { flate2::read::DeflateDecoder::new(data).take(entry.size+1).read_to_end(&mut out).with_context(||format!("ZIP data is damaged: {name}"))?; }
        _ => anyhow::bail!("Unsupported ZIP compression: {name}"),
    }
    ensure!(out.len() as u64==entry.size,"ZIP entry size does not match: {name}");
    Ok(out)
}
fn verify_zip_with(zip: &[u8], key: &[u8], version: &str, platform: &str, channel: &str) -> Result<()> {
    let entries=zip_entries(zip)?;
    const SIGNED: &str="PlazCode-Extension/plazcode-installation-integrity.json";
    let roots:Vec<&str>=entries.keys().filter_map(|name| name.strip_suffix(SIGNED)).filter(|root| root.is_empty() || (root.ends_with('/') && !root[..root.len()-1].contains('/'))).collect();
    ensure!(roots.len()==1,"The package must contain exactly one signed file list");
    let root=roots[0].to_owned();
    let signed_name=format!("{root}{SIGNED}");
    let value=manifest_from(&zip_read(zip,&signed_name,&entries[&signed_name],MAX_MANIFEST)?,key,version,platform,channel)?;
    for (name,record) in &value.files {
        ensure!(safe_path(name) && record.bytes<=MAX_FILE,"Unsafe manifest file");
        let full=format!("{root}{name}");
        let entry=entries.get(&full).with_context(||format!("Program check failed: {name}: missing from the package"))?;
        let bytes=zip_read(zip,&full,entry,record.bytes)?;
        ensure!(bytes.len() as u64==record.bytes && format!("{:x}",Sha256::digest(&bytes))==record.sha256,"Program check failed: {name}: changed in the package");
    }
    Ok(())
}
pub fn verify_package_zip(zip: &Path, version: &str) -> Result<()> {
    let key=public_key()?.context("Signed-package verification requires a configured public key")?;
    let meta=std::fs::metadata(zip)?;
    ensure!(meta.is_file() && meta.len()<=128*1024*1024,"Update package is missing or too large");
    // One read of one file (retried while security software holds it), then everything is checked in memory.
    let raw=retry_transient(&TRANSIENT_WAITS_MS,transient_io,|ms| std::thread::sleep(std::time::Duration::from_millis(ms)),|| Ok(std::fs::read(zip)?))?;
    verify_zip_with(&raw,&key,version,platform(),channel()).context(RECOVERY)
}
pub fn verify_installation(root: &Path) -> Result<()> {
    let Some(key)=public_key()? else {return Ok(());}; // Debug builds only.
    // macOS can resolve a recorded root from a translocated/copied app. Authenticate the running
    // executable itself as well, so an untouched installation cannot vouch for a modified copy.
    let value=manifest(root,&key,env!("CARGO_PKG_VERSION"),platform(),channel()).context(RECOVERY)?;
    verify_running_executable(&std::env::current_exe()?,&value,platform()).context(RECOVERY)?;
    verify_installation_with(root,&key,env!("CARGO_PKG_VERSION"),platform(),channel()).context(RECOVERY)
}
fn verify_installation_with(root: &Path,key: &[u8],version: &str,platform: &str,channel: &str)->Result<()> {
    let marker=root.join(format!(".plazcode-layout-{version}"));
    let present=std::fs::symlink_metadata(&marker).ok();
    if let Some(meta)=&present {ensure!(meta.is_file() && !meta.file_type().is_symlink(),"Unsafe migration marker");}
    let result=verify_tree_with(root,key,version,platform,channel);
    if result.is_err() && present.is_none() {
        bootstrap_legacy(root,key,version,platform,channel)?;
    } else {result?;}
    // The marker only avoids repeating an authenticated legacy repair. Valid program files
    // must still run from read-only installations (for example a managed Applications folder).
    // Missing markers never waive signature/hash verification; repair can only restore signed bytes.
    if present.is_none() {let _=std::fs::OpenOptions::new().write(true).create_new(true).open(marker);}
    Ok(())
}
pub async fn check_work() -> Result<()> {
    if public_key()?.is_none() {return Ok(());}
    tokio::task::spawn_blocking(|| verify_package(&crate::platform::installation_root(),env!("CARGO_PKG_VERSION"))).await?
}
pub fn verify_update(feed: &serde_json::Value, version: &str, hash: &str, platform: &str) -> Result<()> {
    let Some(key)=public_key()? else {return Ok(());};
    ensure!(channel()=="release","Validation packages cannot install production updates");
    verify_update_with(&key,feed,version,hash,platform)
}
fn verify_extension_with(key: &[u8],raw: &[u8],version: &str,channel: &str)->Result<()> {
    let value:Files=serde_json::from_str(&signed_payload(key,raw)?)?;
    ensure!(value.schema==1 && value.kind=="files" && value.platform=="extension" && value.version==version && value.channel==channel,"Wrong extension signature metadata");
    ensure!(!value.files.is_empty() && value.files.len()<=12000,"Invalid extension manifest");
    for required in ["background.js","manifest.json","protection.js"] {ensure!(value.files.contains_key(required),"Missing extension file");}
    for (name,record) in value.files {ensure!(safe_path(&name) && record.bytes<=MAX_FILE && record.sha256.len()==64 && record.sha256.bytes().all(|c|c.is_ascii_hexdigit()),"Unsafe extension file metadata");}
    Ok(())
}
pub async fn extension_signature(headers: axum::http::HeaderMap,axum::Json(value): axum::Json<serde_json::Value>)->axum::response::Response {
    use axum::response::IntoResponse;
    // Public crypto verification only: no credentials, filesystem access or tool dispatch.
    if !crate::security::can_auto_pair(&headers) {return axum::http::StatusCode::FORBIDDEN.into_response();}
    let result=(||{let key=public_key()?.context("Release verification unavailable in this debug build")?;verify_extension_with(&key,&serde_json::to_vec(&value)?,env!("CARGO_PKG_VERSION"),channel())})();
    match result {Ok(())=>axum::Json(serde_json::json!({"ok":true})).into_response(),Err(_)=>(axum::http::StatusCode::FORBIDDEN,axum::Json(serde_json::json!({"ok":false,"error":RECOVERY}))).into_response()}
}
fn verify_update_with(key: &[u8],feed: &serde_json::Value,version: &str,hash: &str,platform: &str)->Result<()> {
    let signed=feed.get("security").context("This update is missing its release signature; installation was not changed")?;
    let value: Update=serde_json::from_str(&signed_payload(&key,&serde_json::to_vec(signed)?)?)?;
    ensure!(value.schema==1 && value.kind=="update" && value.channel=="release" && value.version==version && value.sha256==hash && value.platform==platform,"Update signature does not match this version/platform/archive");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ring::signature::{Ed25519KeyPair,KeyPair};
    fn signed(key:&Ed25519KeyPair,value:serde_json::Value)->Vec<u8>{
        let payload=serde_json::to_string(&value).unwrap();let mut message=DOMAIN.to_vec();message.extend_from_slice(payload.as_bytes());
        let signature=key.sign(&message).as_ref().iter().map(|b|format!("{b:02x}")).collect::<String>();
        serde_json::to_vec(&serde_json::json!({"payload":payload,"signature":signature})).unwrap()
    }
    #[test] fn update_signature_binds_version_platform_hash_and_rejects_unsigned_fallback() {
        let key=Ed25519KeyPair::from_seed_unchecked(&[7;32]).unwrap();let hash="a".repeat(64);
        let security:serde_json::Value=serde_json::from_slice(&signed(&key,serde_json::json!({"schema":1,"kind":"update","channel":"release","version":"1.24.27","platform":"windows","sha256":hash}))).unwrap();
        let feed=serde_json::json!({"security":security});let public=key.public_key().as_ref();
        assert!(verify_update_with(public,&feed,"1.24.27",&hash,"windows").is_ok());
        assert!(verify_update_with(public,&feed,"1.24.25",&hash,"windows").is_err());
        assert!(verify_update_with(public,&feed,"1.24.27",&hash,"macos").is_err());
        assert!(verify_update_with(public,&feed,"1.24.27",&"b".repeat(64),"windows").is_err());
        assert!(verify_update_with(public,&serde_json::json!({}),"1.24.27",&hash,"windows").is_err());
    }
    #[test] fn old_browser_metadata_fallback_requires_the_pinned_key_version_and_channel() {
        let key=Ed25519KeyPair::from_seed_unchecked(&[7;32]).unwrap();
        let row=serde_json::json!({"bytes":1,"sha256":"a".repeat(64)});
        let raw=signed(&key,serde_json::json!({"schema":1,"kind":"files","platform":"extension","version":"1.24.27","channel":"release","files":{"background.js":row,"manifest.json":row,"protection.js":row}}));
        assert!(verify_extension_with(key.public_key().as_ref(),&raw,"1.24.27","release").is_ok());
        assert!(verify_extension_with(key.public_key().as_ref(),&raw,"1.24.25","release").is_err());
        assert!(verify_extension_with(key.public_key().as_ref(),&raw,"1.24.27","validation").is_err());
        let other=Ed25519KeyPair::from_seed_unchecked(&[8;32]).unwrap();assert!(verify_extension_with(other.public_key().as_ref(),&raw,"1.24.27","release").is_err());
    }
    #[test] fn signed_bootstrap_migrates_old_installers_without_touching_user_data_then_blocks_edits() {
        use base64::Engine;
        let root=std::env::temp_dir().join(format!("plazcode-bootstrap-{}",std::process::id()));let _=std::fs::remove_dir_all(&root);std::fs::create_dir_all(root.join("core")).unwrap();std::fs::create_dir_all(root.join("PlazCode-Extension")).unwrap();
        let key=Ed25519KeyPair::from_seed_unchecked(&[7;32]).unwrap();let mut files=serde_json::Map::new();
        for name in ["manifest.json","background.js","core/main.js","PlazCode-Extension/manifest.json","PlazCode"] {
            std::fs::write(root.join(name),b"original").unwrap();files.insert(name.into(),serde_json::json!({"bytes":8,"sha256":format!("{:x}",Sha256::digest(b"original"))}));
        }
        files.insert("helper.command".into(),serde_json::json!({"bytes":8,"sha256":format!("{:x}",Sha256::digest(b"original")),"mode":0o755}));
        let hash=format!("{:x}",Sha256::digest(b"original"));
        let blob="PlazCode-Extension/plazcode-bootstrap.json";let raw=serde_json::to_vec(&serde_json::json!({"files":{"core/main.js":hash,"helper.command":hash},"blobs":{hash:base64::engine::general_purpose::STANDARD.encode(b"original")}})).unwrap();
        std::fs::write(root.join(blob),&raw).unwrap();files.insert(blob.into(),serde_json::json!({"bytes":raw.len(),"sha256":format!("{:x}",Sha256::digest(&raw))}));
        let value=serde_json::json!({"schema":1,"kind":"files","version":"1.24.27","platform":"linux","channel":"release","files":files});
        std::fs::write(root.join("PlazCode-Extension/plazcode-installation-integrity.json"),signed(&key,value)).unwrap();
        std::fs::write(root.join("config.json"),b"user settings").unwrap();std::fs::write(root.join("core/main.js"),b"old mirror").unwrap();
        let check=||verify_installation_with(&root,key.public_key().as_ref(),"1.24.27","linux","release");
        assert!(check().is_ok());assert_eq!(std::fs::read(root.join("core/main.js")).unwrap(),b"original");assert_eq!(std::fs::read(root.join("config.json")).unwrap(),b"user settings");
        #[cfg(unix)] {use std::os::unix::fs::PermissionsExt;assert_eq!(std::fs::metadata(root.join("helper.command")).unwrap().permissions().mode()&0o111,0o111);}
        std::fs::write(root.join("core/main.js"),b"modified after migration").unwrap();assert!(check().is_err());
        std::fs::remove_file(root.join(".plazcode-layout-1.24.27")).unwrap();std::fs::write(root.join(blob),b"forged repair data").unwrap();assert!(check().is_err());
        assert_eq!(std::fs::read(root.join("core/main.js")).unwrap(),b"modified after migration");
        let _=std::fs::remove_dir_all(root);
    }
    #[test] fn signature_rejects_modified_payload_key_and_protocol() {
        let key=Ed25519KeyPair::from_seed_unchecked(&[7;32]).unwrap();
        let raw=signed(&key,serde_json::json!({"schema":1,"kind":"files"}));
        assert!(signed_payload(key.public_key().as_ref(),&raw).is_ok());
        let other=Ed25519KeyPair::from_seed_unchecked(&[8;32]).unwrap();
        assert!(signed_payload(other.public_key().as_ref(),&raw).is_err());
        let mut value:serde_json::Value=serde_json::from_slice(&raw).unwrap();value["payload"]=serde_json::json!("{}");
        assert!(signed_payload(key.public_key().as_ref(),&serde_json::to_vec(&value).unwrap()).is_err());
        assert!(signed_payload(key.public_key().as_ref(),b"{}").is_err());
    }
    #[test] fn passing_file_locks_are_retried_but_real_changes_fail_at_once() {
        use std::cell::Cell;
        let locked=|| -> anyhow::Error {anyhow::Error::from(std::io::Error::from_raw_os_error(32)).context("Program check failed: PlazCode.exe")};
        let is_locked=|e:&anyhow::Error| e.chain().filter_map(|x|x.downcast_ref::<std::io::Error>()).any(|x|x.raw_os_error().is_some_and(super::transient_code));
        // Antivirus holds the new file for two attempts, then lets go: the check passes after two short waits.
        let (tries,slept)=(Cell::new(0),Cell::new(0u64));
        let result=super::retry_transient(&super::TRANSIENT_WAITS_MS,is_locked,|ms|slept.set(slept.get()+ms),|| {tries.set(tries.get()+1);if tries.get()<=2 {Err(locked())} else {Ok(())}});
        assert!(result.is_ok());assert_eq!((tries.get(),slept.get()),(3,750));
        // A changed file is never retried.
        let tries=Cell::new(0);
        let result:anyhow::Result<()>=super::retry_transient(&super::TRANSIENT_WAITS_MS,is_locked,|_|panic!("no wait for a real change"),|| {tries.set(tries.get()+1);Err(anyhow::anyhow!("Program file changed: core/main.js"))});
        assert!(result.is_err());assert_eq!(tries.get(),1);
        // Still locked after every wait (about 7 s): the check fails and reports the lock.
        let (tries,slept)=(Cell::new(0),Cell::new(0u64));
        let result:anyhow::Result<()>=super::retry_transient(&super::TRANSIENT_WAITS_MS,is_locked,|ms|slept.set(slept.get()+ms),|| {tries.set(tries.get()+1);Err(locked())});
        assert!(format!("{:#}",result.unwrap_err()).contains("Program check failed: PlazCode.exe"));
        assert_eq!((tries.get(),slept.get()),(6,6750));
        // Only Windows access-denied / file-in-use / lock errors count as passing.
        assert!(super::transient_code(5) && super::transient_code(32) && super::transient_code(33) && !super::transient_code(2) && !super::transient_code(3));
        // Missing files are never treated as a passing lock.
        assert!(!is_locked(&anyhow::Error::from(std::io::Error::from(std::io::ErrorKind::NotFound))));
    }
    #[test] fn parallel_program_checks_reject_changes_missing_files_and_symlinks() {
        let root=std::env::temp_dir().join(format!("plazcode-parallel-integrity-{}",std::process::id()));
        let _=std::fs::remove_dir_all(&root);std::fs::create_dir_all(root.join("core")).unwrap();
        let mut files=BTreeMap::new();
        for index in 0..96 {
            let name=format!("core/file-{index:03}.js");let bytes=format!("original {index:03}");
            std::fs::write(root.join(&name),bytes.as_bytes()).unwrap();
            files.insert(name,FileRecord{sha256:format!("{:x}",Sha256::digest(bytes.as_bytes())),bytes:bytes.len() as u64,mode:None});
        }
        assert!(verify_files(&root,&files).is_ok());
        for index in [0,1,31,32,63,64,94,95] {
            let name=format!("core/file-{index:03}.js");let original=std::fs::read(root.join(&name)).unwrap();
            // Same-length edits cannot hide behind size/mtime shortcuts.
            std::fs::write(root.join(&name),vec![b'x';original.len()]).unwrap();assert!(verify_files(&root,&files).is_err());
            std::fs::remove_file(root.join(&name)).unwrap();assert!(verify_files(&root,&files).is_err());
            std::fs::write(root.join(&name),&original).unwrap();
        }
        #[cfg(unix)] {
            let name=root.join("core/file-095.js");std::fs::remove_file(&name).unwrap();
            std::os::unix::fs::symlink(root.join("core/file-000.js"),&name).unwrap();assert!(verify_files(&root,&files).is_err());
        }
        let _=std::fs::remove_dir_all(root);
    }
    // Minimal ZIP writer for fixtures: (name, bytes, deflate?, unix symlink?).
    fn zip_fixture(items:&[(&str,&[u8],bool,bool)])->Vec<u8>{
        use std::io::Write;
        let (mut out,mut central)=(Vec::new(),Vec::new());
        for (name,bytes,deflate,link) in items {
            let data=if *deflate {let mut e=flate2::write::DeflateEncoder::new(Vec::new(),flate2::Compression::default());e.write_all(bytes).unwrap();e.finish().unwrap()} else {bytes.to_vec()};
            let offset=out.len() as u32;let method:u16=if *deflate {8} else {0};
            let local=[&0x04034b50u32.to_le_bytes()[..],&20u16.to_le_bytes(),&0u16.to_le_bytes(),&method.to_le_bytes(),&[0;8],&(data.len() as u32).to_le_bytes(),&(bytes.len() as u32).to_le_bytes(),&(name.len() as u16).to_le_bytes(),&0u16.to_le_bytes()].concat();
            out.extend(local);out.extend(name.as_bytes());out.extend(&data);
            let attrs:u32=if *link {0o120777<<16} else {0o100644<<16};
            central.extend([&0x02014b50u32.to_le_bytes()[..],&(3u16<<8|20).to_le_bytes(),&20u16.to_le_bytes(),&0u16.to_le_bytes(),&method.to_le_bytes(),&[0;8],&(data.len() as u32).to_le_bytes(),&(bytes.len() as u32).to_le_bytes(),&(name.len() as u16).to_le_bytes(),&[0;8],&attrs.to_le_bytes(),&offset.to_le_bytes()].concat());
            central.extend(name.as_bytes());
        }
        let (cd_offset,cd_size,count)=(out.len() as u32,central.len() as u32,items.len() as u16);
        out.extend(central);
        out.extend([&0x06054b50u32.to_le_bytes()[..],&[0;4],&count.to_le_bytes(),&count.to_le_bytes(),&cd_size.to_le_bytes(),&cd_offset.to_le_bytes(),&0u16.to_le_bytes()].concat());
        out
    }
    #[test] fn update_zip_is_checked_against_the_signed_list_without_unpacking() {
        let key=Ed25519KeyPair::from_seed_unchecked(&[7;32]).unwrap();let public=key.public_key().as_ref();
        let names=["manifest.json","background.js","core/main.js","PlazCode-Extension/manifest.json","PlazCode.exe"];
        let body=|n:&str| format!("contents of {n}").repeat(40).into_bytes();
        let mut files=serde_json::Map::new();
        for n in names {let b=body(n);files.insert(n.into(),serde_json::json!({"bytes":b.len(),"sha256":format!("{:x}",Sha256::digest(&b))}));}
        let list=signed(&key,serde_json::json!({"schema":1,"kind":"files","version":"1.24.29","platform":"windows","channel":"release","files":files}));
        let build=|change:&dyn Fn(&str,Vec<u8>)->Option<Vec<u8>>,extra:&[(&str,&[u8],bool,bool)]| {
            let owned:Vec<(String,Vec<u8>)>=names.iter().filter_map(|n| change(n,body(n)).map(|b|(format!("PlazCode/{n}"),b))).collect();
            let mut items:Vec<(&str,&[u8],bool,bool)>=owned.iter().enumerate().map(|(i,(n,b))|(n.as_str(),b.as_slice(),i%2==0,false)).collect();
            items.push(("PlazCode/PlazCode-Extension/plazcode-installation-integrity.json",&list,true,false));
            items.extend_from_slice(extra);
            zip_fixture(&items)
        };
        let check=|zip:&[u8]| verify_zip_with(zip,public,"1.24.29","windows","release");
        // Intact package (stored and compressed entries) passes; files outside the list (user data) are ignored.
        assert!(check(&build(&|_,b|Some(b),&[("PlazCode/config.json",b"{}",false,false)])).is_ok());
        // One changed byte, a missing file, a different size: refused, and the message names the file.
        let changed=check(&build(&|n,mut b| {if n=="core/main.js" {b[5]^=1;} Some(b)},&[])).unwrap_err();
        assert!(format!("{changed:#}").contains("core/main.js"),"{changed:#}");
        assert!(format!("{:#}",check(&build(&|n,b| (n!="PlazCode.exe").then_some(b),&[])).unwrap_err()).contains("PlazCode.exe: missing"));
        assert!(check(&build(&|n,mut b| {if n=="background.js" {b.push(b'x');} Some(b)},&[])).is_err());
        // Wrong key, version, platform or channel: refused.
        let zip=build(&|_,b|Some(b),&[]);
        let other=Ed25519KeyPair::from_seed_unchecked(&[8;32]).unwrap();
        assert!(verify_zip_with(&zip,other.public_key().as_ref(),"1.24.29","windows","release").is_err());
        assert!(verify_zip_with(&zip,public,"1.24.28","windows","release").is_err());
        assert!(verify_zip_with(&zip,public,"1.24.29","macos","release").is_err());
        assert!(verify_zip_with(&zip,public,"1.24.29","windows","validation").is_err());
        // A listed file stored as a link, duplicate names (also by case), two signed lists, or a damaged ZIP: refused.
        let linked=build(&|n,b| (n!="background.js").then_some(b),&[("PlazCode/background.js",b"core/main.js",false,true)]);
        assert!(check(&linked).is_err());
        assert!(check(&build(&|_,b|Some(b),&[("PlazCode/Core/Main.js",b"x",false,false)])).is_err());
        assert!(check(&build(&|_,b|Some(b),&[("Other/PlazCode-Extension/plazcode-installation-integrity.json",&list,false,false)])).is_err());
        let mut cut=zip.clone();cut.truncate(zip.len()/2);assert!(check(&cut).is_err());
        assert!(check(b"not a zip at all, just text").is_err());
    }
    // Opt-in: PLAZCODE_TEST_RELEASE_ZIPS="<windows zip>;<mac zip>;<version>" checks real published packages
    // with the production key, proving the reader handles PlazCode's actual ZIP files.
    #[test] fn real_published_packages_pass_the_zip_check() {
        let Ok(spec)=std::env::var("PLAZCODE_TEST_RELEASE_ZIPS") else {return;};
        let parts:Vec<&str>=spec.split(';').collect();assert_eq!(parts.len(),3);
        let key=unhex(include_str!("../../release-public-key.hex").trim()).unwrap();
        for (path,platform) in [(parts[0],"windows"),(parts[1],"macos")] {
            let raw=std::fs::read(path).unwrap();
            verify_zip_with(&raw,&key,parts[2],platform,"release").unwrap_or_else(|e|panic!("{path}: {e:#}"));
            assert!(verify_zip_with(&raw,&key,parts[2],if platform=="windows" {"macos"} else {"windows"},"release").is_err());
            let mut bad=raw.clone();let mid=bad.len()/3;bad[mid]^=0x55;assert!(verify_zip_with(&bad,&key,parts[2],platform,"release").is_err(),"a damaged real package is refused");
        }
    }
    #[test] fn files_reject_tampering_missing_files_traversal_symlinks_and_keep_user_data_editable() {
        let root=std::env::temp_dir().join(format!("plazcode-integrity-{}",std::process::id()));let _=std::fs::remove_dir_all(&root);std::fs::create_dir_all(root.join("core")).unwrap();std::fs::create_dir_all(root.join("PlazCode-Extension")).unwrap();
        let key=Ed25519KeyPair::from_seed_unchecked(&[7;32]).unwrap();let mut files=serde_json::Map::new();
        for name in ["manifest.json","background.js","core/main.js","PlazCode-Extension/manifest.json","PlazCode"] {
            std::fs::write(root.join(name),b"original").unwrap();files.insert(name.into(),serde_json::json!({"bytes":8,"sha256":format!("{:x}",Sha256::digest(b"original"))}));
        }
        let value=serde_json::json!({"schema":1,"kind":"files","version":"1.24.27","platform":"linux","channel":"release","files":files});
        std::fs::write(root.join("PlazCode-Extension/plazcode-installation-integrity.json"),signed(&key,value.clone())).unwrap();
        let check=||verify_tree_with(&root,key.public_key().as_ref(),"1.24.27","linux","release");
        assert!(check().is_ok());
        #[cfg(unix)] {
            use std::os::unix::fs::PermissionsExt;
            let original=std::fs::metadata(&root).unwrap().permissions();
            std::fs::set_permissions(&root,std::fs::Permissions::from_mode(0o555)).unwrap();
            let result=verify_installation_with(&root,key.public_key().as_ref(),"1.24.27","linux","release");
            std::fs::set_permissions(&root,original).unwrap();
            assert!(result.is_ok(),"valid read-only installations need no marker-writing permission: {result:?}");
        }
        let value=manifest(&root,key.public_key().as_ref(),"1.24.27","linux","release").unwrap();
        let copied=root.join("copied-native");std::fs::write(&copied,b"original").unwrap();assert!(verify_running_executable(&copied,&value,"linux").is_ok());
        std::fs::write(&copied,b"modified").unwrap();assert!(verify_running_executable(&copied,&value,"linux").is_err());
        std::fs::write(root.join("config.json"),b"user edits").unwrap();std::fs::create_dir_all(root.join("skills")).unwrap();std::fs::write(root.join("skills/user.md"),b"editable").unwrap();assert!(check().is_ok());
        assert!(verify_tree_with(&root,key.public_key().as_ref(),"0.0.0","linux","release").is_err());
        assert!(verify_tree_with(&root,key.public_key().as_ref(),"1.24.27","windows","release").is_err());
        assert!(verify_tree_with(&root,key.public_key().as_ref(),"1.24.27","linux","validation").is_err());
        std::fs::write(root.join("core/main.js"),b"modified").unwrap();assert!(check().is_err());std::fs::write(root.join("core/main.js"),b"original").unwrap();
        std::fs::remove_file(root.join("background.js")).unwrap();assert!(check().is_err());std::fs::write(root.join("background.js"),b"original").unwrap();
        #[cfg(unix)] {std::fs::remove_file(root.join("core/main.js")).unwrap();std::os::unix::fs::symlink(root.join("background.js"),root.join("core/main.js")).unwrap();assert!(check().is_err());}
        let _=std::fs::remove_dir_all(&root);
        for name in ["../escape","/absolute","a\\b","C:/x","a/../b","a//b","a./b"] {assert!(!safe_path(name),"{name}");}
        assert!(safe_path("core/main.js"));
    }
}
