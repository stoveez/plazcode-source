//! Private per-profile pictures, loaded on demand instead of in every status poll.
use std::{path::{Path,PathBuf},sync::Mutex};
use anyhow::{ensure,Context,Result};
use base64::{Engine,engine::general_purpose::STANDARD};
use serde_json::Value;
pub const MAX_BYTES:usize=1024*1024;
pub const MAX_ENCODED:usize=MAX_BYTES.div_ceil(3)*4+64;
static FILES:Mutex<()>=Mutex::new(());
fn path(id:&str)->Result<PathBuf>{Ok(crate::profile_paths::profile_root(id)?.join("profile-picture.json"))}
pub fn validate(value:&Value)->Result<()> {
    if value.is_null(){return Ok(());}
    let text=value.as_str().context("Choose a JPEG, PNG or GIF picture")?;
    ensure!(text.len()<=MAX_ENCODED,"Profile pictures must be 1 MB or smaller");
    let (kind,data)=text.split_once(",").context("Choose a JPEG, PNG or GIF picture")?;
    let bytes=STANDARD.decode(data).context("Invalid profile picture")?;
    ensure!(!bytes.is_empty()&&bytes.len()<=MAX_BYTES,"Profile pictures must be 1 MB or smaller");
    let valid=match kind {
        "data:image/png;base64"=>bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "data:image/gif;base64"=>bytes.starts_with(b"GIF87a")||bytes.starts_with(b"GIF89a"),
        "data:image/jpeg;base64"=>bytes.starts_with(b"\xff\xd8\xff")&&bytes.ends_with(b"\xff\xd9"),
        _=>false,
    };
    ensure!(valid,"Choose a JPEG, PNG or GIF picture");Ok(())
}
fn read_at(path:&Path)->Result<Value>{
    let metadata=match std::fs::symlink_metadata(path){Ok(v)=>v,Err(e)if e.kind()==std::io::ErrorKind::NotFound=>return Ok(Value::Null),Err(e)=>return Err(e.into())};
    ensure!(metadata.is_file()&&!metadata.file_type().is_symlink()&&metadata.len()<=MAX_ENCODED as u64+8,"Invalid saved profile picture");
    let picture:Value=serde_json::from_slice(&std::fs::read(path)?)?;validate(&picture)?;Ok(picture)
}
fn write_at(path:&Path,value:&Value)->Result<()>{
    validate(value)?;
    if value.is_null(){match std::fs::remove_file(path){Ok(())=>{},Err(e)if e.kind()==std::io::ErrorKind::NotFound=>{},Err(e)=>return Err(e.into())}return Ok(());}
    std::fs::create_dir_all(path.parent().context("Invalid profile picture path")?)?;
    let temporary=path.with_extension(format!("json.tmp-{}-{}",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos()));
    let mut options=std::fs::OpenOptions::new();options.write(true).create_new(true);
    #[cfg(unix)] {use std::os::unix::fs::OpenOptionsExt;options.mode(0o600);}
    use std::io::Write;let mut file=options.open(&temporary)?;file.write_all(&serde_json::to_vec(value)?)?;file.sync_all()?;drop(file);std::fs::rename(temporary,path)?;Ok(())
}
pub fn read(id:&str)->Result<Value>{let _guard=FILES.lock().map_err(|_|anyhow::anyhow!("Picture storage is busy"))?;read_at(&path(id)?)}
pub fn set(id:&str,value:&Value)->Result<()>{let _guard=FILES.lock().map_err(|_|anyhow::anyhow!("Picture storage is busy"))?;write_at(&path(id)?,value)}
pub fn apply_if_unchanged(id:&str,before:&Value,incoming:&Value)->Result<()>{let _guard=FILES.lock().map_err(|_|anyhow::anyhow!("Picture storage is busy"))?;let path=path(id)?;let current=read_at(&path)?;if current==*before&&current!=*incoming{write_at(&path,incoming)?;}Ok(())}
pub fn revision(id:&str)->Option<String>{let metadata=std::fs::symlink_metadata(path(id).ok()?).ok()?;if !metadata.is_file()||metadata.file_type().is_symlink(){return None;}Some(format!("{}-{}",metadata.len(),metadata.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_nanos()))}
#[cfg(test)]mod tests{use super::*;
#[test]fn rejects_external_svg_forged_and_oversized_pictures(){
 for value in [serde_json::json!("https://example.com/photo.png"),serde_json::json!("data:image/svg+xml;base64,PHN2Zy8+"),serde_json::json!("data:image/png;base64,R0lGODlh")]{assert!(validate(&value).is_err());}
 assert!(validate(&serde_json::json!(format!("data:image/gif;base64,{}",STANDARD.encode(vec![0;MAX_BYTES+1])))).is_err());
 for (mime,bytes) in [("png",b"\x89PNG\r\n\x1a\n".as_slice()),("gif",b"GIF89a".as_slice()),("jpeg",b"\xff\xd8\xff\xff\xd9".as_slice())]{assert!(validate(&serde_json::json!(format!("data:image/{mime};base64,{}",STANDARD.encode(bytes)))).is_ok());}
}
#[test]fn keeps_animation_bytes_and_removal_separate_from_other_files(){
 let root=std::env::temp_dir().join(format!("plazcode-picture-{}",std::process::id()));let _=std::fs::remove_dir_all(&root);std::fs::create_dir_all(&root).unwrap();let path=root.join("picture.json");std::fs::write(root.join("memory.json"),b"kept").unwrap();let picture=serde_json::json!(format!("data:image/gif;base64,{}",STANDARD.encode(b"GIF89a original frame bytes")));write_at(&path,&picture).unwrap();assert_eq!(read_at(&path).unwrap(),picture);write_at(&path,&Value::Null).unwrap();assert_eq!(read_at(&path).unwrap(),Value::Null);assert_eq!(std::fs::read(root.join("memory.json")).unwrap(),b"kept");let _=std::fs::remove_dir_all(root);
}}
