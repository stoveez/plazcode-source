// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
//! Blender in the background (no window): PlazCode starts `blender --background` with its own controller script
//! and talks to it over stdin / stdout. No network port, so nothing can be "already in use".
//!
//! Protocol (also at the top of `agent/blender_controller.py`): one JSON object per line to Blender; every reply is
//! one line starting with `PZ1 ` followed by JSON; everything else Blender prints is kept only as a detail log.
//! One request at a time; a second caller waits its turn. Blender starts on first use (own 60 s limit), is never
//! restarted behind a request that may have changed the scene, and ends when PlazCode ends (stdin closes).
//! The controller and the Blender actions file are built into the app and written to a per-session folder, so a
//! changed file on disk can never be what runs.
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};

pub const PROTOCOL: u64 = 1;
pub const START_LIMIT: Duration = Duration::from_secs(60);
const IDLE_LIMIT: Duration = Duration::from_secs(600);
const CONTROLLER: &str = include_str!("../blender_controller.py");
const OPS: &str = include_str!("../../blender_ops.py");

type Detail = Arc<Mutex<VecDeque<String>>>;

fn remember(detail: &Detail, line: &str) {
    let mut lines = detail.lock().unwrap_or_else(|error| error.into_inner());
    if lines.len() == 200 { lines.pop_front(); }
    lines.push_back(line.chars().take(500).collect());
}

fn detail_text(detail: &Detail) -> String {
    detail.lock().unwrap_or_else(|error| error.into_inner()).iter().cloned().collect::<Vec<_>>().join("\n")
}

/// One running background Blender.
pub struct Session {
    child: Child,
    stdin: ChildStdin,
    replies: tokio::sync::mpsc::UnboundedReceiver<Value>,
    next_id: u64,
    detail: Detail,
    folder: PathBuf,
    pub version: String,
    last_used: Instant,
}

/// A reply line is `PZ1 <json object>`; anything else is Blender talking to itself.
pub fn parse_reply(line: &str) -> Option<Value> {
    serde_json::from_str::<Value>(line.trim().strip_prefix("PZ1 ")?).ok().filter(Value::is_object)
}

fn session_folder() -> PathBuf {
    static RUN: AtomicU64 = AtomicU64::new(0);
    std::env::temp_dir().join(format!("plazcode-blender-{}-{}", std::process::id(), RUN.fetch_add(1, Ordering::Relaxed)))
}

impl Session {
    /// Start Blender and wait until its controller says it is ready.
    pub async fn start(program: &Path, limit: Duration, envs: &[(&str, &str)]) -> anyhow::Result<Session> {
        let folder = session_folder();
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder)?;
        let controller = folder.join("blender_controller.py");
        std::fs::write(&controller, CONTROLLER)?;
        std::fs::write(folder.join("blender_ops.py"), OPS)?;
        let mut command = Command::new(program);
        command.args(["--background", "--factory-startup", "--python"]).arg(&controller).arg("--").arg("--session").arg(&folder)
            .current_dir(&folder).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
        for (key, value) in envs { command.env(key, value); }
        #[cfg(windows)]
        command.creation_flags(0x0800_0000);
        let mut child = command.spawn().map_err(|error| anyhow::anyhow!("Blender could not be started ({error}). Check that Blender is still installed at {}.", program.display()))?;
        let detail: Detail = Arc::new(Mutex::new(VecDeque::new()));
        if let Some(stderr) = child.stderr.take() {
            let detail = detail.clone();
            tokio::spawn(async move { let mut lines = BufReader::new(stderr).lines(); while let Ok(Some(line)) = lines.next_line().await { remember(&detail, &line); } });
        }
        let stdout = child.stdout.take().ok_or_else(|| anyhow::anyhow!("Blender's output could not be read."))?;
        let stdin = child.stdin.take().ok_or_else(|| anyhow::anyhow!("Blender's input could not be opened."))?;
        // A reader task owns stdout, so a caller that gives up never leaves half a line behind.
        let (sender, replies) = tokio::sync::mpsc::unbounded_channel();
        { let detail = detail.clone(); tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                match parse_reply(&line) { Some(reply) => { if sender.send(reply).is_err() { break; } } None => if !line.trim().is_empty() { remember(&detail, &line); } }
            }
        }); }
        let mut session = Session { child, stdin, replies, next_id: 0, detail, folder, version: String::new(), last_used: Instant::now() };
        let hello = match tokio::time::timeout(limit, session.replies.recv()).await {
            Ok(Some(hello)) => hello,
            Ok(None) => { let text = session.failure_detail(); session.stop().await; anyhow::bail!("Blender closed while it was starting.{text}"); }
            Err(_) => { let text = session.failure_detail(); session.stop().await; anyhow::bail!("Blender did not start within {} seconds.{text}", limit.as_secs()); }
        };
        if hello["event"] != "ready" {
            let message = hello["message"].as_str().unwrap_or("Blender's controller did not start.").to_string();
            session.stop().await;
            anyhow::bail!("{message}");
        }
        if hello["protocol"].as_u64() != Some(PROTOCOL) {
            session.stop().await;
            anyhow::bail!("This Blender controller speaks a newer language than this PlazCode. Update PlazCode, then try again.");
        }
        session.version = hello["blender"].as_str().unwrap_or("").to_string();
        Ok(session)
    }

    fn failure_detail(&self) -> String {
        let text = detail_text(&self.detail);
        if text.trim().is_empty() { String::new() } else { format!(" Details: {}", text.chars().rev().take(600).collect::<String>().chars().rev().collect::<String>()) }
    }

    pub fn alive(&mut self) -> bool { matches!(self.child.try_wait(), Ok(None)) }

    /// Send one request and wait for its own reply. Late replies to requests a caller gave up on are skipped.
    /// `Err` means Blender is gone or silent: the caller must drop this session (the scene is lost).
    pub async fn request(&mut self, mut body: Value, limit: Duration) -> anyhow::Result<Value> {
        self.next_id += 1;
        let id = self.next_id;
        body["id"] = json!(id);
        self.last_used = Instant::now();
        let line = body.to_string() + "\n";
        let exchange = async {
            self.stdin.write_all(line.as_bytes()).await?;
            self.stdin.flush().await?;
            loop {
                match self.replies.recv().await {
                    Some(reply) if reply["id"].as_u64() == Some(id) => return Ok::<Value, anyhow::Error>(reply),
                    Some(_) => continue,
                    None => anyhow::bail!("closed"),
                }
            }
        };
        let outcome = tokio::time::timeout(limit, exchange).await;
        self.last_used = Instant::now();
        match outcome {
            Ok(Ok(reply)) => Ok(reply),
            Ok(Err(_)) => anyhow::bail!("Blender closed unexpectedly while it was working. PlazCode starts a fresh background Blender on the next command, with an empty scene; anything not saved or exported is gone. The command was not repeated.{}", self.failure_detail()),
            Err(_) => anyhow::bail!("Blender did not answer within {} seconds, so PlazCode stopped it. A fresh background Blender starts on the next command, with an empty scene. The command was not repeated.", limit.as_secs()),
        }
    }

    /// Ask Blender to leave, then make sure it is gone and remove the session folder.
    pub async fn stop(mut self) {
        let _ = self.stdin.write_all(b"{\"type\":\"quit\"}\n").await;
        let _ = self.stdin.flush().await;
        if tokio::time::timeout(Duration::from_secs(3), self.child.wait()).await.is_err() { let _ = self.child.start_kill(); let _ = tokio::time::timeout(Duration::from_secs(2), self.child.wait()).await; }
        let _ = std::fs::remove_dir_all(&self.folder);
    }

    pub fn folder(&self) -> &Path { &self.folder }
}

/// The controller's reply in the shape the Blender addon socket uses, so the rest of PlazCode sees no difference.
pub fn addon_shape(reply: &Value) -> Value {
    if reply["ok"] == true { return json!({"status": "success", "result": reply["result"]}); }
    let message = match reply["error"].as_str() {
        Some("safe_mode") => crate::blender::SAFE_MODE_MESSAGE.to_string(),
        Some("unknown_op") => "This Blender command is not available in the background mode of this PlazCode version. Update PlazCode and the extension together.".to_string(),
        _ => reply["message"].as_str().unwrap_or("Blender reported an error.").to_string(),
    };
    json!({"status": "error", "message": message})
}

// ---- The app's one shared background Blender ---------------------------------------------------------------------

/// What the setup window shows for the background Blender.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Status { Stopped, Starting, Running(String), Failed(String) }

static SESSION: once_cell::sync::Lazy<tokio::sync::Mutex<Option<Session>>> = once_cell::sync::Lazy::new(|| tokio::sync::Mutex::new(None));
static STARTING: AtomicBool = AtomicBool::new(false);
static STATUS: Mutex<Status> = Mutex::new(Status::Stopped);

fn set_status(status: Status) { *STATUS.lock().unwrap_or_else(|error| error.into_inner()) = status; }
pub fn status() -> Status { STATUS.lock().unwrap_or_else(|error| error.into_inner()).clone() }

/// Start Blender in a task of its own, so a caller that stops waiting never kills a start that is under way.
fn kick_start(program: PathBuf) {
    if STARTING.swap(true, Ordering::SeqCst) { return; }
    set_status(Status::Starting);
    tokio::spawn(async move {
        let started = Session::start(&program, START_LIMIT, &[]).await;
        let mut slot = SESSION.lock().await;
        match started {
            Ok(session) => { set_status(Status::Running(session.version.clone())); *slot = Some(session); tokio::spawn(idle_watch()); }
            Err(error) => { tracing::warn!("Background Blender did not start: {error}"); set_status(Status::Failed(error.to_string())); }
        }
        STARTING.store(false, Ordering::SeqCst);
    });
}

async fn idle_watch() {
    loop {
        tokio::time::sleep(Duration::from_secs(30)).await;
        let mut slot = SESSION.lock().await;
        let Some(session) = slot.as_mut() else { return; };
        if !session.alive() { *slot = None; set_status(Status::Stopped); return; }
        if session.last_used.elapsed() >= IDLE_LIMIT {
            if let Some(session) = slot.take() { session.stop().await; }
            set_status(Status::Stopped);
            return;
        }
    }
}

/// Stop the background Blender (Disconnect, mode switch, app exit). The scene in it is gone.
pub async fn stop() {
    let mut slot = SESSION.lock().await;
    if let Some(session) = slot.take() { session.stop().await; }
    set_status(Status::Stopped);
}

/// Run one request in the background Blender, starting it first when needed. Returns the addon-shaped reply.
/// `limit` covers waiting for a turn and the request itself. When Blender has to start first (first use, or after
/// the idle stop), the caller also waits for the start (up to `START_LIMIT`) and the request then gets its full
/// `limit`, so a first command is answered instead of being told to try again.
pub async fn command(program: &Path, body: Value, limit: Duration) -> anyhow::Result<Value> {
    let mut deadline = Instant::now() + limit;
    let mut kicked = false;
    let mut waited_for_start = false;
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        let waiting_message = || anyhow::anyhow!("{}", if STARTING.load(Ordering::SeqCst) { "Blender is starting in the background. Try again in a few seconds." } else { "Blender is busy with another PlazCode command. Wait for it to finish, then try again. Nothing was queued or repeated." });
        let mut slot = tokio::time::timeout(remaining, SESSION.lock()).await.map_err(|_| waiting_message())?;
        if let Some(session) = slot.as_mut() {
            if session.alive() {
                let remaining = if waited_for_start { limit } else { deadline.saturating_duration_since(Instant::now()) }.max(Duration::from_secs(1));
                return match session.request(body, remaining).await {
                    Ok(reply) => Ok(addon_shape(&reply)),
                    Err(error) => { if let Some(mut dead) = slot.take() { let _ = dead.child.start_kill(); let _ = std::fs::remove_dir_all(&dead.folder); } set_status(Status::Failed(error.to_string())); Err(error) }
                };
            }
            *slot = None;
            set_status(Status::Stopped);
        }
        drop(slot);
        if !STARTING.load(Ordering::SeqCst) {
            if kicked { if let Status::Failed(error) = status() { anyhow::bail!("{error}"); } }
            kick_start(program.to_path_buf());
            kicked = true;
        }
        // A start is under way (ours or another caller's): wait for it once, on top of the request's own time.
        if !waited_for_start { waited_for_start = true; deadline = Instant::now() + START_LIMIT + limit; }
        if Instant::now() >= deadline { return Err(waiting_message()); }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

/// The running session's folder, for files the controller wrote there (previews, saved scenes).
pub async fn session_folder_now() -> Option<PathBuf> { SESSION.lock().await.as_ref().map(|session| session.folder().to_path_buf()) }

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    /// A stand-in for Blender: a small Python program that speaks the protocol and misbehaves on request.
    fn fake(name: &str) -> PathBuf {
        use std::os::unix::fs::PermissionsExt;
        let path = std::env::temp_dir().join(format!("plazcode-fake-blender-{}-{name}", std::process::id()));
        std::fs::write(&path, r#"#!/usr/bin/env python3
import json, os, sys, time
mode = os.environ.get("FAKE_BLENDER", "")
args = sys.argv[1:]
assert args[:3] == ["--background", "--factory-startup", "--python"] and args[4:6] == ["--", "--session"], args
assert os.path.isfile(args[3]) and os.path.isfile(os.path.join(args[6], "blender_ops.py")) and os.getcwd() == os.path.realpath(args[6])
def say(obj): sys.stdout.write("PZ1 " + json.dumps(obj) + "\n"); sys.stdout.flush()
if mode == "silent": time.sleep(30)
if "slowstart" in os.path.basename(sys.argv[0]): time.sleep(2.5)
if mode == "dies": sys.stderr.write("cannot open display\n"); sys.exit(1)
print("Blender 9.9 (fake)"); print("PZ1 not json"); print("PZ1 [1,2]"); sys.stdout.flush()
say({"event": "ready", "blender": "9.9.0", "protocol": 7 if mode == "newer" else 1, "ops": ["add_cube"], "safe": True})
count = 0
for line in sys.stdin:
    request = json.loads(line)
    if request.get("type") == "quit": break
    count += 1
    if request.get("type") == "slow": time.sleep(float(request.get("seconds", 5)))
    if request.get("type") == "crash": os._exit(9)
    if request.get("type") == "execute_code" and request.get("allow_code") is not True:
        say({"id": request["id"], "ok": False, "error": "safe_mode", "message": "blocked"}); continue
    print("Fra:1 Mem:8.00M | rendering"); sys.stdout.write("half a line without an end "); sys.stdout.flush()
    sys.stdout.write("\n")
    say({"id": request["id"], "ok": True, "result": {"echo": request, "count": count}})
"#).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path
    }

    #[test] fn only_marked_json_objects_are_replies() {
        assert_eq!(parse_reply("PZ1 {\"id\":1,\"ok\":true}").unwrap()["id"], 1);
        assert_eq!(parse_reply("  PZ1 {\"event\":\"ready\"}  ").unwrap()["event"], "ready");
        for line in ["", "Blender 4.2", "PZ1", "PZ1 not json", "PZ1 [1]", "{\"id\":1}", "PZ2 {\"id\":1}", "x PZ1 {\"id\":1}"] { assert!(parse_reply(line).is_none(), "{line}"); }
    }

    #[test] fn replies_look_like_the_addon_socket() {
        assert_eq!(addon_shape(&json!({"id": 1, "ok": true, "result": {"name": "Scene"}})), json!({"status": "success", "result": {"name": "Scene"}}));
        assert_eq!(addon_shape(&json!({"id": 1, "ok": false, "error": "failed", "message": "Object not found: x"})), json!({"status": "error", "message": "Object not found: x"}));
        assert!(addon_shape(&json!({"ok": false, "error": "safe_mode"}))["message"].as_str().unwrap().contains("Safe mode"));
        assert!(addon_shape(&json!({"ok": false, "error": "unknown_op"}))["message"].as_str().unwrap().contains("Update PlazCode"));
    }

    #[tokio::test] async fn starts_ignores_blender_chatter_and_answers_in_order() {
        let program = fake("ok");
        let mut session = Session::start(&program, Duration::from_secs(20), &[]).await.unwrap();
        assert_eq!(session.version, "9.9.0");
        let folder = session.folder().to_path_buf();
        assert!(folder.join("blender_controller.py").is_file() && folder.join("blender_ops.py").is_file(), "the built-in files are what runs");
        for index in 1..=3u64 {
            let reply = session.request(json!({"type": "plazcode_op", "cmd": "add_cube", "args": {"name": "Box 🧪"}}), Duration::from_secs(10)).await.unwrap();
            assert_eq!(reply["ok"], true);
            assert_eq!(reply["result"]["count"], index);
            assert_eq!(reply["result"]["echo"]["args"]["name"], "Box 🧪");
            assert_eq!(reply["result"]["echo"]["id"], index, "each request carries its own number");
        }
        assert!(detail_text(&session.detail).contains("Blender 9.9 (fake)") && detail_text(&session.detail).contains("rendering"), "what Blender prints is kept for Show details");
        assert!(session.alive());
        session.stop().await;
        assert!(!folder.exists(), "the session folder is removed");
        let _ = std::fs::remove_file(program);
    }

    #[tokio::test] async fn free_python_needs_the_apps_own_mark() {
        let program = fake("safe");
        let mut session = Session::start(&program, Duration::from_secs(20), &[]).await.unwrap();
        let refused = session.request(json!({"type": "execute_code", "params": {"code": "print(1)"}}), Duration::from_secs(10)).await.unwrap();
        assert_eq!((refused["ok"].clone(), refused["error"].clone()), (json!(false), json!("safe_mode")));
        assert_eq!(addon_shape(&refused)["status"], "error");
        let allowed = session.request(json!({"type": "execute_code", "allow_code": true, "params": {"code": "print(1)"}}), Duration::from_secs(10)).await.unwrap();
        assert_eq!(allowed["ok"], true);
        session.stop().await;
        let _ = std::fs::remove_file(program);
    }

    #[tokio::test] async fn a_blender_that_never_gets_ready_is_stopped_with_a_plain_reason() {
        let program = fake("start");
        let started = Instant::now();
        let error = Session::start(&program, Duration::from_millis(600), &[("FAKE_BLENDER", "silent")]).await.err().unwrap().to_string();
        assert!(error.contains("did not start within") && started.elapsed() < Duration::from_secs(10), "{error}");
        let error = Session::start(&program, Duration::from_secs(20), &[("FAKE_BLENDER", "dies")]).await.err().unwrap().to_string();
        assert!(error.contains("closed while it was starting") && error.contains("cannot open display"), "{error}");
        let error = Session::start(&program, Duration::from_secs(20), &[("FAKE_BLENDER", "newer")]).await.err().unwrap().to_string();
        assert!(error.contains("Update PlazCode"), "{error}");
        let error = Session::start(Path::new("/no/such/blender"), Duration::from_secs(5), &[]).await.err().unwrap().to_string();
        assert!(error.contains("could not be started"), "{error}");
        let _ = std::fs::remove_file(program);
    }

    #[tokio::test] async fn a_slow_or_crashed_request_fails_once_and_is_never_replayed() {
        let program = fake("slow");
        let mut session = Session::start(&program, Duration::from_secs(20), &[]).await.unwrap();
        let error = session.request(json!({"type": "slow", "seconds": 5}), Duration::from_millis(300)).await.unwrap_err().to_string();
        assert!(error.contains("did not answer within") && error.contains("not repeated"), "{error}");
        // The late answer to the abandoned request must not be taken for the next request's answer.
        let reply = session.request(json!({"type": "slow", "seconds": 0}), Duration::from_secs(20)).await.unwrap();
        assert_eq!(reply["result"]["echo"]["id"], 2);
        let error = session.request(json!({"type": "crash"}), Duration::from_secs(10)).await.unwrap_err().to_string();
        assert!(error.contains("closed unexpectedly") && error.contains("empty scene") && error.contains("not repeated"), "{error}");
        tokio::time::sleep(Duration::from_millis(200)).await;
        assert!(!session.alive());
        session.stop().await;
        let _ = std::fs::remove_file(program);
    }

    /// The real thing: needs a Blender program, so it runs only when one is named.
    /// `PLAZCODE_BLENDER=/path/to/blender cargo test real_blender -- --ignored --nocapture`
    #[tokio::test] #[ignore] async fn real_blender_runs_actions_refuses_free_python_and_makes_a_picture() {
        let Some(program) = std::env::var_os("PLAZCODE_BLENDER").map(PathBuf::from) else { return; };
        let mut session = Session::start(&program, START_LIMIT, &[]).await.unwrap();
        println!("real Blender {} answered ready", session.version);
        let limit = Duration::from_secs(120);
        let ask = |kind: &str, extra: Value| { let mut body = json!({"type": kind}); for (key, value) in extra.as_object().unwrap() { body[key] = value.clone(); } body };
        let text = |reply: &Value| reply["result"]["result"].as_str().unwrap_or("").to_string();

        let scene = session.request(ask("get_scene_info", json!({})), limit).await.unwrap();
        assert_eq!(scene["ok"], true, "{scene}");
        let before = scene["result"]["object_count"].as_u64().unwrap();
        let added = session.request(ask("plazcode_op", json!({"cmd": "add_cube", "args": {"name": "PZ \"\"\" Box", "location": [1, 2, 3]}})), limit).await.unwrap();
        assert!(text(&added).contains("PLAZCODE_MESH_JSON:{\"ok\":true"), "{added}");
        let listed = session.request(ask("plazcode_op", json!({"cmd": "list_objects", "args": {}})), limit).await.unwrap();
        assert!(text(&listed).contains("PZ \\\"\\\"\\\" Box"), "the object exists under exactly the name asked for: {listed}");
        assert_eq!(session.request(ask("get_scene_info", json!({})), limit).await.unwrap()["result"]["object_count"], before + 1);
        let info = session.request(ask("get_object_info", json!({"params": {"name": "PZ \"\"\" Box"}})), limit).await.unwrap();
        assert_eq!(info["result"]["mesh"]["vertices"], 8, "{info}");

        // Safe mode: the controller itself refuses free Python without the app's mark, and nothing runs.
        let marker = session.folder().join("free-python-ran.txt");
        let code = format!("open({:?}, 'w').write('ran')", marker.display().to_string());
        let refused = session.request(ask("execute_code", json!({"params": {"code": code}})), limit).await.unwrap();
        assert_eq!((refused["ok"].clone(), refused["error"].clone()), (json!(false), json!("safe_mode")), "{refused}");
        let sneaky = session.request(ask("execute_code", json!({"allow_code": "true", "params": {"code": code}})), limit).await.unwrap();
        assert_eq!(sneaky["error"], "safe_mode", "only the exact mark counts");
        assert!(!marker.exists(), "refused code did not run");
        let allowed = session.request(ask("execute_code", json!({"allow_code": true, "params": {"code": code}})), limit).await.unwrap();
        assert!(allowed["ok"] == true && marker.exists(), "{allowed}");

        // The open-window form of a built-in action (the app fills the actions file) runs in real Blender too.
        let filled = crate::blender::ops_code("add_sphere", &json!({"name": "PZ 🧪 Ball"})).unwrap();
        let ran = session.request(ask("execute_code", json!({"allow_code": true, "params": {"code": filled}})), limit).await.unwrap();
        assert!(text(&ran).contains("\"ok\":true"), "{ran}");

        // A failed action is reported and the session lives on.
        let failed = session.request(ask("get_object_info", json!({"params": {"name": "no such object"}})), limit).await.unwrap();
        assert_eq!((failed["ok"].clone(), failed["message"].clone()), (json!(false), json!("Object not found: no such object")));
        assert_eq!(session.request(ask("mystery", json!({})), limit).await.unwrap()["error"], "unknown_op");

        // A picture without any window: Workbench, or Cycles on the processor where there is no graphics context.
        let file = session.folder().join("plazcode_blender_shot_123e4567-e89b-12d3-a456-426614174000.png");
        let shot = session.request(ask("plazcode_shot", json!({"params": {"filepath": file.display().to_string(), "max_size": 320}})), Duration::from_secs(300)).await.unwrap();
        assert!(text(&shot).starts_with("PLAZCODE_SHOT_JSON:"), "{shot}");
        let facts: Value = serde_json::from_str(text(&shot).trim_start_matches("PLAZCODE_SHOT_JSON:")).unwrap();
        println!("picture made with {} ({} bytes){}", facts["method"], facts["bytes"], facts.get("offscreen_error").map(|e| format!(", first try failed: {e}")).unwrap_or_default());
        assert!(matches!(facts["method"].as_str(), Some("render_workbench" | "render_cycles")));
        let picture = image::load_from_memory(&std::fs::read(&file).unwrap()).unwrap().to_rgba8();
        assert_eq!((picture.width(), picture.height()), (320, 180));
        let colours: std::collections::HashSet<[u8; 4]> = picture.pixels().map(|p| p.0).collect();
        assert!(colours.len() > 8, "the picture shows the scene, not one flat colour ({} colours)", colours.len());
        assert_eq!(session.request(ask("get_scene_info", json!({})), limit).await.unwrap()["result"]["object_count"], before + 2, "making a picture leaves no camera or light behind");

        let blend = session.folder().join("scene.blend");
        let saved = session.request(ask("plazcode_save", json!({"params": {"filepath": blend.display().to_string()}})), limit).await.unwrap();
        assert!(saved["ok"] == true && std::fs::metadata(&blend).unwrap().len() > 1000, "{saved}");
        session.stop().await;
    }

    #[tokio::test] async fn the_shared_blender_starts_on_first_use_queues_callers_and_restarts_after_a_crash() {
        let program = fake("shared");
        stop().await;
        let (a, b) = tokio::join!(command(&program, json!({"type": "get_scene_info"}), Duration::from_secs(30)), command(&program, json!({"type": "slow", "seconds": 0.3}), Duration::from_secs(30)));
        let (a, b) = (a.unwrap(), b.unwrap());
        assert_eq!((a["status"].clone(), b["status"].clone()), (json!("success"), json!("success")));
        let mut counts = [a["result"]["count"].as_u64().unwrap(), b["result"]["count"].as_u64().unwrap()]; counts.sort();
        assert_eq!(counts, [1, 2], "two callers share one Blender and take turns");
        assert_eq!(status(), Status::Running("9.9.0".into()));

        // A scene check does not wait behind a long action for ever: it gets a plain "busy" after its own limit.
        let long = tokio::spawn({ let program = program.clone(); async move { command(&program, json!({"type": "slow", "seconds": 1.5}), Duration::from_secs(30)).await } });
        tokio::time::sleep(Duration::from_millis(300)).await;
        let busy = command(&program, json!({"type": "get_scene_info"}), Duration::from_millis(400)).await.unwrap_err().to_string();
        assert!(busy.contains("busy with another PlazCode command"), "{busy}");
        assert_eq!(long.await.unwrap().unwrap()["status"], "success", "the long action is not disturbed");

        let crash = command(&program, json!({"type": "crash"}), Duration::from_secs(10)).await.unwrap_err().to_string();
        assert!(crash.contains("closed unexpectedly"), "{crash}");
        assert!(matches!(status(), Status::Failed(_)));
        let after = command(&program, json!({"type": "get_scene_info"}), Duration::from_secs(30)).await.unwrap();
        assert_eq!(after["result"]["count"], 1, "the next command gets a fresh Blender");
        stop().await;
        assert_eq!(status(), Status::Stopped);
        let gone = command(Path::new("/no/such/blender"), json!({"type": "get_scene_info"}), Duration::from_secs(10)).await.unwrap_err().to_string();
        assert!(gone.contains("could not be started"), "{gone}");
        stop().await;

        // A first command while Blender is still starting waits for the start, then gets its own full time,
        // instead of being told to try again (this Blender needs 2.5 s to start; the request allows 1 s).
        let slow = fake("slowstart");
        let began = Instant::now();
        let first = command(&slow, json!({"type": "get_scene_info"}), Duration::from_secs(1)).await.unwrap();
        assert_eq!(first["status"], "success");
        assert!(began.elapsed() >= Duration::from_secs(2), "the caller really waited for the start");
        stop().await;
        let _ = std::fs::remove_file(slow);
        let _ = std::fs::remove_file(program);
    }
}
