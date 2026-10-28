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
fn hash_file(root: &Path, name: &str, record: &FileRecord) -> Result<()> {
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
    let value: Files=serde_json::from_str(&signed_payload(key,&std::fs::read(path)?)?)?;
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
    for (name,record) in value.files {hash_file(root,&name,&record)?;}
    Ok(())
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
        let security:serde_json::Value=serde_json::from_slice(&signed(&key,serde_json::json!({"schema":1,"kind":"update","channel":"release","version":"1.24.26","platform":"windows","sha256":hash}))).unwrap();
        let feed=serde_json::json!({"security":security});let public=key.public_key().as_ref();
        assert!(verify_update_with(public,&feed,"1.24.26",&hash,"windows").is_ok());
        assert!(verify_update_with(public,&feed,"1.24.25",&hash,"windows").is_err());
        assert!(verify_update_with(public,&feed,"1.24.26",&hash,"macos").is_err());
        assert!(verify_update_with(public,&feed,"1.24.26",&"b".repeat(64),"windows").is_err());
        assert!(verify_update_with(public,&serde_json::json!({}),"1.24.26",&hash,"windows").is_err());
    }
    #[test] fn old_browser_metadata_fallback_requires_the_pinned_key_version_and_channel() {
        let key=Ed25519KeyPair::from_seed_unchecked(&[7;32]).unwrap();
        let row=serde_json::json!({"bytes":1,"sha256":"a".repeat(64)});
        let raw=signed(&key,serde_json::json!({"schema":1,"kind":"files","platform":"extension","version":"1.24.26","channel":"release","files":{"background.js":row,"manifest.json":row,"protection.js":row}}));
        assert!(verify_extension_with(key.public_key().as_ref(),&raw,"1.24.26","release").is_ok());
        assert!(verify_extension_with(key.public_key().as_ref(),&raw,"1.24.25","release").is_err());
        assert!(verify_extension_with(key.public_key().as_ref(),&raw,"1.24.26","validation").is_err());
        let other=Ed25519KeyPair::from_seed_unchecked(&[8;32]).unwrap();assert!(verify_extension_with(other.public_key().as_ref(),&raw,"1.24.26","release").is_err());
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
        let value=serde_json::json!({"schema":1,"kind":"files","version":"1.24.26","platform":"linux","channel":"release","files":files});
        std::fs::write(root.join("PlazCode-Extension/plazcode-installation-integrity.json"),signed(&key,value)).unwrap();
        std::fs::write(root.join("config.json"),b"user settings").unwrap();std::fs::write(root.join("core/main.js"),b"old mirror").unwrap();
        let check=||verify_installation_with(&root,key.public_key().as_ref(),"1.24.26","linux","release");
        assert!(check().is_ok());assert_eq!(std::fs::read(root.join("core/main.js")).unwrap(),b"original");assert_eq!(std::fs::read(root.join("config.json")).unwrap(),b"user settings");
        #[cfg(unix)] {use std::os::unix::fs::PermissionsExt;assert_eq!(std::fs::metadata(root.join("helper.command")).unwrap().permissions().mode()&0o111,0o111);}
        std::fs::write(root.join("core/main.js"),b"modified after migration").unwrap();assert!(check().is_err());
        std::fs::remove_file(root.join(".plazcode-layout-1.24.26")).unwrap();std::fs::write(root.join(blob),b"forged repair data").unwrap();assert!(check().is_err());
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
    #[test] fn files_reject_tampering_missing_files_traversal_symlinks_and_keep_user_data_editable() {
        let root=std::env::temp_dir().join(format!("plazcode-integrity-{}",std::process::id()));let _=std::fs::remove_dir_all(&root);std::fs::create_dir_all(root.join("core")).unwrap();std::fs::create_dir_all(root.join("PlazCode-Extension")).unwrap();
        let key=Ed25519KeyPair::from_seed_unchecked(&[7;32]).unwrap();let mut files=serde_json::Map::new();
        for name in ["manifest.json","background.js","core/main.js","PlazCode-Extension/manifest.json","PlazCode"] {
            std::fs::write(root.join(name),b"original").unwrap();files.insert(name.into(),serde_json::json!({"bytes":8,"sha256":format!("{:x}",Sha256::digest(b"original"))}));
        }
        let value=serde_json::json!({"schema":1,"kind":"files","version":"1.24.26","platform":"linux","channel":"release","files":files});
        std::fs::write(root.join("PlazCode-Extension/plazcode-installation-integrity.json"),signed(&key,value.clone())).unwrap();
        let check=||verify_tree_with(&root,key.public_key().as_ref(),"1.24.26","linux","release");
        assert!(check().is_ok());
        #[cfg(unix)] {
            use std::os::unix::fs::PermissionsExt;
            let original=std::fs::metadata(&root).unwrap().permissions();
            std::fs::set_permissions(&root,std::fs::Permissions::from_mode(0o555)).unwrap();
            let result=verify_installation_with(&root,key.public_key().as_ref(),"1.24.26","linux","release");
            std::fs::set_permissions(&root,original).unwrap();
            assert!(result.is_ok(),"valid read-only installations need no marker-writing permission: {result:?}");
        }
        let value=manifest(&root,key.public_key().as_ref(),"1.24.26","linux","release").unwrap();
        let copied=root.join("copied-native");std::fs::write(&copied,b"original").unwrap();assert!(verify_running_executable(&copied,&value,"linux").is_ok());
        std::fs::write(&copied,b"modified").unwrap();assert!(verify_running_executable(&copied,&value,"linux").is_err());
        std::fs::write(root.join("config.json"),b"user edits").unwrap();std::fs::create_dir_all(root.join("skills")).unwrap();std::fs::write(root.join("skills/user.md"),b"editable").unwrap();assert!(check().is_ok());
        assert!(verify_tree_with(&root,key.public_key().as_ref(),"1.24.27","linux","release").is_err());
        assert!(verify_tree_with(&root,key.public_key().as_ref(),"1.24.26","windows","release").is_err());
        assert!(verify_tree_with(&root,key.public_key().as_ref(),"1.24.26","linux","validation").is_err());
        std::fs::write(root.join("core/main.js"),b"modified").unwrap();assert!(check().is_err());std::fs::write(root.join("core/main.js"),b"original").unwrap();
        std::fs::remove_file(root.join("background.js")).unwrap();assert!(check().is_err());std::fs::write(root.join("background.js"),b"original").unwrap();
        #[cfg(unix)] {std::fs::remove_file(root.join("core/main.js")).unwrap();std::os::unix::fs::symlink(root.join("background.js"),root.join("core/main.js")).unwrap();assert!(check().is_err());}
        let _=std::fs::remove_dir_all(&root);
        for name in ["../escape","/absolute","a\\b","C:/x","a/../b","a//b","a./b"] {assert!(!safe_path(name),"{name}");}
        assert!(safe_path("core/main.js"));
    }
}
