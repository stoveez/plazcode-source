//! 1.24.30 (owner: move PlazCode's valuable text into the app, without breaking startup or updates).
//! Release packaging seals the long prompt texts and the Studio Skills Luau library into
//! `PlazCode-Extension/core/text-pack.bin` (development/<version>/protection.mjs `sealTextPack`). Only this app
//! opens it, and it serves the text only through the paired bridge, which refuses unofficial extensions
//! (security.rs). Key, magic, authenticated padding and field layout vary by release.
//! The compiler and packaging process receive the same variant; the seed never enters public metadata.
use anyhow::{ensure, Context, Result};
use std::io::Read;
use std::path::Path;

pub const FILE: &str = "PlazCode-Extension/core/text-pack.bin";
const MAX_SEALED: u64 = 8 * 1024 * 1024;
const MAX_OPEN: u64 = 32 * 1024 * 1024;
fn config(version:&str,seed:&[u8;32])->([u8;32],[u8;8],[u8;8],usize,u8){
    let key=crate::release_variant::digest("PlazCode text pack v2",version,seed);
    let magic=crate::release_variant::digest("PlazCode pack header v2",version,seed)[..8].try_into().unwrap();
    let mark=crate::release_variant::digest("PlazCode release mark v1",version,seed)[..8].try_into().unwrap();
    (key,magic,mark,8+(seed[1]%24) as usize,seed[0]%3)
}
pub fn open(raw:&[u8],version:&str)->Result<Vec<u8>> {open_with_seed(raw,version,&crate::release_variant::SEED)}
fn open_with_seed(raw:&[u8],version:&str,seed:&[u8;32])->Result<Vec<u8>> {
    use ring::aead::{Aad,LessSafeKey,Nonce,UnboundKey,AES_256_GCM};
    let (key,magic,mark,n,layout)=config(version,seed);
    ensure!(raw.len()>8+n+12+16 && raw.len() as u64<=MAX_SEALED && raw.starts_with(&magic),"Not this release text pack");
    let (nonce,pad,body,tag)=match layout {
        0=>(&raw[8+n..20+n],&raw[8..8+n],&raw[20+n..raw.len()-16],&raw[raw.len()-16..]),
        1=>(&raw[8..20],&raw[20..20+n],&raw[36+n..],&raw[20+n..36+n]),
        _=>(&raw[24..36],&raw[raw.len()-n..],&raw[36..raw.len()-n],&raw[8..24]),
    };
    ensure!(pad.starts_with(&mark),"Wrong release mark");
    let nonce=Nonce::try_assume_unique_for_key(nonce).map_err(|_|anyhow::anyhow!("Invalid pack nonce"))?;
    let sealer=LessSafeKey::new(UnboundKey::new(&AES_256_GCM,&key).map_err(|_|anyhow::anyhow!("Invalid pack key"))?);
    let aad=[magic.as_slice(),pad].concat();let mut body=[body,tag].concat();
    let plain=sealer.open_in_place(nonce,Aad::from(&aad),&mut body).map_err(|_|anyhow::anyhow!("Text pack release verification failed"))?;
    let mut json=Vec::new();flate2::read::GzDecoder::new(&plain[..]).take(MAX_OPEN+1).read_to_end(&mut json)?;
    ensure!(json.len() as u64<=MAX_OPEN,"Text pack is too large");
    let value:serde_json::Value=serde_json::from_slice(&json).context("Invalid text pack contents")?;
    ensure!(value.as_object().is_some_and(|map|!map.is_empty()),"Empty text pack");Ok(json)
}

pub fn load(root: &Path) -> Result<Option<Vec<u8>>> {
    let path = root.join(FILE);
    let Ok(meta) = std::fs::symlink_metadata(&path) else { return Ok(None) };
    ensure!(meta.is_file() && meta.len() <= MAX_SEALED, "Unsafe text pack file");
    Ok(Some(open(&std::fs::read(path)?, env!("CARGO_PKG_VERSION"))?))
}

/// GET /api/text-pack (behind the pairing check, like every other bridge request).
pub async fn serve() -> axum::response::Response {
    use axum::response::IntoResponse;
    let root = crate::platform::installation_root();
    match tokio::task::spawn_blocking(move || {crate::release_checks::startup(&root)?;load(&root)}).await {
        Ok(Ok(Some(json))) => ([("content-type", "application/json"), ("cache-control", "no-store")], json).into_response(),
        Ok(Ok(None)) => (axum::http::StatusCode::NOT_FOUND, "This PlazCode build has no text pack.").into_response(),
        _ => (axum::http::StatusCode::CONFLICT, crate::integrity::RECOVERY).into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn seal_with_seed(json:&[u8],version:&str,seed:&[u8;32])->Vec<u8>{
        use ring::aead::{Aad,LessSafeKey,Nonce,UnboundKey,AES_256_GCM};use std::io::Write;
        let (key,magic,mark,n,layout)=config(version,seed);let mut pad=vec![0;n];pad[..8].copy_from_slice(&mark);
        let nonce=[7;12];let mut gz=flate2::write::GzEncoder::new(Vec::new(),flate2::Compression::best());gz.write_all(json).unwrap();let mut body=gz.finish().unwrap();
        let aad=[magic.as_slice(),pad.as_slice()].concat();
        LessSafeKey::new(UnboundKey::new(&AES_256_GCM,&key).unwrap()).seal_in_place_append_tag(Nonce::assume_unique_for_key(nonce),Aad::from(&aad),&mut body).unwrap();
        let tag=body.split_off(body.len()-16);
        match layout {0=>[magic.as_slice(),&pad,&nonce,&body,&tag].concat(),1=>[magic.as_slice(),&nonce,&pad,&tag,&body].concat(),_=>[magic.as_slice(),&tag,&nonce,&body,&pad].concat()}
    }
    fn seal(json:&[u8],version:&str)->Vec<u8>{seal_with_seed(json,version,&crate::release_variant::SEED)}
    #[test] fn release_variants_are_incompatible_and_all_layouts_round_trip(){
        for layout in 0..3 {let seed=[layout;32];let data=br#"{"hello":"world"}"#;let sealed=seal_with_seed(data,"1.24.33",&seed);
            assert_eq!(open_with_seed(&sealed,"1.24.33",&seed).unwrap(),data);
            assert!(open_with_seed(&sealed,"1.24.33",&[layout+1;32]).is_err());
            for index in [0,8,sealed.len()/2,sealed.len()-1] {let mut changed=sealed.clone();changed[index]^=1;assert!(open_with_seed(&changed,"1.24.33",&seed).is_err());}
        }
    }
    #[test]
    fn opens_only_its_own_version_and_rejects_changes() {
        let json = br#"{"config:0":"hello","skills:1":["a","b"]}"#;
        let sealed = seal(json, "1.24.33");
        assert_eq!(open(&sealed, "1.24.33").unwrap(), json.to_vec());
        assert!(open(&sealed, "1.24.29").is_err(), "another version cannot open it");
        let mut changed = sealed.clone(); let last = changed.len() - 20; changed[last] ^= 1;
        assert!(open(&changed, "1.24.33").is_err(), "a changed file is refused");
        assert!(open(b"PCTP1short", "1.24.33").is_err() && open(&seal(b"{}", "1.24.33"), "1.24.33").is_err());
        let root = std::env::temp_dir().join(format!("plazcode-textpack-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        assert!(load(&root).unwrap().is_none(), "development builds have no text pack");
        std::fs::create_dir_all(root.join("PlazCode-Extension/core")).unwrap();
        std::fs::write(root.join(FILE), seal(json, env!("CARGO_PKG_VERSION"))).unwrap();
        assert_eq!(load(&root).unwrap().unwrap(), json.to_vec());
        std::fs::remove_dir_all(root).unwrap();
    }
}
