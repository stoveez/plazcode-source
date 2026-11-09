// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
//! Quality boundary for AI learning. Manual notes/imports remain editable and are never deleted here.
use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::Value;
static NOISE: Lazy<Vec<Regex>>=Lazy::new(||[
 r"(?i)⟦RS-SYS⟧|PLAZCODE MEMORY, PAGE|PLAZCODE CONTINUATION REFERENCE|\[SYSTEM_STATE:",
 r"(?im)^\s*(?:[-*]\s*)?(?:Asked:\s*)?(?:[a-z][a-z0-9_]*\s*[·|]\s*)?(?:result\s*)?(?:Output of ['\x22]|ERROR calling ['\x22])",
 r"(?im)^\s*(?:First request:|Latest request:|Latest reply:)",
 r"(?i)PlazCode startup check:|STARTUP HANDSHAKE|I clicked Start Agent in my installed PlazCode extension",
 r"(?i)PID\s+(?:MEM\s+)?NAME|\d+ running processes|SystemTime\s*\{|scan(?:ned|ning) \d+ files",
].iter().map(|s|Regex::new(s).unwrap()).collect());
fn normalized(s:&str)->String{s.split_whitespace().collect::<Vec<_>>().join(" ")}
pub fn is_noise(text:&str)->bool{NOISE.iter().any(|r|r.is_match(text))}
pub fn rejection(req:&Value,text:&str,max:usize)->Option<String>{
 let reject=|s:&str|Some(s.to_owned());
 if is_noise(text){return reject("Startup messages, chat summaries, tool output and temporary diagnostics are not lasting knowledge. Continue the task without saving this note.");}
 if text.chars().count()>max{return reject("Keep automatic learning to one compact lasting fact or lesson; do not save transcripts or large source dumps.");}
 if crate::vault::refuse_secrets("automatic memory",text).is_err(){return reject("Automatic learning never stores credentials, tokens or passwords.");}
 let Some(context)=req.get("learning_context") else{return None}; // Older clients still get the noise/secret/cap checks.
 if req["frontmatter"]["confidence"].as_str()==Some("low") || req["frontmatter"]["source"].as_str()==Some("AI guess"){return reject("Verify a fact before saving it. Guesses stay in the current chat.");}
 let evidence=normalized(req["evidence"].as_str().unwrap_or(""));
 if evidence.chars().count()<4 || evidence.len()>1200{return reject("Save only a lasting preference, convention or verified lesson, with evidence quoting the user's words or verified project source. Otherwise skip learning and continue the task.");}
 let supports=|key:&str|context[key].as_array().is_some_and(|a|a.iter().filter_map(Value::as_str).any(|s|!is_noise(s)&&normalized(s).contains(&evidence)));
 if supports("user"){return None;}
 if supports("project") {
  let scope=context["project_id"].as_str().unwrap_or("");
  let target=req["project"].as_str().or_else(||req["frontmatter"]["project"].as_str()).unwrap_or("");
  if !scope.is_empty() && target==scope {return None;}
  return reject("A project convention needs the current project scope; do not turn one project's source into a global preference.");
 }
 reject("The evidence was not found in this chat's user requests or successful project reads. Do not save an unsupported memory; continue the task.")
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn transcript_and_protocol_noise_is_never_learning(){for s in ["First request: PlazCode startup check: reply with exactly one fenced json code block", "- Asked: grep_files · resultOutput of 'grep_files': Matches for notion", "resultERROR calling 'list_windows': requires FULL PC ACCESS", "[SYSTEM_STATE: ENGINE=LOCAL]", "276 running processes (top 10 by memory): PID MEM NAME"]{assert!(rejection(&serde_json::json!({}),s,2000).is_some(),"{s}");}}
 #[test]fn supported_compact_facts_work_in_any_language_and_unknown_facts_are_skipped(){
  let r=serde_json::json!({"evidence":"Use tabs","learning_context":{"user":["Use tabs in my code"],"project":[]}});assert!(rejection(&r,"User prefers tabs for indentation.",2000).is_none());
  let r=serde_json::json!({"evidence":"使用中文","learning_context":{"user":["请使用中文回答"],"project":[]}});assert!(rejection(&r,"用户希望使用中文。",2000).is_none());
  let r=serde_json::json!({"evidence":"Prefer red","learning_context":{"user":["Use tabs"],"project":[]}});assert!(rejection(&r,"The user prefers red.",2000).is_some());
 }
 #[test]fn project_source_cannot_leak_to_global_notes(){let mut r=serde_json::json!({"evidence":"local Config","learning_context":{"user":[],"project":["local Config = require(script.Config)"],"project_id":"Game A"}});assert!(rejection(&r,"This game uses a Config module.",2000).is_some());r["project"]=serde_json::json!("Game A");assert!(rejection(&r,"Game A uses a Config module.",2000).is_none());}
}
