// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
//! Reusable, reviewed methods. Stores observable steps, never hidden reasoning.
use axum::{extract::State,Json,response::{Response,IntoResponse}};
use serde::{Deserialize,Serialize};
use serde_json::{json,Value};
use std::{collections::{BTreeMap,BTreeSet},path::PathBuf};
use sha2::{Digest,Sha256};
use futures::StreamExt;
#[derive(Clone,Serialize,Deserialize)]
pub(crate) struct Skill {pub(crate) id:String,#[serde(default)]pub(crate) title:String,pub(crate) description:String,pub(crate) domain:String,#[serde(default)]pub(crate) scope:String,pub(crate) steps:Vec<String>,#[serde(default)]pub(crate) pitfalls:Vec<String>,#[serde(default)]pub(crate) verification:Vec<String>,#[serde(default)]pub(crate) confirmed:bool,#[serde(default)]pub(crate) enabled:bool,#[serde(default)]pub(crate) revision:u64,#[serde(default)]pub(crate) community:bool,#[serde(default,skip_serializing_if="std::ops::Not::not")]pub(crate) favorite:bool,
 // 2026-11-20 folder import (skill_folder.rs): reference files kept in skill-files/<id>/, where the skill came from, and a
 // fingerprint of the card as imported (a different fingerprint now means the person edited it by hand).
 #[serde(default,skip_serializing_if="Vec::is_empty")]pub(crate) files:Vec<String>,#[serde(default,skip_serializing_if="String::is_empty")]pub(crate) source:String,#[serde(default,skip_serializing_if="String::is_empty")]pub(crate) import_digest:String}
#[derive(Clone,Serialize,Deserialize)]
struct DeletedSkill {#[serde(flatten)]skill:Skill,deleted_at:u64}
#[derive(Default,Clone,Serialize,Deserialize)]
struct Catalog {skills:BTreeMap<String,Skill>,#[serde(default)]deleted:BTreeMap<String,DeletedSkill>,#[serde(default)]suppressed:BTreeSet<String>,#[serde(default)]trash_revision:u64,#[serde(default)]starter_pack_version:u64,#[serde(default)]ultragui_pack_version:u64,#[serde(default)]candidate_cleanup_version:u64}
pub struct Store {path:PathBuf,data:Catalog,error:Option<String>}
impl Store {
 fn load(path:PathBuf)->Self {
  let (mut data,error): (Catalog,Option<String>)=match std::fs::read(&path){Ok(bytes)=>match serde_json::from_slice(&bytes){Ok(data)=>(data,None),Err(e)=>(Catalog::default(),Some(e.to_string()))},Err(e) if e.kind()==std::io::ErrorKind::NotFound=>(Catalog::default(),None),Err(e)=>(Catalog::default(),Some(e.to_string()))};
  if error.is_none() && data.starter_pack_version<1 {
   for value in crate::starter_skills::catalog() {if let Ok(skill)=serde_json::from_value::<Skill>(value){if !data.deleted.contains_key(&skill.id)&&!data.suppressed.contains(&skill.id){data.skills.entry(skill.id.clone()).or_insert(skill);}}}
   data.starter_pack_version=1;
  }
  // 1.24.30 (owner): add the Ro-Engineer cards once, for new and existing users; a card the user deleted stays deleted.
  if error.is_none() && data.starter_pack_version<2 {
   for value in crate::starter_skills::roengineer_catalog() {if let Ok(skill)=serde_json::from_value::<Skill>(value){if !data.deleted.contains_key(&skill.id)&&!data.suppressed.contains(&skill.id){data.skills.entry(skill.id.clone()).or_insert(skill);}}}
   data.starter_pack_version=2;
  }
  // 1.24.21: Ultra's built-in reference cards (UltraGUI) moved into the Ultra pack, which
  // the AI opens with the ultralab_read tool. Retire every old bundled card once; user
  // skills, starter skills and their trash are untouched.
  if error.is_none() && data.ultragui_pack_version<3 {
   data.skills.retain(|id,_|!id.starts_with("bundled-ultragui-"));
   data.deleted.retain(|id,_|!id.starts_with("bundled-ultragui-"));
   data.suppressed.retain(|id|!id.starts_with("bundled-ultragui-"));
   data.ultragui_pack_version=3;
  }
  // 1.24.13: earlier builds saved one automatic candidate per finished task,
  // so a repeated label filled the library with identical cards. Collapse
  // untouched automatic duplicates and placeholder-named ones once. Edited,
  // tested, enabled or favourite cards are never removed.
  if error.is_none() && data.candidate_cleanup_version<1 {
   let mut seen=std::collections::BTreeSet::new();
   let remove:Vec<String>=data.skills.values().filter(|s|untouched_auto_candidate(s)).filter(|s|placeholder_title(&s.title)||!seen.insert((s.domain.clone(),normal_title(&s.title)))).map(|s|s.id.clone()).collect();
   for id in remove {data.skills.remove(&id);}
   data.candidate_cleanup_version=1;
  }
  Self{path,data,error}
 }

 fn persist(&mut self,data:Catalog)->anyhow::Result<()> {self.persist_with_backup(data,false)}
 fn persist_with_backup(&mut self,data:Catalog,redact_backup:bool)->anyhow::Result<()> {
  anyhow::ensure!(self.error.is_none(),"Skills could not be loaded. Existing data was left unchanged; restore a valid backup and restart.");
  anyhow::ensure!(data.skills.len()<=1000,"Skill library limit reached.");
  anyhow::ensure!(data.deleted.len()<=10000,"Deleted Skills is full. Permanently delete unwanted items before removing more skills.");
  let bytes=serde_json::to_vec_pretty(&data)?;anyhow::ensure!(bytes.len()<=12*1024*1024,"Skill library exceeds 12 MB.");
  let parent=self.path.parent().ok_or_else(||anyhow::anyhow!("Missing skill directory."))?;std::fs::create_dir_all(parent)?;
  if redact_backup {let temporary_backup=self.path.with_extension("json.backup.tmp");std::fs::write(&temporary_backup,serde_json::to_vec_pretty(&data)?)?;std::fs::rename(temporary_backup,self.path.with_extension("json.backup"))?;}
  else if self.path.is_file(){std::fs::copy(&self.path,self.path.with_extension("json.backup"))?;}
  crate::preferences::write_atomic(&self.path,&bytes)?;self.data=data;Ok(())
 }
 pub(crate) fn request(&mut self,request:&Value)->anyhow::Result<Value> {
  anyhow::ensure!(self.error.is_none(),"Skills could not be loaded; existing data is preserved.");
  let action=request["action"].as_str().unwrap_or("list");
  if action=="list" {
   let mut meta=serde_json::Map::new();
   for (id,skill) in &self.data.skills { meta.insert(id.clone(),self.skill_meta(skill)); }
   return Ok(json!({"ok":true,"skills":self.data.skills.values().collect::<Vec<_>>(),"skills_dir":self.files_root().display().to_string(),"meta":meta }));
  }
  if action=="workbench_load" {
   let id=request["id"].as_str().unwrap_or("");
   let skill=self.data.skills.get(id).ok_or_else(||anyhow::anyhow!("Skill not found."))?;
   let files=self.workbench_files(skill);
   let validation=crate::skill_folder::validate_skill_workbench(&files);
   let preview=crate::skill_folder::build_agent_preview(&skill.id,&skill.title,&files);
   let file_rows:Vec<Value>=files.iter().map(|(path,text)|json!({"path":path,"text":text,"bytes":text.len(),"chars":text.chars().count()})).collect();
   let folder_path=if is_read_only_skill(&skill.id) {
    crate::starter_skills::bundle_folder(&crate::platform::installation_root(),&skill.id).unwrap_or_else(||self.files_root()).display().to_string()
   } else { self.files_root().join(&skill.id).display().to_string() };
   return Ok(json!({"ok":true,"skill":skill,"files":file_rows,"folder_path":folder_path,"read_only":is_read_only_skill(&skill.id),"validation":validation,"preview":preview}));
  }
  if action=="workbench_validate" {
   let files=if let Some(arr)=request["files"].as_array() {
    arr.iter().map(|v|(v["path"].as_str().unwrap_or("").to_string(),v["text"].as_str().unwrap_or("").to_string())).collect::<Vec<_>>()
   } else {
    let id=request["id"].as_str().unwrap_or("");
    let skill=self.data.skills.get(id).ok_or_else(||anyhow::anyhow!("Skill not found."))?;
    self.workbench_files(skill)
   };
   return Ok(crate::skill_folder::validate_skill_workbench(&files));
  }
  if action=="workbench_preview" {
   let id=request["id"].as_str().unwrap_or("");
   let (title,files)=if let Some(arr)=request["files"].as_array() {
    let title=request["title"].as_str().unwrap_or("Skill").to_string();
    let files=arr.iter().map(|v|(v["path"].as_str().unwrap_or("").to_string(),v["text"].as_str().unwrap_or("").to_string())).collect::<Vec<_>>();
    (title,files)
   } else {
    let skill=self.data.skills.get(id).ok_or_else(||anyhow::anyhow!("Skill not found."))?;
    (skill.title.clone(),self.workbench_files(skill))
   };
   return Ok(crate::skill_folder::build_agent_preview(id,&title,&files));
  }
  if action=="open_folder" {
   let id=request["id"].as_str().unwrap_or("");
   let target=if !id.is_empty() && id.bytes().all(|b|b.is_ascii_alphanumeric()||b"_-".contains(&b)) {
    if let Some(bundle)=crate::starter_skills::bundle_folder(&crate::platform::installation_root(),id) {
     if bundle.is_dir() { bundle } else { self.files_root() }
    } else {
     let dir=self.files_root().join(id);
     std::fs::create_dir_all(&dir)?;
     dir
    }
   } else {
    let root=self.files_root();
    std::fs::create_dir_all(&root)?;
    root
   };
   open_local_folder(&target)?;
   return Ok(json!({"ok":true,"path":target.display().to_string()}));
  }
  if action=="list_deleted" {return Ok(json!({"ok":true,"skills":self.data.deleted.values().collect::<Vec<_>>(),"trash_revision":self.data.trash_revision}));}
  if action=="match" {
   let query=request["query"].as_str().unwrap_or("").to_lowercase();let domain=request["domain"].as_str().unwrap_or("");let scope=request["scope"].as_str().unwrap_or("");
   let mut terms=query.split(|c:char|!c.is_alphanumeric()).filter(|s|s.len()>2&&!STOPWORDS.contains(s)).take(80).collect::<Vec<_>>();terms.sort_unstable();terms.dedup();
   let mut hits=self.data.skills.values().filter(|s|(s.confirmed||s.enabled||s.favorite)&&(s.scope.is_empty()||s.scope==scope)&&(s.domain=="all"||s.domain==domain||(domain=="roblox"&&matches!(s.domain.as_str(),"model"|"ui"))||(domain=="local"&&s.domain=="blender"))).filter_map(|s|{let title=s.title.to_lowercase();let hay=format!("{} {} {}",title,s.description,s.steps.join(" ")).to_lowercase();let score=terms.iter().filter(|word|hay.contains(**word)).count()+terms.iter().filter(|word|title.contains(**word)).count();(score>0||s.enabled||s.favorite).then_some((score+if s.scope.is_empty(){0}else{3}+if s.enabled{8}else{0}+if s.favorite{6}else{0},s))}).collect::<Vec<_>>();hits.sort_by_key(|(score,_)|std::cmp::Reverse(*score));
   // 1.24.13: favourites are always used in their project/engine: every starred
   // skill (up to 8) comes first, then the 3 best other matches.
   let (starred,rest):(Vec<_>,Vec<_>)=hits.into_iter().partition(|(_,s)|s.favorite);
   return Ok(json!({"ok":true,"skills":starred.into_iter().take(8).chain(rest.into_iter().take(3)).map(|(_,skill)|skill).collect::<Vec<_>>() }));
  }
  let id=request["id"].as_str().unwrap_or("");
  if action=="read"&&(id.starts_with("bundled-ultra-")||id.starts_with("bundled-ultragui-")||id.starts_with("bundled-ultracode-")){anyhow::bail!("The built-in Ultra skills moved into the Ultra pack. At Ultra effort, open them with the ultralab_read tool.");}
  if action=="read"||action=="export" {let skill=self.data.skills.get(id).ok_or_else(||anyhow::anyhow!("Skill not found."))?;let mut result=json!({"ok":true,"skill":if action=="export"{public(skill)}else{serde_json::to_value(skill)?}});
   if action=="read" { if let Some(folder)=crate::starter_skills::bundle_folder(&crate::platform::installation_root(),id) {result["bundle"]=crate::starter_skills::read(&folder,id,request)?;} else if !skill.files.is_empty() {result["bundle"]=read_reference(&self.files_root(),skill,request)?;} }
   return Ok(result);}
  let mut data=self.data.clone();
  match action {
   "save"=>{let input=&request["skill"];let mut skill:Skill=serde_json::from_value(input.clone())?;{/* reference files only ever come from a folder import, never from a save */let previous=data.skills.get(&skill.id);skill.files=previous.map(|s|s.files.clone()).unwrap_or_default();skill.source=previous.map(|s|s.source.clone()).unwrap_or_default();skill.import_digest=previous.map(|s|s.import_digest.clone()).unwrap_or_default();}if skill.title.trim().is_empty()||matches!(skill.title.trim().to_lowercase().as_str(),"skill"|"untitled"|"new skill"){let text=if skill.description.trim().is_empty(){skill.steps.first().map(String::as_str).unwrap_or("")}else{&skill.description};skill.title=text.split(['\n','.','!','?']).next().unwrap_or("").trim().chars().take(100).collect();}validate(&skill)?;anyhow::ensure!(!skill.id.starts_with("starter-syphodev-")&&!skill.id.starts_with("bundled-ultragui-"),"Starter references are read-only; save your adapted method under a new ID.");anyhow::ensure!(!skill.id.starts_with("global-workflow-"),"Automatic workflow lessons cannot be edited; save an adapted method under a new ID.");anyhow::ensure!(!data.deleted.contains_key(&skill.id),"This skill is in Deleted Skills. Restore it before editing, or save with a new ID.");let previous=data.skills.get(&skill.id);anyhow::ensure!(request["revision"].as_u64().unwrap_or(0)==previous.map_or(0,|s|s.revision),"Skill changed. Reload before saving.");skill.revision=previous.map_or(1,|s|s.revision+1);skill.favorite=previous.map_or(skill.favorite,|s|s.favorite);skill.community=false;data.suppressed.remove(&skill.id);data.skills.insert(skill.id.clone(),skill.clone());self.persist(data)?;return Ok(json!({"ok":true,"skill":skill}));},
   "delete"=>{let current=data.skills.get(id).ok_or_else(||anyhow::anyhow!("Skill not found."))?;anyhow::ensure!(request["revision"].as_u64()==Some(current.revision),"Skill changed. Reload before deleting.");move_to_deleted(&mut data,id)?;},
   "restore"=>{let deleted=data.deleted.get(id).ok_or_else(||anyhow::anyhow!("Deleted skill not found."))?;anyhow::ensure!(request["revision"].as_u64()==Some(deleted.skill.revision),"Deleted skill changed. Refresh before restoring.");anyhow::ensure!(!data.skills.contains_key(id),"An active skill already uses this ID; nothing was overwritten.");let mut skill=data.deleted.remove(id).unwrap().skill;skill.revision+=1;data.skills.insert(id.to_owned(),skill.clone());data.suppressed.remove(id);data.trash_revision+=1;self.persist(data)?;return Ok(json!({"ok":true,"skill":skill}));},
   "purge"=>{anyhow::ensure!(request["confirm"]==true,"Confirm permanent deletion; this cannot be undone.");let deleted=data.deleted.get(id).ok_or_else(||anyhow::anyhow!("Deleted skill not found."))?;anyhow::ensure!(request["revision"].as_u64()==Some(deleted.skill.revision),"Deleted skill changed. Refresh before permanently deleting.");data.deleted.remove(id);data.suppressed.insert(id.to_owned());data.trash_revision+=1;self.persist_with_backup(data,true)?;self.remove_files(id);return Ok(json!({"ok":true,"purged":1}));},
   "purge_all"=>{anyhow::ensure!(request["confirm"]==true,"Confirm permanent deletion of all Deleted Skills; this cannot be undone.");anyhow::ensure!(request["trash_revision"].as_u64()==Some(data.trash_revision),"Deleted Skills changed. Refresh and confirm again.");let purged=data.deleted.len();let ids:Vec<String>=data.deleted.keys().cloned().collect();data.suppressed.extend(ids.iter().cloned());data.deleted.clear();data.trash_revision+=1;self.persist_with_backup(data,true)?;for id in ids{self.remove_files(&id);}return Ok(json!({"ok":true,"purged":purged}));},
   "favorite"=>{let favorite=request["favorite"].as_bool().ok_or_else(||anyhow::anyhow!("Choose favourite true or false."))?;let skill=data.skills.get_mut(id).ok_or_else(||anyhow::anyhow!("Skill not found."))?;skill.favorite=favorite;let skill=skill.clone();self.persist(data)?;return Ok(json!({"ok":true,"skill":skill}));},
   "delete_all"=>{let ids:Vec<String>=data.skills.iter().filter(|(id,s)|!s.favorite&&!kept_by_delete_all(id)).map(|(id,_)|id.clone()).collect();let removed=ids.len();for id in ids{move_to_deleted(&mut data,&id)?;}let kept=data.skills.len();self.persist(data)?;return Ok(json!({"ok":true,"removed":removed,"kept":kept}));},
   "workbench_save_file"=>{
    anyhow::ensure!(!is_read_only_skill(id),"Starter and automatic workflow skills are read-only; create a new skill to edit.");
    let rel=request["path"].as_str().unwrap_or("SKILL.md").replace('\\',"/");
    anyhow::ensure!(crate::skill_folder::safe_reference(&rel),"Unsafe file path.");
    let text=request["text"].as_str().ok_or_else(||anyhow::anyhow!("File text is required."))?.replace("\r\n","\n");
    anyhow::ensure!(!text.contains('\0') && text.len()<=crate::skill_folder::MAX_FILE_BYTES,"File must be valid UTF-8 text under 1 MB.");
    let mut skill=data.skills.get(id).ok_or_else(||anyhow::anyhow!("Skill not found."))?.clone();
    if let Some(expected_rev)=request["revision"].as_u64() {
     anyhow::ensure!(expected_rev==skill.revision,"Skill changed. Reload before saving.");
    }
    let dir=self.files_root().join(&skill.id);
    std::fs::create_dir_all(&dir)?;
    // Ensure SKILL.md exists on disk if saving a sibling reference for the first time.
    if !rel.eq_ignore_ascii_case("SKILL.md") && !dir.join("SKILL.md").is_file() {
     let synth=synthesize_skill_md(&skill);
     std::fs::write(dir.join("SKILL.md"),synth)?;
     if !skill.files.iter().any(|p|p.eq_ignore_ascii_case("SKILL.md")) { skill.files.insert(0,"SKILL.md".into()); }
    }
    let target=dir.join(&rel);
    if let Some(parent)=target.parent() { std::fs::create_dir_all(parent)?; }
    std::fs::write(&target,&text)?;
    if !skill.files.iter().any(|p|p==&rel) {
     if rel.eq_ignore_ascii_case("SKILL.md") { skill.files.insert(0,rel.clone()); } else { skill.files.push(rel.clone()); }
    }
    if rel.eq_ignore_ascii_case("SKILL.md") {
     let (title,desc,domain,steps,_)=crate::skill_folder::card_from_skill_md(&skill.id,&text,&skill.title);
     skill.title=title;
     if !desc.trim().is_empty() { skill.description=desc; }
     if domain!="all" || skill.domain=="all" { skill.domain=domain; }
     if !steps.is_empty() { skill.steps=steps; }
    }
    skill.revision+=1;
    skill.import_digest.clear();
    validate(&skill)?;
    data.skills.insert(skill.id.clone(),skill.clone());
    self.persist(data)?;
    let files=self.workbench_files(&skill);
    let validation=crate::skill_folder::validate_skill_workbench(&files);
    let preview=crate::skill_folder::build_agent_preview(&skill.id,&skill.title,&files);
    return Ok(json!({"ok":true,"skill":skill,"meta":self.skill_meta(&skill),"validation":validation,"preview":preview}));
   },
   "workbench_add_files"=>{
    anyhow::ensure!(!is_read_only_skill(id),"Starter and automatic workflow skills are read-only; create a new skill to edit.");
    let mut skill=data.skills.get(id).ok_or_else(||anyhow::anyhow!("Skill not found."))?.clone();
    let incoming=request["files"].as_array().ok_or_else(||anyhow::anyhow!("Provide files to add."))?;
    anyhow::ensure!(!incoming.is_empty() && incoming.len()<=50,"Add between 1 and 50 files at a time.");
    let dir=self.files_root().join(&skill.id);
    std::fs::create_dir_all(&dir)?;
    if !dir.join("SKILL.md").is_file() {
     std::fs::write(dir.join("SKILL.md"),synthesize_skill_md(&skill))?;
     if !skill.files.iter().any(|p|p.eq_ignore_ascii_case("SKILL.md")) { skill.files.insert(0,"SKILL.md".into()); }
    }
    let mut added=Vec::new();
    for item in incoming {
     let rel=item["path"].as_str().unwrap_or("").replace('\\',"/");
     anyhow::ensure!(crate::skill_folder::safe_reference(&rel),"Unsafe file path: {rel}");
     let text=item["text"].as_str().ok_or_else(||anyhow::anyhow!("File text required for {rel}"))?.replace("\r\n","\n");
     anyhow::ensure!(!text.contains('\0') && text.len()<=crate::skill_folder::MAX_FILE_BYTES,"File {rel} must be valid UTF-8 text under 1 MB.");
     let target=dir.join(&rel);
     if let Some(parent)=target.parent() { std::fs::create_dir_all(parent)?; }
     std::fs::write(&target,&text)?;
     if !skill.files.iter().any(|p|p==&rel) { skill.files.push(rel.clone()); }
     added.push(rel);
    }
    anyhow::ensure!(skill.files.len()<=crate::skill_folder::MAX_REFERENCES,"Too many reference files in one skill.");
    skill.revision+=1;
    skill.import_digest.clear();
    validate(&skill)?;
    data.skills.insert(skill.id.clone(),skill.clone());
    self.persist(data)?;
    let files=self.workbench_files(&skill);
    let validation=crate::skill_folder::validate_skill_workbench(&files);
    let preview=crate::skill_folder::build_agent_preview(&skill.id,&skill.title,&files);
    return Ok(json!({"ok":true,"added":added,"skill":skill,"meta":self.skill_meta(&skill),"validation":validation,"preview":preview}));
   },
   _=>anyhow::bail!("Unknown skill action.")
  }
  self.persist(data)?;Ok(json!({"ok":true}))
 }
}
impl Store {
 /// Reference files of imported folder skills: skill-files/<id>/ next to skills.json (so each profile has its own).
 pub(crate) fn files_root(&self)->PathBuf{self.path.parent().map(|p|p.join("skill-files")).unwrap_or_else(||PathBuf::from("skill-files"))}
 fn remove_files(&self,id:&str){if id.bytes().all(|b|b.is_ascii_alphanumeric()||b"_-".contains(&b))&&!id.is_empty(){let _=std::fs::remove_dir_all(self.files_root().join(id));}}
 pub(crate) fn workbench_files(&self,skill:&Skill)->Vec<(String,String)>{
  let mut out=Vec::new();
  if let Some(bundle)=crate::starter_skills::bundle_folder(&crate::platform::installation_root(),&skill.id) {
   if bundle.is_dir() {
    if let Ok(read)=crate::starter_skills::read(&bundle,&skill.id,&json!({"limit":24000})) {
     if let Some(res)=read["resource"].as_str() {
      let name=if res.ends_with("SKILL.md"){"SKILL.md".to_string()}else{res.to_string()};
      out.push((name,read["content"].as_str().unwrap_or("").to_string()));
     }
    }
   }
  }
  if out.is_empty() && !skill.files.is_empty() {
   let dir=self.files_root().join(&skill.id);
   for rel in &skill.files {
    if let Ok(text)=std::fs::read_to_string(dir.join(rel)) { out.push((rel.clone(),text.replace("\r\n","\n"))); }
   }
  }
  if out.is_empty() {
   out.push(("SKILL.md".into(),synthesize_skill_md(skill)));
  }
  out
 }
 pub(crate) fn skill_meta(&self,skill:&Skill)->Value {
  let files=self.workbench_files(skill);
  let file_count=files.len();
  let total_bytes:usize=files.iter().map(|(_,t)|t.len()).sum();
  let total_chars:usize=files.iter().map(|(_,t)|t.chars().count()).sum();
  let parts=(total_chars.max(1)+crate::skill_folder::PART_CHARS-1)/crate::skill_folder::PART_CHARS;
  let origin=if crate::starter_skills::is_starter(&skill.id){"starter"}else if skill.community{"community"}else if skill.id.starts_with(crate::skill_folder::ID_PREFIX){"folder"}else{"local"};
  json!({"file_count":file_count,"total_bytes":total_bytes,"total_chars":total_chars,"parts":parts,"origin":origin,"read_only":is_read_only_skill(&skill.id)})
 }
 pub(crate) fn list_local_for_workshop(&self)->Vec<Value> {
  self.data.skills.values().filter(|s|!s.id.starts_with("bundled-")).map(|s|{
   let files=self.workbench_files(s);
   let file_rows:Vec<Value>=files.iter().map(|(p,t)|json!({"path":p,"text":t})).collect();
   json!({"id":s.id,"title":s.title,"description":s.description,"domain":s.domain,"community":s.community,"files":file_rows,"meta":self.skill_meta(s)})
  }).collect()
 }
 pub(crate) fn install_workshop_skill(&mut self,slug:&str,title:&str,description:&str,domain:&str,files:Vec<(String,String)>,source_label:&str)->anyhow::Result<Value>{
  anyhow::ensure!(self.error.is_none(),"Skills could not be loaded; existing data is preserved.");
  let clean_slug:String=slug.to_ascii_lowercase().chars().map(|c|if c.is_ascii_alphanumeric()||c=='-'{c}else{'-'}).collect::<String>().trim_matches('-').chars().take(48).collect();
  let clean_slug=if clean_slug.is_empty(){"skill".to_string()}else{clean_slug};
  let mut id=format!("community-{clean_slug}");
  let mut n=2usize;
  while self.data.skills.contains_key(&id)||self.data.deleted.contains_key(&id) {
   id=format!("community-{clean_slug}-{n}");
   n+=1;
  }
  anyhow::ensure!(!files.is_empty(),"Package has no files.");
  let main_text=files.iter().find(|(p,_)|p.eq_ignore_ascii_case("SKILL.md")).map(|(_,t)|t.as_str()).unwrap_or(&files[0].1);
  let (_,_,parsed_domain,mut steps,_)=crate::skill_folder::card_from_skill_md(&id,main_text,title);
  if steps.is_empty() { steps.push(title.to_string()); }
  let final_domain=if matches!(domain,"all"|"roblox"|"local"|"blender"|"model"|"ui"){domain}else if matches!(parsed_domain.as_str(),"all"|"roblox"|"local"|"blender"|"model"|"ui"){parsed_domain.as_str()}else{"all"};
  let clean_files:Vec<(String,String)>=files.into_iter().filter(|(p,_)|crate::skill_folder::safe_reference(p)).collect();
  anyhow::ensure!(!clean_files.is_empty(),"Package has no valid safe file paths.");
  let skill=Skill{
   id:id.clone(),
   title:crate::skill_folder::cut(title.trim(),200),
   description:crate::skill_folder::cut(description.trim(),2000),
   domain:final_domain.to_string(),
   scope:String::new(),
   steps,
   pitfalls:Vec::new(),
   verification:Vec::new(),
   confirmed:false,
   enabled:true,
   revision:1,
   community:true,
   favorite:false,
   files:clean_files.iter().map(|(p,_)|p.clone()).collect(),
   source:crate::skill_folder::cut(source_label,600),
   import_digest:String::new(),
  };
  validate(&skill)?;
  let mut data=self.data.clone();
  let dir=self.files_root().join(&id);
  std::fs::create_dir_all(&dir)?;
  for (rel,text) in &clean_files {
   let target=dir.join(rel);
   if let Some(parent)=target.parent(){std::fs::create_dir_all(parent)?;}
   std::fs::write(&target,text)?;
  }
  data.skills.insert(id.clone(),skill.clone());
  self.persist(data)?;
  Ok(json!({"ok":true,"skill":skill,"meta":self.skill_meta(&skill)}))
 }
 /// 2026-11-20: a whole folder (or .zip) becomes skills; see skill_folder.rs. Importing the same folder again updates the skills
 /// that came from it: a skill the person edited by hand is kept as a separate copy "(your edit)", favourites stay, and a skill
 /// sitting in Deleted Skills is left there.
 fn import_folder(&mut self,plan:crate::skill_folder::Plan)->anyhow::Result<Value>{
  anyhow::ensure!(self.error.is_none(),"Skills could not be loaded; existing data is preserved.");
  let mut data=self.data.clone();
  let root=self.files_root();
  let stamp=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos();
  let staging=root.join(format!(".staging-{stamp}"));
  let (mut added,mut updated,mut kept_edits,mut in_trash)=(0usize,0usize,0usize,0usize);
  let mut skipped:Vec<Value>=plan.skipped.iter().map(|(p,r)|json!({"path":p,"reason":r})).collect();
  let (mut ids,mut copies,mut written)=(Vec::new(),Vec::<(String,String)>::new(),Vec::new());
  let result=(||->anyhow::Result<()>{
   for (n,card) in plan.cards.into_iter().enumerate(){
    let id=card.id.clone();
    if data.deleted.contains_key(&id){in_trash+=1;continue;}
    let mut skill=Skill{id:id.clone(),title:card.title,description:card.description,domain:card.domain,scope:String::new(),steps:card.steps,pitfalls:card.pitfalls,verification:card.verification,confirmed:false,enabled:true,revision:1,community:false,favorite:false,files:card.files.iter().map(|(p,_)|p.clone()).collect(),source:crate::skill_folder::cut(&format!("folder:{}/{}",plan.source,card.key),600),import_digest:String::new()};
    skill.import_digest=fingerprint(&skill);
    if let Err(error)=validate(&skill){skipped.push(json!({"path":card.key,"reason":error.to_string()}));continue;}
    if let Some(old)=data.skills.get(&id).cloned(){
     if old.import_digest!=fingerprint(&old){
      // Edited by hand since it was imported: keep the person's version under its own id.
      let copy=format!("skill-{}-{n}",&format!("{:x}",Sha256::digest(format!("{id}{stamp}").as_bytes()))[..16]);
      let mut mine=old.clone();mine.id=copy.clone();mine.title=crate::skill_folder::cut(&format!("{} (your edit)",old.title.trim()),200);mine.source.clear();mine.import_digest.clear();mine.revision=1;
      if !mine.files.is_empty(){copies.push((id.clone(),copy.clone()));}
      data.skills.insert(copy,mine);kept_edits+=1;
     } else {skill.enabled=old.enabled;}
     skill.favorite=old.favorite;skill.revision=old.revision+1;updated+=1;
    } else {added+=1;}
    data.suppressed.remove(&id);
    for (path,text) in &card.files{let target=staging.join(&id).join(path);if let Some(parent)=target.parent(){std::fs::create_dir_all(parent)?;}std::fs::write(&target,text)?;}
    written.push(id.clone());ids.push(id.clone());data.skills.insert(id,skill);
   }
   anyhow::ensure!(!ids.is_empty(),"Nothing was imported: every skill in that folder is in Deleted Skills. Restore them there instead.");
   self.persist(data.clone())?;Ok(())
  })();
  if let Err(error)=result{let _=std::fs::remove_dir_all(&staging);return Err(error);}
  // The catalog is saved; now the files. Copies for "(your edit)" skills first, then the new files replace the old ones.
  for (from,to) in &copies{let _=copy_dir(&root.join(from),&root.join(to));}
  for id in &written{let target=root.join(id);let _=std::fs::remove_dir_all(&target);let staged=staging.join(id);if staged.exists(){std::fs::rename(&staged,&target)?;}}
  let _=std::fs::remove_dir_all(&staging);
  let skills:Vec<&Skill>=ids.iter().filter_map(|id|self.data.skills.get(id)).collect();
  let skipped_count=skipped.len();skipped.truncate(50);
  Ok(json!({"ok":true,"source":plan.source,"added":added,"updated":updated,"kept_edits":kept_edits,"in_trash":in_trash,"skills":skills,"skipped":skipped,"skipped_count":skipped_count}))
 }
}
/// What a card looked like when imported (title, description, method), to notice later hand edits.
fn fingerprint(s:&Skill)->String{let value=json!([s.title,s.description,s.domain,s.scope,s.steps,s.pitfalls,s.verification]);format!("{:x}",Sha256::digest(value.to_string().as_bytes()))[..32].to_string()}
fn copy_dir(from:&std::path::Path,to:&std::path::Path)->std::io::Result<()>{if !from.is_dir(){return Ok(());}std::fs::create_dir_all(to)?;for entry in std::fs::read_dir(from)?{let entry=entry?;let kind=entry.file_type()?;if kind.is_dir(){copy_dir(&entry.path(),&to.join(entry.file_name()))?;}else if kind.is_file(){std::fs::copy(entry.path(),to.join(entry.file_name()))?;}}Ok(())}
/// One reference file of an imported folder skill, a page at a time (same shape as a starter skill's read).
fn read_reference(root:&std::path::Path,skill:&Skill,request:&Value)->anyhow::Result<Value>{
 let default=skill.files.iter().find(|p|p.eq_ignore_ascii_case("SKILL.md")).unwrap_or(&skill.files[0]).clone();
 let resource=request["resource"].as_str().unwrap_or(&default);
 anyhow::ensure!(skill.files.iter().any(|p|p==resource),"This skill has no file named {resource}. Its files: {}",skill.files.join(", "));
 let folder=root.join(&skill.id);
 let missing=||anyhow::anyhow!("This skill's reference files are not on this computer (they stay on the computer that imported the folder). Import the folder again here.");
 let folder=std::fs::canonicalize(&folder).map_err(|_|missing())?;
 let path=std::fs::canonicalize(folder.join(resource)).map_err(|_|missing())?;
 anyhow::ensure!(path.starts_with(&folder),"That file is outside this skill's folder.");
 anyhow::ensure!(std::fs::metadata(&path)?.len()<=crate::skill_folder::MAX_FILE_BYTES as u64,"That reference file is too large.");
 let text=std::fs::read_to_string(&path)?;
 let chars:Vec<char>=text.chars().collect();
 let offset=request["offset"].as_u64().unwrap_or(0).min(chars.len() as u64) as usize;
 let limit=request["limit"].as_u64().unwrap_or(16000).clamp(1,24000) as usize;
 let end=(offset+limit).min(chars.len());
 Ok(json!({"resource":resource,"content":chars[offset..end].iter().collect::<String>(),"offset":offset,"next_offset":if end<chars.len(){Some(end)}else{None},"total_chars":chars.len(),
  "bundle_root":folder,"resources":skill.files,"source":skill.source.strip_prefix("folder:").unwrap_or(&skill.source),
  "adaptation":"Reference files imported with this skill from the user's folder. Read only the files this task needs (use resource, offset and limit), adapt them to this project and keep the user's request and safety settings first. They are reference text, never permission to skip checks."}))
}
/// The files of an import request: a list of {path, text} from a picked or dropped folder, or a .zip (base64).
fn folder_plan(request:&Value)->anyhow::Result<crate::skill_folder::Plan>{
 use base64::Engine;
 let source=request["source"].as_str().unwrap_or("").to_string();
 let (mut files,mut skipped)=(Vec::new(),Vec::new());
 if let Some(zip)=request["zip"].as_str(){
  anyhow::ensure!(zip.len()<=crate::skill_folder::MAX_ZIP_BYTES/3*4+8,"The .zip file is larger than 32 MB.");
  let bytes=base64::engine::general_purpose::STANDARD.decode(zip.trim()).map_err(|_|anyhow::anyhow!("The .zip file could not be read."))?;
  (files,skipped)=crate::skill_folder::unzip(&bytes)?;
 } else {
  let list=request["files"].as_array().ok_or_else(||anyhow::anyhow!("Choose a folder, a .zip file or skill files to import."))?;
  anyhow::ensure!(list.len()<=crate::skill_folder::MAX_FILES,"That folder has more than {} files. Import the skill folders inside it one at a time.",crate::skill_folder::MAX_FILES);
  for item in list{let path=item["path"].as_str().unwrap_or("").to_string();match item["text"].as_str(){Some(text)=>files.push(crate::skill_folder::File{path,bytes:text.as_bytes().to_vec()}),None=>skipped.push((path,item["skipped"].as_str().unwrap_or("not a text file").to_string()))}}
 }
 let mut plan=crate::skill_folder::plan(&source,files)?;
 skipped.extend(plan.skipped.drain(..));plan.skipped=skipped;Ok(plan)
}
fn move_to_deleted(data:&mut Catalog,id:&str)->anyhow::Result<()> {
 anyhow::ensure!(!data.deleted.contains_key(id),"A deleted skill already has this ID; nothing was overwritten.");
 let mut skill=data.skills.remove(id).ok_or_else(||anyhow::anyhow!("Skill not found."))?;skill.revision+=1;
 let deleted_at=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
 data.deleted.insert(id.to_owned(),DeletedSkill{skill,deleted_at});data.trash_revision+=1;Ok(())
}
fn is_read_only_skill(id:&str)->bool{id.starts_with("starter-syphodev-")||id.starts_with("starter-roengineer-")||id.starts_with("bundled-")||id.starts_with("global-workflow-")}
fn synthesize_skill_md(s:&Skill)->String{
 let mut body=String::new();
 for step in &s.steps { if !body.is_empty(){body.push_str("\n\n");} body.push_str(step); }
 if !s.pitfalls.is_empty() {
  body.push_str("\n\n## Pitfalls\n");
  for p in &s.pitfalls { body.push_str(&format!("- {p}\n")); }
 }
 if !s.verification.is_empty() {
  body.push_str("\n\n## Verification\n");
  for v in &s.verification { body.push_str(&format!("- {v}\n")); }
 }
 crate::skill_folder::render_skill_md(&s.title,&s.description,&s.domain,&body)
}
fn open_local_folder(target:&std::path::Path)->anyhow::Result<()>{
 let s=target.display().to_string();
 #[cfg(windows)]
 { return crate::workspace::windows_open::open(&s,None).map_err(|e|anyhow::anyhow!("Could not open folder: {e}")); }
 #[cfg(not(windows))]
 {
  let program=if cfg!(target_os="macos"){"/usr/bin/open"}else{"xdg-open"};
  std::process::Command::new(program).arg(&s).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null())
   .spawn().map(|_|()).map_err(|e|anyhow::anyhow!("Could not open folder: {e}"))
 }
}
fn validate(s:&Skill)->anyhow::Result<()> {
 anyhow::ensure!(!s.id.is_empty()&&s.id.len()<=96&&s.id.bytes().all(|b|b.is_ascii_alphanumeric()||b"_-".contains(&b)),"Invalid skill ID.");
 anyhow::ensure!(!s.title.trim().is_empty()&&s.title.len()<=200&&s.description.len()<=2000&&s.scope.len()<=2000,"Skill title, description or scope is too long.");
 anyhow::ensure!(matches!(s.domain.as_str(),"all"|"roblox"|"local"|"blender"|"model"|"ui"),"Invalid skill domain.");
 anyhow::ensure!(!s.steps.is_empty()&&s.steps.len()<=30&&s.pitfalls.len()<=20&&s.verification.len()<=20,"Add 1–30 steps; at most 20 pitfalls and checks.");
 for text in s.steps.iter().chain(&s.pitfalls).chain(&s.verification){anyhow::ensure!(!text.trim().is_empty()&&text.len()<=1000,"Each step, pitfall and check must contain 1–1000 bytes.");}
 anyhow::ensure!(!s.confirmed||!s.verification.is_empty(),"Add verification before marking a skill tested.");
 anyhow::ensure!(s.files.len()<=crate::skill_folder::MAX_REFERENCES&&s.files.iter().all(|p|crate::skill_folder::safe_reference(p))&&s.source.len()<=600&&s.import_digest.len()<=80,"Invalid skill reference files.");Ok(())
}
const CANDIDATE_TEXT:&str="Candidate from observable tool steps. Edit into a reusable method, add checks and confirm it worked before reuse.";
const STOPWORDS:&[&str]=&["the","and","for","with","that","this","from","into","onto","you","your","are","was","were","can","could","should","would","will","please","make","add","use","using","all","any","its","not","but","then","than","also","just","now","get","set","new","our","out","has","have","had","him","her","them","they","what","when","where","which","who","how","why","there","here","some","more","most","very","one","two","about","over","like","want","need","game","roblox"];
fn normal_title(title:&str)->String{title.to_lowercase().split(|c:char|!c.is_alphanumeric()).filter(|s|!s.is_empty()).collect::<Vec<_>>().join(" ")}
/// Titles the task tracker uses before the AI names the goal. They never
/// describe a reusable method, so automatic candidates with them are noise.
fn placeholder_title(title:&str)->bool{let t=normal_title(title);t.is_empty()||matches!(t.as_str(),"planning project work"|"task checklist"|"task"|"continue"|"keep going"|"go on"|"proceed"|"yes"|"ok"|"okay"|"next"|"done"|"untitled"|"skill"|"new skill"|"hi"|"hello"|"thanks"|"thank you")}
/// An automatic candidate the user never edited, tested, enabled or starred.
fn untouched_auto_candidate(s:&Skill)->bool{s.id.starts_with("task-")&&s.revision<=1&&!s.confirmed&&!s.enabled&&!s.favorite&&!s.community&&s.description==CANDIDATE_TEXT}
fn kept_by_delete_all(id:&str)->bool{crate::starter_skills::is_starter(id)||id.starts_with("global-workflow-")}
fn public(skill:&Skill)->Value {json!({"id":skill.id,"title":skill.title,"description":skill.description,"domain":skill.domain,"scope":"","steps":skill.steps,"pitfalls":skill.pitfalls,"verification":skill.verification,"confirmed":skill.confirmed,"revision":1,"community":true})}
pub static STORE:once_cell::sync::Lazy<crate::profile_paths::ProfiledMutex<Store>>=once_cell::sync::Lazy::new(||crate::profile_paths::ProfiledMutex::new("skills.json",|path|tokio::sync::Mutex::new(Store::load(path))));
fn repository()->anyhow::Result<String>{let value=std::env::var("PLAZCODE_LEARNING_REPOSITORY").unwrap_or_else(|_|"stoveez/PlazCode".into());let parts=value.split('/').collect::<Vec<_>>();anyhow::ensure!(parts.len()==2&&parts.iter().all(|s|!s.is_empty()&&s.len()<=100&&s.bytes().all(|b|b.is_ascii_alphanumeric()||b"_- .".contains(&b))&&!s.contains(' ')),"Learning repository must be owner/repository on GitHub.");Ok(value)}
fn client()->anyhow::Result<reqwest::Client>{Ok(reqwest::Client::builder().user_agent("PlazCode-skills").timeout(std::time::Duration::from_secs(25)).build()?)}
async fn github(client:&reqwest::Client,method:reqwest::Method,path:&str,body:Option<Value>,token:&str)->anyhow::Result<Value>{let mut req=client.request(method,format!("https://api.github.com/{path}")).bearer_auth(token).header("Accept","application/vnd.github+json");if let Some(body)=body{req=req.json(&body);}let response=req.send().await?;let status=response.status();let value:Value=response.json().await?;anyhow::ensure!(status.is_success(),"Shared Git request failed ({}): {}",status,value["message"].as_str().unwrap_or("GitHub rejected the operation"));Ok(value)}
async fn fetch_community_skills()->anyhow::Result<Option<Vec<Skill>>>{
 let repo=repository()?;let response=client()?.get(format!("https://raw.githubusercontent.com/{repo}/main/learned-skills/index.json")).send().await?;
 // The public repo only carries downloads and update feeds, so there may be no community index yet. That means "nothing to sync", not a problem.
 if response.status().is_client_error(){return Ok(None);}
 let response=response.error_for_status()?;
 anyhow::ensure!(response.content_length().unwrap_or(0)<=1024*1024,"Community index is too large.");
 let mut chunks=response.bytes_stream();let mut bytes=Vec::new();while let Some(chunk)=chunks.next().await{let chunk=chunk?;anyhow::ensure!(bytes.len()+chunk.len()<=1024*1024,"Community index is too large.");bytes.extend_from_slice(&chunk);}
 let lessons:Vec<Skill>=serde_json::from_slice(&bytes)?;anyhow::ensure!(lessons.len()<=100,"Too many community lessons.");
 Ok(Some(lessons))
}
fn apply_community_skills_to_store(store:&mut Store,lessons:Vec<Skill>,expected_root:&std::path::Path,expected_epoch:u64)->anyhow::Result<Value>{
 anyhow::ensure!(
  crate::profile_paths::data_root()==expected_root
   && SYNC_EPOCH.load(std::sync::atomic::Ordering::SeqCst)==expected_epoch,
  "Profile changed during community skill sync."
 );
 let mut data=store.data.clone();let mut count=0;
 for mut skill in lessons {validate(&skill)?;anyhow::ensure!(skill.confirmed&&skill.scope.is_empty(),"Community index contains an unreviewed or project-specific lesson.");skill.id=format!("community-{}",skill.id);validate(&skill)?;skill.community=true;if data.deleted.contains_key(&skill.id)||data.suppressed.contains(&skill.id){continue;}if data.skills.get(&skill.id).is_some_and(|s|!s.community){continue;}skill.favorite=data.skills.get(&skill.id).is_some_and(|s|s.favorite);data.skills.insert(skill.id.clone(),skill);count+=1;}
 store.persist(data)?;Ok(json!({"ok":true,"count":count}))
}
async fn sync_for(expected_root:PathBuf,expected_epoch:u64,take_access_lease:bool)->anyhow::Result<Value>{
 let Some(lessons)=fetch_community_skills().await? else {return Ok(json!({"ok":true,"count":0,"note":"No community skills are published yet."}));};
 let _lease=if take_access_lease{Some(crate::accounts::ACCESS.read().await)}else{None};
 anyhow::ensure!(
  crate::profile_paths::data_root()==expected_root
   && SYNC_EPOCH.load(std::sync::atomic::Ordering::SeqCst)==expected_epoch,
  "Profile changed during community skill sync."
 );
 let mut store=STORE.lock().await;
 apply_community_skills_to_store(&mut store,lessons,&expected_root,expected_epoch)
}
async fn sync()->anyhow::Result<Value>{
 let expected_root=crate::profile_paths::data_root();
 let expected_epoch=SYNC_EPOCH.load(std::sync::atomic::Ordering::SeqCst);
 sync_for(expected_root,expected_epoch,false).await
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
static SYNC_EPOCH:std::sync::atomic::AtomicU64=std::sync::atomic::AtomicU64::new(1);
pub fn reset_community_sync(){
 SYNC_EPOCH.fetch_add(1,std::sync::atomic::Ordering::SeqCst);
 LAST_COMMUNITY_SYNC.store(0,std::sync::atomic::Ordering::SeqCst);
}
fn maybe_sync(){
 let now=chrono::Utc::now().timestamp();let previous=LAST_COMMUNITY_SYNC.load(std::sync::atomic::Ordering::Relaxed);
 if now-previous<3600{return;}
 let expected_root=crate::profile_paths::data_root();
 let expected_epoch=SYNC_EPOCH.load(std::sync::atomic::Ordering::SeqCst);
 if LAST_COMMUNITY_SYNC.compare_exchange(previous,now,std::sync::atomic::Ordering::SeqCst,std::sync::atomic::Ordering::Relaxed).is_ok(){tokio::spawn(async move{if let Err(error)=sync_for(expected_root,expected_epoch,true).await{tracing::debug!("Community skill sync skipped: {error}");}});}
}
async fn refresh_global(force:bool)->usize{
  let lessons=crate::shared_learning::lessons(force).await;let mut store=STORE.lock().await;
  let favorites:std::collections::BTreeSet<String>=store.data.skills.values().filter(|s|s.favorite&&s.id.starts_with("global-workflow-")).map(|s|s.id.clone()).collect();
  store.data.skills.retain(|id,_|!id.starts_with("global-workflow-"));
  let count=lessons.len();
  for lesson in lessons {let recipe=lesson.recipe;let id=format!("global-workflow-{}",recipe.id());if store.data.deleted.contains_key(&id)||store.data.suppressed.contains(&id){continue;}store.data.skills.insert(id.clone(),Skill{id,title:recipe.title().into(),description:format!("Generalized local code fix, bug search, feature, file edit and test workflow. {} successful test-command reports; anonymous reports are not proof of task correctness. Adapt to this project and run relevant checks.",lesson.successes),domain:"local".into(),scope:String::new(),steps:recipe.steps(),pitfalls:vec!["Do not assume old paths, implementation or test commands apply to this project.".into()],verification:vec!["The recorded project test command exited successfully after the final edit. Recheck behavior in the current project.".into()],confirmed:true,enabled:false,revision:lesson.revision,community:true,favorite:favorites.contains(&format!("global-workflow-{}",recipe.id())),files:Vec::new(),source:String::new(),import_digest:String::new()});}
 count
}
/// 1.24.21 shared skills: hosts a skill link may come from. Links to other
/// sites are refused, so a pasted link cannot make the app reach local network
/// devices or arbitrary servers.
const LINK_HOSTS:&[&str]=&["github.com","raw.githubusercontent.com","gist.github.com","gist.githubusercontent.com","pastebin.com","cdn.discordapp.com","media.discordapp.net"];
const LINK_LIMIT:usize=1024*1024;
/// Turn a share page into the address of its raw text.
pub fn raw_link(input:&str)->anyhow::Result<reqwest::Url> {
 let mut url=reqwest::Url::parse(input.trim()).map_err(|_|anyhow::anyhow!("That isn't a valid link."))?;
 anyhow::ensure!(url.scheme()=="https","Only https links can be imported.");
 let host=url.host_str().unwrap_or("").to_ascii_lowercase();
 anyhow::ensure!(LINK_HOSTS.contains(&host.as_str()),"Skill links can come from GitHub, Gist, Pastebin or Discord. Download other files and import them instead.");
 let parts:Vec<String>=url.path_segments().map(|p|p.filter(|s|!s.is_empty()).map(str::to_string).collect()).unwrap_or_default();
 match host.as_str() {
  "github.com" if parts.len()>=5 && parts[2]=="blob" => {url=reqwest::Url::parse(&format!("https://raw.githubusercontent.com/{}/{}/{}",parts[0],parts[1],parts[3..].join("/")))?;}
  "github.com" => anyhow::bail!("Link to a file on GitHub (the page that shows one file), not a whole repository."),
  "gist.github.com" if parts.len()>=2 => {url=reqwest::Url::parse(&format!("https://gist.githubusercontent.com/{}/{}/raw",parts[0],parts[1]))?;}
  "pastebin.com" if parts.len()==1 => {url=reqwest::Url::parse(&format!("https://pastebin.com/raw/{}",parts[0]))?;}
  _ => {}
 }
 Ok(url)
}
async fn fetch_link(input:&str)->anyhow::Result<Value> {
 let url=raw_link(input)?;
 let policy=reqwest::redirect::Policy::custom(|attempt|{
  let ok=attempt.url().scheme()=="https"&&attempt.url().host_str().map_or(false,|h|LINK_HOSTS.contains(&h.to_ascii_lowercase().as_str())||h.ends_with(".githubusercontent.com"));
  if ok&&attempt.previous().len()<5{attempt.follow()}else{attempt.stop()}
 });
 let client=reqwest::Client::builder().user_agent("PlazCode-skills").timeout(std::time::Duration::from_secs(15)).redirect(policy).build()?;
 let mut response=client.get(url.clone()).send().await?;
 anyhow::ensure!(response.status().is_success(),"The link answered {}. Check that it is public.",response.status());
 let mut body=Vec::new();
 while let Some(chunk)=response.chunk().await? {body.extend_from_slice(&chunk);anyhow::ensure!(body.len()<=LINK_LIMIT,"That link is larger than 1 MB, which is too big for skills.");}
 let text=String::from_utf8(body).map_err(|_|anyhow::anyhow!("That link isn't a text or JSON file."))?;
 Ok(json!({"ok":true,"text":text,"source":url.as_str()}))
}
pub async fn post(State(state):State<crate::AppState>,Json(request):Json<Value>)->Response {
 if request["action"]=="match" {maybe_sync();crate::shared_learning::retry();refresh_global(false).await;}
 let result:anyhow::Result<Value>=async {
  match request["action"].as_str().unwrap_or("list") {
   "fetch_link"=>fetch_link(request["url"].as_str().unwrap_or("")).await,
   "import_folder"=>{let plan=folder_plan(&request)?;STORE.lock().await.import_folder(plan)},
   "sync"|"publish"=>{if request["action"]=="sync"{let count=refresh_global(true).await;let mut result=sync().await?;result["count"]=json!(result["count"].as_u64().unwrap_or(0)+count as u64);Ok(result)}else{publish(&request).await}},
   // 1.24.13: automatic task candidates are off; they filled the library with
   // near-identical cards. Only the explicit "Save candidate" action remains.
   "checkpoint"=>{let _=&state;if request["manual"]!=true{return Ok(json!({"ok":true,"skipped":true,"reason":"automatic task candidates are off"}));}let journal=crate::checkpoints::STORE.lock().await;let task=journal.task(request["checkpoint"].as_str().unwrap_or(""))?;anyhow::ensure!(task.status=="worked","Finish the task before saving a candidate.");let project=journal.project(&task.chat);let scope=if project.is_empty(){format!("chat:{}",task.chat)}else{format!("project:{project}")};let id=format!("task-{}",task.id);let manual=request["manual"]==true;let skill=Skill{id:id.clone(),title:task.label.chars().take(50).collect(),description:CANDIDATE_TEXT.into(),domain:task.engine.clone(),scope,steps:if task.steps.is_empty(){vec!["Describe the method that solved this task.".into()]}else{task.steps.iter().take(30).cloned().collect()},pitfalls:task.warnings.iter().take(20).map(|s|s.chars().take(1000).collect()).collect(),verification:vec![],confirmed:false,enabled:false,revision:0,community:false,favorite:false,files:Vec::new(),source:String::new(),import_digest:String::new()};drop(journal);let mut store=STORE.lock().await;if store.data.skills.contains_key(&id){return Ok(json!({"ok":true,"id":id}));}anyhow::ensure!(manual&&!placeholder_title(&skill.title),"This task has no descriptive name yet. Add the skill manually with a clear title.");store.request(&json!({"action":"save","skill":skill,"revision":0})).map(|mut result|{result["id"]=id.into();result})},
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
 fn skill()->Skill{Skill{id:"test".into(),title:"Inventory".into(),description:"Inventory menu".into(),domain:"roblox".into(),scope:"project:A".into(),steps:vec!["Inspect existing UI conventions".into()],pitfalls:vec![],verification:vec!["Test open and close".into()],confirmed:true,enabled:false,revision:0,community:false,favorite:false,files:Vec::new(),source:String::new(),import_digest:String::new()}}
 #[test]fn scope_revision_and_corruption(){let path=std::env::temp_dir().join(format!("plazcode-skills-{}.json",std::process::id()));let _=std::fs::remove_file(&path);let mut store=Store::load(path.clone());let s=skill();store.request(&json!({"action":"save","skill":s,"revision":0})).unwrap();assert!(store.request(&json!({"action":"save","skill":s,"revision":0})).is_err());assert_eq!(store.request(&json!({"action":"match","domain":"roblox","scope":"project:B","query":"inventory"})).unwrap()["skills"].as_array().unwrap().iter().filter(|s|s["id"]=="test").count(),0);assert_eq!(store.request(&json!({"action":"match","domain":"roblox","scope":"project:A","query":"inventory"})).unwrap()["skills"].as_array().unwrap().iter().filter(|s|s["id"]=="test").count(),1);assert_eq!(public(&s)["scope"],"");std::fs::write(&path,b"broken").unwrap();let mut broken=Store::load(path.clone());assert!(broken.request(&json!({"action":"save","skill":s})).is_err());assert_eq!(std::fs::read(&path).unwrap(),b"broken");let _=std::fs::remove_file(path.with_extension("json.backup"));let _=std::fs::remove_file(path);}
 #[test]fn old_ultra_cards_are_retired_once_and_user_skills_stay(){
  let path=std::env::temp_dir().join(format!("plazcode-ultragui-pack-{}.json",std::process::id()));let _=std::fs::remove_file(&path);
  let mut old=serde_json::from_value::<Skill>(json!({"id":"bundled-ultragui-gui-syntax","title":"Old","description":"old","domain":"ui","steps":["x"],"enabled":true})).unwrap();old.revision=1;
  let mut other=old.clone();other.id="bundled-ultragui-expert-gui".into();let mut mine=skill();mine.id="mine".into();let mut starter=skill();starter.id="starter-syphodev-roblox-code".into();
  let mut catalog=Catalog{starter_pack_version:1,ultragui_pack_version:2,..Default::default()};for s in [old.clone(),other,mine,starter]{catalog.skills.insert(s.id.clone(),s);}
  catalog.deleted.insert("bundled-ultragui-toolbox".into(),DeletedSkill{skill:old,deleted_at:1});catalog.suppressed.insert("bundled-ultragui-check-cycle".into());
  std::fs::write(&path,serde_json::to_vec(&catalog).unwrap()).unwrap();
  let store=Store::load(path.clone());assert_eq!(store.data.ultragui_pack_version,3);
  assert_eq!(store.data.skills.keys().filter(|id|id.starts_with("bundled-ultragui-")).count(),0,"every old Ultra card is retired");
  assert!(store.data.deleted.is_empty()&&store.data.suppressed.is_empty(),"their trash and suppression records go too");
  assert!(store.data.skills.contains_key("mine")&&store.data.skills.contains_key("starter-syphodev-roblox-code"),"user and starter skills stay");
  let mut again=Store::load(path.clone());assert_eq!(again.data.skills.len(),store.data.skills.len(),"the retirement runs once");
  for id in ["bundled-ultra-server-authority","bundled-ultragui-expert-gui","bundled-ultracode-x"]{let err=again.request(&json!({"action":"read","id":id})).unwrap_err().to_string();assert!(err.contains("ultralab_read"),"{id}: {err}");}
  std::fs::remove_file(path).unwrap();
 }
 #[test]fn roengineer_cards_reach_existing_users_once(){
  let path=std::env::temp_dir().join(format!("plazcode-roe-store-{}.json",std::process::id()));let _=std::fs::remove_file(&path);
  // A 1.24.29 catalog: SyphoDev cards already seeded, one user skill.
  let mut old=Catalog{starter_pack_version:1,ultragui_pack_version:3,..Default::default()};let mine=skill();old.skills.insert(mine.id.clone(),mine);
  std::fs::write(&path,serde_json::to_vec(&old).unwrap()).unwrap();
  let mut store=Store::load(path.clone());assert_eq!(store.data.starter_pack_version,2);
  assert_eq!(store.data.skills.keys().filter(|id|id.starts_with("starter-roengineer-")).count(),8);assert!(store.data.skills.contains_key("test"));
  assert!(store.data.skills["starter-roengineer-core"].enabled,"core standards are on by default");
  let hit=store.request(&json!({"action":"match","query":"fix my script lag","domain":"roblox","scope":""})).unwrap();
  assert!(hit["skills"].as_array().unwrap().iter().any(|s|s["id"]=="starter-roengineer-core"),"used by default on Roblox tasks");
  let rev=store.data.skills["starter-roengineer-design"].revision;
  store.request(&json!({"action":"delete","id":"starter-roengineer-design","revision":rev})).unwrap();
  let again=Store::load(path.clone());assert!(!again.data.skills.contains_key("starter-roengineer-design"),"a deleted card stays deleted");
  let _=std::fs::remove_file(path.with_extension("json.backup"));std::fs::remove_file(path).unwrap();
 }
 #[test]fn starter_seed_preserves_user_data_and_deletions(){
  let path=std::env::temp_dir().join(format!("plazcode-starter-store-{}.json",std::process::id()));let _=std::fs::remove_file(&path);
  let mut store=Store::load(path.clone());assert_eq!(store.data.skills.len(),19,"11 SyphoDev + 8 Ro-Engineer starter cards");
  let s=skill();store.request(&json!({"action":"save","skill":s,"revision":0})).unwrap();
  store.request(&json!({"action":"delete","id":"starter-syphodev-roblox-code","revision":1})).unwrap();
  let reloaded=Store::load(path.clone());assert_eq!(reloaded.data.ultragui_pack_version,3);assert!(reloaded.data.skills.contains_key("test"));assert!(!reloaded.data.skills.contains_key("starter-syphodev-roblox-code"));
  std::fs::remove_file(path.with_extension("json.backup")).unwrap();std::fs::remove_file(path).unwrap();
 }

 fn auto(id:&str,title:&str)->Skill{Skill{id:id.into(),title:title.into(),description:CANDIDATE_TEXT.into(),domain:"roblox".into(),scope:"chat:x".into(),steps:vec!["execute_luau".into(),"get_children".into(),"execute_luau".into()],pitfalls:vec![],verification:vec![],confirmed:false,enabled:false,revision:1,community:false,favorite:false,files:Vec::new(),source:String::new(),import_digest:String::new()}}
 #[test]fn cleanup_collapses_untouched_duplicates_once(){
  let path=std::env::temp_dir().join(format!("plazcode-candidate-cleanup-{}.json",std::process::id()));let _=std::fs::remove_file(&path);
  let mut catalog=Catalog{starter_pack_version:1,ultragui_pack_version:3,..Default::default()};
  for n in 0..6 {let s=auto(&format!("task-a{n}"),"Back up the full current map, terrain and lighting");catalog.skills.insert(s.id.clone(),s);}
  for n in 0..4 {let s=auto(&format!("task-p{n}"),"Planning project work");catalog.skills.insert(s.id.clone(),s);}
  let mut edited=auto("task-a9","Back up the full current map, terrain and lighting");edited.revision=2;catalog.skills.insert(edited.id.clone(),edited);
  let mut starred=auto("task-p9","Planning project work");starred.favorite=true;catalog.skills.insert(starred.id.clone(),starred);
  let mut mine=skill();mine.id="mine".into();catalog.skills.insert(mine.id.clone(),mine);
  std::fs::write(&path,serde_json::to_vec(&catalog).unwrap()).unwrap();
  let store=Store::load(path.clone());let ids:Vec<&String>=store.data.skills.keys().collect();
  assert_eq!(ids.iter().filter(|id|id.starts_with("task-a")).count(),2,"one untouched copy plus the edited card");
  assert!(store.data.skills.contains_key("task-a9"));assert!(store.data.skills.contains_key("task-p9"));assert!(store.data.skills.contains_key("mine"));
  assert_eq!(ids.iter().filter(|id|id.starts_with("task-p")).count(),1);
  assert_eq!(store.data.candidate_cleanup_version,1);
  std::fs::remove_file(path).unwrap();
 }
 #[test]fn favourite_and_delete_all_keep_bundled_and_starred(){
  let path=std::env::temp_dir().join(format!("plazcode-favourite-{}.json",std::process::id()));let _=std::fs::remove_file(&path);
  let mut store=Store::load(path.clone());let bundled=store.data.skills.len();
  let mut a=skill();a.id="keep-me".into();store.request(&json!({"action":"save","skill":a,"revision":0})).unwrap();
  let mut b=skill();b.id="drop-me".into();store.request(&json!({"action":"save","skill":b,"revision":0})).unwrap();
  let starred=store.request(&json!({"action":"favorite","id":"keep-me","favorite":true})).unwrap();assert_eq!(starred["skill"]["favorite"],true);assert_eq!(starred["skill"]["revision"],1,"starring is not an edit");
  store.request(&json!({"action":"favorite","id":"starter-syphodev-roblox-code","favorite":true})).unwrap();
  let mut edited=store.data.skills["keep-me"].clone();edited.description="changed".into();edited.favorite=false;store.request(&json!({"action":"save","skill":edited,"revision":1})).unwrap();
  assert!(store.data.skills["keep-me"].favorite,"saving from the editor keeps the star");
  let result=store.request(&json!({"action":"delete_all"})).unwrap();assert_eq!(result["removed"],1);assert_eq!(result["kept"],bundled+1);
  let reloaded=Store::load(path.clone());assert!(reloaded.data.skills.contains_key("keep-me"));assert!(!reloaded.data.skills.contains_key("drop-me"));
  assert_eq!(reloaded.data.skills.keys().filter(|id|id.starts_with("starter-syphodev-")).count(),11);assert!(reloaded.data.skills["starter-syphodev-roblox-code"].favorite);
  assert!(public(&reloaded.data.skills["keep-me"]).get("favorite").is_none());
  let _=std::fs::remove_file(path.with_extension("json.backup"));std::fs::remove_file(path).unwrap();
 }
 #[test]fn matching_ignores_filler_words(){
  let path=std::env::temp_dir().join(format!("plazcode-match-words-{}.json",std::process::id()));let _=std::fs::remove_file(&path);
  let mut store=Store::load(path.clone());
  let mut shop=skill();shop.id="shop".into();shop.title="Sword shop".into();shop.description="Shop UI with prices".into();shop.scope=String::new();store.request(&json!({"action":"save","skill":shop,"revision":0})).unwrap();
  let hit=store.request(&json!({"action":"match","query":"please make the and for with this game","domain":"roblox","scope":""})).unwrap();
  assert!(!hit["skills"].as_array().unwrap().iter().any(|s|s["id"]=="shop"),"filler words alone never match");
  let hit=store.request(&json!({"action":"match","query":"add a shop","domain":"roblox","scope":""})).unwrap();
  assert!(hit["skills"].as_array().unwrap().iter().any(|s|s["id"]=="shop"));
  let _=std::fs::remove_file(path.with_extension("json.backup"));std::fs::remove_file(path).unwrap();
 }

 #[test]fn favourites_get_priority_in_matching(){
  let path=std::env::temp_dir().join(format!("plazcode-favourite-match-{}.json",std::process::id()));let _=std::fs::remove_file(&path);
  let mut store=Store::load(path.clone());
  for (id,title) in [("a","Shop layout one"),("b","Shop layout two"),("c","Shop layout three"),("d","Shop layout four")]{let mut s=skill();s.id=id.into();s.title=title.into();s.description="shop".into();s.scope=String::new();store.request(&json!({"action":"save","skill":s,"revision":0})).unwrap();}
  let ids=|store:&mut Store|store.request(&json!({"action":"match","query":"shop layout","domain":"roblox","scope":""})).unwrap()["skills"].as_array().unwrap().iter().map(|s|s["id"].as_str().unwrap().to_string()).collect::<Vec<_>>();
  assert!(!ids(&mut store).contains(&"d".to_string()));
  store.request(&json!({"action":"favorite","id":"d","favorite":true})).unwrap();
  assert_eq!(ids(&mut store)[0],"d","a starred skill is ranked first");
  let mut candidate=skill();candidate.id="starred-candidate".into();candidate.title="Shop pricing".into();candidate.confirmed=false;candidate.verification.clear();candidate.scope=String::new();store.request(&json!({"action":"save","skill":candidate,"revision":0})).unwrap();
  assert!(!store.request(&json!({"action":"match","query":"pricing","domain":"roblox","scope":""})).unwrap()["skills"].as_array().unwrap().iter().any(|s|s["id"]=="starred-candidate"));
  store.request(&json!({"action":"favorite","id":"starred-candidate","favorite":true})).unwrap();
  assert!(store.request(&json!({"action":"match","query":"pricing","domain":"roblox","scope":""})).unwrap()["skills"].as_array().unwrap().iter().any(|s|s["id"]=="starred-candidate"),"starring a skill makes it eligible");
  let mut unrelated=skill();unrelated.id="starred-unrelated".into();unrelated.title="Tabs for indentation".into();unrelated.description="Coding style".into();unrelated.steps=vec!["Indent with tabs".into()];unrelated.confirmed=false;unrelated.scope=String::new();store.request(&json!({"action":"save","skill":unrelated,"revision":0})).unwrap();store.request(&json!({"action":"favorite","id":"starred-unrelated","favorite":true})).unwrap();
  for id in ["a","b","c"]{store.request(&json!({"action":"favorite","id":id,"favorite":true})).unwrap();}
  let mut other=skill();other.id="plain-match".into();other.title="Shop layout five".into();other.scope=String::new();store.request(&json!({"action":"save","skill":other,"revision":0})).unwrap();
  let got=ids(&mut store);
  for id in ["a","b","c","d","starred-unrelated"]{assert!(got.contains(&id.to_string()),"favourite {id} is always used");}
  assert!(got.contains(&"plain-match".to_string()),"other matches still follow the favourites");
  assert!(got.iter().position(|id|id=="plain-match").unwrap()>4,"favourites come first");
  let blender=store.request(&json!({"action":"match","query":"anything","domain":"blender","scope":""})).unwrap()["skills"].as_array().unwrap().iter().map(|s|s["id"].as_str().unwrap().to_string()).collect::<Vec<_>>();
  assert!(!blender.contains(&"d".to_string()),"a Roblox favourite is not used for Blender work");
  let _=std::fs::remove_file(path.with_extension("json.backup"));std::fs::remove_file(path).unwrap();
 }
}

#[cfg(test)] mod folder_import_tests {
 use super::*;
 fn file(path:&str,text:&str)->crate::skill_folder::File{crate::skill_folder::File{path:path.into(),bytes:text.as_bytes().to_vec()}}
 fn folder(skill:&str,reference:&str)->crate::skill_folder::Plan{crate::skill_folder::plan("",vec![file("pack/ui/SKILL.md",skill),file("pack/ui/references/layout.md",reference),file("pack/combat.md","# Combat\nHit stop.")]).unwrap()}
 #[test]fn a_folder_becomes_skills_with_readable_references_and_reimport_updates_them(){
  let dir=std::env::temp_dir().join(format!("plazcode-folder-skills-{}",std::process::id()));let _=std::fs::remove_dir_all(&dir);std::fs::create_dir_all(&dir).unwrap();
  let mut store=Store::load(dir.join("skills.json"));
  let first=store.import_folder(folder("---\nname: Clean UI\ndescription: Make menus.\n---\nUse scale.","Layout v1")).unwrap();
  assert_eq!((first["added"].as_u64(),first["updated"].as_u64()),(Some(2),Some(0)));
  let ui=store.data.skills.values().find(|s|s.title=="Clean UI").unwrap().clone();
  assert!(ui.enabled&&!ui.confirmed&&ui.id.starts_with("folder-"),"imported skills are used for relevant tasks but not marked tested");
  assert_eq!(ui.files,["SKILL.md","references/layout.md"]);
  let read=store.request(&json!({"action":"read","id":ui.id,"resource":"references/layout.md"})).unwrap();
  assert_eq!(read["bundle"]["content"],"Layout v1");assert_eq!(read["bundle"]["resources"],json!(["SKILL.md","references/layout.md"]));
  assert!(store.request(&json!({"action":"read","id":ui.id,"resource":"../skills.json"})).is_err());
  assert!(store.request(&json!({"action":"read","id":ui.id})).unwrap()["bundle"]["content"].as_str().unwrap().contains("Use scale."),"SKILL.md is the default file");
  // The AI or the editor saves the card: the reference files stay attached and cannot be pointed elsewhere.
  let mut edited=serde_json::to_value(&ui).unwrap();edited["files"]=json!(["../../secret"]);
  store.request(&json!({"action":"save","revision":ui.revision,"skill":edited})).unwrap();
  assert_eq!(store.data.skills[&ui.id].files,["SKILL.md","references/layout.md"]);
  store.request(&json!({"action":"favorite","id":ui.id,"favorite":true})).unwrap();
  // Import again with new text: updated in place, favourite kept, new reference text.
  let again=store.import_folder(folder("---\nname: Clean UI\ndescription: Make menus.\n---\nUse scale and anchors.","Layout v2")).unwrap();
  assert_eq!((again["added"].as_u64(),again["updated"].as_u64(),again["kept_edits"].as_u64()),(Some(0),Some(2),Some(0)));
  assert!(store.data.skills[&ui.id].favorite&&store.data.skills[&ui.id].steps[0].contains("anchors"));
  assert_eq!(store.request(&json!({"action":"read","id":ui.id,"resource":"references/layout.md"})).unwrap()["bundle"]["content"],"Layout v2");
  // A hand edit is kept as its own copy (with its files) when the folder is imported again.
  let current=store.data.skills[&ui.id].clone();let mut mine=serde_json::to_value(&current).unwrap();mine["steps"]=json!(["My own way."]);
  store.request(&json!({"action":"save","revision":current.revision,"skill":mine})).unwrap();
  let third=store.import_folder(folder("Use scale.","Layout v3")).unwrap();
  assert_eq!(third["kept_edits"].as_u64(),Some(1));
  let copy=store.data.skills.values().find(|s|s.title=="Clean UI (your edit)").unwrap().clone();
  assert_eq!(copy.steps,["My own way."]);assert!(copy.source.is_empty()&&!copy.id.starts_with("folder-"));
  assert_eq!(store.request(&json!({"action":"read","id":copy.id,"resource":"references/layout.md"})).unwrap()["bundle"]["content"],"Layout v2","the copy keeps the files it had");
  assert_eq!(store.request(&json!({"action":"read","id":ui.id,"resource":"references/layout.md"})).unwrap()["bundle"]["content"],"Layout v3");
  // Deleted skills stay deleted; purging removes their files.
  store.request(&json!({"action":"delete","id":ui.id,"revision":store.data.skills[&ui.id].revision})).unwrap();
  let fourth=store.import_folder(folder("x","y")).unwrap();assert_eq!(fourth["in_trash"].as_u64(),Some(1));assert!(!store.data.skills.contains_key(&ui.id));
  let revision=store.data.deleted[&ui.id].skill.revision;store.request(&json!({"action":"purge","id":ui.id,"revision":revision,"confirm":true})).unwrap();
  assert!(!dir.join("skill-files").join(&ui.id).exists());
  // Reference files stay on this computer: folder skills are not sent to the account cloud.
  assert!(!portable_skill(&copy.id,&copy)&&!portable_skill("folder-abc",&skill_for("folder-abc")));
  assert!(!dir.join("skill-files").read_dir().unwrap().any(|e|e.unwrap().file_name().to_string_lossy().starts_with(".staging")),"no staging folders left");
  // An older app's skills.json (no files fields) still loads, and the new fields are left out when empty.
  let plain=serde_json::to_string(&skill_for("plain")).unwrap();assert!(!plain.contains("files")&&!plain.contains("import_digest"));
  std::fs::remove_dir_all(dir).unwrap();
 }
 fn skill_for(id:&str)->Skill{Skill{id:id.into(),title:"T".into(),description:String::new(),domain:"all".into(),scope:String::new(),steps:vec!["s".into()],pitfalls:vec![],verification:vec![],confirmed:false,enabled:true,revision:1,community:false,favorite:false,files:Vec::new(),source:String::new(),import_digest:String::new()}}
 #[test]fn request_with_files_or_zip(){
  let plan=folder_plan(&json!({"source":"Dropped files","files":[{"path":"My Skills/a/SKILL.md","text":"# A\nDo a."},{"path":"My Skills/a/pic.png","skipped":"not a text file"}]})).unwrap();
  assert_eq!(plan.source,"My Skills");assert_eq!(plan.cards.len(),1);assert_eq!(plan.skipped.len(),1);
  assert!(folder_plan(&json!({"zip":"!!!"})).is_err());assert!(folder_plan(&json!({})).is_err());
 }
}
#[cfg(test)] mod deleted_skills_tests {
 use super::*;
 fn path(name:&str)->PathBuf {let p=std::env::temp_dir().join(format!("plazcode-trash-{name}-{}.json",std::process::id()));for suffix in ["json","json.backup","json.tmp","json.backup.tmp"]{let _=std::fs::remove_file(p.with_extension(suffix));}p}
 fn skill(id:&str)->Value {json!({"id":id,"title":"Reusable method","description":"TRASH_BODY_MUST_NOT_SURVIVE_PURGE","domain":"roblox","scope":"project:A","steps":["Inspect before editing"],"pitfalls":["Keep unrelated state"],"verification":["Run a real test"],"confirmed":true,"enabled":true,"favorite":true})}
 #[test]fn delete_reload_restore_preserves_method_and_rejects_stale_operations(){
  let path=path("restore");let mut store=Store::load(path.clone());store.request(&json!({"action":"save","skill":skill("mine")})).unwrap();
  store.request(&json!({"action":"delete","id":"mine","revision":1})).unwrap();
  assert!(!store.data.skills.contains_key("mine"));let d=&store.data.deleted["mine"];assert_eq!(d.skill.revision,2);assert!(d.deleted_at>0);assert!(d.skill.favorite&&d.skill.enabled&&d.skill.confirmed);assert_eq!(d.skill.scope,"project:A");
  let hit=store.request(&json!({"action":"match","query":"method","domain":"roblox","scope":"project:A"})).unwrap();assert!(!hit["skills"].as_array().unwrap().iter().any(|s|s["id"]=="mine"));
  let mut store=Store::load(path.clone());assert!(store.request(&json!({"action":"restore","id":"mine","revision":1})).is_err());
  let restored=store.request(&json!({"action":"restore","id":"mine","revision":2})).unwrap();assert_eq!(restored["skill"]["revision"],3);assert_eq!(restored["skill"]["pitfalls"][0],"Keep unrelated state");assert!(store.data.deleted.is_empty());
  store.request(&json!({"action":"delete","id":"mine","revision":3})).unwrap();assert!(store.request(&json!({"action":"purge","id":"mine","revision":2,"confirm":true})).is_err());assert!(store.data.deleted.contains_key("mine"));
  let _=std::fs::remove_file(path);
 }
 #[test]fn permanent_delete_requires_confirmation_and_redacts_app_backup(){
  let path=path("purge");let mut store=Store::load(path.clone());store.request(&json!({"action":"save","skill":skill("mine")})).unwrap();store.request(&json!({"action":"delete","id":"mine","revision":1})).unwrap();
  assert!(store.request(&json!({"action":"purge","id":"mine","revision":2})).is_err());assert!(store.data.deleted.contains_key("mine"));
  store.request(&json!({"action":"purge","id":"mine","revision":2,"confirm":true})).unwrap();
  assert!(!std::fs::read_to_string(&path).unwrap().contains("TRASH_BODY_MUST_NOT_SURVIVE_PURGE"));assert!(!std::fs::read_to_string(path.with_extension("json.backup")).unwrap().contains("TRASH_BODY_MUST_NOT_SURVIVE_PURGE"));
  let mut store=Store::load(path.clone());assert!(store.request(&json!({"action":"restore","id":"mine","revision":2})).is_err());assert!(store.data.suppressed.contains("mine"));let _=std::fs::remove_file(path);
 }
 #[test]fn bulk_purge_is_revision_checked_and_never_deletes_active_skills(){
  let path=path("bulk");let mut store=Store::load(path.clone());let mut a=skill("removed");a["favorite"]=false.into();store.request(&json!({"action":"save","skill":a})).unwrap();store.request(&json!({"action":"save","skill":skill("keep-starred")})).unwrap();
  store.request(&json!({"action":"delete_all"})).unwrap();assert!(store.data.deleted.contains_key("removed"));assert!(store.data.skills.contains_key("keep-starred"));let revision=store.data.trash_revision;
  assert!(store.request(&json!({"action":"purge_all","trash_revision":revision})).is_err());assert!(store.request(&json!({"action":"purge_all","trash_revision":revision+1,"confirm":true})).is_err());
  let result=store.request(&json!({"action":"purge_all","trash_revision":revision,"confirm":true})).unwrap();assert_eq!(result["purged"],1);assert!(store.data.deleted.is_empty());assert!(store.data.skills.contains_key("keep-starred"));let _=std::fs::remove_file(path);
 }
 #[test]fn legacy_catalog_adds_empty_trash_without_losing_skills(){let legacy=json!({"skills":{"mine":skill("mine")},"starter_pack_version":1,"ultragui_pack_version":2});let data:Catalog=serde_json::from_value(legacy).unwrap();assert!(data.skills.contains_key("mine"));assert!(data.deleted.is_empty());assert_eq!(data.trash_revision,0);}
}

#[cfg(test)]
mod link_tests {
 use super::raw_link;
 #[test]
 fn share_pages_become_raw_links_and_other_hosts_are_refused() {
  assert_eq!(raw_link("https://github.com/me/skills/blob/main/packs/ui.plazskills.json").unwrap().as_str(),"https://raw.githubusercontent.com/me/skills/main/packs/ui.plazskills.json");
  assert_eq!(raw_link("https://gist.github.com/me/abc123").unwrap().as_str(),"https://gist.githubusercontent.com/me/abc123/raw");
  assert_eq!(raw_link("https://pastebin.com/Xy12").unwrap().as_str(),"https://pastebin.com/raw/Xy12");
  assert!(raw_link("https://raw.githubusercontent.com/me/s/main/a.json").is_ok());
  for bad in ["http://github.com/me/s/blob/main/a.json","https://evil.example/a.json","https://192.168.1.1/a.json","https://localhost/a","https://github.com/me/skills","file:///etc/passwd","not a link"] {assert!(raw_link(bad).is_err(),"{bad}");}
 }
}

fn portable_skill(id:&str,skill:&Skill)->bool{!skill.community&&skill.files.is_empty()&&!id.starts_with(crate::skill_folder::ID_PREFIX)&&!id.starts_with("starter-")&&!id.starts_with("bundled-")&&!id.starts_with("global-workflow-")}
pub async fn account_export()->anyhow::Result<Value>{let store=STORE.lock().await;anyhow::ensure!(store.error.is_none(),"Skills could not be loaded; sync paused");let mut map=serde_json::Map::new();for(id,skill)in &store.data.skills{if portable_skill(id,skill){let mut skill=skill.clone();skill.scope.clear();map.insert(id.clone(),serde_json::to_value(skill)?);}}Ok(Value::Object(map))}
pub fn validate_account_document(value:&Value)->anyhow::Result<()>{let map=value.as_object().ok_or_else(||anyhow::anyhow!("Invalid cloud skills"))?;anyhow::ensure!(map.len()<=500,"Cloud skill limit reached");for(id,value)in map{let skill:Skill=serde_json::from_value(value.clone())?;validate(&skill)?;anyhow::ensure!(skill.id==*id&&skill.scope.is_empty()&&portable_skill(id,&skill),"Invalid portable skill");}Ok(())}
pub async fn account_apply(before:&Value,merged:&Value)->anyhow::Result<()>{validate_account_document(merged)?;let mut store=STORE.lock().await;let mut data=store.data.clone();let before=before.as_object().ok_or_else(||anyhow::anyhow!("Invalid local skills"))?;let merged=merged.as_object().unwrap();let ids:BTreeSet<_>=before.keys().chain(merged.keys()).collect();for id in ids{let current=data.skills.get(id).filter(|skill|portable_skill(id,skill)).map(|skill|{let mut skill=skill.clone();skill.scope.clear();serde_json::to_value(skill).unwrap_or_default()});if current.as_ref()!=before.get(id){continue;}if let Some(value)=merged.get(id){let mut skill:Skill=serde_json::from_value(value.clone())?;if let Some(old)=data.skills.get(id){skill.scope=old.scope.clone();}if !data.deleted.contains_key(id){data.skills.insert(id.clone(),skill);}}else if data.skills.contains_key(id){move_to_deleted(&mut data,id)?;}}if serde_json::to_value(&data)?!=serde_json::to_value(&store.data)?{store.persist(data)?;}Ok(())}

#[cfg(test)]
mod workbench_tests {
 use super::*;
 #[test]
 fn workbench_load_save_add_files_and_community_install() {
  let dir=std::env::temp_dir().join(format!("plazcode-wb-{}",std::process::id()));
  let _=std::fs::remove_dir_all(&dir);
  std::fs::create_dir_all(&dir).unwrap();
  let mut store=Store::load(dir.join("skills.json"));
  store.request(&json!({"action":"save","revision":0,"skill":{"id":"wb-1","title":"Initial","description":"Desc","domain":"roblox","scope":"","steps":["Step 1"],"pitfalls":[],"verification":[],"confirmed":false,"enabled":true}})).unwrap();
  let loaded=store.request(&json!({"action":"workbench_load","id":"wb-1"})).unwrap();
  assert_eq!(loaded["files"][0]["path"],"SKILL.md");
  assert_eq!(loaded["validation"]["has_name"],true);
  let saved=store.request(&json!({"action":"workbench_save_file","id":"wb-1","path":"SKILL.md","revision":1,"text":"---\nname: Updated Title\ndescription: Updated desc\ndomain: ui\n---\nSee [ref](references/guide.md).\n"})).unwrap();
  assert_eq!(saved["skill"]["title"],"Updated Title");
  assert_eq!(saved["validation"]["references_ok"],false);
  let added=store.request(&json!({"action":"workbench_add_files","id":"wb-1","files":[{"path":"references/guide.md","text":"Guide text"}]})).unwrap();
  assert_eq!(added["validation"]["references_ok"],true);
  // Community install never overwrites existing skills
  let first=store.install_workshop_skill("hud","HUD Designer","Build HUDs","ui",vec![("SKILL.md".into(),"---\nname: HUD Designer\ndescription: Build HUDs\n---\nUse Scale.".into())],"workshop:PlazCode:reviewed").unwrap();
  let second=store.install_workshop_skill("hud","HUD Designer","Build HUDs","ui",vec![("SKILL.md".into(),"---\nname: HUD Designer\ndescription: Build HUDs\n---\nUse Scale.".into())],"workshop:PlazCode:reviewed").unwrap();
  assert_eq!(first["skill"]["id"],"community-hud");
  assert_eq!(second["skill"]["id"],"community-hud-2");
  assert_eq!(first["skill"]["community"],true);
  let _=std::fs::remove_dir_all(&dir);
 }
 #[test]
 fn reset_community_sync_aborts_stale_apply() {
  let dir=std::env::temp_dir().join(format!("plazcode-sync-epoch-{}",std::process::id()));
  let _=std::fs::remove_dir_all(&dir);
  std::fs::create_dir_all(&dir).unwrap();
  let mut store=Store::load(dir.join("skills.json"));
  let expected_root=crate::profile_paths::data_root();
  let expected_epoch=SYNC_EPOCH.load(std::sync::atomic::Ordering::SeqCst);
  LAST_COMMUNITY_SYNC.store(12345,std::sync::atomic::Ordering::SeqCst);
  reset_community_sync();
  assert_eq!(LAST_COMMUNITY_SYNC.load(std::sync::atomic::Ordering::SeqCst),0);
  let lesson=Skill{id:"sync-test".into(),title:"Sync".into(),description:"Desc".into(),domain:"all".into(),scope:String::new(),steps:vec!["Step".into()],pitfalls:vec![],verification:vec!["Check".into()],confirmed:true,enabled:true,revision:1,community:true,favorite:false,files:vec![],source:String::new(),import_digest:String::new()};
  assert!(apply_community_skills_to_store(&mut store,vec![lesson.clone()],&expected_root,expected_epoch).is_err());
  assert!(apply_community_skills_to_store(&mut store,vec![lesson],&dir,SYNC_EPOCH.load(std::sync::atomic::Ordering::SeqCst)).is_err());
  assert!(!store.data.skills.contains_key("community-sync-test"));
  let _=std::fs::remove_dir_all(&dir);
 }
}
