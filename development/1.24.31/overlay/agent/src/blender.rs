use axum::Json;
use serde_json::{json, Value};
use std::time::Duration;
use tokio::{io::{AsyncReadExt, AsyncWriteExt}, net::TcpStream};

static LAST_CONNECTION: std::sync::Mutex<Option<(std::time::Instant,bool)>> = std::sync::Mutex::new(None);
pub fn connected() -> Option<bool> { LAST_CONNECTION.lock().ok().and_then(|state|state.as_ref().filter(|(at,_)|at.elapsed()<Duration::from_secs(20)).map(|(_,ready)|*ready)) }

async fn command_slot<'a>(lock: &'a tokio::sync::Mutex<()>, kind: &str) -> anyhow::Result<tokio::sync::MutexGuard<'a, ()>> {
    // A read-only connection check must not queue behind a long render for
    // 45 s: every caller needs the scene response within its 12-15 s deadline.
    let wait = if kind == "get_scene_info" { 2 } else { 45 };
    tokio::time::timeout(Duration::from_secs(wait), lock.lock()).await
        .map_err(|_| anyhow::anyhow!("Blender is processing another PlazCode command. Wait for it to finish before running a scene check."))
}

pub async fn command_at(host: &str, port: u16, kind: &str, params: Value, limit: Duration) -> anyhow::Result<Value> {
    tokio::time::timeout(limit, async {
        let mut socket = TcpStream::connect((host, port)).await?;
        socket.write_all(&serde_json::to_vec(&json!({"type":kind,"params":params}))?).await?;
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

pub async fn command(kind: &str, params: Value, limit: Duration) -> anyhow::Result<Value> {
    static COMMAND_LOCK: once_cell::sync::Lazy<tokio::sync::Mutex<()>> = once_cell::sync::Lazy::new(||tokio::sync::Mutex::new(()));
    // Several chats/browsers can share one Blender. Wait briefly for the active
    // command instead of failing immediately; commands are never repeated.
    let _guard = command_slot(&COMMAND_LOCK, kind).await?;
    let config=crate::mcp_addons::read_config();
    let spec=config.servers.get("blender");
    let host = spec.and_then(|s|s.env.get("BLENDER_HOST")).cloned().or_else(||std::env::var("BLENDER_HOST").ok()).unwrap_or_else(|| "127.0.0.1".into());
    let port = spec.and_then(|s|s.env.get("BLENDER_PORT")).cloned().or_else(||std::env::var("BLENDER_PORT").ok()).and_then(|v|v.parse().ok()).unwrap_or(9876);
    let result=command_at(&host,port,kind,params,limit).await;
    // A slow reply means Blender is busy, not disconnected: keep the last known
    // state so the extension does not drop a live Blender connection.
    let busy=matches!(&result,Err(error) if error.to_string().contains("did not answer"));
    if !busy {if let Ok(mut state)=LAST_CONNECTION.lock(){*state=Some((std::time::Instant::now(),result.is_ok()));}}
    result
}

pub async fn post(Json(request): Json<Value>) -> Json<Value> {
    let kind = request["type"].as_str().unwrap_or("get_scene_info");
    let seconds = if kind == "get_scene_info" {8} else {request["timeout_seconds"].as_u64().unwrap_or(120).clamp(1,180)};
    Json(command_response(command(kind, request.get("params").cloned().unwrap_or_else(||json!({})), Duration::from_secs(seconds)).await))
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
    #[test] fn an_addon_error_is_not_a_successful_scene_check() {
        let result=command_response(Ok(json!({"status":"error","message":"Scene is unavailable"})));
        assert_eq!(result["ok"],false);assert_eq!(result["error"],"Scene is unavailable");
        assert_eq!(result["blender"],true,"the addon replied, but the scene check failed");
        assert_eq!(command_response(Ok(json!({"status":"success","result":{"objects":[]}})))["ok"],true);
    }
}
