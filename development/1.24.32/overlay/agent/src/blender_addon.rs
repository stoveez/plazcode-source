//! PlazCode's own helper for an open Blender window ("My open Blender window").
//!
//! The helper is an add-on folder named `plazcode_blender`. Its program is built here from the same executor the
//! background controller uses, so a built-in action, the scene check and safe mode behave the same both ways.
//! Each installed copy carries a pairing word made for this PlazCode; the helper refuses requests without it.
use std::path::Path;

/// The add-on's folder name inside Blender's add-ons folder. Also its module name.
pub const FOLDER: &str = "plazcode_blender";
const ADDON: &str = include_str!("../blender_addon.py");
const OPS: &str = include_str!("../../blender_ops.py");
const SHOT: &str = include_str!("../blender_shot.py");
const MARKER: &str = "# __PLAZCODE_EXECUTOR__";

/// A fresh pairing word: 64 hex characters from the system's random source.
pub fn new_token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).expect("the system's random source is available");
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn token_ok(token: &str) -> bool { token.len() == 64 && token.bytes().all(|b| b.is_ascii_hexdigit()) }

/// The helper's files: (name, text). The same text for every install except the pairing file.
pub fn files(token: &str, port: u16) -> anyhow::Result<Vec<(&'static str, String)>> {
    anyhow::ensure!(token_ok(token), "PlazCode could not make a pairing word for the Blender helper.");
    anyhow::ensure!(ADDON.matches(MARKER).count() == 1, "PlazCode's Blender helper file is not the expected one.");
    Ok(vec![
        ("__init__.py", ADDON.replace(MARKER, crate::blender_headless::EXECUTOR)),
        ("blender_ops.py", OPS.to_string()),
        ("blender_shot.py", SHOT.to_string()),
        ("pairing.json", serde_json::json!({"token": token, "port": port}).to_string()),
    ])
}

/// Write the helper's files into `folder` (made if missing).
pub fn write_files(folder: &Path, token: &str, port: u16) -> anyhow::Result<()> {
    std::fs::create_dir_all(folder)?;
    for (name, text) in files(token, port)? { std::fs::write(folder.join(name), text)?; }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    #[test] fn the_helper_is_built_from_the_shared_executor_and_needs_a_real_pairing_word() {
        let token = new_token();
        assert!(token_ok(&token) && token != new_token(), "pairing words are random");
        let files = files(&token, 9876).unwrap();
        let init = &files.iter().find(|(name, _)| *name == "__init__.py").unwrap().1;
        assert!(init.starts_with("# SPDX") && init.contains("bl_info = {") && !init.contains(MARKER));
        assert!(init.find("bl_info = {").unwrap() < init.find("def answer(request, ops, folder):").unwrap(), "Blender reads bl_info first; the executor follows");
        assert!(init.contains("def render_shot(") && init.contains("PICTURE = viewport_shot") && init.contains("hmac.compare_digest"));
        let pairing: Value = serde_json::from_str(&files.iter().find(|(name, _)| *name == "pairing.json").unwrap().1).unwrap();
        assert_eq!(pairing, json!({"token": token, "port": 9876}));
        assert_eq!(files.iter().map(|(name, _)| *name).collect::<Vec<_>>(), ["__init__.py", "blender_ops.py", "blender_shot.py", "pairing.json"]);
        for bad in ["", "short", &"g".repeat(64)] { assert!(super::files(bad, 9876).is_err(), "{bad}"); }
    }

    /// One request to the helper's socket, the way the app sends it.
    #[cfg(unix)]
    async fn ask(port: u16, body: Value) -> Value {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let mut socket = tokio::net::TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        socket.write_all(&serde_json::to_vec(&body).unwrap()).await.unwrap();
        let mut data = Vec::new();
        tokio::time::timeout(std::time::Duration::from_secs(60), socket.read_to_end(&mut data)).await.unwrap().unwrap();
        serde_json::from_slice(&data).unwrap()
    }

    /// The real helper inside a real Blender, over its real socket. Blender runs without a window here, so the test
    /// runs the helper's main-thread step itself; the picture of the 3D view needs a window and must say so.
    /// `PLAZCODE_BLENDER=<blender> cargo test real_blender -- --ignored`
    #[cfg(unix)]
    #[tokio::test] #[ignore] async fn real_blender_helper_pairs_runs_actions_and_keeps_safe_mode() {
        let program = std::path::PathBuf::from(std::env::var("PLAZCODE_BLENDER").expect("set PLAZCODE_BLENDER to a Blender program"));
        let root = std::env::temp_dir().join(format!("plazcode-helper-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let port = { let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap(); listener.local_addr().unwrap().port() };
        let token = new_token();
        write_files(&root.join(FOLDER), &token, port).unwrap();
        let harness = root.join("harness.py");
        std::fs::write(&harness, r#"
import os, sys, time
root = sys.argv[sys.argv.index("--session") + 1]
sys.path.insert(0, root)
os.environ["PLAZCODE_HELPER_TEST"] = "1"
import plazcode_blender as helper
assert helper.start(), helper._state["error"]
end = time.time() + 120
while time.time() < end and not os.path.exists(os.path.join(root, "stop")):
    helper.pump(); time.sleep(0.02)
helper.unregister()
"#).unwrap();
        let mut child = tokio::process::Command::new(&program).args(["--background", "--factory-startup", "--python"]).arg(&harness).arg("--").arg("--session").arg(&root)
            .stdout(std::process::Stdio::null()).stderr(std::process::Stdio::inherit()).kill_on_drop(true).spawn().unwrap();
        for _ in 0..600 { if tokio::net::TcpStream::connect(("127.0.0.1", port)).await.is_ok() { break; } tokio::time::sleep(std::time::Duration::from_millis(100)).await; }

        let none = ask(port, json!({"type": "get_scene_info", "params": {}})).await;
        assert_eq!((none["status"].clone(), none["code"].clone()), (json!("error"), json!("wrong_pair")), "no pairing word, no answer");
        let wrong = ask(port, json!({"type": "get_scene_info", "params": {}, "token": new_token()})).await;
        assert_eq!(wrong["code"], "wrong_pair", "another install's word is refused");
        let hello = ask(port, json!({"type": "plazcode_hello", "token": token})).await;
        assert_eq!((hello["status"].clone(), hello["result"]["plazcode_helper"].clone()), (json!("success"), json!(1)), "{hello}");
        let cube = ask(port, json!({"type": "plazcode_op", "params": {"cmd": "add_cube", "args": {"name": "PZ Helper Cube"}}, "token": token})).await;
        assert_eq!(cube["status"], "success", "{cube}");
        let scene = ask(port, json!({"type": "get_scene_info", "params": {}, "token": token})).await;
        assert!(scene["result"]["objects"].to_string().contains("PZ Helper Cube"), "{scene}");
        let blocked = ask(port, json!({"type": "execute_code", "params": {"code": "print(6*7)"}, "token": token})).await;
        assert_eq!((blocked["status"].clone(), blocked["code"].clone()), (json!("error"), json!("safe_mode")), "free Python needs the app's own mark");
        let allowed = ask(port, json!({"type": "execute_code", "allow_code": true, "params": {"code": "print(6*7)"}, "token": token})).await;
        assert_eq!(allowed["result"]["result"].as_str().map(str::trim), Some("42"), "{allowed}");
        let unknown = ask(port, json!({"type": "format_disk", "params": {}, "token": token})).await;
        assert_eq!(unknown["code"], "unknown_op");
        let shot = ask(port, json!({"type": "plazcode_shot", "params": {"filepath": root.join("shot.png").display().to_string(), "max_size": 320}, "token": token})).await;
        // With no window there is no 3D view to capture: the helper says so and does not quietly render instead.
        assert!(shot["status"] == "error" && !root.join("shot.png").exists(), "the open-window picture is the 3D view, not a render: {shot}");

        std::fs::write(root.join("stop"), "").unwrap();
        let _ = tokio::time::timeout(std::time::Duration::from_secs(20), child.wait()).await;
        let _ = std::fs::remove_dir_all(root);
    }
}
