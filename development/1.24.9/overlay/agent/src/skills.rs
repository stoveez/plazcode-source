// SPDX-License-Identifier: GPL-3.0-or-later
//! Reusable, reviewed methods. Stores observable steps, never hidden reasoning.
use axum::{extract::State,Json,response::{Response,IntoResponse}};
use serde::{Deserialize,Serialize};
use serde_json::{json,Value};
use std::{collections::BTreeMap,path::PathBuf};
use sha2::{Digest,Sha256};
use futures::StreamExt;
#[derive(Clone,Serialize,Deserialize)]
struct Skill {id:String,#[serde(default)]title:String,description:String,domain:String,#[serde(default)]scope:String,steps:Vec<String>,#[serde(default)]pitfalls:Vec<String>,#[serde(default)]verification:Vec<String>,#[serde(default)]confirmed:bool,#[serde(default)]enabled:bool,#[serde(default)]revision:u64,#[serde(default)]community:bool}
#[derive(Default,Clone,Serialize,Deserialize)]
struct Catalog {skills:BTreeMap<String,Skill>,#[serde(default)]starter_pack_version:u64,#[serde(default)]ultragui_pack_version:u64}
struct Store {path:PathBuf,data:Catalog,error:Option<String>}
impl Store {
 fn load(path:PathBuf)->Self {
  let (mut data,error): (Catalog,Option<String>)=match std::fs::read(&path){Ok(bytes)=>match serde_json::from_slice(&bytes){Ok(data)=>(data,None),Err(e)=>(Catalog::default(),Some(e.to_string()))},Err(e) if e.kind()==std::io::ErrorKind::NotFound=>(Catalog::default(),None),Err(e)=>(Catalog::default(),Some(e.to_string()))};
  if error.is_none() && data.starter_pack_version<1 {
   for value in crate::starter_skills::catalog() {if let Ok(skill)=serde_json::from_value::<Skill>(value){data.skills.entry(skill.id.clone()).or_insert(skill);}}
   data.starter_pack_version=1;
  }
  if error.is_none() && data.ultragui_pack_version<1 {
   for value in crate::starter_skills::ultragui_catalog() {if let Ok(skill)=serde_json::from_value::<Skill>(value){data.skills.entry(skill.id.clone()).or_insert(skill);}}
   data.ultragui_pack_version=1;
  }
  Self{path,data,error}
 }

 fn persist(&mut self,data:Catalog)->anyhow::Result<()> {
  anyhow::ensure!(self.error.is_none(),"Skills could not be loaded. Existing data was left unchanged; restore a valid backup and restart.");
  anyhow::ensure!(data.skills.len()<=1000,"Skill library limit reached.");
  let bytes=serde_json::to_vec_pretty(&data)?;anyhow::ensure!(bytes.len()<=12*1024*1024,"Skill library exceeds 12 MB.");
  let parent=self.path.parent().ok_or_else(||anyhow::anyhow!("Missing skill directory."))?;std::fs::create_dir_all(parent)?;
  let temporary=self.path.with_extension("json.tmp");std::fs::write(&temporary,bytes)?;
  if self.path.is_file(){std::fs::copy(&self.path,self.path.with_extension("json.backup"))?;}
  std::fs::rename(&temporary,&self.path)?;self.data=data;Ok(())
 }
 fn request(&mut self,request:&Value)->anyhow::Result<Value> {
  anyhow::ensure!(self.error.is_none(),"Skills could not be loaded; existing data is preserved.");
  let action=request["action"].as_str().unwrap_or("list");
  if action=="list" {return Ok(json!({"ok":true,"skills":self.data.skills.values().collect::<Vec<_>>() }));}
  if action=="match" {
   let query=request["query"].as_str().unwrap_or("").to_lowercase();let domain=request["domain"].as_str().unwrap_or("");let scope=request["scope"].as_str().unwrap_or("");
   let terms=query.split(|c:char|!c.is_alphanumeric()).filter(|s|s.len()>2).take(80).collect::<Vec<_>>();
   let mut hits=self.data.skills.values().filter(|s|(s.confirmed||s.enabled)&&(s.scope.is_empty()||s.scope==scope)&&(s.domain=="all"||s.domain==domain||(domain=="roblox"&&matches!(s.domain.as_str(),"model"|"ui"))||(domain=="local"&&s.domain=="blender"))).filter_map(|s|{let hay=format!("{} {} {}",s.title,s.description,s.steps.join(" ")).to_lowercase();let score=terms.iter().filter(|word|hay.contains(**word)).count();(score>0||s.enabled).then_some((score+if s.scope.is_empty(){0}else{3}+if s.enabled{8}else{0},s))}).collect::<Vec<_>>();hits.sort_by_key(|(score,_)|std::cmp::Reverse(*score));
   return Ok(json!({"ok":true,"skills":hits.into_iter().take(3).map(|(_,skill)|skill).collect::<Vec<_>>() }));
  }
  let id=request["id"].as_str().unwrap_or("");
  if action=="read"||action=="export" {let skill=self.data.skills.get(id).ok_or_else(||anyhow::anyhow!("Skill not found."))?;let mut result=json!({"ok":true,"skill":if action=="export"{public(skill)}else{serde_json::to_value(skill)?}});
   if action=="read" && id.starts_with("starter-syphodev-") {result["bundle"]=crate::starter_skills::read(&crate::platform::installation_root().join("PlazCode-Extension/starter-skills/syphodev"),id,request)?;}
   if action=="read" && id.starts_with("bundled-ultragui-") {result["bundle"]=crate::starter_skills::read_ultragui(&crate::platform::installation_root().join("PlazCode-Extension/ultragui"),id,request)?;}
   return Ok(result);}
  let mut data=self.data.clone();
  match action {
   "save"=>{let input=&request["skill"];let mut skill:Skill=serde_json::from_value(input.clone())?;if skill.title.trim().is_empty()||matches!(skill.title.trim().to_lowercase().as_str(),"skill"|"untitled"|"new skill"){let text=if skill.description.trim().is_empty(){skill.steps.first().map(String::as_str).unwrap_or("")}else{&skill.description};skill.title=text.split(['\n','.','!','?']).next().unwrap_or("").trim().chars().take(100).collect();}validate(&skill)?;anyhow::ensure!(!skill.id.starts_with("starter-syphodev-")&&!skill.id.starts_with("bundled-ultragui-"),"Starter references are read-only; save your adapted method under a new ID.");anyhow::ensure!(!skill.id.starts_with("global-workflow-"),"Automatic workflow lessons cannot be edited; save an adapted method under a new ID.");let previous=data.skills.get(&skill.id);anyhow::ensure!(request["revision"].as_u64().unwrap_or(0)==previous.map_or(0,|s|s.revision),"Skill changed. Reload before saving.");skill.revision=previous.map_or(1,|s|s.revision+1);skill.community=false;data.skills.insert(skill.id.clone(),skill.clone());self.persist(data)?;return Ok(json!({"ok":true,"skill":skill}));},
   "delete"=>{let current=data.skills.get(id).ok_or_else(||anyhow::anyhow!("Skill not found."))?;anyhow::ensure!(request["revision"].as_u64()==Some(current.revision),"Skill changed. Reload before deleting.");data.skills.remove(id);},
   _=>anyhow::bail!("Unknown skill action.")
  }
  self.persist(data)?;Ok(json!({"ok":true}))
 }
}
fn validate(s:&Skill)->anyhow::Result<()> {
 anyhow::ensure!(!s.id.is_empty()&&s.id.len()<=96&&s.id.bytes().all(|b|b.is_ascii_alphanumeric()||b"_-".contains(&b)),"Invalid skill ID.");
 anyhow::ensure!(!s.title.trim().is_empty()&&s.title.len()<=200&&s.description.len()<=2000&&s.scope.len()<=2000,"Skill title, description or scope is too long.");
 anyhow::ensure!(matches!(s.domain.as_str(),"all"|"roblox"|"local"|"blender"|"model"|"ui"),"Invalid skill domain.");
 anyhow::ensure!(!s.steps.is_empty()&&s.steps.len()<=30&&s.pitfalls.len()<=20&&s.verification.len()<=20,"Add 1–30 steps; at most 20 pitfalls and checks.");
 for text in s.steps.iter().chain(&s.pitfalls).chain(&s.verification){anyhow::ensure!(!text.trim().is_empty()&&text.len()<=1000,"Each step, pitfall and check must contain 1–1000 bytes.");}
 anyhow::ensure!(!s.confirmed||!s.verification.is_empty(),"Add verification before marking a skill tested.");Ok(())
}
fn public(skill:&Skill)->Value {json!({"id":skill.id,"title":skill.title,"description":skill.description,"domain":skill.domain,"scope":"","steps":skill.steps,"pitfalls":skill.pitfalls,"verification":skill.verification,"confirmed":skill.confirmed,"revision":1,"community":true})}
static STORE:once_cell::sync::Lazy<tokio::sync::Mutex<Store>>=once_cell::sync::Lazy::new(||{let base=std::env::var_os("LOCALAPPDATA").or_else(||std::env::var_os("XDG_CONFIG_HOME")).map(PathBuf::from).unwrap_or_else(||PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".config"));tokio::sync::Mutex::new(Store::load(base.join("PlazCode/skills.json")))});
fn repository()->anyhow::Result<String>{let value=std::env::var("PLAZCODE_LEARNING_REPOSITORY").unwrap_or_else(|_|"stoveez/PlazCode".into());let parts=value.split('/').collect::<Vec<_>>();anyhow::ensure!(parts.len()==2&&parts.iter().all(|s|!s.is_empty()&&s.len()<=100&&s.bytes().all(|b|b.is_ascii_alphanumeric()||b"_- .".contains(&b))&&!s.contains(' ')),"Learning repository must be owner/repository on GitHub.");Ok(value)}
fn client()->anyhow::Result<reqwest::Client>{Ok(reqwest::Client::builder().user_agent("PlazCode-skills").timeout(std::time::Duration::from_secs(25)).build()?)}
async fn github(client:&reqwest::Client,method:reqwest::Method,path:&str,body:Option<Value>,token:&str)->anyhow::Result<Value>{let mut req=client.request(method,format!("https://api.github.com/{path}")).bearer_auth(token).header("Accept","application/vnd.github+json");if let Some(body)=body{req=req.json(&body);}let response=req.send().await?;let status=response.status();let value:Value=response.json().await?;anyhow::ensure!(status.is_success(),"Shared Git request failed ({}): {}",status,value["message"].as_str().unwrap_or("GitHub rejected the operation"));Ok(value)}
async fn sync()->anyhow::Result<Value>{
 let repo=repository()?;let response=client()?.get(format!("https://raw.githubusercontent.com/{repo}/main/learned-skills/index.json")).send().await?.error_for_status()?;
 anyhow::ensure!(response.content_length().unwrap_or(0)<=1024*1024,"Community index is too large.");
 let mut chunks=response.bytes_stream();let mut bytes=Vec::new();while let Some(chunk)=chunks.next().await{let chunk=chunk?;anyhow::ensure!(bytes.len()+chunk.len()<=1024*1024,"Community index is too large.");bytes.extend_from_slice(&chunk);}let lessons:Vec<Skill>=serde_json::from_slice(&bytes)?;anyhow::ensure!(lessons.len()<=100,"Too many community lessons.");
 let mut store=STORE.lock().await;let mut data=store.data.clone();let mut count=0;
 for mut skill in lessons {validate(&skill)?;anyhow::ensure!(skill.confirmed&&skill.scope.is_empty(),"Community index contains an unreviewed or project-specific lesson.");skill.id=format!("community-{}",skill.id);validate(&skill)?;skill.community=true;if data.skills.get(&skill.id).is_some_and(|s|!s.community){continue;}data.skills.insert(skill.id.clone(),skill);count+=1;}
 store.persist(data)?;Ok(json!({"ok":true,"count":count}))
}
async fn publish(request:&Value)->anyhow::Result<Value>{
 anyhow::ensure!(request["reviewed"]==true,"Review the exact public lesson and remove private project details before sharing.");
 let value=STORE.lock().await.request(&json!({"action":"read","id":request["id"]}))?;let skill:Skill=serde_json::from_value(value["skill"].clone())?;
 anyhow::ensure!(skill.confirmed&&request["revision"].as_u64()==Some(skill.revision),"Only the current tested skill can be shared.");
 let token=std::env::var("PLAZCODE_GITHUB_TOKEN").map_err(|_|anyhow::anyhow!("Set PLAZCODE_GITHUB_TOKEN with write access to the learning repository, or export the lesson and contribute from GitHub."))?;
 let repo=repository()?;let client=client()?;let content=serde_json::to_string_pretty(&public(&skill))?;let digest=format!("{:x}",Sha256::digest(content.as_bytes()));let branch=format!("skill-contribution-{}",&digest[..16]);
 let get=reqwest::Method::GET;let post=reqwest::Method::POST;
 let base=github(&client,get.clone(),&format!("repos/{repo}/git/ref/heads/main"),None,&token).await?;let sha=base["object"]["sha"].as_str().ok_or_else(||anyhow::anyhow!("Missing main commit."))?;
 let commit=github(&client,get,&format!("repos/{repo}/git/commits/{sha}"),None,&token).await?;
 let tree=github(&client,post.clone(),&format!("repos/{repo}/git/trees"),Some(json!({"base_tree":commit["tree"]["sha"],"tree":[{"path":format!("learned-skills/proposals/{}.json",&digest[..16]),"mode":"100644","type":"blob","content":content}]})),&token).await?;
 let created=github(&client,post.clone(),&format!("repos/{repo}/git/commits"),Some(json!({"message":"Propose reviewed reusable PlazCode skill","tree":tree["sha"],"parents":[sha]})),&token).await?;
 github(&client,post.clone(),&format!("repos/{repo}/git/refs"),Some(json!({"ref":format!("refs/heads/{branch}"),"sha":created["sha"]})),&token).await?;
 let pull=github(&client,post,&format!("repos/{repo}/pulls"),Some(json!({"title":format!("Shared skill: {}",skill.title),"head":branch,"base":"main","body":"Reviewed reusable method. Maintainers: verify the lesson, remove private details and add approved content to learned-skills/index.json. No raw chat logs or project files are included.","draft":true})),&token).await?;
 Ok(json!({"ok":true,"url":pull["html_url"],"message":"Draft contribution created. Global use starts after maintainer review and index approval."}))
}
static LAST_COMMUNITY_SYNC:std::sync::atomic::AtomicI64=std::sync::atomic::AtomicI64::new(0);
fn maybe_sync(){
 let now=chrono::Utc::now().timestamp();let previous=LAST_COMMUNITY_SYNC.load(std::sync::atomic::Ordering::Relaxed);
 if now-previous<3600{return;}
 if LAST_COMMUNITY_SYNC.compare_exchange(previous,now,std::sync::atomic::Ordering::SeqCst,std::sync::atomic::Ordering::Relaxed).is_ok(){tokio::spawn(async{if let Err(error)=sync().await{tracing::warn!("Community skill sync unavailable: {error}");}});}
}
async fn refresh_global(force:bool)->usize{
  let lessons=crate::shared_learning::lessons(force).await;let mut store=STORE.lock().await;
  store.data.skills.retain(|id,_|!id.starts_with("global-workflow-"));
  let count=lessons.len();
  for lesson in lessons {let recipe=lesson.recipe;let id=format!("global-workflow-{}",recipe.id());store.data.skills.insert(id.clone(),Skill{id,title:recipe.title().into(),description:format!("Generalized local code fix, bug search, feature, file edit and test workflow. {} successful test-command reports; anonymous reports are not proof of task correctness. Adapt to this project and run relevant checks.",lesson.successes),domain:"local".into(),scope:String::new(),steps:recipe.steps(),pitfalls:vec!["Do not assume old paths, implementation or test commands apply to this project.".into()],verification:vec!["The recorded project test command exited successfully after the final edit. Recheck behavior in the current project.".into()],confirmed:true,enabled:false,revision:lesson.revision,community:true});}
 count
}
pub async fn post(State(state):State<crate::AppState>,Json(request):Json<Value>)->Response {
 if request["action"]=="match" {maybe_sync();crate::shared_learning::retry();refresh_global(false).await;}
 let result:anyhow::Result<Value>=async {
  match request["action"].as_str().unwrap_or("list") {
   "sync"|"publish"=>{if request["action"]=="sync"{let count=refresh_global(true).await;let mut result=sync().await?;result["count"]=json!(result["count"].as_u64().unwrap_or(0)+count as u64);Ok(result)}else{publish(&request).await}},
   "checkpoint"=>{if !state.preferences.snapshot().skill_auto_learn&&request["manual"]!=true{return Ok(json!({"ok":true,"skipped":true}));}let journal=crate::checkpoints::STORE.lock().await;let task=journal.task(request["checkpoint"].as_str().unwrap_or(""))?;anyhow::ensure!(task.status=="worked","Finish the task before saving a candidate.");let project=journal.project(&task.chat);let scope=if project.is_empty(){format!("chat:{}",task.chat)}else{format!("project:{project}")};let id=format!("task-{}",task.id);let skill=Skill{id:id.clone(),title:task.label.chars().take(50).collect(),description:"Candidate from observable tool steps. Edit into a reusable method, add checks and confirm it worked before reuse.".into(),domain:task.engine.clone(),scope,steps:if task.steps.is_empty(){vec!["Describe the method that solved this task.".into()]}else{task.steps.iter().take(30).cloned().collect()},pitfalls:task.warnings.iter().take(20).map(|s|s.chars().take(1000).collect()).collect(),verification:vec![],confirmed:false,enabled:false,revision:0,community:false};drop(journal);let mut store=STORE.lock().await;if store.data.skills.contains_key(&id){return Ok(json!({"ok":true,"id":id}));}store.request(&json!({"action":"save","skill":skill,"revision":0})).map(|mut result|{result["id"]=id.into();result})},
   _=>STORE.lock().await.request(&request)
  }
 }.await;
 match result{Ok(value)=>Json(value).into_response(),Err(error)=>(axum::http::StatusCode::BAD_REQUEST,Json(json!({"ok":false,"error":error.to_string()}))).into_response()}
}
#[cfg(test)]mod tests{use super::*;
 #[test]fn explicit_saved_guidance_is_matched_without_claiming_verification(){
  let path=std::env::temp_dir().join(format!("plazcode-enabled-skills-{}.json",std::process::id()));let _=std::fs::remove_file(&path);
  let mut store=Store::load(path.clone());let mut saved=skill();saved.id="guidance".into();saved.confirmed=false;saved.enabled=true;saved.verification.clear();saved.domain="all".into();
  store.request(&json!({"action":"save","skill":saved,"revision":0})).unwrap();
  let mut candidate=saved.clone();candidate.id="candidate".into();candidate.enabled=false;candidate.scope=String::new();store.request(&json!({"action":"save","skill":candidate,"revision":0})).unwrap();
  let mut reloaded=Store::load(path.clone());
  let matched=reloaded.request(&json!({"action":"match","query":"continue","domain":"roblox","scope":"project:A"})).unwrap();
  assert!(matched["skills"].as_array().unwrap().iter().any(|s|s["id"]=="guidance"&&s["confirmed"]==false&&s["enabled"]==true));
  assert!(!matched["skills"].as_array().unwrap().iter().any(|s|s["id"]=="candidate"));
  let other=reloaded.request(&json!({"action":"match","query":"inventory","domain":"roblox","scope":"project:B"})).unwrap();assert!(!other["skills"].as_array().unwrap().iter().any(|s|s["id"]=="guidance"));
  let exported=public(&saved);assert!(exported.get("enabled").is_none());assert_eq!(exported["scope"],"");assert!(!serde_json::from_value::<Skill>(exported).unwrap().enabled);
  let _=std::fs::remove_file(path.with_extension("json.backup"));std::fs::remove_file(path).unwrap();
 }
 fn skill()->Skill{Skill{id:"test".into(),title:"Inventory".into(),description:"Inventory menu".into(),domain:"roblox".into(),scope:"project:A".into(),steps:vec!["Inspect existing UI conventions".into()],pitfalls:vec![],verification:vec!["Test open and close".into()],confirmed:true,enabled:false,revision:0,community:false}}
 #[test]fn scope_revision_and_corruption(){let path=std::env::temp_dir().join(format!("plazcode-skills-{}.json",std::process::id()));let _=std::fs::remove_file(&path);let mut store=Store::load(path.clone());let s=skill();store.request(&json!({"action":"save","skill":s,"revision":0})).unwrap();assert!(store.request(&json!({"action":"save","skill":s,"revision":0})).is_err());assert_eq!(store.request(&json!({"action":"match","domain":"roblox","scope":"project:B","query":"inventory"})).unwrap()["skills"].as_array().unwrap().iter().filter(|s|s["id"]=="test").count(),0);assert_eq!(store.request(&json!({"action":"match","domain":"roblox","scope":"project:A","query":"inventory"})).unwrap()["skills"].as_array().unwrap().iter().filter(|s|s["id"]=="test").count(),1);assert_eq!(public(&s)["scope"],"");std::fs::write(&path,b"broken").unwrap();let mut broken=Store::load(path.clone());assert!(broken.request(&json!({"action":"save","skill":s})).is_err());assert_eq!(std::fs::read(&path).unwrap(),b"broken");let _=std::fs::remove_file(path.with_extension("json.backup"));let _=std::fs::remove_file(path);}
 #[test]fn starter_seed_preserves_user_data_and_deletions(){
  let path=std::env::temp_dir().join(format!("plazcode-starter-store-{}.json",std::process::id()));let _=std::fs::remove_file(&path);
  let mut store=Store::load(path.clone());assert_eq!(store.data.skills.len(),23);
  let s=skill();store.request(&json!({"action":"save","skill":s,"revision":0})).unwrap();
  store.request(&json!({"action":"delete","id":"starter-syphodev-roblox-code","revision":1})).unwrap();
  store.request(&json!({"action":"delete","id":"bundled-ultragui-gui-layout","revision":1})).unwrap();
  let reloaded=Store::load(path.clone());assert!(!reloaded.data.skills.contains_key("bundled-ultragui-gui-layout"));assert_eq!(reloaded.data.ultragui_pack_version,1);assert!(reloaded.data.skills.contains_key("test"));assert!(!reloaded.data.skills.contains_key("starter-syphodev-roblox-code"));
  std::fs::remove_file(path.with_extension("json.backup")).unwrap();std::fs::remove_file(path).unwrap();
 }

}
