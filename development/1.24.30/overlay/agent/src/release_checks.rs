//! Independent release canaries, deliberately separate from the full-tree work verifier.
//! These raise the cost of a single-function patch; they cannot make an unsigned local app unpatchable.
use anyhow::{ensure,Context,Result};
use sha2::{Digest,Sha256};
use std::{io::Read,path::{Path,PathBuf},sync::Mutex,time::{Duration,Instant,SystemTime}};
const RECORD:&str="PlazCode-Extension/core/release-variant.json";
const MANIFEST:&str="PlazCode-Extension/plazcode-installation-integrity.json";
const REUSE:Duration=Duration::from_secs(10);
type Stamp=(PathBuf,u64,SystemTime);
struct Passed {root:PathBuf,at:Instant,stamps:Vec<Stamp>}
static NATIVE:Mutex<Option<Passed>>=Mutex::new(None);
static TEXT:Mutex<Option<Passed>>=Mutex::new(None);
static PROGRAM:Mutex<Option<Passed>>=Mutex::new(None);

fn metadata(path:&Path)->Result<std::fs::Metadata>{
    for parent in path.ancestors(){ensure!(!std::fs::symlink_metadata(parent)?.file_type().is_symlink(),"Unsafe release canary path");}
    let meta=std::fs::symlink_metadata(path)?;ensure!(meta.is_file(),"Release canary is not a file");Ok(meta)
}
fn stamps(paths:&[PathBuf])->Result<Vec<Stamp>> {paths.iter().map(|p|{let m=metadata(p)?;Ok((p.clone(),m.len(),m.modified()?))}).collect()}
fn cached(slot:&Mutex<Option<Passed>>,root:&Path,paths:&[PathBuf],verify:impl FnOnce()->Result<()>)->Result<()> {
    let mut slot=slot.lock().map_err(|_|anyhow::anyhow!("Release check unavailable"))?;
    let before=match stamps(paths){Ok(value)=>value,Err(error)=>{*slot=None;return Err(error);}};
    if slot.as_ref().is_some_and(|p|p.root==root&&p.at.elapsed()<REUSE&&p.stamps==before){return Ok(());}
    *slot=None;verify()?;*slot=Some(Passed{root:root.to_owned(),at:Instant::now(),stamps:before});Ok(())
}
fn bounded(path:&Path,limit:u64)->Result<Vec<u8>> {ensure!(metadata(path)?.len()<=limit,"Oversized release canary");let mut bytes=Vec::new();std::fs::File::open(path)?.take(limit+1).read_to_end(&mut bytes)?;ensure!(bytes.len() as u64<=limit,"Release canary grew");Ok(bytes)}
fn unhex(text:&str)->Result<Vec<u8>> {ensure!(text.len()%2==0&&text.bytes().all(|b|b.is_ascii_hexdigit()),"Invalid release metadata");(0..text.len()).step_by(2).map(|i|Ok(u8::from_str_radix(&text[i..i+2],16)?)).collect()}
fn trusted_key()->Result<Vec<u8>> {
    let text=option_env!("PLAZCODE_RELEASE_PUBLIC_KEY").unwrap_or(include_str!("../../release-public-key.hex")).trim();
    let key=unhex(text)?;ensure!(key.len()==32,"Release trust is missing");Ok(key)
}
fn signed(root:&Path,key:&[u8])->Result<serde_json::Value>{
    let raw=bounded(&root.join(MANIFEST),4*1024*1024)?;
    let envelope:serde_json::Value=serde_json::from_slice(&raw)?;
    let payload=envelope["payload"].as_str().context("Missing release payload")?;
    let signature=unhex(envelope["signature"].as_str().context("Missing release signature")?)?;
    let message=[b"PlazCode release v1\n".as_slice(),payload.as_bytes()].concat();
    ring::signature::UnparsedPublicKey::new(&ring::signature::ED25519,key).verify(&message,&signature).map_err(|_|anyhow::anyhow!("Release canary signature failed"))?;
    let value:serde_json::Value=serde_json::from_str(payload)?;
    ensure!(value["schema"]==1&&value["kind"]=="files"&&value["version"]==env!("CARGO_PKG_VERSION")&&value["platform"]==crate::integrity::platform()&&value["channel"]==crate::integrity::channel(),"Release canary version mismatch");Ok(value)
}
fn fingerprint(path:&Path,row:&serde_json::Value)->Result<()> {
    let size=row["bytes"].as_u64().context("Missing release fingerprint")?;
    ensure!(size<=256*1024*1024&&metadata(path)?.len()==size,"Release canary size changed");
    let mut reader=std::fs::File::open(path)?.take(size+1);let mut hasher=Sha256::new();let mut buf=[0;65536];let mut total=0;
    loop{let count=reader.read(&mut buf)?;if count==0{break;}total+=count as u64;hasher.update(&buf[..count]);}
    ensure!(total==size&&row["sha256"].as_str()==Some(format!("{:x}",hasher.finalize()).as_str()),"Release canary fingerprint changed");Ok(())
}
fn record(root:&Path)->Result<()> {
    let value:serde_json::Value=serde_json::from_slice(&bounded(&root.join(RECORD),4096)?)?;
    ensure!(value==crate::release_variant::info(),"Release variant belongs to another build");Ok(())
}
fn native(root:&Path,exe:&Path,key:&[u8])->Result<()> {
    let manifest=signed(root,key)?;
    let name=if cfg!(windows){"PlazCode.exe"}else if cfg!(target_os="macos"){"PlazCode.app/Contents/MacOS/PlazCode"}else{"PlazCode"};
    fingerprint(exe,&manifest["files"][name])
}
fn program_name()->&'static str {match crate::release_variant::SEED[2]%3{0=>"core/main.js",1=>"background.js",_=>"PlazCode-Extension/core/text-pack.js"}}
fn program(root:&Path,key:&[u8])->Result<()> {record(root)?;let manifest=signed(root,key)?;fingerprint(&root.join(program_name()),&manifest["files"][program_name()])}
pub fn startup(root:&Path)->Result<()> {if cfg!(debug_assertions){return Ok(());}record(root).context(crate::integrity::RECOVERY)}
pub fn text(root:&Path)->Result<()> {
    if cfg!(debug_assertions){return Ok(());}
    cached(&TEXT,root,&[root.join(RECORD),root.join(crate::text_pack::FILE)],||{record(root)?;ensure!(crate::text_pack::load(root)?.is_some(),"Missing release text pack");Ok(())}).context(crate::integrity::RECOVERY)
}
fn work(root:&Path,request:&str)->Result<()> {
    let exe=std::env::current_exe()?;let key=trusted_key()?;
    // Seeded order and request selection change the arrangement in each release.
    let offset=(crate::hidden::fnv(request)%3) as u8;
    for index in 0..3 {match (index+offset)%3{
        0=>cached(&NATIVE,root,&[root.join(MANIFEST),exe.clone()],||native(root,&exe,&key))?,
        1=>cached(&PROGRAM,root,&[root.join(MANIFEST),root.join(RECORD),root.join(program_name())],||program(root,&key))?,
        _=>text(root)?,
    }}Ok(())
}
pub async fn before_work(request:&str)->Result<()> {
    if cfg!(debug_assertions){return Ok(());}
    let request=request.to_owned();tokio::task::spawn_blocking(move||work(&crate::platform::installation_root(),&request)).await?.context(crate::integrity::RECOVERY)
}

#[cfg(test)] mod tests {
    use super::*;use ring::signature::{Ed25519KeyPair,KeyPair};
    #[test] fn independent_canaries_refuse_changes_and_wrong_signatures(){
        let root=std::env::temp_dir().join(format!("plazcode-canary-{}",std::process::id()));let _=std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("PlazCode-Extension/core")).unwrap();std::fs::create_dir_all(root.join("core")).unwrap();
        let name=if cfg!(windows){"PlazCode.exe"}else if cfg!(target_os="macos"){"PlazCode.app/Contents/MacOS/PlazCode"}else{"PlazCode"};
        std::fs::create_dir_all(root.join(name).parent().unwrap()).unwrap();
        let mut files=serde_json::Map::new();
        for file in [name,"core/main.js","background.js","PlazCode-Extension/core/text-pack.js"] {std::fs::write(root.join(file),b"original").unwrap();files.insert(file.into(),serde_json::json!({"bytes":8,"sha256":format!("{:x}",Sha256::digest(b"original"))}));}
        let key=Ed25519KeyPair::generate_pkcs8(&ring::rand::SystemRandom::new()).unwrap();let key=Ed25519KeyPair::from_pkcs8(key.as_ref()).unwrap();
        let payload=serde_json::json!({"schema":1,"kind":"files","version":env!("CARGO_PKG_VERSION"),"platform":crate::integrity::platform(),"channel":crate::integrity::channel(),"files":files}).to_string();
        let signature=key.sign(&[b"PlazCode release v1\n".as_slice(),payload.as_bytes()].concat()).as_ref().iter().map(|b|format!("{b:02x}")).collect::<String>();
        std::fs::write(root.join(MANIFEST),serde_json::json!({"payload":payload,"signature":signature}).to_string()).unwrap();
        std::fs::write(root.join(RECORD),crate::release_variant::info().to_string()).unwrap();
        native(&root,&root.join(name),key.public_key().as_ref()).unwrap();program(&root,key.public_key().as_ref()).unwrap();
        assert!(native(&root,&root.join(name),&[0;32]).is_err());
        std::fs::write(root.join(name),b"modified").unwrap();assert!(native(&root,&root.join(name),key.public_key().as_ref()).is_err());
        std::fs::write(root.join(program_name()),b"modified").unwrap();assert!(program(&root,key.public_key().as_ref()).is_err());
        std::fs::write(root.join(RECORD),"{}").unwrap();assert!(record(&root).is_err());std::fs::remove_dir_all(root).unwrap();
    }
    #[test] fn cached_pass_never_hides_a_changed_file_or_reuses_failure(){
        let root=std::env::temp_dir().join(format!("plazcode-canary-cache-{}",std::process::id()));std::fs::create_dir_all(&root).unwrap();let path=root.join("file");std::fs::write(&path,"a").unwrap();
        let slot=Mutex::new(None);cached(&slot,&root,&[path.clone()],||Ok(())).unwrap();
        std::fs::write(&path,"different size").unwrap();assert!(cached(&slot,&root,&[path.clone()],||anyhow::bail!("changed")).is_err());
        assert!(cached(&slot,&root,&[path],||anyhow::bail!("still changed")).is_err());std::fs::remove_dir_all(root).unwrap();
    }
}
