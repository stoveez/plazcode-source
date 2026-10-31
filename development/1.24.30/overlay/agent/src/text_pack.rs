//! 1.24.30 (owner: move PlazCode's valuable text into the app, without breaking startup or updates).
//! Release packaging seals the long prompt texts and the Studio Skills Luau library into
//! `PlazCode-Extension/core/text-pack.bin` (development/<version>/protection.mjs `sealTextPack`). Only this app
//! opens it, and it serves the text only through the paired bridge, which refuses unofficial extensions
//! (security.rs). Format: "PCTP1" | 12-byte nonce | AES-256-GCM(gzip(JSON)) | 16-byte tag; the key is derived
//! from a fixed salt and this app's version, so a file from another version cannot be opened.
use anyhow::{ensure, Context, Result};
use sha2::Digest;
use std::io::Read;
use std::path::Path;

const SALT: &str = "071787836aa53f54c4e672124a99ea635483f6085f8b45c6822af1c11deb81a0";
pub const FILE: &str = "PlazCode-Extension/core/text-pack.bin";
const MAX_SEALED: u64 = 8 * 1024 * 1024;
const MAX_OPEN: u64 = 32 * 1024 * 1024;

fn key(version: &str) -> [u8; 32] {
    sha2::Sha256::digest(format!("PlazCode text pack v1\n{SALT}\n{version}").as_bytes()).into()
}

pub fn open(raw: &[u8], version: &str) -> Result<Vec<u8>> {
    use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM};
    ensure!(raw.len() > 5 + 12 + 16 && raw.starts_with(b"PCTP1"), "Not a PlazCode text pack");
    let nonce = Nonce::try_assume_unique_for_key(&raw[5..17]).map_err(|_| anyhow::anyhow!("Invalid text pack nonce"))?;
    let sealer = LessSafeKey::new(UnboundKey::new(&AES_256_GCM, &key(version)).map_err(|_| anyhow::anyhow!("Invalid text pack key"))?);
    let mut body = raw[17..].to_vec();
    let plain = sealer.open_in_place(nonce, Aad::empty(), &mut body).map_err(|_| anyhow::anyhow!("The text pack does not belong to this PlazCode version"))?;
    let mut json = Vec::new();
    flate2::read::GzDecoder::new(&plain[..]).take(MAX_OPEN + 1).read_to_end(&mut json)?;
    ensure!(json.len() as u64 <= MAX_OPEN, "Text pack is too large");
    let value: serde_json::Value = serde_json::from_slice(&json).context("Invalid text pack contents")?;
    ensure!(value.as_object().is_some_and(|map| !map.is_empty()), "Empty text pack");
    Ok(json)
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
    match tokio::task::spawn_blocking(move || load(&root)).await {
        Ok(Ok(Some(json))) => ([("content-type", "application/json"), ("cache-control", "no-store")], json).into_response(),
        Ok(Ok(None)) => (axum::http::StatusCode::NOT_FOUND, "This PlazCode build has no text pack.").into_response(),
        _ => (axum::http::StatusCode::CONFLICT, crate::integrity::RECOVERY).into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn seal(json: &[u8], version: &str) -> Vec<u8> {
        use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM};
        use std::io::Write;
        let mut gz = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::best());
        gz.write_all(json).unwrap();
        let mut body = gz.finish().unwrap();
        let nonce = [7u8; 12];
        LessSafeKey::new(UnboundKey::new(&AES_256_GCM, &key(version)).unwrap())
            .seal_in_place_append_tag(Nonce::assume_unique_for_key(nonce), Aad::empty(), &mut body).unwrap();
        [b"PCTP1".as_slice(), &nonce, &body].concat()
    }
    #[test]
    fn opens_only_its_own_version_and_rejects_changes() {
        let json = br#"{"config:0":"hello","skills:1":["a","b"]}"#;
        let sealed = seal(json, "1.24.30");
        assert_eq!(open(&sealed, "1.24.30").unwrap(), json.to_vec());
        assert!(open(&sealed, "1.24.29").is_err(), "another version cannot open it");
        let mut changed = sealed.clone(); let last = changed.len() - 20; changed[last] ^= 1;
        assert!(open(&changed, "1.24.30").is_err(), "a changed file is refused");
        assert!(open(b"PCTP1short", "1.24.30").is_err() && open(&seal(b"{}", "1.24.30"), "1.24.30").is_err());
        let root = std::env::temp_dir().join(format!("plazcode-textpack-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        assert!(load(&root).unwrap().is_none(), "development builds have no text pack");
        std::fs::create_dir_all(root.join("PlazCode-Extension/core")).unwrap();
        std::fs::write(root.join(FILE), seal(json, env!("CARGO_PKG_VERSION"))).unwrap();
        assert_eq!(load(&root).unwrap().unwrap(), json.to_vec());
        std::fs::remove_dir_all(root).unwrap();
    }
}
