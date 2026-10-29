// SPDX-License-Identifier: GPL-3.0-or-later
//! Lazy, project-isolated Engram MCP. Chat transcripts remain in chat_history.
use crate::mcp_addons::{AddonRuntime,ServerSpec};
use serde_json::{json,Value};
use std::{collections::{HashMap,HashSet},path::PathBuf,sync::Arc};
use tokio::sync::Mutex;
struct Runtime { process:AddonRuntime, sessions:HashSet<String> }
struct Entry { runtime:Arc<Mutex<Runtime>>, touched:u64 }
#[derive(Default)]struct Registry { entries:HashMap<String,Entry>, tick:u64 }
static REGISTRY:once_cell::sync::Lazy<Mutex<Registry>>=once_cell::sync::Lazy::new(||Mutex::new(Registry::default()));
fn key(text:&str)->String {let mut hash=14695981039346656037u64;for byte in text.as_bytes(){hash^=*byte as u64;hash=hash.wrapping_mul(1099511628211);}format!("{hash:016x}")}
fn data_root()->PathBuf{let base=std::env::var_os("LOCALAPPDATA").or_else(||std::env::var_os("XDG_CONFIG_HOME")).map(PathBuf::from).unwrap_or_else(||PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".config"));base.join("PlazCode").join("engram")}
fn executable()->anyhow::Result<PathBuf>{
    let root=crate::platform::installation_root();
    let platform=if cfg!(target_os="windows"){"windows"}else if cfg!(target_os="macos"){"darwin"}else{"linux"};
    let arch=if cfg!(target_arch="aarch64"){"arm64"}else{"amd64"};
    let filename=format!("engram-{platform}-{arch}{}",if cfg!(windows){".exe"}else{""});
    // Older macOS updaters replace the signed app, but do not copy new runtime folders.
    // Prefer the bundled runtime so automatic upgrades carry the matching Engram build.
    let bundled=root.join("PlazCode.app/Contents/Resources/engram").join(&filename);
    let path=if cfg!(target_os="macos") && bundled.is_file(){bundled}else{root.join("runtime").join("engram").join(filename)};
    anyhow::ensure!(path.is_file(),"The bundled Engram runtime is unavailable. Existing memory and chat logging remain available.");Ok(path)
}

// ── Memory helper download ────────────────────────────────────────────────────
// Small test downloads leave the large memory helper (Engram) out. When it is missing, PlazCode fetches
// the official Engram 3.0.0 release from GitHub once, checks it against the pinned SHA-256 and keeps it in
// the installation's runtime folder. Anything that does not match the pinned hash is thrown away.
const ENGRAM_BASE:&str="https://github.com/Gentleman-Programming/engram/releases/download/v3.0.0/";
/// (archive name, pinned SHA-256 of the official archive, name of the program inside it)
fn pinned_archive()->Option<(&'static str,&'static str,&'static str)>{
    if cfg!(all(target_os="windows",target_arch="x86_64")){Some(("engram_3.0.0_windows_amd64.zip","bb410e4a578bee96888f848764dbbf9e7dd78971204c05bb7fb81a4a8db324a3","engram.exe"))}
    else if cfg!(all(target_os="macos",target_arch="x86_64")){Some(("engram_3.0.0_darwin_amd64.tar.gz","68cc3eebbb265d1c45999a429d1e6774150ba71ac008f4dd381b9d73b10c79dd","engram"))}
    else if cfg!(all(target_os="macos",target_arch="aarch64")){Some(("engram_3.0.0_darwin_arm64.tar.gz","54e080ed64a1d1b7b8a5d59e5a6d17100adbd69a6aafbb73d270dbeb37c03266","engram"))}
    else {None}
}
fn verify_sha256(bytes:&[u8],expected:&str)->anyhow::Result<()>{
    use sha2::{Digest,Sha256};
    let actual=Sha256::digest(bytes).iter().map(|b|format!("{b:02x}")).collect::<String>();
    anyhow::ensure!(actual==expected,"The downloaded memory helper did not match its official checksum, so it was not used.");Ok(())
}
/// Unpacks with the tar program every supported system ships (Windows 10+ and macOS read zip and tar.gz) and returns the named program.
fn extract_program(archive:&[u8],file_name:&str,program:&str)->anyhow::Result<Vec<u8>>{
    let dir=std::env::temp_dir().join(format!("plazcode-engram-{}",std::process::id()));let _=std::fs::remove_dir_all(&dir);std::fs::create_dir_all(&dir)?;
    let result=(||->anyhow::Result<Vec<u8>>{
        let file=dir.join(file_name);std::fs::write(&file,archive)?;
        let status=std::process::Command::new("tar").arg("-xf").arg(&file).arg("-C").arg(&dir).status()?;
        anyhow::ensure!(status.success(),"Could not unpack the memory helper.");
        let mut stack=vec![dir.clone()];
        while let Some(folder)=stack.pop(){for entry in std::fs::read_dir(&folder)?{let path=entry?.path();if path.is_dir(){stack.push(path)}else if path.file_name().and_then(|n|n.to_str())==Some(program){return Ok(std::fs::read(&path)?)}}}
        anyhow::bail!("The memory helper download did not contain {program}.")
    })();
    let _=std::fs::remove_dir_all(&dir);result
}
static DOWNLOAD:once_cell::sync::Lazy<Mutex<()>>=once_cell::sync::Lazy::new(||Mutex::new(()));
async fn executable_or_download()->anyhow::Result<PathBuf>{
    if let Ok(path)=executable(){return Ok(path);}
    let (archive,sha,program)=pinned_archive().ok_or_else(||anyhow::anyhow!("The bundled Engram runtime is unavailable. Existing memory and chat logging remain available."))?;
    let _guard=DOWNLOAD.lock().await;
    if let Ok(path)=executable(){return Ok(path);}
    let platform=if cfg!(target_os="windows"){"windows"}else{"darwin"};let arch=if cfg!(target_arch="aarch64"){"arm64"}else{"amd64"};
    let filename=format!("engram-{platform}-{arch}{}",if cfg!(windows){".exe"}else{""});
    let destination=crate::platform::installation_root().join("runtime").join("engram").join(&filename);
    let client=reqwest::Client::builder().user_agent("PlazCode-memory").timeout(std::time::Duration::from_secs(120)).build()?;
    let response=client.get(format!("{ENGRAM_BASE}{archive}")).send().await.map_err(|e|anyhow::anyhow!("Could not download the memory helper ({e}). Check your connection; memory will try again next time."))?.error_for_status()?;
    anyhow::ensure!(response.content_length().unwrap_or(0)<=30*1024*1024,"The memory helper download is larger than expected.");
    let mut bytes=Vec::new();let mut chunks=response.bytes_stream();
    {use futures::StreamExt;while let Some(chunk)=chunks.next().await{let chunk=chunk?;anyhow::ensure!(bytes.len()+chunk.len()<=30*1024*1024,"The memory helper download is larger than expected.");bytes.extend_from_slice(&chunk);}}
    verify_sha256(&bytes,sha)?;
    let program_bytes=tokio::task::spawn_blocking(move||extract_program(&bytes,archive,program)).await??;
    if let Some(parent)=destination.parent(){tokio::fs::create_dir_all(parent).await?;}
    let partial=destination.with_extension("part");tokio::fs::write(&partial,&program_bytes).await?;
    #[cfg(unix)]{use std::os::unix::fs::PermissionsExt;tokio::fs::set_permissions(&partial,std::fs::Permissions::from_mode(0o755)).await?;}
    tokio::fs::rename(&partial,&destination).await?;
    #[cfg(target_os="macos")]{let _=std::process::Command::new("codesign").args(["--force","--sign","-"]).arg(&destination).status();}
    Ok(destination)
}
async fn runtime(scope:&str)->anyhow::Result<Arc<Mutex<Runtime>>>{
    let mut registry=REGISTRY.lock().await;registry.tick+=1;let tick=registry.tick;
    if let Some(entry)=registry.entries.get_mut(scope){entry.touched=tick;return Ok(entry.runtime.clone());}
    if registry.entries.len()>=4 {
        let oldest=registry.entries.iter().filter(|(_,v)|Arc::strong_count(&v.runtime)==1).min_by_key(|(_,v)|v.touched).map(|(k,_)|k.clone());
        if let Some(oldest)=oldest{if let Some(entry)=registry.entries.remove(&oldest){entry.runtime.lock().await.process.reset().await;}}
        else {anyhow::bail!("Memory is busy. Try reading context after current requests finish.");}
    }
    let path=executable_or_download().await?;let dir=data_root().join(key(scope));tokio::fs::create_dir_all(&dir).await?;
    let marker=dir.join("scope.json");
    if marker.is_file(){let stored:String=serde_json::from_slice(&tokio::fs::read(&marker).await?)?;anyhow::ensure!(stored==scope,"Memory scope collision; refused to open another project's database.");}
    else{tokio::fs::write(&marker,serde_json::to_vec(scope)?).await?;}
    let mut env=HashMap::new();env.insert("ENGRAM_DATA_DIR".into(),dir.to_string_lossy().into_owned());env.insert("ENGRAM_PROJECT".into(),scope.into());env.insert("ENGRAM_CLOUD_AUTOSYNC".into(),"0".into());
    let process=AddonRuntime::new("plazcode-engram".into(),ServerSpec{command:path.to_string_lossy().into_owned(),args:vec!["mcp".into(),"--tools=agent,admin".into()],env});
    let runtime=Arc::new(Mutex::new(Runtime{process,sessions:HashSet::new()}));registry.entries.insert(scope.into(),Entry{runtime:runtime.clone(),touched:tick});Ok(runtime)
}
fn string(value:&Value,name:&str,max:usize)->anyhow::Result<String>{let text=value[name].as_str().unwrap_or("");anyhow::ensure!(!text.trim().is_empty()&&text.len()<=max,"Invalid or oversized {name}");Ok(text.into())}
async fn execute(value:Value)->anyhow::Result<Value>{
    let scope=string(&value,"scope",2000)?;let chat=string(&value,"chat",2000)?;let action=string(&value,"action",30)?;
    if matches!(action.as_str(),"save"|"summary"|"checkpoint") {anyhow::ensure!(crate::memory::STORE.snapshot().automatic,"Automatic memory is off.");}
    let session=format!("plazcode-{}",key(&chat));
    let (tool,args)=match action.as_str(){
        "context"=>("mem_context",json!({"project":scope,"scope":"project","max_bytes":12000})),
        "search"=>("mem_search",json!({"project":scope,"scope":"project","query":string(&value,"query",1000)?,"limit":8,"response_format":"compact"})),
        "read"=>{let id=value["id"].as_u64().filter(|id|*id>0).ok_or_else(||anyhow::anyhow!("Positive observation id required"))?;("mem_get_observation",json!({"id":id,"project":scope}))},
        "save"|"manual-save"=>("mem_save",json!({"session_id":session,"project":scope,"scope":"project","title":string(&value,"title",160)?,"content":string(&value,"content",16000)?,"topic_key":string(&value,"topic_key",160)?,"type":"discovery","capture_prompt":false})),
        "manual-remove"=>{let id=value["id"].as_u64().filter(|id|*id>0).ok_or_else(||anyhow::anyhow!("Positive observation id required"))?;("mem_delete",json!({"id":id,"expected_project":scope,"hard_delete":false}))},
        "checkpoint"=>{
            let id=string(&value,"checkpoint",160)?;
            let journal=crate::checkpoints::STORE.lock().await;let task=journal.task(&id)?;
            anyhow::ensure!(task.chat==chat && matches!(task.status.as_str(),"worked"|"interrupted"),"Checkpoint does not belong to this chat or is not finished.");
            let files=journal.details(&id)?;let paths=files["files"].as_array().map(|rows|rows.iter().filter_map(|row|row["path"].as_str()).take(40).map(|path|path.chars().take(300).collect::<String>()).collect::<Vec<_>>().join("\n")).unwrap_or_default();
            let content=format!("## Goal\n{}\n## Instructions\nHistorical checkpoint record. Verify current state before continuing; an ended loop is not proof every user goal was achieved.\n## Discoveries\nNo additional discoveries inferred automatically.\n## Accomplished\nRecorded checkpoint status: {}.\nRecorded tool steps: {}\nWarnings: {}\n## Next Steps\nInspect current state and unfinished goals before resuming.\n## Relevant Files\n{}",task.request.chars().take(4000).collect::<String>(),task.status,task.steps.iter().take(30).map(|step|step.chars().take(100).collect::<String>()).collect::<Vec<_>>().join(", "),task.warnings.iter().take(8).map(|warning|warning.chars().take(250).collect::<String>()).collect::<Vec<_>>().join("; "),paths);
            let mut end=content.len().min(16000);while !content.is_char_boundary(end){end-=1;}let content=&content[..end];
            ("mem_save",json!({"session_id":session,"project":scope,"scope":"project","title":format!("Task checkpoint: {}",task.label.chars().take(120).collect::<String>()),"content":content,"topic_key":format!("checkpoint/{id}"),"type":"discovery","capture_prompt":false}))
        },
        "summary"=>("mem_session_summary",json!({"session_id":session,"project":scope,"content":string(&value,"content",20000)?})),
        _=>anyhow::bail!("Use context, search, read, save or summary."),
    };
    let shared=runtime(&scope).await?;let mut runtime=shared.lock().await;
    let operation=async {
        if !runtime.sessions.contains(&session){runtime.process.call_tool("mem_session_start",json!({"id":session})).await?;if runtime.sessions.len()>=256{runtime.sessions.clear();}runtime.sessions.insert(session);}
        let (text,_)=runtime.process.call_tool(tool,args).await?;Ok::<String,anyhow::Error>(text)
    };
    let text=match tokio::time::timeout(std::time::Duration::from_secs(22),operation).await{
        Ok(Ok(text))=>text,Ok(Err(error))=>{runtime.process.reset().await;runtime.sessions.clear();return Err(error);},Err(_)=>{runtime.process.reset().await;runtime.sessions.clear();anyhow::bail!("Memory request timed out; a write may have completed. Read context before repeating a write.");}
    };
    let mut end=text.len().min(24000);while !text.is_char_boundary(end){end-=1;}
    Ok(json!({"ok":true,"text":&text[..end],"truncated":end<text.len(),"scope":scope}))
}
pub async fn post(axum::Json(value):axum::Json<Value>)->axum::response::Response{use axum::response::IntoResponse;match execute(value).await{Ok(result)=>axum::Json(result).into_response(),Err(e)=>(axum::http::StatusCode::BAD_REQUEST,axum::Json(json!({"ok":false,"error":e.to_string()}))).into_response()}}
#[cfg(test)]mod tests{use super::*;#[test]fn scope_keys_are_stable_and_safe(){assert_eq!(key("project:A"),key("project:A"));assert_ne!(key("project:A"),key("chat:A"));assert!(key("../escape").chars().all(|c|c.is_ascii_hexdigit()));}#[test]fn input_limits_are_bytes(){assert!(string(&json!({"scope":""}),"scope",2000).is_err());assert!(string(&json!({"content":"éé"}),"content",3).is_err());}}
#[cfg(test)]mod download_tests{use super::*;
#[test]fn checksum_must_match(){assert!(verify_sha256(b"abc","ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad").is_ok());assert!(verify_sha256(b"abd","ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad").is_err());}
#[test]fn pinned_hashes_match_the_shipped_list(){let sums=include_str!("../../runtime/engram/SHA256SUMS.txt");for (name,sha) in [("engram_3.0.0_windows_amd64.zip","bb410e4a578bee96888f848764dbbf9e7dd78971204c05bb7fb81a4a8db324a3"),("engram_3.0.0_darwin_amd64.tar.gz","68cc3eebbb265d1c45999a429d1e6774150ba71ac008f4dd381b9d73b10c79dd"),("engram_3.0.0_darwin_arm64.tar.gz","54e080ed64a1d1b7b8a5d59e5a6d17100adbd69a6aafbb73d270dbeb37c03266")]{assert!(sums.contains(&format!("{sha}  {name}")),"{name}");}}
#[cfg(unix)]#[test]fn program_is_found_inside_a_tar_archive(){let dir=std::env::temp_dir().join(format!("plazcode-engram-test-{}",std::process::id()));let _=std::fs::remove_dir_all(&dir);std::fs::create_dir_all(dir.join("pack/sub")).unwrap();std::fs::write(dir.join("pack/sub/engram"),b"PROGRAM").unwrap();std::fs::write(dir.join("pack/README"),b"x").unwrap();
 let ok=std::process::Command::new("tar").args(["-czf"]).arg(dir.join("a.tar.gz")).arg("-C").arg(dir.join("pack")).arg(".").status().unwrap().success();assert!(ok);
 let bytes=std::fs::read(dir.join("a.tar.gz")).unwrap();assert_eq!(extract_program(&bytes,"a.tar.gz","engram").unwrap(),b"PROGRAM");assert!(extract_program(&bytes,"a.tar.gz","missing").is_err());let _=std::fs::remove_dir_all(&dir);}}
