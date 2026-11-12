use axum::Json;
use serde_json::{json, Value};
use std::time::Duration;
use tokio::{io::{AsyncReadExt, AsyncWriteExt}, net::TcpStream};

static LAST_CONNECTION: std::sync::Mutex<Option<(std::time::Instant,bool)>> = std::sync::Mutex::new(None);
/// The open-window helper answered its last scene check (within the last 20 seconds).
pub fn socket_connected() -> Option<bool> { LAST_CONNECTION.lock().ok().and_then(|state|state.as_ref().filter(|(at,_)|at.elapsed()<Duration::from_secs(20)).map(|(_,ready)|*ready)) }

async fn command_slot<'a>(lock: &'a tokio::sync::Mutex<()>, kind: &str) -> anyhow::Result<tokio::sync::MutexGuard<'a, ()>> {
    // A read-only connection check must not queue behind a long render for
    // 45 s: every caller needs the scene response within its 12-15 s deadline.
    let wait = if kind == "get_scene_info" { 2 } else { 45 };
    tokio::time::timeout(Duration::from_secs(wait), lock.lock()).await
        .map_err(|_| anyhow::anyhow!("Blender is processing another PlazCode command. Wait for it to finish before running a scene check."))
}

pub async fn command_at(host: &str, port: u16, kind: &str, params: Value, limit: Duration) -> anyhow::Result<Value> {
    send_at(host, port, kind, json!({"type":kind,"params":params}), limit).await
}

/// Send one whole request (PlazCode's own helper also needs the pairing word and the safe-mode mark in it).
async fn send_at(host: &str, port: u16, kind: &str, body: Value, limit: Duration) -> anyhow::Result<Value> {
    tokio::time::timeout(limit, async {
        // Nothing listening is told apart quickly: on Windows a refused connection can take about two seconds.
        let mut socket = tokio::time::timeout(Duration::from_millis(1500).min(limit), TcpStream::connect((host, port))).await
            .map_err(|_| anyhow::Error::new(NotListening("no answer".into())))?
            .map_err(|error| anyhow::Error::new(NotListening(error.to_string())))?;
        socket.write_all(&serde_json::to_vec(&body)?).await?;
        let mut data = Vec::new();
        let mut buffer = [0u8;8192];
        loop {
            let size = socket.read(&mut buffer).await?;
            anyhow::ensure!(size > 0, "Blender closed the connection before sending a complete response.");
            data.extend_from_slice(&buffer[..size]);
            anyhow::ensure!(data.len() <= 16*1024*1024, "Blender response exceeds 16 MB.");
            match serde_json::from_slice::<Value>(&data) {
                Ok(value) => {
                    anyhow::ensure!(value.is_object() && matches!(value["status"].as_str(), Some("success"|"error")), "The endpoint is not a compatible Blender MCP addon.");
                    return Ok(value);
                },
                Err(error) if error.is_eof() => {},
                Err(error) => return Err(error.into()),
            }
        }
    }).await.map_err(|_| anyhow::anyhow!("Blender did not answer {kind} within {} seconds. Run Blender normally with its visible GUI (not headless / -b), keep it responsive, close blocking dialogs, then stop and start the MCP server in Blender (N → Blender MCP → Start MCP Server). If a fresh scene check still fails, update the official Blender MCP addon: older addons can accept sockets without scheduling commands reliably on Blender's main thread. A running MCP process or tool list alone does not confirm Blender is connected. A timed-out edit may still execute later; inspect the scene before retrying. PlazCode did not replay the command.", limit.as_secs()))?
}

/// Nothing listens on that port (Blender is closed, or its helper is not running).
#[derive(Debug)]
struct NotListening(String);
impl std::fmt::Display for NotListening { fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { write!(f, "Blender is not answering ({})", self.0) } }
impl std::error::Error for NotListening {}

static COMMAND_LOCK: once_cell::sync::Lazy<tokio::sync::Mutex<()>> = once_cell::sync::Lazy::new(||tokio::sync::Mutex::new(()));

fn remember_connection(result: &anyhow::Result<Value>) {
    // A slow reply means Blender is busy, not disconnected: keep the last known
    // state so the extension does not drop a live Blender connection.
    let busy=matches!(result,Err(error) if error.to_string().contains("did not answer"));
    if !busy {if let Ok(mut state)=LAST_CONNECTION.lock(){*state=Some((std::time::Instant::now(),result.is_ok()));}}
}

/// PlazCode's own open-window helper listens here (the older helper keeps 9876, so both can be in Blender at once).
pub fn helper_port() -> u16 { std::env::var("PLAZCODE_BLENDER_HELPER_PORT").ok().and_then(|v| v.parse().ok()).unwrap_or(9877) }

/// One request to PlazCode's own helper in the open Blender window, with its pairing word.
pub async fn helper_command(body: Value, pairing: &str, limit: Duration) -> anyhow::Result<Value> { helper_command_at(helper_port(), body, pairing, limit).await }

async fn helper_command_at(port: u16, body: Value, pairing: &str, limit: Duration) -> anyhow::Result<Value> {
    let kind = body["type"].as_str().unwrap_or("get_scene_info").to_string();
    let _guard = command_slot(&COMMAND_LOCK, &kind).await?;
    let mut body = body;
    body["token"] = json!(pairing);
    let result = send_at("127.0.0.1", port, &kind, body, limit).await.map(|reply| helper_shape(&reply));
    if !matches!(&result, Err(error) if error.downcast_ref::<NotListening>().is_some()) { remember_connection(&result); }
    result
}

/// The helper's reply in the words the extension shows (the same as for the background Blender).
pub fn helper_shape(reply: &Value) -> Value {
    match reply["code"].as_str() {
        Some("safe_mode") => json!({"status": "error", "message": SAFE_MODE_MESSAGE}),
        Some("unknown_op") => json!({"status": "error", "message": "This Blender command is not available in the helper inside Blender. Open PlazCode, go to Apps & servers, open Blender and press Add helper again."}),
        Some("wrong_pair") => json!({"status": "error", "message": reply["message"].as_str().unwrap_or("This Blender helper belongs to a different PlazCode install.")}),
        _ => reply.clone(),
    }
}

pub async fn command(kind: &str, params: Value, limit: Duration) -> anyhow::Result<Value> {
    // Several chats/browsers can share one Blender. Wait briefly for the active
    // command instead of failing immediately; commands are never repeated.
    let _guard = command_slot(&COMMAND_LOCK, kind).await?;
    let config=crate::mcp_addons::read_config();
    let spec=config.servers.get("blender");
    let host = spec.and_then(|s|s.env.get("BLENDER_HOST")).cloned().or_else(||std::env::var("BLENDER_HOST").ok()).unwrap_or_else(|| "127.0.0.1".into());
    let port = spec.and_then(|s|s.env.get("BLENDER_PORT")).cloned().or_else(||std::env::var("BLENDER_PORT").ok()).and_then(|v|v.parse().ok()).unwrap_or(9876);
    let result=command_at(&host,port,kind,params,limit).await;
    remember_connection(&result);
    result
}

/// What the extension's status line shows. Background mode counts as connected once it is set up: Blender
/// starts by itself on the first command.
pub fn connected() -> Option<bool> {
    let choice = crate::connections::blender_choice();
    if choice.background { Some(choice.program.is_some()) } else { socket_connected() }
}

pub const SAFE_MODE_MESSAGE: &str = "Safe mode is on: the AI can only use PlazCode's built-in Blender actions. To let it run its own Python code, open PlazCode, go to Apps & servers, open Blender and switch on \"Allow free Python\".";
const OPS_TEMPLATE: &str = include_str!("../../blender_ops.py");
const SHOT_TEMPLATE: &str = include_str!("../blender_shot.py");

/// Free Python: only runs when the person switched it on.
pub fn is_free_code(kind: &str) -> bool { matches!(kind, "execute_code" | "execute_blender_code" | "blender_execute_code") }

fn op_name(raw: &str) -> anyhow::Result<&str> {
    anyhow::ensure!(!raw.is_empty() && raw.len() <= 64 && raw.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_'), "PlazCode does not know that Blender action.");
    Ok(raw)
}

/// A built-in action as the Python the open-window helper runs. The action name and its arguments go in as Python
/// string values, never as program text, so no argument can add code of its own.
pub fn ops_code(cmd: &str, args: &Value) -> anyhow::Result<String> {
    let cmd = op_name(cmd)?;
    let args = if args.is_object() { args.clone() } else { json!({}) };
    const CMD: &str = "\"\"\"__PLAZCODE_CMD__\"\"\"";
    const ARGS: &str = "r\"\"\"__PLAZCODE_ARGS__\"\"\"";
    anyhow::ensure!(OPS_TEMPLATE.matches(CMD).count() == 1 && OPS_TEMPLATE.matches(ARGS).count() == 1, "PlazCode's Blender actions file is not the expected one.");
    Ok(OPS_TEMPLATE.replace(CMD, &python_string(cmd)).replace(ARGS, &python_string(&args.to_string()))
        .replace("__PLAZCODE_OUT__", "\"plazcode_status.json\"").replace("__PLAZCODE_MESH__", "\"plazcode_mesh.json\""))
}

/// A Python string literal for any text (plain ASCII with escapes, so nothing in it can end the literal).
fn python_string(text: &str) -> String {
    let mut out = String::from("\"");
    for c in text.chars() {
        match c {
            '"' => out.push_str("\\\""), '\\' => out.push_str("\\\\"), '\n' => out.push_str("\\n"), '\r' => out.push_str("\\r"), '\t' => out.push_str("\\t"),
            c if c.is_ascii() && !c.is_ascii_control() => out.push(c),
            c if (c as u32) <= 0xffff => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push_str(&format!("\\U{:08x}", c as u32)),
        }
    }
    out.push('"');
    out
}

/// The file a picture is written to: an absolute path whose name is the one the extension makes up.
fn shot_file(params: &Value) -> anyhow::Result<String> {
    let path = params["filepath"].as_str().unwrap_or("");
    let name = std::path::Path::new(path).file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default();
    let middle = name.strip_prefix("plazcode_blender_shot_").and_then(|rest| rest.strip_suffix(".png")).unwrap_or("");
    anyhow::ensure!(std::path::Path::new(path).is_absolute() && path.len() <= 1024 && middle.len() == 36 && middle.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-'), "PlazCode could not tell where to save the Blender picture. Update the extension and the app together.");
    Ok(path.to_string())
}

fn shot_size(params: &Value) -> u64 { params["max_size"].as_u64().unwrap_or(1000).clamp(64, 4096) }

/// One request, made ready for one of the two ways to reach Blender.
#[derive(Debug, PartialEq)]
pub enum Prepared { Background(Value), Window(String, Value) }

/// Safe mode and the built-in verbs are decided here, in the app, before anything reaches Blender.
pub fn prepare(kind: &str, params: &Value, background: bool, free_python: bool) -> anyhow::Result<Prepared> {
    anyhow::ensure!(free_python || !is_free_code(kind), "{SAFE_MODE_MESSAGE}");
    Ok(match kind {
        "plazcode_op" => {
            let cmd = op_name(params["cmd"].as_str().unwrap_or(""))?;
            if background { Prepared::Background(json!({"type": "plazcode_op", "cmd": cmd, "args": params.get("args").filter(|a| a.is_object()).cloned().unwrap_or_else(|| json!({}))})) }
            else { Prepared::Window("execute_code".into(), json!({"code": ops_code(cmd, &params["args"])?})) }
        }
        "plazcode_shot" => {
            let (file, size) = (shot_file(params)?, shot_size(params));
            if background { Prepared::Background(json!({"type": "plazcode_shot", "params": {"filepath": file, "max_size": size}})) }
            else { Prepared::Window("execute_code".into(), json!({"code": format!("FP = {}\nMAX = {}\n{}", python_string(&file), size, SHOT_TEMPLATE)})) }
        }
        kind if is_free_code(kind) => {
            if background { Prepared::Background(json!({"type": "execute_code", "allow_code": true, "params": {"code": params["code"].as_str().unwrap_or("")}})) }
            else { Prepared::Window("execute_code".into(), params.clone()) }
        }
        kind => if background { Prepared::Background(json!({"type": kind, "params": params})) } else { Prepared::Window(kind.to_string(), params.clone()) },
    })
}

const HELPER_CLOSED: &str = "Blender is not open, or it was opened before PlazCode added its helper. Open Blender (close and reopen it if it was already open); the PlazCode helper starts by itself. Then send the command again.";
const NOT_SET_UP: &str = "Blender is not set up in PlazCode yet. Open PlazCode, go to Apps & servers and connect Blender.";

/// Run one Blender request the way the person chose (background Blender or their open window).
pub async fn run(choice: &crate::connections::BlenderChoice, request: &Value) -> Value {
    let kind = request["type"].as_str().unwrap_or("get_scene_info");
    let seconds = if kind == "get_scene_info" {8} else {request["timeout_seconds"].as_u64().unwrap_or(120).clamp(1,180)};
    let params = request.get("params").cloned().unwrap_or_else(||json!({}));
    let prepared = match prepare(kind, &params, choice.background, choice.free_python) {
        Ok(prepared) => prepared,
        Err(error) => return json!({"ok":false,"blender":true,"safe_mode":is_free_code(kind),"error":error.to_string()}),
    };
    // PlazCode's own helper in the open window takes the same requests as the background Blender.
    if let (false, Some(pairing)) = (choice.background, choice.pairing.as_deref()) {
        if let Ok(Prepared::Background(body)) = prepare(kind, &params, true, choice.free_python) {
            match helper_command(body, pairing, Duration::from_secs(seconds)).await {
                Err(error) if error.downcast_ref::<NotListening>().is_some() => {} // not running: maybe the older helper is
                result => return command_response(result),
            }
        }
    }
    match prepared {
        Prepared::Window(kind, params) => match command(&kind, params, Duration::from_secs(seconds)).await {
            // Neither helper answers: with PlazCode's own helper added, the likely reason is that Blender is closed.
            Err(error) if choice.pairing.is_some() && error.downcast_ref::<NotListening>().is_some() => json!({"ok":false,"blender":false,"error":HELPER_CLOSED}),
            result => command_response(result),
        },
        Prepared::Background(body) => {
            let Some(program) = choice.program.as_ref() else { return json!({"ok":false,"blender":false,"error":NOT_SET_UP}); };
            match crate::blender_headless::command(program, body, Duration::from_secs(seconds)).await {
                Ok(value) => command_response(Ok(value)),
                // "Starting" and "busy" are not a lost connection; a Blender that cannot start is.
                Err(error) => { let text = error.to_string(); json!({"ok":false,"blender":!text.contains("could not be started"),"error":text}) }
            }
        }
    }
}

pub async fn post(Json(request): Json<Value>) -> Json<Value> {
    let choice = tokio::task::spawn_blocking(crate::connections::blender_choice).await.unwrap_or_else(|_| crate::connections::BlenderChoice { consent: false, background: false, free_python: false, program: None, pairing: None });
    Json(run(&choice, &request).await)
}

/// The real check behind "Test" in the setup window: Blender answers a scene request. In background mode this
/// starts Blender, so it gets the start-up limit on top.
pub async fn check() -> bool {
    let choice = tokio::task::spawn_blocking(crate::connections::blender_choice).await.ok();
    let Some(choice) = choice else { return false; };
    // The same way a real command goes: background Blender, PlazCode's own helper, or the older helper.
    let ok = run(&choice, &json!({"type":"get_scene_info","params":{}})).await["ok"] == true;
    let _ = tokio::task::spawn_blocking(move || crate::connections::mark_blender_verified(ok)).await;
    ok
}

static PREVIEW: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);
/// The last picture made with "Show a picture", as a data address the page can show.
pub fn preview() -> Option<String> { PREVIEW.lock().ok().and_then(|slot| slot.clone()) }
pub fn clear_preview() { if let Ok(mut slot) = PREVIEW.lock() { *slot = None; } }

/// "Show a picture": a small render of the background scene, kept in memory for the setup window.
pub async fn make_preview() -> anyhow::Result<()> {
    use base64::Engine;
    let choice = tokio::task::spawn_blocking(crate::connections::blender_choice).await?;
    let program = choice.program.filter(|_| choice.background).ok_or_else(|| anyhow::anyhow!("{NOT_SET_UP}"))?;
    // Make sure Blender runs first, so its session folder exists; the picture is written there and read back.
    crate::blender_headless::command(&program, json!({"type":"get_scene_info","params":{}}), Duration::from_secs(10)).await?;
    let folder = crate::blender_headless::session_folder_now().await.ok_or_else(|| anyhow::anyhow!("Blender is not running."))?;
    let file = folder.join("preview.png");
    let reply = crate::blender_headless::command(&program, json!({"type":"plazcode_shot","params":{"filepath":file.display().to_string(),"max_size":640}}), Duration::from_secs(120)).await?;
    anyhow::ensure!(reply["status"] == "success", "{}", reply["message"].as_str().unwrap_or("Blender could not make a picture."));
    let bytes = tokio::fs::read(&file).await?;
    anyhow::ensure!(bytes.len() <= 4 * 1024 * 1024, "The picture is larger than expected.");
    if let Ok(mut slot) = PREVIEW.lock() { *slot = Some(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))); }
    Ok(())
}

/// Where "Open in Blender" saves the scene: a PlazCode folder in the person's Documents (or home) folder.
pub fn scene_file_in(home: &std::path::Path, stamp: &str) -> std::path::PathBuf {
    let documents = home.join("Documents");
    (if documents.is_dir() { documents } else { home.to_path_buf() }).join("PlazCode Blender").join(format!("plazcode-scene-{stamp}.blend"))
}

/// "Open in Blender": save the background scene as a .blend file and open that file in the normal Blender.
/// The page never names a path; the place is fixed here.
pub async fn open_in_blender() -> anyhow::Result<std::path::PathBuf> {
    let choice = tokio::task::spawn_blocking(crate::connections::blender_choice).await?;
    let program = choice.program.filter(|_| choice.background).ok_or_else(|| anyhow::anyhow!("{NOT_SET_UP}"))?;
    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(std::path::PathBuf::from).ok_or_else(|| anyhow::anyhow!("PlazCode could not find your user folder."))?;
    let file = scene_file_in(&home, &chrono::Local::now().format("%Y-%m-%d-%H%M%S").to_string());
    if let Some(parent) = file.parent() { tokio::fs::create_dir_all(parent).await?; }
    let reply = crate::blender_headless::command(&program, json!({"type":"plazcode_save","params":{"filepath":file.display().to_string()}}), Duration::from_secs(60)).await?;
    anyhow::ensure!(reply["status"] == "success" && file.is_file(), "{}", reply["message"].as_str().unwrap_or("Blender could not save the scene."));
    let mut normal = tokio::process::Command::new(&program);
    normal.arg(&file).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
    let child = normal.spawn().map_err(|error| anyhow::anyhow!("The scene was saved to {}, but Blender could not be opened ({error}).", file.display()))?;
    // The opened Blender belongs to the person from here on; PlazCode neither waits for it nor stops it.
    std::mem::forget(child);
    Ok(file)
}

/// "Open Blender" in the open-window way: start the normal Blender. It belongs to the person; PlazCode does not stop it.
pub async fn launch_blender() -> anyhow::Result<()> {
    let choice = tokio::task::spawn_blocking(crate::connections::blender_choice).await?;
    let program = choice.program.ok_or_else(|| anyhow::anyhow!("PlazCode has not found Blender yet."))?;
    let mut normal = tokio::process::Command::new(&program);
    normal.stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
    let child = normal.spawn().map_err(|error| anyhow::anyhow!("Blender could not be opened ({error})."))?;
    std::mem::forget(child);
    Ok(())
}

fn command_response(result: anyhow::Result<Value>) -> Value {
    match result {
        Ok(value) if value["status"] == "success" => json!({"ok":true,"blender":true,"data":value}),
        Ok(value) => {
            let error = value.get("message").or_else(||value.get("error")).and_then(Value::as_str).unwrap_or("Blender returned an error instead of scene information.");
            json!({"ok":false,"blender":true,"error":error,"data":value})
        },
        Err(error) => json!({"ok":false,"blender":false,"error":format!("{error}. Check that the Blender MCP addon is enabled and its server is started on the same host and port as PlazCode (default 127.0.0.1:9876).")}),
    }
}

#[cfg(test)] mod tests {
    use super::*;
    #[tokio::test] async fn responds_without_waiting_for_socket_close() {
        let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap(); let port=listener.local_addr().unwrap().port();
        let task=tokio::spawn(async move {let (mut stream,_)=listener.accept().await.unwrap();let mut bytes=[0;1024];stream.read(&mut bytes).await.unwrap();stream.write_all(b"{\"status\":\"success\",\"result\":{}").await.unwrap();stream.write_all(b"}").await.unwrap();tokio::time::sleep(Duration::from_secs(2)).await;});
        assert!(command_at("127.0.0.1",port,"get_scene_info",json!({}),Duration::from_secs(1)).await.is_ok());task.abort();
    }
    #[tokio::test] async fn listening_but_silent_is_not_connected() {
        let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap(); let port=listener.local_addr().unwrap().port();
        let task=tokio::spawn(async move {let (_stream,_)=listener.accept().await.unwrap();tokio::time::sleep(Duration::from_secs(2)).await;});
        assert!(command_at("127.0.0.1",port,"get_scene_info",json!({}),Duration::from_millis(50)).await.unwrap_err().to_string().contains("did not answer"));task.abort();
    }
    #[tokio::test] async fn a_busy_scene_probe_is_bounded_and_does_not_interrupt_the_edit() {
        let lock = tokio::sync::Mutex::new(());
        let edit = lock.lock().await;
        let started = std::time::Instant::now();
        let result = tokio::time::timeout(Duration::from_secs(4), command_slot(&lock, "get_scene_info")).await.unwrap();
        assert!(result.unwrap_err().to_string().contains("processing another"));
        assert!(started.elapsed() < Duration::from_secs(3));
        assert!(lock.try_lock().is_err(), "the running edit retains its lock");
        drop(edit);
        assert!(command_slot(&lock, "get_scene_info").await.is_ok(), "a later explicit check recovers");
    }
    #[tokio::test] async fn fragmented_unicode_and_reconnects_preserve_exact_scene_results() {
        let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();let port=listener.local_addr().unwrap().port();
        let server=tokio::spawn(async move {
            for index in 0..24 {
                let (mut stream,_)=listener.accept().await.unwrap();
                let mut request=Vec::new();let mut buffer=[0;128];
                loop {let n=stream.read(&mut buffer).await.unwrap();assert!(n>0);request.extend_from_slice(&buffer[..n]);if serde_json::from_slice::<Value>(&request).is_ok(){break;}}
                if index % 3 == 0 {continue;} // peer exits mid-request
                let value=json!({"status":"success","result":{"name":"Cube 🧪 完整","index":index}});
                let bytes=serde_json::to_vec(&value).unwrap();
                for chunk in bytes.chunks(3) {stream.write_all(chunk).await.unwrap();tokio::task::yield_now().await;}
            }
        });
        for index in 0..24 {
            let result=command_at("127.0.0.1",port,"get_scene_info",json!({}),Duration::from_secs(2)).await;
            if index % 3 == 0 {assert!(result.unwrap_err().to_string().contains("closed the connection"));}
            else {let value=result.unwrap();assert_eq!(value["result"]["index"],index);assert_eq!(value["result"]["name"],"Cube 🧪 完整");}
        }
        server.await.unwrap();
    }
    #[test] fn safe_mode_stops_free_python_in_the_app_for_both_ways_of_connecting() {
        for background in [true, false] {
            for kind in ["execute_code", "execute_blender_code", "blender_execute_code"] {
                let refused = prepare(kind, &json!({"code": "import os"}), background, false).unwrap_err().to_string();
                assert!(refused.contains("Safe mode is on") && refused.contains("Allow free Python"), "{refused}");
            }
            assert!(prepare("get_scene_info", &json!({}), background, false).is_ok());
            assert!(prepare("plazcode_op", &json!({"cmd": "add_cube", "args": {}}), background, false).is_ok(), "built-in actions always run");
        }
        assert_eq!(prepare("execute_blender_code", &json!({"code": "print(1)"}), true, true).unwrap(), Prepared::Background(json!({"type": "execute_code", "allow_code": true, "params": {"code": "print(1)"}})), "switched on: the app itself marks the request");
        assert_eq!(prepare("execute_code", &json!({"code": "print(1)"}), false, true).unwrap(), Prepared::Window("execute_code".into(), json!({"code": "print(1)"})));
        assert_eq!(prepare("get_object_info", &json!({"name": "Cube"}), true, false).unwrap(), Prepared::Background(json!({"type": "get_object_info", "params": {"name": "Cube"}})));
        assert_eq!(prepare("get_polyhaven_status", &json!({}), false, false).unwrap(), Prepared::Window("get_polyhaven_status".into(), json!({})), "the open-window helper's own commands pass through");
    }
    #[test] fn built_in_actions_never_carry_arguments_as_program_text() {
        let hostile = json!({"name": "x\"\"\")\nimport os\nos.system('boom')\n#", "note": "a\\", "emoji": "🧪 完整", "line": "\u{2028}"});
        let code = ops_code("add_cube", &hostile).unwrap();
        assert!(!code.contains("__PLAZCODE_"), "every placeholder is filled");
        assert!(code.contains("CMD = \"add_cube\"\n"));
        let args_line = code.lines().find(|line| line.starts_with("ARGS = json.loads(")).unwrap();
        assert!(args_line.is_ascii() && !args_line.contains("\"\"\"") && args_line.ends_with("\")"), "one plain line: {args_line}");
        assert_eq!(code.matches("import os").count(), OPS_TEMPLATE.matches("import os").count() + 1, "the hostile text exists once, inside the string");
        // The literal must read back as exactly the JSON text that was put in.
        let literal = args_line.trim_start_matches("ARGS = json.loads(").trim_end_matches(')');
        let back: String = serde_json::from_str(&literal.replace("\\U0001f9ea", "\\ud83e\\uddea")).unwrap();
        assert_eq!(serde_json::from_str::<Value>(&back).unwrap(), hostile);
        for bad in ["", "add cube", "x\"\"\";import os", "Add_Cube", &"a".repeat(65)] { assert!(ops_code(bad, &json!({})).is_err(), "{bad}"); assert!(prepare("plazcode_op", &json!({"cmd": bad}), true, true).is_err()); }
        match prepare("plazcode_op", &json!({"cmd": "list_objects", "args": "not an object"}), true, false).unwrap() { Prepared::Background(body) => assert_eq!(body, json!({"type": "plazcode_op", "cmd": "list_objects", "args": {}})), other => panic!("{other:?}") }
        match prepare("plazcode_op", &json!({"cmd": "list_objects"}), false, false).unwrap() { Prepared::Window(kind, params) => { assert_eq!(kind, "execute_code"); assert!(params["code"].as_str().unwrap().contains("CMD = \"list_objects\"")); } other => panic!("{other:?}") }
    }
    #[test] fn pictures_are_only_written_to_the_file_the_extension_named() {
        let good = if cfg!(windows) { "C:\\work\\plazcode_blender_shot_123e4567-e89b-12d3-a456-426614174000.png" } else { "/work/plazcode_blender_shot_123e4567-e89b-12d3-a456-426614174000.png" };
        assert_eq!(prepare("plazcode_shot", &json!({"filepath": good, "max_size": 99999}), true, false).unwrap(), Prepared::Background(json!({"type": "plazcode_shot", "params": {"filepath": good, "max_size": 4096}})));
        match prepare("plazcode_shot", &json!({"filepath": good}), false, false).unwrap() {
            Prepared::Window(kind, params) => { let code = params["code"].as_str().unwrap(); assert_eq!(kind, "execute_code"); assert!(code.starts_with("FP = \"") && code.contains("\nMAX = 1000\n") && code.contains("PLAZCODE_SHOT_JSON:")); }
            other => panic!("{other:?}"),
        }
        for bad in ["", "plazcode_blender_shot_123e4567-e89b-12d3-a456-426614174000.png", "/work/notes.png", "/work/plazcode_blender_shot_../../x.png", "/etc/passwd"] {
            assert!(prepare("plazcode_shot", &json!({"filepath": bad}), true, false).is_err(), "{bad}");
        }
    }
    #[test] fn open_in_blender_saves_under_documents_or_home() {
        let root = std::env::temp_dir().join(format!("plazcode-blend-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root); std::fs::create_dir_all(&root).unwrap();
        assert_eq!(scene_file_in(&root, "2026-11-11-120000"), root.join("PlazCode Blender").join("plazcode-scene-2026-11-11-120000.blend"));
        std::fs::create_dir_all(root.join("Documents")).unwrap();
        assert_eq!(scene_file_in(&root, "x"), root.join("Documents").join("PlazCode Blender").join("plazcode-scene-x.blend"));
        let _ = std::fs::remove_dir_all(root);
    }
    #[test] fn an_addon_error_is_not_a_successful_scene_check() {
        let result=command_response(Ok(json!({"status":"error","message":"Scene is unavailable"})));
        assert_eq!(result["ok"],false);assert_eq!(result["error"],"Scene is unavailable");
        assert_eq!(result["blender"],true,"the addon replied, but the scene check failed");
        assert_eq!(command_response(Ok(json!({"status":"success","result":{"objects":[]}})))["ok"],true);
    }

    #[tokio::test] async fn plazcodes_own_helper_gets_the_pairing_word_and_its_answers_read_like_the_background_ones() {
        let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();let port=listener.local_addr().unwrap().port();
        let task=tokio::spawn(async move {
            let mut seen=Vec::new();
            for reply in [r#"{"status":"success","result":{"objects":[]}}"#, r#"{"status":"error","code":"safe_mode","message":"Safe mode is on: free Python is blocked."}"#] {
                let (mut stream,_)=listener.accept().await.unwrap();let mut bytes=vec![0;4096];let size=stream.read(&mut bytes).await.unwrap();
                seen.push(serde_json::from_slice::<Value>(&bytes[..size]).unwrap());stream.write_all(reply.as_bytes()).await.unwrap();
            }
            seen
        });
        let token="b".repeat(64);
        let scene=helper_command_at(port,json!({"type":"get_scene_info","params":{}}),&token,Duration::from_secs(2)).await.unwrap();
        assert_eq!(command_response(Ok(scene))["ok"],true);
        let code=match prepare("execute_code",&json!({"code":"print(1)"}),true,true).unwrap(){Prepared::Background(body)=>body,other=>panic!("{other:?}")};
        let refused=helper_command_at(port,code,&token,Duration::from_secs(2)).await.unwrap();
        assert_eq!(refused["message"],SAFE_MODE_MESSAGE,"the helper's safe-mode answer reads the same as the background one");
        let seen=task.await.unwrap();
        assert_eq!((seen[0]["type"].clone(),seen[0]["token"].clone()),(json!("get_scene_info"),json!(token)),"every request carries the pairing word");
        assert_eq!((seen[1]["allow_code"].clone(),seen[1]["token"].clone()),(json!(true),json!(token)),"free Python carries the app's own mark only when it was switched on");
        // Nothing listening is told apart from a reply, so the older helper can be tried next.
        drop(seen);
        let closed=helper_command_at(port,json!({"type":"get_scene_info","params":{}}),&token,Duration::from_secs(2)).await.unwrap_err();
        assert!(closed.downcast_ref::<NotListening>().is_some(),"{closed}");
        assert!(helper_shape(&json!({"status":"error","code":"wrong_pair","message":"other install"}))["message"]=="other install");
        assert!(helper_shape(&json!({"status":"error","code":"unknown_op"}))["message"].as_str().unwrap().contains("Add helper"));
    }
}