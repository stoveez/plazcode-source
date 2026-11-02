// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
//! One durable DeepSeek request gate shared by Chrome/Firefox, tabs and profiles on this computer.
//! Stores timing/opaque lease identifiers only, never chat text, account credentials or project data.
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{fs, path::PathBuf, sync::Mutex};
const MIN_GAP: u64 = 8_000;
const LEASE_MS: u64 = 30_000;
const MAX_WAIT: u64 = 86_400_000;
#[derive(Clone, Default, PartialEq, Serialize, Deserialize)]
struct Lease { owner: String, id: String, until: u64, gap: u64, started: u64 }
#[derive(Clone, Default, PartialEq, Serialize, Deserialize)]
struct State {
    #[serde(default)] next: u64,
    #[serde(default)] active: Option<Lease>,
    #[serde(default)] delivered: Option<Lease>,
    #[serde(default)] blocked: u64,
    #[serde(default)] last_limit: u64,
    #[serde(default)] failures: u32,
    #[serde(default)] last_notice: String,
}
fn id(req: &Value, key: &str) -> anyhow::Result<String> {
    let s=req[key].as_str().unwrap_or("");
    anyhow::ensure!(!s.is_empty() && s.len()<=180 && s.bytes().all(|c|c.is_ascii_alphanumeric() || b"-_:|.".contains(&c)),"Invalid pacing identifier");
    Ok(s.to_owned())
}
impl State {
    fn apply(&mut self, req: &Value, now: u64, jitter: u64) -> anyhow::Result<Value> {
        anyhow::ensure!(req["provider"].as_str()==Some("deepseek"),"Unsupported provider");
        let owner=id(req,"owner")?;
        // An interrupted tab/app never leaves a permanent lock, and cannot reuse an expired grant.
        if self.active.as_ref().is_some_and(|l| l.until<=now) {
            let expired=self.active.take().unwrap();self.next=self.next.max(expired.until.saturating_add(expired.gap));
        }
        let gap=req["gap_ms"].as_u64().unwrap_or(MIN_GAP).clamp(MIN_GAP,120_000).saturating_add(jitter.min(1_800));
        match req["action"].as_str().unwrap_or("") {
            "claim" => {
                let token=id(req,"id")?;
                if self.blocked>now {return Ok(json!({"ok":true,"allowed":false,"paused":true,"wait_ms":self.blocked-now,"error":"DeepSeek asked PlazCode to pause. Wait for the cooldown and resolve any notice on DeepSeek before starting again."}));}
                if let Some(active)=&self.active {
                    if active.owner==owner && active.id==token {return Ok(json!({"ok":true,"allowed":true,"id":active.id,"valid_until":active.until}));}
                    return Ok(json!({"ok":true,"allowed":false,"wait_ms":(active.until-now).min(1_500)}));
                }
                if self.next>now {return Ok(json!({"ok":true,"allowed":false,"wait_ms":self.next-now}));}
                let lease=Lease{owner,id:token.clone(),until:now.saturating_add(LEASE_MS),gap,started:now};
                self.active=Some(lease.clone());
                Ok(json!({"ok":true,"allowed":true,"id":token,"valid_until":lease.until}))
            }
            "finish" => {
                let token=id(req,"id")?;
                if self.active.as_ref().is_some_and(|l| l.owner==owner && l.id==token) {
                    let lease=self.active.take().unwrap();self.next=self.next.max(now.saturating_add(lease.gap));
                    if req["sent"].as_bool()==Some(true) {self.delivered=Some(lease);}
                }
                Ok(json!({"ok":true}))
            }
            "observe" => {
                // A trusted native user action is counted, never delayed. Revoke not-yet-committed automation.
                self.next=self.next.max(now.saturating_add(gap));self.active=None;
                Ok(json!({"ok":true}))
            }
            "limit" => {
                let notice=id(req,"notice")?;
                if self.last_notice!=notice {
                    self.failures=self.failures.saturating_add(1);self.last_notice=notice;self.last_limit=now;
                    let restricted=req["restricted"].as_bool()==Some(true);
                    let base:u64=if restricted || self.failures>=3 {900_000} else if req["rate"].as_bool()==Some(true) {60_000} else {30_000};
                    let backoff=base.saturating_mul(1u64 << self.failures.saturating_sub(1).min(3)).min(900_000);
                    let reported=req["wait_ms"].as_u64().unwrap_or(0).min(MAX_WAIT);
                    self.blocked=self.blocked.max(now.saturating_add(backoff.max(reported)));
                    self.next=self.next.max(self.blocked);self.active=None;
                }
                Ok(json!({"ok":true,"retry":self.failures<3 && req["restricted"].as_bool()!=Some(true),"wait_ms":self.blocked.saturating_sub(now),"failures":self.failures}))
            }
            "healthy" => {
                let token=id(req,"id")?;
                if self.delivered.as_ref().is_some_and(|l|l.owner==owner && l.id==token && l.started>=self.last_limit) {self.failures=0;}
                Ok(json!({"ok":true}))
            }
            _ => anyhow::bail!("Unknown pacing action"),
        }
    }
}
struct Store { path: PathBuf, state: State }
impl Store {
    fn load(path: PathBuf) -> anyhow::Result<Self> {
        let state=match fs::read(&path) {Ok(raw)=>serde_json::from_slice(&raw)?,Err(e) if e.kind()==std::io::ErrorKind::NotFound=>State::default(),Err(e)=>return Err(e.into())};
        Ok(Self{path,state})
    }
    fn update(&mut self, req: &Value, now: u64, jitter: u64) -> anyhow::Result<Value> {
        let mut next=self.state.clone();let response=next.apply(req,now,jitter)?;
        if let Some(parent)=self.path.parent(){fs::create_dir_all(parent)?;}
        if next==self.state {return Ok(response);}
        let temp=self.path.with_extension("tmp");fs::write(&temp,serde_json::to_vec(&next)?)?;fs::rename(&temp,&self.path)?;
        self.state=next;Ok(response)
    }
}
static STORE: Lazy<Mutex<anyhow::Result<Store>>> = Lazy::new(||Mutex::new(Store::load(crate::profile_paths::legacy_data_root().join("provider-pacing.json"))));
pub async fn post(axum::Json(req):axum::Json<Value>) -> axum::response::Response {
    use axum::response::IntoResponse;
    let now=chrono::Utc::now().timestamp_millis().max(0) as u64;
    let mut random=[0u8;2];
    if getrandom::getrandom(&mut random).is_err(){return (axum::http::StatusCode::SERVICE_UNAVAILABLE,axum::Json(json!({"ok":false,"error":"Request pacing is unavailable; no send was authorized."}))).into_response();}
    let jitter=u16::from_be_bytes(random) as u64%1801;
    let result=STORE.lock().unwrap_or_else(|e|e.into_inner()).as_mut().map_err(|_|anyhow::anyhow!("The shared request timer could not be read. Restart PlazCode; no request was authorized.")).and_then(|s|s.update(&req,now,jitter));
    match result {Ok(v)=>axum::Json(v).into_response(),Err(e)=>(axum::http::StatusCode::BAD_REQUEST,axum::Json(json!({"ok":false,"error":e.to_string()}))).into_response()}
}
#[cfg(test)] mod tests {
 use super::*;
 fn req(action:&str,owner:&str,id:&str)->Value{json!({"provider":"deepseek","action":action,"owner":owner,"id":id})}
 #[test] fn tabs_browsers_and_restarts_share_completion_cooldown(){
  let dir=std::env::temp_dir().join(format!("plazcode-pace-test-{}",std::process::id()));let _=fs::remove_dir_all(&dir);let path=dir.join("pace.json");let mut s=Store::load(path.clone()).unwrap();
  assert_eq!(s.update(&req("claim","chrome","a"),1000,900).unwrap()["allowed"],true);
  assert_eq!(s.update(&req("claim","firefox","b"),1000,0).unwrap()["allowed"],false);
  s.update(&req("finish","chrome","a"),4000,0).unwrap();drop(s);
  let mut s=Store::load(path).unwrap();assert_eq!(s.update(&req("claim","firefox","b"),12000,0).unwrap()["wait_ms"],900);
  assert_eq!(s.update(&req("claim","firefox","b"),12900,0).unwrap()["allowed"],true);let _=fs::remove_dir_all(dir);
 }
 #[test] fn manual_activity_expired_grants_and_wrong_owners_cannot_bypass(){
  let mut s=State::default();s.apply(&req("claim","a","one"),1000,0).unwrap();
  s.apply(&req("finish","other","one"),1001,0).unwrap();assert!(s.active.is_some());
  s.apply(&req("observe","b","manual"),1100,0).unwrap();assert!(s.active.is_none());
  assert_eq!(s.apply(&req("claim","a","two"),1101,0).unwrap()["wait_ms"],7999);
  s.apply(&req("claim","a","two"),9100,0).unwrap();
  assert_eq!(s.apply(&req("claim","b","three"),39100,0).unwrap()["wait_ms"],8000);
 }
 #[test] fn repeated_limits_pause_every_client_and_respect_reported_wait(){
  let mut s=State::default();for i in 1..=3 {let v=s.apply(&json!({"provider":"deepseek","action":"limit","owner":"a","notice":format!("n{i}"),"rate":true,"wait_ms":120000}),i*1000,0).unwrap();assert!(v["wait_ms"].as_u64().unwrap()>=120000);assert_eq!(v["retry"],i<3);}
  assert_eq!(s.apply(&req("claim","b","one"),4000,0).unwrap()["paused"],true);
  let failures=s.failures;s.apply(&json!({"provider":"deepseek","action":"limit","owner":"a","notice":"n3"}),4001,0).unwrap();assert_eq!(s.failures,failures);
 }
}
