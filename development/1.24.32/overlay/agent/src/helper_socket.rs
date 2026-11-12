//! The local connection for PlazCode's own helpers inside other apps (Blockbench's desktop app first, Figma later).
//!
//! A helper dials `ws://127.0.0.1:3000/helper` and sends its pairing word as its first message. Rules, in the
//! order they are checked (the security review is in development/1.24.32/CONNECTIONS-REWORK-PROGRESS.md):
//! - only loopback host names, and never a web page or a browser extension (those have no helper);
//! - a pairing word made for exactly this app by this PlazCode, compared in constant time, within five seconds;
//! - authority runs one way: PlazCode asks, the helper answers. Nothing a helper sends can make PlazCode do
//!   anything; a message that is not an answer to a waiting request is dropped;
//! - one live helper per app (a newer one replaces the older), one request at a time, with a time limit;
//! - size and speed limits, and a pause after repeated wrong pairing words.
//! The pairing word is never logged and never leaves this module.
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use futures::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Largest message a paired helper may send (pictures travel as text).
pub const MAX_MESSAGE: usize = 8 * 1024 * 1024;
const MAX_HELLO: usize = 1024;
const MAX_UNPAIRED: usize = 8;
const HELLO_LIMIT: Duration = Duration::from_secs(5);
const FAILURES_BEFORE_PAUSE: usize = 20;
const FAILURE_WINDOW: Duration = Duration::from_secs(60);
const MAX_PER_SECOND: u32 = 200;

/// Why a request to a helper did not produce an answer. `Display` is the sentence shown to the person or the AI.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Trouble { NotConnected, Dropped, Replaced, TimedOut(u64), Busy, Helper(String) }
impl std::fmt::Display for Trouble {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Trouble::NotConnected => write!(f, "The app is not connected to PlazCode. Open it and load the PlazCode helper (PlazCode, Apps & servers shows how)."),
            Trouble::Dropped => write!(f, "The app closed its connection before answering. The change may or may not have happened: look at the app before trying again."),
            Trouble::Replaced => write!(f, "Another window of the app connected and took over. Send the request again; it goes to the newer window."),
            Trouble::TimedOut(seconds) => write!(f, "The app did not answer within {seconds} seconds. It may still be working: look at the app before trying again."),
            Trouble::Busy => write!(f, "The app is still working on an earlier PlazCode request. Wait for it to finish, then send this one again. Nothing was queued or repeated."),
            Trouble::Helper(message) => write!(f, "{message}"),
        }
    }
}

enum Outgoing { Text(String), Close(&'static str) }
struct Live { conn: u64, tx: tokio::sync::mpsc::Sender<Outgoing>, info: Value, pending: HashMap<u64, tokio::sync::oneshot::Sender<Result<Value, Trouble>>> }
#[derive(Default)]
struct Inner {
    words: HashMap<String, String>,
    live: HashMap<String, Live>,
    turns: HashMap<String, Arc<tokio::sync::Mutex<()>>>,
    unpaired: usize,
    failures: VecDeque<Instant>,
    next_conn: u64,
    next_request: u64,
    stray: u64,
}

/// All helper connections of this PlazCode. One per running app (`hub()`); tests make their own.
#[derive(Default)]
pub struct Hub { inner: Mutex<Inner> }

static HUB: once_cell::sync::Lazy<Arc<Hub>> = once_cell::sync::Lazy::new(|| Arc::new(Hub::default()));
pub fn hub() -> &'static Arc<Hub> { &HUB }

fn word_ok(word: &str) -> bool { word.len() == 64 && word.bytes().all(|b| b.is_ascii_hexdigit()) }
fn same(a: &str, b: &str) -> bool { a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |d, (x, y)| d | (x ^ y)) == 0 }

/// A web page or a browser extension is never a helper. No Origin, `null`, `file://` and app schemes may try the word.
pub fn origin_allowed(headers: &HeaderMap) -> bool {
    match headers.get("origin") {
        None => true,
        Some(value) => value.to_str().map(|origin| {
            let origin = origin.trim().to_ascii_lowercase();
            !(origin.starts_with("http://") || origin.starts_with("https://") || origin.contains("extension://"))
        }).unwrap_or(false),
    }
}

fn note(level: &str, what: &str, text: &str, data: Value) {
    if level == "warn" { tracing::warn!("helper connection: {text}"); } else { tracing::info!("helper connection: {text}"); }
    crate::events::record("helper", level, what, text, data);
}

struct Unpaired(Arc<Hub>);
impl Drop for Unpaired { fn drop(&mut self) { let mut inner = self.0.lock(); inner.unpaired = inner.unpaired.saturating_sub(1); } }

impl Hub {
    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> { self.inner.lock().unwrap_or_else(|error| error.into_inner()) }

    /// Set (or, with `None`, forget) the pairing word of one app. A changed or forgotten word closes that app's
    /// live helper at once, so a helper file left behind after Disconnect cannot be used again.
    pub fn set_word(&self, app: &str, word: Option<&str>) {
        let mut inner = self.lock();
        let unchanged = match (inner.words.get(app), word) { (Some(old), Some(new)) => same(old, new), (None, None) => true, _ => false };
        match word.filter(|word| word_ok(word)) { Some(word) => { inner.words.insert(app.to_string(), word.to_string()); } None => { inner.words.remove(app); } }
        if unchanged { return; }
        if let Some(live) = inner.live.remove(app) { close(live, Trouble::NotConnected, "PlazCode was disconnected from this app."); }
    }

    /// What the connected helper said about itself (app version and so on), if one is connected.
    pub fn connected(&self, app: &str) -> Option<Value> { self.lock().live.get(app).map(|live| live.info.clone()) }

    /// How many messages from helpers were dropped because they were not answers to a waiting request.
    pub fn stray(&self) -> u64 { self.lock().stray }

    fn paused(inner: &mut Inner) -> bool {
        while inner.failures.front().is_some_and(|at| at.elapsed() > FAILURE_WINDOW) { inner.failures.pop_front(); }
        inner.failures.len() >= FAILURES_BEFORE_PAUSE
    }
    fn failed(&self, why: &str) {
        let mut inner = self.lock();
        inner.failures.push_back(Instant::now());
        while inner.failures.len() > FAILURES_BEFORE_PAUSE { inner.failures.pop_front(); }
        let paused = Self::paused(&mut inner);
        drop(inner);
        note("warn", "pairing_refused", &format!("a connection was refused ({why}){}", if paused { "; new pairings are paused for a minute" } else { "" }), json!({"why": why, "paused": paused}));
    }

    /// Ask the app's helper to do one named thing and wait for its answer.
    pub async fn request(&self, app: &str, cmd: &str, args: Value, limit: Duration) -> Result<Value, Trouble> {
        let turn = { let mut inner = self.lock(); if !inner.live.contains_key(app) { return Err(Trouble::NotConnected); } inner.turns.entry(app.to_string()).or_default().clone() };
        // One request at a time per app; a later one waits its turn, but not for ever.
        let _turn = tokio::time::timeout(limit.max(Duration::from_secs(1)), turn.lock()).await.map_err(|_| Trouble::Busy)?;
        let (id, conn, tx, rx) = {
            let mut inner = self.lock();
            inner.next_request += 1;
            let id = inner.next_request;
            let Some(live) = inner.live.get_mut(app) else { return Err(Trouble::NotConnected); };
            let (answer, rx) = tokio::sync::oneshot::channel();
            live.pending.insert(id, answer);
            (id, live.conn, live.tx.clone(), rx)
        };
        let forget = |hub: &Hub| { let mut inner = hub.lock(); if let Some(live) = inner.live.get_mut(app).filter(|live| live.conn == conn) { live.pending.remove(&id); } };
        if tx.send(Outgoing::Text(json!({"id": id, "cmd": cmd, "args": args}).to_string())).await.is_err() { forget(self); return Err(Trouble::Dropped); }
        match tokio::time::timeout(limit, rx).await {
            Ok(Ok(answer)) => answer,
            Ok(Err(_)) => Err(Trouble::Dropped),
            Err(_) => {
                forget(self);
                note("warn", "request_timeout", &format!("{app} did not answer \"{cmd}\" within {} seconds", limit.as_secs()), json!({"app": app, "cmd": cmd}));
                Err(Trouble::TimedOut(limit.as_secs()))
            }
        }
    }
}

fn close(live: Live, trouble: Trouble, reason: &'static str) {
    for (_, waiting) in live.pending { let _ = waiting.send(Err(trouble.clone())); }
    let _ = live.tx.try_send(Outgoing::Close(reason));
}

/// The `/helper` address. Checked before the connection is accepted: host, origin, pause, number of unpaired callers.
pub async fn upgrade(ws: WebSocketUpgrade, headers: HeaderMap) -> axum::response::Response { upgrade_on(hub().clone(), ws, headers) }

pub fn upgrade_on(hub: Arc<Hub>, ws: WebSocketUpgrade, headers: HeaderMap) -> axum::response::Response {
    if !crate::security::allowed_authority(&headers) { hub.failed("the address used was not this computer"); return StatusCode::FORBIDDEN.into_response(); }
    if !origin_allowed(&headers) { hub.failed("it came from a web page or a browser extension"); return StatusCode::FORBIDDEN.into_response(); }
    let guard = {
        let mut inner = hub.lock();
        if Hub::paused(&mut inner) || inner.unpaired >= MAX_UNPAIRED { return StatusCode::TOO_MANY_REQUESTS.into_response(); }
        inner.unpaired += 1;
        Unpaired(hub.clone())
    };
    ws.max_message_size(MAX_MESSAGE).max_frame_size(MAX_MESSAGE).on_upgrade(move |socket| serve(hub, socket, guard))
}

async fn serve(hub: Arc<Hub>, mut socket: WebSocket, guard: Unpaired) {
    // 1. The pairing word, as the first message, within five seconds.
    let hello = match tokio::time::timeout(HELLO_LIMIT, socket.recv()).await {
        Ok(Some(Ok(Message::Text(text)))) if text.len() <= MAX_HELLO => serde_json::from_str::<Value>(&text).ok(),
        Ok(Some(Ok(_))) => None,
        _ => { drop(guard); hub.failed("no pairing word arrived in time"); return; }
    };
    let app = hello.as_ref().and_then(|hello| hello["app"].as_str()).unwrap_or("").to_string();
    let offered = hello.as_ref().and_then(|hello| hello["word"].as_str()).unwrap_or("").to_string();
    let offered = offered.as_str();
    let known = hub.lock().words.get(&app).cloned();
    // Compare even when the app is unknown, so the answer takes the same time either way.
    let paired = same(offered, known.as_deref().unwrap_or(&"0".repeat(64))) && known.is_some() && word_ok(offered);
    drop(guard);
    if !paired { hub.failed("the pairing word was missing or wrong"); let _ = socket.close().await; return; }
    let info = { let hello = hello.unwrap_or(Value::Null); json!({"version": hello["version"].as_str().unwrap_or("").chars().take(40).collect::<String>(), "variant": hello["variant"].as_str().unwrap_or("").chars().take(20).collect::<String>()}) };

    // 2. Take the app's one place; an older helper of the same app is closed.
    let (tx, mut rx) = tokio::sync::mpsc::channel::<Outgoing>(16);
    let conn = {
        let mut inner = hub.lock();
        if !inner.words.get(&app).is_some_and(|word| same(word, offered)) { return; } // disconnected in between
        inner.next_conn += 1;
        let conn = inner.next_conn;
        if let Some(older) = inner.live.insert(app.clone(), Live { conn, tx, info: info.clone(), pending: HashMap::new() }) { close(older, Trouble::Replaced, "A newer window of this app connected to PlazCode."); }
        conn
    };
    note("info", "helper_connected", &format!("{app} connected"), json!({"app": app, "info": info}));
    let _ = socket.send(Message::Text(json!({"paired": true}).to_string())).await;

    // 3. PlazCode asks, the helper answers.
    let (mut second, mut count) = (Instant::now(), 0u32);
    let why = loop {
        tokio::select! {
            outgoing = rx.recv() => match outgoing {
                Some(Outgoing::Text(text)) => { if socket.send(Message::Text(text)).await.is_err() { break "the connection broke"; } }
                Some(Outgoing::Close(reason)) => { let _ = socket.send(Message::Text(json!({"closed": reason}).to_string())).await; break reason; }
                None => break "PlazCode let go of it",
            },
            incoming = socket.recv() => match incoming {
                Some(Ok(Message::Text(text))) => {
                    if second.elapsed() >= Duration::from_secs(1) { second = Instant::now(); count = 0; }
                    count += 1;
                    if count > MAX_PER_SECOND { break "it sent too many messages"; }
                    let Ok(message) = serde_json::from_str::<Value>(&text) else { hub.lock().stray += 1; continue; };
                    let waiting = message["id"].as_u64().and_then(|id| { let mut inner = hub.lock(); inner.live.get_mut(&app).filter(|live| live.conn == conn).and_then(|live| live.pending.remove(&id)) });
                    match waiting {
                        Some(waiting) => {
                            let answer = if message["ok"] == true { Ok(message.get("result").cloned().unwrap_or(Value::Null)) }
                                else { Err(Trouble::Helper(message["message"].as_str().unwrap_or("The app could not do that.").chars().take(4000).collect())) };
                            let _ = waiting.send(answer);
                        }
                        // Not an answer to a waiting request (a heartbeat, or anything else): never acted on.
                        None => { if message.get("beat").is_none() { hub.lock().stray += 1; } }
                    }
                }
                Some(Ok(Message::Close(_))) | None => break "the app closed it",
                Some(Ok(_)) => {}
                Some(Err(_)) => break "the connection broke",
            }
        }
    };
    let _ = socket.close().await;
    let mine = { let mut inner = hub.lock(); if inner.live.get(&app).is_some_and(|live| live.conn == conn) { inner.live.remove(&app) } else { None } };
    if let Some(live) = mine { for (_, waiting) in live.pending { let _ = waiting.send(Err(Trouble::Dropped)); } }
    note("info", "helper_dropped", &format!("{app} disconnected: {why}"), json!({"app": app, "why": why}));
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio_tungstenite::tungstenite::{client::IntoClientRequest, Message as Wire};
    type Client = tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

    async fn serve_hub() -> (Arc<Hub>, u16) {
        let hub = Arc::new(Hub::default());
        let shared = hub.clone();
        let app = axum::Router::new().route("/helper", axum::routing::get(move |ws: WebSocketUpgrade, headers: HeaderMap| { let hub = shared.clone(); async move { upgrade_on(hub, ws, headers) } }));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap(); });
        (hub, port)
    }
    async fn dial(port: u16, headers: &[(&'static str, &str)]) -> Result<Client, u16> {
        let mut request = format!("ws://127.0.0.1:{port}/helper").into_client_request().unwrap();
        for (name, value) in headers { request.headers_mut().insert(*name, value.parse().unwrap()); }
        match tokio_tungstenite::connect_async(request).await {
            Ok((client, _)) => Ok(client),
            Err(tokio_tungstenite::tungstenite::Error::Http(response)) => Err(response.status().as_u16()),
            Err(error) => panic!("{error}"),
        }
    }
    async fn hello(client: &mut Client, app: &str, word: &str) -> bool {
        client.send(Wire::Text(json!({"hello": 1, "app": app, "word": word, "version": "5.0.1", "variant": "desktop"}).to_string().into())).await.unwrap();
        matches!(tokio::time::timeout(Duration::from_secs(3), client.next()).await, Ok(Some(Ok(Wire::Text(text)))) if text.contains("\"paired\":true"))
    }
    async fn next_json(client: &mut Client) -> Value {
        loop { match tokio::time::timeout(Duration::from_secs(3), client.next()).await.expect("a message in time") { Some(Ok(Wire::Text(text))) => return serde_json::from_str(&text).unwrap(), Some(Ok(_)) => continue, other => panic!("connection ended: {other:?}") } }
    }
    async fn gone(client: &mut Client) -> bool {
        loop { match tokio::time::timeout(Duration::from_secs(3), client.next()).await { Ok(Some(Ok(Wire::Text(text)))) if text.contains("closed") => continue, Ok(None) | Ok(Some(Err(_))) | Ok(Some(Ok(Wire::Close(_)))) => return true, Ok(Some(Ok(_))) => continue, Err(_) => return false } }
    }
    fn word(letter: char) -> String { letter.to_string().repeat(64) }

    #[tokio::test] async fn only_the_right_pairing_word_gets_in() {
        let (hub, port) = serve_hub().await;
        hub.set_word("blockbench", Some(&word('a')));
        hub.set_word("figma", Some(&word('f')));
        // No word, a wrong word, another app's word, an unknown app, a first message that is too long: all closed.
        for (app, offered) in [("blockbench", String::new()), ("blockbench", word('b')), ("blockbench", word('f')), ("unity", word('a')), ("blockbench", format!("{}{}", word('a'), "x".repeat(2000)))] {
            let mut client = dial(port, &[]).await.unwrap();
            assert!(!hello(&mut client, app, &offered).await, "{app} with a wrong word must not pair");
            assert!(gone(&mut client).await);
        }
        assert!(hub.connected("blockbench").is_none());
        let mut client = dial(port, &[("origin", "file://")]).await.unwrap();
        assert!(hello(&mut client, "blockbench", &word('a')).await);
        assert_eq!(hub.connected("blockbench").unwrap()["version"], "5.0.1");
        assert!(hub.connected("figma").is_none(), "pairing one app says nothing about another");
        // The word is nowhere in what the hub tells others.
        assert!(!hub.connected("blockbench").unwrap().to_string().contains(&word('a')));
    }

    #[tokio::test] async fn web_pages_extensions_and_rebound_hosts_are_refused_before_any_word() {
        let (hub, port) = serve_hub().await;
        hub.set_word("blockbench", Some(&word('a')));
        for origin in ["https://web.blockbench.net", "http://evil.example", "https://127.0.0.1:3000", "chrome-extension://abcdefghijklmnopabcdefghijklmnop", "moz-extension://12345678-1234-1234-1234-123456789abc"] {
            assert_eq!(dial(port, &[("origin", origin)]).await.err(), Some(403), "{origin}");
        }
        assert_eq!(dial(port, &[("host", "evil.example:3000")]).await.err(), Some(403), "a rebound host name");
        for origin in ["null", "file://", "app://blockbench"] { assert!(dial(port, &[("origin", origin)]).await.is_ok(), "{origin} may try its word"); }
        assert!(hub.connected("blockbench").is_none(), "getting through the door is not pairing");
    }

    #[tokio::test] async fn a_silent_caller_is_dropped_and_repeated_wrong_words_pause_pairing() {
        let (hub, port) = serve_hub().await;
        hub.set_word("blockbench", Some(&word('a')));
        // More unpaired callers than allowed at once: the extra one is turned away.
        let mut silent = Vec::new();
        for _ in 0..MAX_UNPAIRED { silent.push(dial(port, &[]).await.unwrap()); }
        assert_eq!(dial(port, &[]).await.err(), Some(429));
        drop(silent);
        tokio::time::sleep(Duration::from_millis(200)).await;
        for _ in 0..FAILURES_BEFORE_PAUSE { if let Ok(mut client) = dial(port, &[]).await { let _ = hello(&mut client, "blockbench", &word('b')).await; } }
        assert_eq!(dial(port, &[]).await.err(), Some(429), "paused after repeated wrong words");
        // The pause is about new pairings only; it ends by itself (shortened here by clearing the record).
        hub.lock().failures.clear();
        let mut client = dial(port, &[]).await.unwrap();
        assert!(hello(&mut client, "blockbench", &word('a')).await);
    }

    #[tokio::test] async fn plazcode_asks_and_the_helper_only_answers() {
        let (hub, port) = serve_hub().await;
        hub.set_word("blockbench", Some(&word('a')));
        assert_eq!(hub.request("blockbench", "status", json!({}), Duration::from_secs(1)).await, Err(Trouble::NotConnected));
        let mut client = dial(port, &[]).await.unwrap();
        assert!(hello(&mut client, "blockbench", &word('a')).await);
        // Things a helper might send on its own are never acted on.
        for stray in [json!({"cmd": "read_file", "args": {"path": "/etc/passwd"}}).to_string(), json!({"id": 999, "ok": true, "result": "nobody asked"}).to_string(), "not json".to_string()] { client.send(Wire::Text(stray.into())).await.unwrap(); }
        client.send(Wire::Text(json!({"beat": 1}).to_string().into())).await.unwrap();
        let asking = { let hub = hub.clone(); tokio::spawn(async move { hub.request("blockbench", "cube_add", json!({"name": "door"}), Duration::from_secs(5)).await }) };
        let request = next_json(&mut client).await;
        assert_eq!((request["cmd"].as_str(), request["args"]["name"].as_str()), (Some("cube_add"), Some("door")));
        client.send(Wire::Text(json!({"id": request["id"], "ok": true, "result": {"uuid": "u1"}}).to_string().into())).await.unwrap();
        assert_eq!(asking.await.unwrap(), Ok(json!({"uuid": "u1"})));
        assert_eq!(hub.stray(), 3, "three stray messages counted, the heartbeat is not one");
        // A refusal from the helper is passed on as its own sentence.
        let asking = { let hub = hub.clone(); tokio::spawn(async move { hub.request("blockbench", "cube_add", json!({}), Duration::from_secs(5)).await }) };
        let request = next_json(&mut client).await;
        client.send(Wire::Text(json!({"id": request["id"], "ok": false, "message": "No project is open."}).to_string().into())).await.unwrap();
        assert_eq!(asking.await.unwrap(), Err(Trouble::Helper("No project is open.".into())));
        // No answer in time; a late answer to that request is then just a stray message.
        let late = hub.request("blockbench", "export", json!({}), Duration::from_millis(300)).await;
        assert_eq!(late, Err(Trouble::TimedOut(0)));
        let request = next_json(&mut client).await;
        client.send(Wire::Text(json!({"id": request["id"], "ok": true, "result": 1}).to_string().into())).await.unwrap();
        // The helper goes away while a request waits.
        let asking = { let hub = hub.clone(); tokio::spawn(async move { hub.request("blockbench", "status", json!({}), Duration::from_secs(5)).await }) };
        let _ = next_json(&mut client).await;
        drop(client);
        assert_eq!(asking.await.unwrap(), Err(Trouble::Dropped));
        tokio::time::sleep(Duration::from_millis(200)).await;
        assert!(hub.connected("blockbench").is_none());
        assert_eq!(hub.stray(), 4);
    }

    #[tokio::test] async fn requests_take_turns_a_newer_helper_replaces_the_older_and_disconnect_kills_the_word() {
        let (hub, port) = serve_hub().await;
        hub.set_word("blockbench", Some(&word('a')));
        let mut first = dial(port, &[]).await.unwrap();
        assert!(hello(&mut first, "blockbench", &word('a')).await);
        // Two requests at once reach the helper one after the other.
        let one = { let hub = hub.clone(); tokio::spawn(async move { hub.request("blockbench", "one", json!({}), Duration::from_secs(5)).await }) };
        let request = next_json(&mut first).await;
        let two = { let hub = hub.clone(); tokio::spawn(async move { hub.request("blockbench", "two", json!({}), Duration::from_secs(5)).await }) };
        assert!(tokio::time::timeout(Duration::from_millis(300), first.next()).await.is_err(), "the second request waits for the first answer");
        first.send(Wire::Text(json!({"id": request["id"], "ok": true, "result": 1}).to_string().into())).await.unwrap();
        assert_eq!(one.await.unwrap(), Ok(json!(1)));
        let request = next_json(&mut first).await;
        assert_eq!(request["cmd"], "two");
        // A second window pairs while the first still owes an answer: the first is closed, its request fails plainly.
        let mut second = dial(port, &[]).await.unwrap();
        assert!(hello(&mut second, "blockbench", &word('a')).await);
        assert_eq!(two.await.unwrap(), Err(Trouble::Replaced));
        assert!(gone(&mut first).await);
        let asking = { let hub = hub.clone(); tokio::spawn(async move { hub.request("blockbench", "status", json!({}), Duration::from_secs(5)).await }) };
        let request = next_json(&mut second).await;
        second.send(Wire::Text(json!({"id": request["id"], "ok": true, "result": "second"}).to_string().into())).await.unwrap();
        assert_eq!(asking.await.unwrap(), Ok(json!("second")));
        // Setting the same word again changes nothing; Disconnect forgets it and closes the helper.
        hub.set_word("blockbench", Some(&word('a')));
        assert!(hub.connected("blockbench").is_some());
        hub.set_word("blockbench", None);
        assert!(hub.connected("blockbench").is_none());
        assert!(gone(&mut second).await);
        // The helper file left behind still holds the old word: it can no longer get in, even after a new Allow.
        let mut replay = dial(port, &[]).await.unwrap();
        assert!(!hello(&mut replay, "blockbench", &word('a')).await);
        hub.set_word("blockbench", Some(&word('c')));
        let mut replay = dial(port, &[]).await.unwrap();
        assert!(!hello(&mut replay, "blockbench", &word('a')).await, "an old word does not work after a new Allow");
        let mut fresh = dial(port, &[]).await.unwrap();
        assert!(hello(&mut fresh, "blockbench", &word('c')).await);
    }

    #[tokio::test] async fn a_flooding_helper_is_cut_off() {
        let (hub, port) = serve_hub().await;
        hub.set_word("blockbench", Some(&word('a')));
        let mut client = dial(port, &[]).await.unwrap();
        assert!(hello(&mut client, "blockbench", &word('a')).await);
        for _ in 0..(MAX_PER_SECOND + 50) { if client.send(Wire::Text(json!({"beat": 1}).to_string().into())).await.is_err() { break; } }
        assert!(gone(&mut client).await);
        tokio::time::sleep(Duration::from_millis(200)).await;
        assert!(hub.connected("blockbench").is_none());
    }
}
