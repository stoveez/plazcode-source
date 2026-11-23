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
const WINDOW_2M_MS: u64 = 120_000;
const WINDOW_10M_MS: u64 = 600_000;
const WINDOW_1H_MS: u64 = 3_600_000;
const WINDOW_24H_MS: u64 = 86_400_000;
const HEAT_DECAY_MS: u64 = 15_000;
const BATCH_4_COOLDOWN_MS: u64 = 20_000;
const HIGH_HEAT_COOLDOWN_MS: u64 = 15_000;
const BREATHER_COOLDOWN_MS: u64 = 25_000;
const RISK_LOCK_MS: u64 = 300_000;
const LIMIT_RUN_TOOLS: u32 = 4;
const LIMIT_SENDS_2M: usize = 3;
const LIMIT_SENDS_10M: usize = 9;
const LIMIT_TOOLS_10M: usize = 8;
const LIMIT_SENDS_1H: usize = 24;
const LIMIT_TOOLS_1H: usize = 20;
const LIMIT_SENDS_24H: usize = 90;
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
    #[serde(default)] heat: u8,
    #[serde(default)] heat_updated_at: u64,
    #[serde(default)] run_tools: u32,
    #[serde(default)] send_timestamps: Vec<u64>,
    #[serde(default)] tool_timestamps: Vec<u64>,
    #[serde(default)] cooldown_until: u64,
    #[serde(default)] cooldown_reason: String,
    #[serde(default)] cooldown_duration_ms: u64,
    #[serde(default)] cooldown_trigger_heat: u8,
    #[serde(default)] pending_reset_mode: String,
    #[serde(default)] risk_lock_until: u64,
    #[serde(default)] risk_lock_reason: String,
    #[serde(default)] compressed_count: u32,
    #[serde(default)] duplicate_count: u32,
    #[serde(default)] error_streak: u32,
}
fn id(req: &Value, key: &str) -> anyhow::Result<String> {
    let s=req[key].as_str().unwrap_or("");
    anyhow::ensure!(!s.is_empty() && s.len()<=180 && s.bytes().all(|c|c.is_ascii_alphanumeric() || b"-_:|.".contains(&c)),"Invalid pacing identifier");
    Ok(s.to_owned())
}
fn count_since(list: &[u64], cutoff: u64) -> usize {
    list.iter().filter(|&&t| t >= cutoff).count()
}
fn push_ts(list: &mut Vec<u64>, ts: u64) {
    list.push(ts);
    if list.len() > 300 {
        let excess = list.len() - 300;
        list.drain(0..excess);
    }
}
impl State {
    fn prune_and_decay(&mut self, now: u64) {
        let cutoff = now.saturating_sub(WINDOW_24H_MS);
        self.send_timestamps.retain(|&t| t >= cutoff && t <= now.saturating_add(60_000));
        self.tool_timestamps.retain(|&t| t >= cutoff && t <= now.saturating_add(60_000));
        if self.risk_lock_until > 0 && now >= self.risk_lock_until {
            self.risk_lock_until = 0;
            self.risk_lock_reason.clear();
            self.heat = self.heat.min(12);
            self.heat_updated_at = now;
        }
        if self.cooldown_until > 0 && now >= self.cooldown_until {
            match self.pending_reset_mode.as_str() {
                "full_zero" => {
                    self.heat = 0;
                    self.run_tools = 0;
                }
                "cool_safe" => {
                    self.heat = self.heat.min(12);
                }
                "cool_warning" => {
                    self.heat = self.heat.min(15);
                }
                _ => {}
            }
            self.cooldown_until = 0;
            self.cooldown_reason.clear();
            self.cooldown_duration_ms = 0;
            self.cooldown_trigger_heat = 0;
            self.pending_reset_mode.clear();
            self.heat_updated_at = now;
        } else if self.risk_lock_until == 0 && self.cooldown_until == 0 && self.heat > 0 && self.heat_updated_at > 0 && now > self.heat_updated_at {
            let decays = ((now - self.heat_updated_at) / HEAT_DECAY_MS) as u64;
            if decays > 0 {
                let drop = decays.min(100) as u8;
                self.heat = self.heat.saturating_sub(drop);
                self.heat_updated_at = self.heat_updated_at.saturating_add(decays.saturating_mul(HEAT_DECAY_MS));
            }
        }
    }
    fn start_cooldown(&mut self, now: u64, duration_ms: u64, reason: &str, reset_mode: &str) {
        let until = now.saturating_add(duration_ms);
        if until >= self.cooldown_until {
            self.cooldown_until = until;
            self.cooldown_reason = reason.to_string();
            self.cooldown_duration_ms = duration_ms;
            self.cooldown_trigger_heat = self.heat;
            self.pending_reset_mode = reset_mode.to_string();
        }
    }
    fn trigger_risk_lock(&mut self, now: u64, reason: &str) {
        self.heat = 100;
        self.heat_updated_at = now;
        self.risk_lock_until = self.risk_lock_until.max(now.saturating_add(RISK_LOCK_MS));
        self.risk_lock_reason = reason.chars().take(180).collect();
        self.active = None;
    }
    fn reset_shield(&mut self, now: u64) {
        self.risk_lock_until = 0;
        self.risk_lock_reason.clear();
        self.blocked = 0;
        self.failures = 0;
        self.last_notice.clear();
        self.cooldown_until = 0;
        self.cooldown_reason.clear();
        self.cooldown_duration_ms = 0;
        self.cooldown_trigger_heat = 0;
        self.pending_reset_mode.clear();
        self.error_streak = 0;
        self.heat = self.heat.min(12);
        self.heat_updated_at = now;
    }
    fn antiban_snapshot(&self, now: u64) -> Value {
        let sends_2m = count_since(&self.send_timestamps, now.saturating_sub(WINDOW_2M_MS));
        let sends_10m = count_since(&self.send_timestamps, now.saturating_sub(WINDOW_10M_MS));
        let sends_1h = count_since(&self.send_timestamps, now.saturating_sub(WINDOW_1H_MS));
        let sends_24h = count_since(&self.send_timestamps, now.saturating_sub(WINDOW_24H_MS));
        let tools_10m = count_since(&self.tool_timestamps, now.saturating_sub(WINDOW_10M_MS));
        let tools_1h = count_since(&self.tool_timestamps, now.saturating_sub(WINDOW_1H_MS));
        let risk_lock_until = self.risk_lock_until.max(self.blocked);
        let risk_lock_remaining_ms = risk_lock_until.saturating_sub(now);
        let cooldown_remaining_ms = self.cooldown_until.saturating_sub(now);
        let tier: u8 = if risk_lock_remaining_ms > 0 { 2 } else if cooldown_remaining_ms > 0 { 1 } else { 0 };
        let label = if risk_lock_remaining_ms > 0 {
            "Risk Lock"
        } else if cooldown_remaining_ms > 0 {
            "Cooldown"
        } else if self.heat < 20 {
            "Safe"
        } else {
            "Heated"
        };
        json!({
            "ok": true,
            "tier": tier,
            "heat": self.heat,
            "label": label,
            "run_tools": self.run_tools,
            "run_limit": LIMIT_RUN_TOOLS,
            "sends_2m": sends_2m,
            "sends_10m": sends_10m,
            "tools_10m": tools_10m,
            "sends_1h": sends_1h,
            "tools_1h": tools_1h,
            "sends_24h": sends_24h,
            "limits": {
                "run_tools": LIMIT_RUN_TOOLS,
                "sends_2m": LIMIT_SENDS_2M,
                "sends_10m": LIMIT_SENDS_10M,
                "tools_10m": LIMIT_TOOLS_10M,
                "sends_1h": LIMIT_SENDS_1H,
                "tools_1h": LIMIT_TOOLS_1H,
                "sends_24h": LIMIT_SENDS_24H
            },
            "cooldown_until": self.cooldown_until,
            "cooldown_remaining_ms": cooldown_remaining_ms,
            "cooldown_reason": self.cooldown_reason,
            "cooldown_duration_ms": self.cooldown_duration_ms,
            "cooldown_trigger_heat": self.cooldown_trigger_heat,
            "risk_lock_until": risk_lock_until,
            "risk_lock_remaining_ms": risk_lock_remaining_ms,
            "risk_lock_reason": self.risk_lock_reason,
            "heat_updated_at": self.heat_updated_at,
            "compressed_count": self.compressed_count,
            "duplicate_count": self.duplicate_count,
            "error_streak": self.error_streak
        })
    }
    fn apply(&mut self, req: &Value, now: u64, jitter: u64) -> anyhow::Result<Value> {
        anyhow::ensure!(req["provider"].as_str()==Some("deepseek"),"Unsupported provider");
        let owner=id(req,"owner")?;
        self.prune_and_decay(now);
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
            "validate" => {
                let token=id(req,"id")?;
                let allowed=self.blocked<=now && self.active.as_ref().is_some_and(|l|l.owner==owner && l.id==token && l.until>now);
                Ok(json!({"ok":true,"allowed":allowed}))
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
                    self.trigger_risk_lock(now, "DeepSeek rate-limit / account notice");
                }
                Ok(json!({"ok":true,"retry":self.failures<3 && req["restricted"].as_bool()!=Some(true),"wait_ms":self.blocked.saturating_sub(now),"failures":self.failures}))
            }
            "healthy" => {
                let token=id(req,"id")?;
                if self.delivered.as_ref().is_some_and(|l|l.owner==owner && l.id==token && l.started>=self.last_limit) {self.failures=0;}
                Ok(json!({"ok":true}))
            }
            "antiban_status" => Ok(self.antiban_snapshot(now)),
            "antiban_reset_shield" => {
                self.reset_shield(now);
                Ok(self.antiban_snapshot(now))
            }
            "antiban_record" => {
                let kind = req["kind"].as_str().unwrap_or("");
                let chars = req["chars"].as_u64().unwrap_or(0);
                let compressed = req["compressed"].as_bool() == Some(true);
                let is_error = req["is_error"].as_bool() == Some(true);
                if compressed {
                    self.compressed_count = self.compressed_count.saturating_add(1);
                }
                match kind {
                    "tool_send" => {
                        push_ts(&mut self.send_timestamps, now);
                        push_ts(&mut self.tool_timestamps, now);
                        self.run_tools = self.run_tools.saturating_add(1);
                        if !is_error {
                            self.error_streak = 0;
                        }
                        let sends_2m = count_since(&self.send_timestamps, now.saturating_sub(WINDOW_2M_MS));
                        let sends_10m = count_since(&self.send_timestamps, now.saturating_sub(WINDOW_10M_MS));
                        let sends_1h = count_since(&self.send_timestamps, now.saturating_sub(WINDOW_1H_MS));
                        let mut delta: u8 = req["heat_delta"].as_u64().map(|n| n.min(100) as u8).unwrap_or(12);
                        if chars > 12_000 { delta = delta.saturating_add(6); }
                        if sends_2m >= 3 { delta = delta.saturating_add(10); }
                        if sends_10m >= 7 { delta = delta.saturating_add(8); }
                        if sends_1h >= 18 { delta = delta.saturating_add(8); }
                        self.heat = self.heat.saturating_add(delta).min(100);
                        self.heat_updated_at = now;
                    }
                    "manual_send" => {
                        push_ts(&mut self.send_timestamps, now);
                        self.error_streak = 0;
                        let delta: u8 = req["heat_delta"].as_u64().map(|n| n.min(100) as u8).unwrap_or(6);
                        self.heat = self.heat.saturating_add(delta).min(100);
                        self.heat_updated_at = now;
                    }
                    "duplicate" => {
                        self.duplicate_count = self.duplicate_count.saturating_add(1);
                        let delta: u8 = req["heat_delta"].as_u64().map(|n| n.min(100) as u8).unwrap_or(15);
                        self.heat = self.heat.saturating_add(delta).min(100);
                        self.heat_updated_at = now;
                    }
                    "tool_error" => {
                        self.error_streak = self.error_streak.saturating_add(1);
                        let delta: u8 = req["heat_delta"].as_u64().map(|n| n.min(100) as u8).unwrap_or(12);
                        self.heat = self.heat.saturating_add(delta).min(100);
                        self.heat_updated_at = now;
                    }
                    "site_warning" => {
                        let reason = req["reason"].as_str().unwrap_or("WAF / rate-limit / CAPTCHA detected");
                        self.trigger_risk_lock(now, reason);
                    }
                    "manual_cool" => {
                        self.heat_updated_at = now;
                        self.start_cooldown(now, BATCH_4_COOLDOWN_MS, "manual_cool", "full_zero");
                    }
                    "reset_shield" => {
                        self.reset_shield(now);
                    }
                    _ => anyhow::bail!("Unknown antiban kind"),
                }

                let sends_2m = count_since(&self.send_timestamps, now.saturating_sub(WINDOW_2M_MS));
                let sends_10m = count_since(&self.send_timestamps, now.saturating_sub(WINDOW_10M_MS));
                let sends_1h = count_since(&self.send_timestamps, now.saturating_sub(WINDOW_1H_MS));
                let sends_24h = count_since(&self.send_timestamps, now.saturating_sub(WINDOW_24H_MS));
                let tools_10m = count_since(&self.tool_timestamps, now.saturating_sub(WINDOW_10M_MS));
                let tools_1h = count_since(&self.tool_timestamps, now.saturating_sub(WINDOW_1H_MS));

                if kind != "site_warning" && kind != "manual_cool" && kind != "reset_shield" {
                    let is_send = matches!(kind, "tool_send" | "manual_send");
                    if kind == "tool_send" && self.run_tools >= LIMIT_RUN_TOOLS {
                        self.start_cooldown(now, BATCH_4_COOLDOWN_MS, "batch_4_tools", "full_zero");
                    } else if self.heat > 80 {
                        self.start_cooldown(now, HIGH_HEAT_COOLDOWN_MS, "high_heat", "cool_safe");
                    } else if is_send
                        && ((self.heat >= 75 && sends_2m >= LIMIT_SENDS_2M)
                            || sends_2m > LIMIT_SENDS_2M
                            || sends_10m > LIMIT_SENDS_10M
                            || tools_10m > LIMIT_TOOLS_10M
                            || sends_1h > LIMIT_SENDS_1H
                            || tools_1h > LIMIT_TOOLS_1H
                            || sends_24h > LIMIT_SENDS_24H)
                    {
                        self.start_cooldown(now, BREATHER_COOLDOWN_MS, "velocity_breather", "cool_safe");
                    }
                }
                Ok(self.antiban_snapshot(now))
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
 #[test] fn grants_are_owned_and_manual_or_rate_activity_revokes_them(){
  let mut s=State::default();s.apply(&req("claim","chrome","one"),1000,0).unwrap();
  assert_eq!(s.apply(&req("validate","firefox","one"),1001,0).unwrap()["allowed"],false);
  assert_eq!(s.apply(&req("validate","chrome","one"),1001,0).unwrap()["allowed"],true);
  s.apply(&req("observe","firefox","manual"),1002,0).unwrap();
  assert_eq!(s.apply(&req("validate","chrome","one"),1003,0).unwrap()["allowed"],false);
  s.apply(&req("claim","chrome","two"),9002,0).unwrap();
  s.apply(&json!({"provider":"deepseek","action":"limit","owner":"firefox","notice":"limit","restricted":true}),9003,0).unwrap();
  assert_eq!(s.apply(&req("validate","chrome","two"),9004,0).unwrap()["allowed"],false);
  assert!(s.apply(&req("claim","chrome","three"),9004,0).unwrap()["wait_ms"].as_u64().unwrap()>=900000-1);
 }
 #[test] fn repeated_limits_pause_every_client_and_respect_reported_wait(){
  let mut s=State::default();for i in 1..=3 {let v=s.apply(&json!({"provider":"deepseek","action":"limit","owner":"a","notice":format!("n{i}"),"rate":true,"wait_ms":120000}),i*1000,0).unwrap();assert!(v["wait_ms"].as_u64().unwrap()>=120000);assert_eq!(v["retry"],i<3);}
  assert_eq!(s.apply(&req("claim","b","one"),4000,0).unwrap()["paused"],true);
  let failures=s.failures;s.apply(&json!({"provider":"deepseek","action":"limit","owner":"a","notice":"n3"}),4001,0).unwrap();assert_eq!(s.failures,failures);
 }
 #[test] fn antiban_four_tools_triggers_20s_cooldown_and_resets_heat_to_zero(){
  let mut s=State::default();
  for i in 1..=3 {
   let snap=s.apply(&json!({"provider":"deepseek","action":"antiban_record","owner":"chrome:1","kind":"tool_send","chars":400}),i*5000,0).unwrap();
   assert_eq!(snap["run_tools"],i);
   assert_eq!(snap["cooldown_remaining_ms"],0);
  }
  let fourth=s.apply(&json!({"provider":"deepseek","action":"antiban_record","owner":"chrome:1","kind":"tool_send","chars":400}),20_000,0).unwrap();
  assert_eq!(fourth["label"],"Cooldown");
  assert_eq!(fourth["cooldown_reason"],"batch_4_tools");
  assert_eq!(fourth["cooldown_remaining_ms"],20_000);
  let after=s.apply(&json!({"provider":"deepseek","action":"antiban_status","owner":"chrome:1"}),40_000,0).unwrap();
  assert_eq!(after["heat"],0);
  assert_eq!(after["run_tools"],0);
  assert_eq!(after["label"],"Safe");
 }
 #[test] fn antiban_heat_over_80_forces_15s_cooldown_and_cools_to_safe(){
  let mut s=State::default();
  s.heat=75;s.heat_updated_at=100_000;
  let snap=s.apply(&json!({"provider":"deepseek","action":"antiban_record","owner":"chrome:1","kind":"tool_send","chars":200}),105_000,0).unwrap();
  assert_eq!(snap["heat"],87);
  assert_eq!(snap["label"],"Cooldown");
  assert_eq!(snap["tier"],1);
  assert_eq!(snap["cooldown_reason"],"high_heat");
  assert_eq!(snap["cooldown_remaining_ms"],15_000);
  let after=s.apply(&json!({"provider":"deepseek","action":"antiban_status","owner":"chrome:1"}),120_000,0).unwrap();
  assert!(after["heat"].as_u64().unwrap()<=12);
  assert_eq!(after["label"],"Safe");
 }
 #[test] fn antiban_rolling_quotas_trigger_25s_breather_and_tier2_risk_lock_5m_resets(){
  let mut s=State::default();
  // Exceed 2m send cap (3 sends allowed -> 4th manual_send triggers 25s Tier 1 breather)
  for i in 1..=3 {
   s.apply(&json!({"provider":"deepseek","action":"antiban_record","owner":"chrome:1","kind":"manual_send"}),10_000+i*1000,0).unwrap();
  }
  let burst=s.apply(&json!({"provider":"deepseek","action":"antiban_record","owner":"chrome:1","kind":"manual_send"}),15_000,0).unwrap();
  assert_eq!(burst["tier"],1);
  assert_eq!(burst["cooldown_reason"],"velocity_breather");
  assert_eq!(burst["cooldown_remaining_ms"],25_000);
  let settled=s.apply(&json!({"provider":"deepseek","action":"antiban_status","owner":"chrome:1"}),40_000,0).unwrap();
  assert!(settled["heat"].as_u64().unwrap()<=12);
  assert_eq!(settled["label"],"Safe");

  // Tier 2 WAF / CAPTCHA triggers 5-minute Risk Lock (heat=100) and Reset Shield unlocks cleanly
  let lock=s.apply(&json!({"provider":"deepseek","action":"antiban_record","owner":"chrome:1","kind":"site_warning","reason":"Turnstile detected"}),50_000,0).unwrap();
  assert_eq!(lock["tier"],2);
  assert_eq!(lock["label"],"Risk Lock");
  assert_eq!(lock["heat"],100);
  assert_eq!(lock["risk_lock_remaining_ms"],300_000);
  let unlocked=s.apply(&json!({"provider":"deepseek","action":"antiban_reset_shield","owner":"chrome:1"}),55_000,0).unwrap();
  assert_eq!(unlocked["tier"],0);
  assert_eq!(unlocked["label"],"Safe");
  assert_eq!(unlocked["heat"],12);
  assert_eq!(unlocked["risk_lock_remaining_ms"],0);
 }
}
