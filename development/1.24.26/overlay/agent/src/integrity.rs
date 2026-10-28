//! Offline release integrity. Only a pinned public key is shipped; no browser claim grants trust.
use anyhow::{bail, ensure, Context, Result};
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
struct FileRecord { sha256: String, bytes: u64 }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Files { schema: u32, kind: String, version: String, platform: String, channel: String, files: BTreeMap<String,FileRecord> }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Update { schema: u32, kind: String, channel: String, version: String, platform: String, sha256: String }

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
fn verify_tree_with(root: &Path, key: &[u8], version: &str, platform: &str, channel: &str) -> Result<()> {
    let path=root.join("plazcode-integrity.json");
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
    for (name,record) in value.files {hash_file(root,&name,&record)?;}
    Ok(())
}
pub fn platform() -> &'static str {
    if cfg!(windows) {"windows"} else if cfg!(target_os="macos") {"macos"} else {"linux"}
}
pub fn verify_package(root: &Path, version: &str) -> Result<()> {
    let key=public_key()?.context("Signed-package verification requires a configured public key")?;
    verify_tree_with(root,&key,version,platform(),channel()).context(RECOVERY)
}
pub fn verify_installation(root: &Path) -> Result<()> {
    if public_key()?.is_none() {return Ok(());} // Only unconfigured debug builds, never release binaries.
    verify_package(root,env!("CARGO_PKG_VERSION"))
}
pub async fn check_work() -> Result<()> {
    if public_key()?.is_none() {return Ok(());}
    tokio::task::spawn_blocking(|| verify_installation(&crate::platform::installation_root())).await?
}
pub fn verify_update(feed: &serde_json::Value, version: &str, hash: &str, platform: &str) -> Result<()> {
    let Some(key)=public_key()? else {return Ok(());};
    let signed=feed.get("security").context("This update is missing its release signature; installation was not changed")?;
    let value: Update=serde_json::from_str(&signed_payload(&key,&serde_json::to_vec(signed)?)?)?;
    ensure!(value.schema==1 && value.kind=="update" && value.channel=="release" && value.version==version && value.sha256==hash && value.platform==platform,"Update signature does not match this version/platform/archive");
    // Validation-key apps cannot install public updates: their trust root is deliberately different.
    if channel()!="release" {bail!("Validation packages cannot install production updates");}
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
        std::fs::write(root.join("plazcode-integrity.json"),signed(&key,value.clone())).unwrap();
        let check=||verify_tree_with(&root,key.public_key().as_ref(),"1.24.26","linux","release");
        assert!(check().is_ok());
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
