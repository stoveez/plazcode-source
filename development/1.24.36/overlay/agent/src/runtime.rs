// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
//! Helper programs for the app connections on Mac and Linux: Node (for `npx`) and uv (for `uvx`).
//!
//! Windows keeps its own setup script (`Setup-Mcp-Runtime.ps1`); this is the same idea for the other systems, in
//! Rust so every decision is unit-tested. A Mac started from Finder has no shell PATH and a beginner has neither
//! program installed, so PlazCode downloads the exact pinned build once, checks its SHA-256 BEFORE unpacking, and
//! keeps it in a per-user folder. Nothing is installed system-wide and no terminal is shown.
//!
//! Pins and where each checksum was read (2026-11-11):
//! - Node 22.22.0: the official release post, https://nodejs.org/en/blog/release/v22.22.0 (signed SHASUMS256 block;
//!   its `win-x64.zip` line equals the hash already pinned in `Setup-Mcp-Runtime.ps1`).
//! - uv 0.12.21: PyPI's file list, https://pypi.org/pypi/uv/0.12.21/json (its `win_amd64` digest equals the hash
//!   already pinned in `Setup-Mcp-Runtime.ps1`).
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind { TarGz, Wheel }

/// One downloadable build of a helper program.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Pin {
    /// Folder name inside the runtimes folder; the same names Windows uses.
    pub name: &'static str,
    pub url: &'static str,
    pub sha256: &'static str,
    pub kind: Kind,
    /// Where the wanted files sit inside the archive.
    pub inner: &'static str,
    /// Files that must exist afterwards, relative to the runtime's folder.
    pub files: &'static [&'static str],
}

const NODE_FILES: &[&str] = &["bin/node", "lib/node_modules/npm/bin/npx-cli.js"];
const UV_FILES: &[&str] = &["uv", "uvx"];

/// The pinned build for a helper (`npx` or `uvx`) on one system. `None`: PlazCode has no build for it.
pub fn pin(helper: &str, os: &str, arch: &str) -> Option<Pin> {
    let node = |inner, url, sha256| Pin { name: "node-22.22.0", url, sha256, kind: Kind::TarGz, inner, files: NODE_FILES };
    let uv = |url, sha256| Pin { name: "uv-0.12.21", url, sha256, kind: Kind::Wheel, inner: "uv-0.12.21.data/scripts", files: UV_FILES };
    Some(match (helper, os, arch) {
        ("npx", "macos", "aarch64") => node("node-v22.22.0-darwin-arm64", "https://nodejs.org/dist/v22.22.0/node-v22.22.0-darwin-arm64.tar.gz", "5ed4db0fcf1eaf84d91ad12462631d73bf4576c1377e192d222e48026a902640"),
        ("npx", "macos", "x86_64") => node("node-v22.22.0-darwin-x64", "https://nodejs.org/dist/v22.22.0/node-v22.22.0-darwin-x64.tar.gz", "5ea50c9d6dea3dfa3abb66b2656f7a4e1c8cef23432b558d45fb538c7b5dedce"),
        ("npx", "linux", "x86_64") => node("node-v22.22.0-linux-x64", "https://nodejs.org/dist/v22.22.0/node-v22.22.0-linux-x64.tar.gz", "c33c39ed9c80deddde77c960d00119918b9e352426fd604ba41638d6526a4744"),
        ("uvx", "macos", "aarch64") => uv("https://files.pythonhosted.org/packages/66/72/389b430ec12bd15547d4d3641622479cbf7a5c94af0ffb14fee2ed58f891/uv-0.12.21-py3-none-macosx_11_0_arm64.whl", "eb4f75e8ed770e1f142e03a134b9507e7f4710c4b2cec385d4bf8c5810a91094"),
        ("uvx", "macos", "x86_64") => uv("https://files.pythonhosted.org/packages/51/f0/8673a5aeb771f99aadd269aa069874b10b8ed43fcb3a08a88d3770c27ad9/uv-0.12.21-py3-none-macosx_10_12_x86_64.whl", "9c6fab087f35c8f8c0c79ad4c8a94f6804b983369c2887250fb753a70d8080fd"),
        ("uvx", "linux", "x86_64") => uv("https://files.pythonhosted.org/packages/c6/2b/8700206efe193fc279fe32c11ab9a502c8364e7882e3f6f36a00a6cc8af7/uv-0.12.21-py3-none-manylinux_2_17_x86_64.manylinux2014_x86_64.whl", "0083454d25479f1cd03547c8c98c235b4af92bd07f0e61c3eae5d1cbb0c1834c"),
        _ => return None,
    })
}

pub fn pin_here(helper: &str) -> Option<Pin> { pin(helper, std::env::consts::OS, std::env::consts::ARCH) }

/// The per-user folder that holds downloaded helper programs. They belong to the computer's user, not to one
/// PlazCode profile, like `%LOCALAPPDATA%\PlazCode\runtimes` on Windows.
pub fn cache_root() -> Option<PathBuf> {
    if let Some(custom) = std::env::var_os("PLAZCODE_RUNTIME_CACHE") { return Some(PathBuf::from(custom)); }
    #[cfg(target_os = "macos")]
    { return std::env::var_os("HOME").map(|home| PathBuf::from(home).join("Library/Application Support/PlazCode/runtimes")); }
    #[cfg(windows)]
    { return std::env::var_os("LOCALAPPDATA").map(|base| PathBuf::from(base).join("PlazCode").join("runtimes")); }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        if let Some(cache) = std::env::var_os("XDG_CACHE_HOME").filter(|v| !v.is_empty()) { return Some(PathBuf::from(cache).join("PlazCode/runtimes")); }
        std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".cache/PlazCode/runtimes"))
    }
}

pub fn sha256_hex(path: &Path) -> std::io::Result<String> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1 << 16];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 { break; }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher.finalize().iter().map(|byte| format!("{byte:02x}")).collect())
}

/// The download is exactly the pinned file. A changed, cut-off or swapped file is refused before anything is unpacked.
pub fn verify(path: &Path, expected: &str) -> anyhow::Result<()> {
    let actual = sha256_hex(path).map_err(|error| anyhow::anyhow!("The downloaded helper program could not be read: {error}"))?;
    anyhow::ensure!(actual.eq_ignore_ascii_case(expected), "The downloaded helper program did not match its checksum, so it was not installed. Try again.");
    Ok(())
}

/// A relative path that stays inside its folder: no drive, no root, no `..`.
fn safe_relative(name: &str) -> Option<PathBuf> {
    let path = Path::new(name);
    (!name.is_empty() && path.components().all(|part| matches!(part, Component::Normal(_)))).then(|| path.to_path_buf())
}

fn le16(bytes: &[u8], at: usize) -> usize { u16::from_le_bytes([bytes[at], bytes[at + 1]]) as usize }
fn le32(bytes: &[u8], at: usize) -> u64 { u32::from_le_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]]) as u64 }

/// Unpack chosen files from a zip (a Python wheel is a zip). `choose` gets each file name in the archive and returns
/// where it goes under `dest`, or `None` to skip it. Sizes and checksums in the archive are enforced.
pub fn unzip(archive: &Path, dest: &Path, choose: impl Fn(&str) -> Option<PathBuf>) -> anyhow::Result<usize> {
    const LIMIT: u64 = 400 * 1024 * 1024;
    let mut file = std::fs::File::open(archive)?;
    let length = file.metadata()?.len();
    let tail_size = length.min(66_000);
    anyhow::ensure!(tail_size >= 22, "The helper archive is too short.");
    file.seek(SeekFrom::Start(length - tail_size))?;
    let mut tail = vec![0u8; tail_size as usize];
    file.read_exact(&mut tail)?;
    let end = (0..=tail.len() - 22).rev().find(|&at| tail[at..at + 4] == [0x50, 0x4b, 0x05, 0x06]).ok_or_else(|| anyhow::anyhow!("The helper archive is not a zip file."))?;
    let (count, size, offset) = (le16(&tail, end + 10), le32(&tail, end + 12), le32(&tail, end + 16));
    anyhow::ensure!(count != 0xffff && size != 0xffff_ffff && offset != 0xffff_ffff && offset + size <= length && size <= 64 * 1024 * 1024, "The helper archive has an unsupported layout.");
    file.seek(SeekFrom::Start(offset))?;
    let mut directory = vec![0u8; size as usize];
    file.read_exact(&mut directory)?;
    let (mut at, mut written, mut total) = (0usize, 0usize, 0u64);
    for _ in 0..count {
        anyhow::ensure!(at + 46 <= directory.len() && directory[at..at + 4] == [0x50, 0x4b, 0x01, 0x02], "The helper archive's file list is damaged.");
        let (method, crc, packed, plain) = (le16(&directory, at + 10), le32(&directory, at + 16) as u32, le32(&directory, at + 20), le32(&directory, at + 24));
        let (name_len, extra_len, note_len, local) = (le16(&directory, at + 28), le16(&directory, at + 30), le16(&directory, at + 32), le32(&directory, at + 42));
        anyhow::ensure!(at + 46 + name_len <= directory.len(), "The helper archive's file list is damaged.");
        let name = String::from_utf8_lossy(&directory[at + 46..at + 46 + name_len]).into_owned();
        at += 46 + name_len + extra_len + note_len;
        if name.ends_with('/') { continue; }
        let Some(target) = choose(&name) else { continue; };
        let target = safe_relative(&target.to_string_lossy()).ok_or_else(|| anyhow::anyhow!("The helper archive names a file outside its folder."))?;
        anyhow::ensure!(packed != 0xffff_ffff && plain != 0xffff_ffff && local != 0xffff_ffff, "The helper archive has an unsupported layout.");
        total += plain;
        anyhow::ensure!(total <= LIMIT, "The helper archive is larger than expected.");
        let mut header = [0u8; 30];
        file.seek(SeekFrom::Start(local))?;
        file.read_exact(&mut header)?;
        anyhow::ensure!(header[..4] == [0x50, 0x4b, 0x03, 0x04], "The helper archive is damaged.");
        file.seek(SeekFrom::Current((le16(&header, 26) + le16(&header, 28)) as i64))?;
        let mut data = Vec::with_capacity(plain.min(LIMIT) as usize);
        let source = (&mut file).take(packed);
        match method {
            0 => { source.take(plain + 1).read_to_end(&mut data)?; }
            8 => { flate2::read::DeflateDecoder::new(source).take(plain + 1).read_to_end(&mut data)?; }
            other => anyhow::bail!("The helper archive uses an unsupported packing method ({other})."),
        }
        let mut check = flate2::Crc::new();
        check.update(&data);
        anyhow::ensure!(data.len() as u64 == plain && check.sum() == crc, "A file in the helper archive is damaged: {name}");
        let out = dest.join(target);
        if let Some(parent) = out.parent() { std::fs::create_dir_all(parent)?; }
        std::fs::write(&out, data)?;
        written += 1;
    }
    Ok(written)
}

#[cfg(unix)]
fn make_runnable(path: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))
}
#[cfg(not(unix))]
fn make_runnable(_path: &Path) -> std::io::Result<()> { Ok(()) }

/// Unpack a `.tar.gz` with the system's own `tar` (always present on macOS and Linux). Only ever called on a file
/// whose checksum already matched the pin.
fn untar(archive: &Path, into: &Path) -> anyhow::Result<()> {
    let program = if Path::new("/usr/bin/tar").is_file() { "/usr/bin/tar" } else { "tar" };
    let output = std::process::Command::new(program).arg("-xzf").arg(archive).arg("-C").arg(into).stdin(std::process::Stdio::null()).output()
        .map_err(|error| anyhow::anyhow!("The helper program could not be unpacked: {error}"))?;
    anyhow::ensure!(output.status.success(), "The helper program could not be unpacked: {}", String::from_utf8_lossy(&output.stderr).chars().take(400).collect::<String>());
    Ok(())
}

fn marker(folder: &Path) -> PathBuf { folder.join(".complete") }

/// The pinned build is fully in place under `cache`: every needed file exists and the marker names the pinned hash.
pub fn ready(cache: &Path, pin: &Pin) -> bool {
    let folder = cache.join(pin.name);
    std::fs::read_to_string(marker(&folder)).is_ok_and(|text| text.trim() == pin.sha256) && pin.files.iter().all(|file| folder.join(file).is_file())
}

/// Check the downloaded archive against its pin, unpack it next to the final place and move it in as one step.
/// A failed or interrupted install leaves the old state (nothing, or the previous complete folder) untouched.
pub fn install(pin: &Pin, archive: &Path, cache: &Path) -> anyhow::Result<PathBuf> {
    verify(archive, pin.sha256)?;
    std::fs::create_dir_all(cache)?;
    static RUN: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let stage = cache.join(format!(".setup-{}-{}-{}", pin.name, std::process::id(), RUN.fetch_add(1, std::sync::atomic::Ordering::Relaxed)));
    let _ = std::fs::remove_dir_all(&stage);
    std::fs::create_dir_all(&stage)?;
    let outcome = (|| -> anyhow::Result<PathBuf> {
        let payload = match pin.kind {
            Kind::TarGz => { untar(archive, &stage)?; stage.join(pin.inner) }
            Kind::Wheel => {
                let payload = stage.join("payload");
                let scripts = format!("{}/", pin.inner);
                unzip(archive, &payload, |name| {
                    if let Some(rest) = name.strip_prefix(&scripts) { return Some(PathBuf::from(rest)); }
                    // Keep the program's licence texts with it, as the Windows setup does.
                    name.split_once(".dist-info/licenses/").map(|(_, rest)| Path::new("licenses").join(rest))
                })?;
                for file in pin.files { let path = payload.join(file); if path.is_file() { make_runnable(&path)?; } }
                payload
            }
        };
        for file in pin.files { anyhow::ensure!(payload.join(file).is_file(), "The downloaded helper program is missing {file}."); }
        std::fs::write(marker(&payload), pin.sha256)?;
        let destination = cache.join(pin.name);
        if destination.exists() { std::fs::remove_dir_all(&destination)?; }
        std::fs::rename(&payload, &destination)?;
        Ok(destination)
    })();
    let _ = std::fs::remove_dir_all(&stage);
    outcome
}

/// How to start a helper: the program, arguments that come before the connector's own, and the folder to put first
/// on PATH (so `npx` finds its own `node`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Located { pub program: PathBuf, pub first_args: Vec<PathBuf>, pub path_dir: PathBuf }

/// Find `npx` or `uvx`: PlazCode's own pinned copy first, then the person's PATH, then the usual install folders
/// (a Mac app started from Finder does not see the shell's PATH).
pub fn locate_in(helper: &str, pinned: Option<&Pin>, cache: Option<&Path>, path: Option<&std::ffi::OsStr>, usual: &[PathBuf]) -> Option<Located> {
    if let (Some(pin), Some(cache)) = (pinned, cache) {
        if ready(cache, pin) {
            let folder = cache.join(pin.name);
            return Some(match pin.kind {
                Kind::TarGz => Located { program: folder.join("bin/node"), first_args: vec![folder.join("lib/node_modules/npm/bin/npx-cli.js")], path_dir: folder.join("bin") },
                Kind::Wheel => Located { program: folder.join("uvx"), first_args: Vec::new(), path_dir: folder },
            });
        }
    }
    let mut dirs: Vec<PathBuf> = path.map(|path| std::env::split_paths(path).collect()).unwrap_or_default();
    dirs.extend(usual.iter().cloned());
    dirs.into_iter().filter(|dir| dir.is_absolute()).map(|dir| (dir.join(helper), dir)).find(|(program, _)| program.is_file())
        .map(|(program, dir)| Located { program, first_args: Vec::new(), path_dir: dir })
}

/// Install folders a Finder-started app would otherwise miss: Homebrew (both Mac kinds) and the per-user tool folders.
pub fn usual_dirs(home: Option<&Path>) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = ["/opt/homebrew/bin", "/usr/local/bin"].map(PathBuf::from).to_vec();
    if let Some(home) = home { dirs.extend([home.join(".local/bin"), home.join(".cargo/bin")]); }
    dirs
}

pub fn locate(helper: &str, path: Option<&std::ffi::OsStr>) -> Option<Located> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    locate_in(helper, pin_here(helper).as_ref(), cache_root().as_deref(), path, &usual_dirs(home.as_deref()))
}

// ---- What the setup window shows ---------------------------------------------------------------------------------

/// The helper program's state as the checklist shows it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum View { Ready, Working, Failed(String), Later }

static NOTES: Mutex<Option<HashMap<String, View>>> = Mutex::new(None);

/// Record what is happening to a helper program so the open setup window can show it.
pub fn note(helper: &str, view: View) {
    let mut notes = NOTES.lock().unwrap_or_else(|error| error.into_inner());
    notes.get_or_insert_with(HashMap::new).insert(helper.to_ascii_lowercase(), view);
}

fn noted(helper: &str) -> Option<View> {
    NOTES.lock().unwrap_or_else(|error| error.into_inner()).as_ref().and_then(|notes| notes.get(helper).cloned())
}

/// A download in progress or a failure is shown as recorded; otherwise the disk decides.
pub fn view_from(noted: Option<View>, present: bool) -> View {
    match noted {
        Some(View::Working) => View::Working,
        Some(View::Failed(error)) if !present => View::Failed(error),
        _ if present => View::Ready,
        _ => View::Later,
    }
}

pub fn view(helper: &str) -> View {
    #[cfg(windows)]
    let present = cache_root().is_some_and(|cache| marker(&cache.join(if helper == "npx" { "node-22.22.0" } else { "uv-0.12.21" })).is_file()) || noted(helper) == Some(View::Ready);
    #[cfg(not(windows))]
    let present = locate(helper, std::env::var_os("PATH").as_deref()).is_some();
    view_from(noted(helper), present)
}

// ---- Download (thin layer over the tested functions above) --------------------------------------------------------

#[cfg(not(windows))]
async fn download(url: &str, to: &Path) -> anyhow::Result<()> {
    use futures::StreamExt;
    use tokio::io::AsyncWriteExt;
    const LIMIT: u64 = 200 * 1024 * 1024;
    anyhow::ensure!(url.starts_with("https://"), "Helper programs are only downloaded over a secure connection.");
    let client = reqwest::Client::builder().connect_timeout(std::time::Duration::from_secs(20)).https_only(true)
        .user_agent(concat!("PlazCode/", env!("CARGO_PKG_VERSION"))).build()?;
    let response = client.get(url).send().await?.error_for_status()?;
    anyhow::ensure!(response.content_length().map_or(true, |size| size <= LIMIT), "The helper program download is larger than expected.");
    let mut file = tokio::fs::File::create(to).await?;
    let (mut stream, mut total) = (response.bytes_stream(), 0u64);
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        total += chunk.len() as u64;
        anyhow::ensure!(total <= LIMIT, "The helper program download is larger than expected.");
        file.write_all(&chunk).await?;
    }
    file.flush().await?;
    Ok(())
}

/// Make sure `npx` or `uvx` can be started, downloading PlazCode's pinned copy when the computer has none.
/// One download at a time; a second caller waits and then finds the finished copy.
#[cfg(not(windows))]
pub async fn ensure(helper: &str) -> anyhow::Result<()> {
    static SETUP: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
    let _one_at_a_time = SETUP.lock().await;
    let path = std::env::var_os("PATH");
    if locate(helper, path.as_deref()).is_some() { note(helper, View::Ready); return Ok(()); }
    note(helper, View::Working);
    let outcome = async {
        let pin = pin_here(helper).ok_or_else(|| anyhow::anyhow!("PlazCode has no ready-made helper program for this kind of computer. Install {} yourself, then try again.", if helper == "npx" { "Node.js" } else { "uv" }))?;
        let cache = cache_root().ok_or_else(|| anyhow::anyhow!("PlazCode could not find your user folder to keep its helper program in."))?;
        tokio::fs::create_dir_all(&cache).await?;
        let archive = cache.join(format!(".download-{}-{}", pin.name, std::process::id()));
        tracing::info!("Preparing the {helper} helper program for first use ({})", pin.name);
        let fetched = tokio::time::timeout(std::time::Duration::from_secs(300), download(pin.url, &archive)).await
            .map_err(|_| anyhow::anyhow!("The download took too long. Check your internet connection and try again."))
            .and_then(|result| result.map_err(|error| anyhow::anyhow!("PlazCode could not download its helper program. Check your internet connection and try again. ({error})")));
        let installed = match fetched {
            Ok(()) => { let (pin, archive, cache) = (pin, archive.clone(), cache.clone()); tokio::task::spawn_blocking(move || install(&pin, &archive, &cache)).await.map_err(|error| anyhow::anyhow!(error.to_string())).and_then(|result| result) }
            Err(error) => Err(error),
        };
        let _ = tokio::fs::remove_file(&archive).await;
        installed.map(|_| ())
    }.await;
    match &outcome {
        Ok(()) => { tracing::info!("The {helper} helper program is ready"); note(helper, View::Ready); }
        Err(error) => note(helper, View::Failed(error.to_string())),
    }
    outcome
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("plazcode-runtime-{}-{}", std::process::id(), name));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// A small zip written by hand: (name, bytes, deflate?).
    fn zip(entries: &[(&str, &[u8], bool)]) -> Vec<u8> {
        use std::io::Write;
        let (mut out, mut directory) = (Vec::new(), Vec::new());
        for (name, data, deflate) in entries {
            let packed = if *deflate { let mut e = flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::default()); e.write_all(data).unwrap(); e.finish().unwrap() } else { data.to_vec() };
            let mut crc = flate2::Crc::new(); crc.update(data);
            let method: u16 = if *deflate { 8 } else { 0 };
            let offset = out.len() as u32;
            let mut common = Vec::new();
            common.extend(20u16.to_le_bytes()); common.extend(0u16.to_le_bytes()); common.extend(method.to_le_bytes());
            common.extend(0u32.to_le_bytes()); common.extend(crc.sum().to_le_bytes());
            common.extend((packed.len() as u32).to_le_bytes()); common.extend((data.len() as u32).to_le_bytes());
            common.extend((name.len() as u16).to_le_bytes()); common.extend(0u16.to_le_bytes());
            out.extend([0x50, 0x4b, 0x03, 0x04]); out.extend(&common); out.extend(name.as_bytes()); out.extend(&packed);
            directory.extend([0x50, 0x4b, 0x01, 0x02]); directory.extend(20u16.to_le_bytes()); directory.extend(&common);
            directory.extend(0u16.to_le_bytes()); directory.extend(0u16.to_le_bytes()); directory.extend(0u16.to_le_bytes());
            directory.extend(0u32.to_le_bytes()); directory.extend(offset.to_le_bytes()); directory.extend(name.as_bytes());
        }
        let start = out.len() as u32;
        out.extend(&directory);
        out.extend([0x50, 0x4b, 0x05, 0x06]); out.extend(0u32.to_le_bytes());
        out.extend((entries.len() as u16).to_le_bytes()); out.extend((entries.len() as u16).to_le_bytes());
        out.extend((directory.len() as u32).to_le_bytes()); out.extend(start.to_le_bytes()); out.extend(0u16.to_le_bytes());
        out
    }

    fn wheel() -> Vec<u8> {
        zip(&[
            ("uv-0.12.21.data/scripts/uv", b"uv program", true),
            ("uv-0.12.21.data/scripts/uvx", b"uvx program", false),
            ("uv-0.12.21.dist-info/licenses/LICENSE-MIT", b"licence text", true),
            ("uv-0.12.21.dist-info/METADATA", b"not wanted", true),
        ])
    }
    fn hash_of(bytes: &[u8]) -> &'static str { Box::leak(Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect::<String>().into_boxed_str()) }
    fn test_pin(kind: Kind, sha256: &'static str) -> Pin {
        match kind {
            Kind::Wheel => Pin { name: "uv-0.12.21", url: "https://example.invalid/uv.whl", sha256, kind, inner: "uv-0.12.21.data/scripts", files: UV_FILES },
            Kind::TarGz => Pin { name: "node-22.22.0", url: "https://example.invalid/node.tar.gz", sha256, kind, inner: "node-v22.22.0-test", files: NODE_FILES },
        }
    }

    #[test] fn every_supported_computer_has_both_pins_at_the_versions_windows_uses() {
        for (os, arch) in [("macos", "aarch64"), ("macos", "x86_64"), ("linux", "x86_64")] {
            for helper in ["npx", "uvx"] {
                let pin = pin(helper, os, arch).unwrap_or_else(|| panic!("{helper} on {os} {arch}"));
                assert!(pin.url.starts_with("https://") && pin.sha256.len() == 64 && pin.sha256.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase()));
                assert_eq!(pin.name, if helper == "npx" { "node-22.22.0" } else { "uv-0.12.21" }, "same folder names as Windows");
                assert!(pin.url.contains(if helper == "npx" { "v22.22.0" } else { "uv-0.12.21" }));
            }
        }
        assert!(pin("npx", "macos", "aarch64").unwrap().url.ends_with("darwin-arm64.tar.gz"));
        assert!(pin("uvx", "macos", "x86_64").unwrap().url.ends_with("macosx_10_12_x86_64.whl"));
        assert_eq!(pin("npx", "freebsd", "x86_64"), None);
        assert_eq!(pin("node", "macos", "aarch64"), None);
        let script = include_str!("../../Setup-Mcp-Runtime.ps1");
        assert!(script.contains("node-22.22.0") && script.contains("uv-0.12.21"), "Windows and the other systems pin the same versions");
        let all: Vec<&str> = ["npx", "uvx"].iter().flat_map(|h| [("macos", "aarch64"), ("macos", "x86_64"), ("linux", "x86_64")].map(|(o, a)| pin(h, o, a).unwrap().sha256)).collect();
        assert_eq!(all.iter().collect::<std::collections::BTreeSet<_>>().len(), 6, "every build has its own checksum");
    }

    #[test] fn only_the_exact_pinned_file_is_accepted() {
        let root = scratch("verify");
        let good = root.join("good"); std::fs::write(&good, b"the real download").unwrap();
        let expected = hash_of(b"the real download");
        assert_eq!(sha256_hex(&good).unwrap(), expected);
        verify(&good, expected).unwrap();
        verify(&good, &expected.to_ascii_uppercase()).unwrap();
        let tampered = root.join("tampered"); std::fs::write(&tampered, b"the real downloae").unwrap();
        assert!(verify(&tampered, expected).unwrap_err().to_string().contains("checksum"));
        let cut = root.join("cut"); std::fs::write(&cut, b"the real downl").unwrap();
        assert!(verify(&cut, expected).is_err(), "a cut-off download is refused");
        std::fs::write(&cut, b"").unwrap();
        assert!(verify(&cut, expected).is_err(), "an empty download is refused");
        assert!(verify(&root.join("missing"), expected).is_err());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test] fn a_wheel_installs_only_after_its_checksum_matches() {
        let root = scratch("wheel");
        let (archive, cache, bytes) = (root.join("uv.whl"), root.join("cache"), wheel());
        std::fs::write(&archive, &bytes).unwrap();
        let wrong = test_pin(Kind::Wheel, hash_of(b"something else"));
        assert!(install(&wrong, &archive, &cache).unwrap_err().to_string().contains("checksum"));
        assert!(!cache.join("uv-0.12.21").exists() && !ready(&cache, &wrong), "nothing is unpacked from a file that failed the check");

        let pin = test_pin(Kind::Wheel, hash_of(&bytes));
        assert!(!ready(&cache, &pin));
        let folder = install(&pin, &archive, &cache).unwrap();
        assert_eq!(folder, cache.join("uv-0.12.21"));
        assert_eq!(std::fs::read(folder.join("uv")).unwrap(), b"uv program");
        assert_eq!(std::fs::read(folder.join("uvx")).unwrap(), b"uvx program");
        assert_eq!(std::fs::read(folder.join("licenses/LICENSE-MIT")).unwrap(), b"licence text", "licence texts stay with the program");
        assert!(!folder.join("METADATA").exists() && !folder.join("uv-0.12.21.dist-info").exists());
        #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; assert_eq!(std::fs::metadata(folder.join("uvx")).unwrap().permissions().mode() & 0o111, 0o111, "the programs can be started"); }
        assert!(ready(&cache, &pin));
        assert_eq!(std::fs::read_dir(&cache).unwrap().count(), 1, "no setup folders are left behind");
        install(&pin, &archive, &cache).unwrap();
        assert!(ready(&cache, &pin), "installing again replaces the folder cleanly");

        std::fs::remove_file(folder.join("uvx")).unwrap();
        assert!(!ready(&cache, &pin), "a damaged folder is not trusted");
        std::fs::write(folder.join("uvx"), b"x").unwrap();
        std::fs::write(folder.join(".complete"), "another hash").unwrap();
        assert!(!ready(&cache, &pin), "a folder from another build is not trusted");
        let _ = std::fs::remove_dir_all(root);
    }

    #[test] fn damaged_or_hostile_zips_are_refused() {
        let root = scratch("zip");
        let archive = root.join("a.zip");
        let all = |name: &str| Some(PathBuf::from(name));
        std::fs::write(&archive, zip(&[("a/b.txt", b"hello", true), ("c.txt", b"", false)])).unwrap();
        assert_eq!(unzip(&archive, &root.join("out"), all).unwrap(), 2);
        assert_eq!(std::fs::read(root.join("out/a/b.txt")).unwrap(), b"hello");
        assert_eq!(unzip(&archive, &root.join("none"), |_| None).unwrap(), 0);

        let mut broken = zip(&[("a.txt", b"hello hello hello", false)]);
        let at = broken.windows(5).position(|w| w == b"hello").unwrap(); broken[at] = b'j';
        std::fs::write(&archive, &broken).unwrap();
        assert!(unzip(&archive, &root.join("out2"), all).unwrap_err().to_string().contains("damaged"), "a changed byte fails the archive's own checksum");
        for name in ["../escape.txt", "/abs.txt", "a/../../b.txt"] {
            std::fs::write(&archive, zip(&[(name, b"x", false)])).unwrap();
            assert!(unzip(&archive, &root.join("out3"), all).is_err(), "{name} must not leave the folder");
        }
        assert!(!root.join("escape.txt").exists());
        std::fs::write(&archive, b"not a zip at all, just text that is long enough").unwrap();
        assert!(unzip(&archive, &root.join("out4"), all).is_err());
        let whole = zip(&[("a.txt", b"hello", true)]);
        std::fs::write(&archive, &whole[..whole.len() - 9]).unwrap();
        assert!(unzip(&archive, &root.join("out5"), all).is_err(), "a cut-off zip is refused");
        let _ = std::fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test] fn a_node_archive_is_unpacked_into_the_layout_the_app_starts_from() {
        let root = scratch("node");
        let tree = root.join("tree/node-v22.22.0-test");
        std::fs::create_dir_all(tree.join("bin")).unwrap();
        std::fs::create_dir_all(tree.join("lib/node_modules/npm/bin")).unwrap();
        std::fs::write(tree.join("bin/node"), "node program").unwrap();
        std::fs::write(tree.join("lib/node_modules/npm/bin/npx-cli.js"), "npx").unwrap();
        let archive = root.join("node.tar.gz");
        assert!(std::process::Command::new("tar").arg("-czf").arg(&archive).arg("-C").arg(root.join("tree")).arg("node-v22.22.0-test").status().unwrap().success());
        let cache = root.join("cache");
        let pin = test_pin(Kind::TarGz, hash_of(&std::fs::read(&archive).unwrap()));
        install(&pin, &archive, &cache).unwrap();
        assert!(ready(&cache, &pin));
        let found = locate_in("npx", Some(&pin), Some(&cache), None, &[]).unwrap();
        assert_eq!(found, Located { program: cache.join("node-22.22.0/bin/node"), first_args: vec![cache.join("node-22.22.0/lib/node_modules/npm/bin/npx-cli.js")], path_dir: cache.join("node-22.22.0/bin") });

        // An archive without the expected program is refused and leaves nothing behind.
        std::fs::remove_file(tree.join("bin/node")).unwrap();
        let bad = root.join("bad.tar.gz");
        assert!(std::process::Command::new("tar").arg("-czf").arg(&bad).arg("-C").arg(root.join("tree")).arg("node-v22.22.0-test").status().unwrap().success());
        let other = root.join("cache2");
        assert!(install(&test_pin(Kind::TarGz, hash_of(&std::fs::read(&bad).unwrap())), &bad, &other).unwrap_err().to_string().contains("bin/node"));
        assert_eq!(std::fs::read_dir(&other).unwrap().count(), 0);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test] fn the_pinned_copy_wins_then_the_path_then_the_usual_folders() {
        let root = scratch("locate");
        let (cache, bin, home) = (root.join("cache"), root.join("bin"), root.join("home"));
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::create_dir_all(home.join(".local/bin")).unwrap();
        let pin = test_pin(Kind::Wheel, "abc");
        let usual = vec![root.join("homebrew"), home.join(".local/bin")];
        assert_eq!(usual_dirs(Some(&home)), ["/opt/homebrew/bin", "/usr/local/bin"].map(PathBuf::from).into_iter().chain([home.join(".local/bin"), home.join(".cargo/bin")]).collect::<Vec<_>>());
        assert_eq!(locate_in("uvx", Some(&pin), Some(&cache), None, &usual), None, "nothing anywhere: PlazCode must download");

        std::fs::write(home.join(".local/bin/uvx"), "").unwrap();
        assert_eq!(locate_in("uvx", Some(&pin), Some(&cache), None, &usual).unwrap().program, home.join(".local/bin/uvx"), "found without any PATH, as when started from Finder");
        std::fs::write(bin.join("uvx"), "").unwrap();
        let path = std::env::join_paths([root.join("empty"), bin.clone()]).unwrap();
        let found = locate_in("uvx", Some(&pin), Some(&cache), Some(&path), &usual).unwrap();
        assert_eq!((found.program, found.path_dir, found.first_args.len()), (bin.join("uvx"), bin.clone(), 0));
        assert_eq!(locate_in("npx", None, None, Some(&path), &usual), None, "uvx being there says nothing about npx");

        let folder = cache.join("uv-0.12.21"); std::fs::create_dir_all(&folder).unwrap();
        for file in ["uv", "uvx"] { std::fs::write(folder.join(file), "").unwrap(); }
        assert_eq!(locate_in("uvx", Some(&pin), Some(&cache), Some(&path), &usual).unwrap().program, bin.join("uvx"), "an unfinished download is never started");
        std::fs::write(folder.join(".complete"), "abc\n").unwrap();
        assert_eq!(locate_in("uvx", Some(&pin), Some(&cache), Some(&path), &usual).unwrap(), Located { program: folder.join("uvx"), first_args: vec![], path_dir: folder.clone() });
        let relative = std::ffi::OsString::from("relative-bin");
        assert_eq!(locate_in("npx", None, None, Some(&relative), &[]), None, "relative PATH entries are ignored");
        let _ = std::fs::remove_dir_all(root);
    }

    #[test] fn the_checklist_view_follows_the_download() {
        assert_eq!(view_from(None, false), View::Later);
        assert_eq!(view_from(None, true), View::Ready);
        assert_eq!(view_from(Some(View::Working), false), View::Working);
        assert_eq!(view_from(Some(View::Working), true), View::Working, "still unpacking");
        assert_eq!(view_from(Some(View::Failed("no internet".into())), false), View::Failed("no internet".into()));
        assert_eq!(view_from(Some(View::Failed("no internet".into())), true), View::Ready, "installed by hand since: the old failure is gone");
        assert_eq!(view_from(Some(View::Ready), false), View::Later, "removed since: it will be fetched again");
    }

    /// Real download of both pinned builds for this computer, then starting them. Needs the internet, so it runs
    /// only when asked: `PLAZCODE_TEST_RUNTIME_DOWNLOAD=1 cargo test real_pinned -- --ignored`.
    #[cfg(not(windows))]
    #[tokio::test] #[ignore] async fn real_pinned_builds_download_verify_and_start() {
        let wanted = std::env::var("PLAZCODE_TEST_RUNTIME_DOWNLOAD").unwrap_or_default();
        if wanted.is_empty() { return; }
        let cache = scratch("real");
        for helper in ["uvx", "npx"] {
            if wanted != "1" && wanted != helper { continue; }
            let pin = pin_here(helper).expect("a pin for this computer");
            // PLAZCODE_TEST_RUNTIME_FILES: a folder with already downloaded `uvx.download` / `npx.download`, for
            // machines whose network the app's own downloader cannot use. The checksum check still applies.
            let ready_made = std::env::var_os("PLAZCODE_TEST_RUNTIME_FILES").map(|dir| PathBuf::from(dir).join(format!("{helper}.download"))).filter(|file| file.is_file());
            let archive = ready_made.clone().unwrap_or_else(|| cache.join(format!("{helper}.download")));
            if ready_made.is_none() { download(pin.url, &archive).await.unwrap_or_else(|error| panic!("{helper}: {error}")); }
            install(&pin, &archive, &cache).unwrap_or_else(|error| panic!("{helper}: {error}"));
            let found = locate_in(helper, Some(&pin), Some(&cache), None, &[]).unwrap();
            let output = std::process::Command::new(&found.program).args(&found.first_args).arg("--version")
                .env("PATH", std::env::join_paths([found.path_dir.clone(), PathBuf::from("/usr/bin"), PathBuf::from("/bin")]).unwrap()).output().unwrap();
            let text = String::from_utf8_lossy(&output.stdout).to_string() + &String::from_utf8_lossy(&output.stderr);
            assert!(output.status.success(), "{helper} --version: {text}");
            println!("{helper} --version -> {}", text.trim());
            if helper == "uvx" { assert!(text.contains("0.12.21"), "{text}"); }
        }
        let _ = std::fs::remove_dir_all(cache);
    }
}
