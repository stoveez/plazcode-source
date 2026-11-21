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

const SETUP: &str = include_str!("../blender_addon_setup.py");

/// What the checklist row "Add the PlazCode helper" shows while PlazCode works on it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Status { Idle, Working, Failed(String) }
static STATUS: std::sync::Mutex<Status> = std::sync::Mutex::new(Status::Idle);
fn set_status(status: Status) { *STATUS.lock().unwrap_or_else(|error| error.into_inner()) = status; }
pub fn status() -> Status { STATUS.lock().unwrap_or_else(|error| error.into_inner()).clone() }

fn scratch() -> std::path::PathBuf {
    static RUN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    std::env::temp_dir().join(format!("plazcode-blender-helper-{}-{}", std::process::id(), RUN.fetch_add(1, std::sync::atomic::Ordering::Relaxed)))
}

/// Run Blender once without a window with the setup script and return its one reply.
async fn run_setup(program: &Path, script: &Path, args: &[&std::ffi::OsStr], envs: &[(&str, &str)]) -> anyhow::Result<serde_json::Value> {
    let mut command = tokio::process::Command::new(program);
    command.args(["--background", "--python"]).arg(script).arg("--").args(args)
        .stdin(std::process::Stdio::null()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::null()).kill_on_drop(true);
    for (key, value) in envs { command.env(key, value); }
    #[cfg(windows)]
    command.creation_flags(0x0800_0000);
    let child = command.spawn().map_err(|error| anyhow::anyhow!("Blender could not be started ({error}). Check that Blender is still installed at {}.", program.display()))?;
    let output = tokio::time::timeout(std::time::Duration::from_secs(120), child.wait_with_output()).await
        .map_err(|_| anyhow::anyhow!("Blender took longer than two minutes. Close other Blender windows that show a message, then try again."))??;
    let text = String::from_utf8_lossy(&output.stdout);
    let reply = text.lines().rev().find_map(crate::blender_headless::parse_reply).ok_or_else(|| anyhow::anyhow!("Blender closed without saying whether the helper was added."))?;
    anyhow::ensure!(reply["ok"] == true, "{}", reply["message"].as_str().unwrap_or("Blender could not add the helper."));
    Ok(reply)
}

async fn install_with(programs: &[std::path::PathBuf], token: &str, port: u16, envs: &[(&str, &str)]) -> anyhow::Result<String> {
    anyhow::ensure!(!programs.is_empty(), "PlazCode has not found Blender yet.");
    let root = scratch();
    let _ = std::fs::remove_dir_all(&root);
    let result = async {
        write_files(&root.join(FOLDER), token, port)?;
        let script = root.join("blender_addon_setup.py");
        std::fs::write(&script, SETUP)?;
        let payload = root.join(FOLDER);
        // The Blender the person uses must get the helper; other Blender versions on the computer get it when they can.
        let first = run_setup(&programs[0], &script, &[std::ffi::OsStr::new("install"), payload.as_os_str()], envs).await?;
        for other in programs.iter().skip(1).take(3) {
            if let Err(error) = run_setup(other, &script, &[std::ffi::OsStr::new("install"), payload.as_os_str()], envs).await { tracing::warn!("PlazCode helper not added to {}: {error}", other.display()); }
        }
        Ok(format!("Blender {}", first["blender"].as_str().unwrap_or("")).trim().to_string())
    }.await;
    let _ = std::fs::remove_dir_all(&root);
    result
}

/// Add the helper to Blender (every Blender given, the first one must succeed). Returns a short detail line.
pub async fn install(programs: &[std::path::PathBuf], token: &str, port: u16) -> anyhow::Result<String> {
    set_status(Status::Working);
    let result = install_with(programs, token, port, &[]).await;
    set_status(match &result { Ok(_) => Status::Idle, Err(error) => Status::Failed(error.to_string()) });
    result
}

async fn remove_with(programs: &[std::path::PathBuf], envs: &[(&str, &str)]) {
    let root = scratch();
    let _ = std::fs::remove_dir_all(&root);
    if std::fs::create_dir_all(&root).is_ok() {
        let script = root.join("blender_addon_setup.py");
        if std::fs::write(&script, SETUP).is_ok() {
            for program in programs.iter().take(4) {
                if let Err(error) = run_setup(program, &script, &[std::ffi::OsStr::new("remove")], envs).await { tracing::warn!("PlazCode helper not removed from {}: {error}", program.display()); }
            }
        }
    }
    let _ = std::fs::remove_dir_all(&root);
}

/// "Disconnect": switch the helper off and delete the folder PlazCode wrote. Best effort; never an error for the person.
pub async fn remove(programs: &[std::path::PathBuf]) { remove_with(programs, &[]).await; set_status(Status::Idle); }

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

    /// A stand-in for Blender that runs the real setup script with small stand-ins for Blender's own modules.
    #[cfg(unix)]
    fn fake_blender(root: &Path) -> std::path::PathBuf {
        use std::os::unix::fs::PermissionsExt;
        let modules = root.join("modules");
        std::fs::create_dir_all(&modules).unwrap();
        std::fs::write(modules.join("bpy.py"), r#"
import os
class _App: version_string = "9.9.0"
class _Utils:
    @staticmethod
    def user_resource(kind, path="", create=False):
        folder = os.path.join(os.environ["FAKE_BLENDER_CONFIG"], "scripts", path)
        if create: os.makedirs(folder, exist_ok=True)
        return folder
class _Wm:
    @staticmethod
    def save_userpref():
        if os.environ.get("FAKE_BLENDER_FAILS") == "1": raise RuntimeError("Blender's settings file is read-only")
        open(os.path.join(os.environ["FAKE_BLENDER_CONFIG"], "userpref-saved"), "a").write("saved\n")
class _Ops: wm = _Wm()
app = _App(); utils = _Utils(); ops = _Ops()
"#).unwrap();
        std::fs::write(modules.join("addon_utils.py"), r#"
import os
def _note(text): open(os.path.join(os.environ["FAKE_BLENDER_CONFIG"], "addons-log"), "a").write(text + "\n")
_on = set()
def modules_refresh(): pass
def enable(name, default_set=False, persistent=False):
    _note("enable " + name + " " + str(default_set))
    if os.environ.get("FAKE_BLENDER_REFUSES") != "1": _on.add(name)
def disable(name, default_set=False): _note("disable " + name + " " + str(default_set)); _on.discard(name)
def check(name): return (name in _on, name in _on)
"#).unwrap();
        let program = root.join("blender");
        std::fs::write(&program, format!("#!/bin/sh\n[ \"$1\" = \"--background\" ] && [ \"$2\" = \"--python\" ] || exit 2\nscript=\"$3\"; shift 3\necho 'Blender 9.9 (fake)'\nPYTHONPATH='{}' exec python3 \"$script\" \"$@\"\n", modules.display())).unwrap();
        std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o755)).unwrap();
        program
    }

    #[cfg(unix)]
    #[tokio::test] async fn the_helper_is_added_backed_up_replaced_and_removed_by_blender_itself() {
        let root = std::env::temp_dir().join(format!("plazcode-helper-install-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let program = fake_blender(&root);
        let config = root.join("config"); std::fs::create_dir_all(&config).unwrap();
        let config_text = config.display().to_string();
        let envs = [("FAKE_BLENDER_CONFIG", config_text.as_str())];
        let addon = config.join("scripts/addons").join(FOLDER);
        // Somebody else's folder with the same name is kept as a backup, not deleted.
        std::fs::create_dir_all(&addon).unwrap(); std::fs::write(addon.join("__init__.py"), "# not PlazCode").unwrap();
        let token = new_token();
        let detail = install_with(&[program.clone()], &token, 9876, &envs).await.unwrap();
        assert_eq!(detail, "Blender 9.9.0");
        assert!(std::fs::read_to_string(addon.join("pairing.json")).unwrap().contains(&token));
        assert!(std::fs::read_to_string(addon.join("__init__.py")).unwrap().contains("bl_info = {"));
        let backups: Vec<_> = std::fs::read_dir(addon.parent().unwrap()).unwrap().flatten().filter(|e| e.file_name().to_string_lossy().starts_with("plazcode_blender.backup-")).collect();
        assert_eq!(backups.len(), 1, "the other folder was kept");
        assert_eq!(std::fs::read_to_string(backups[0].path().join("__init__.py")).unwrap(), "# not PlazCode");
        assert_eq!(std::fs::read_to_string(config.join("addons-log")).unwrap(), "enable plazcode_blender True\n", "switched on for good");
        assert!(config.join("userpref-saved").is_file(), "Blender's settings were saved");
        // Connecting again writes a new pairing word over PlazCode's own folder, with no second backup.
        let second = new_token();
        install_with(&[program.clone()], &second, 9876, &envs).await.unwrap();
        assert!(std::fs::read_to_string(addon.join("pairing.json")).unwrap().contains(&second));
        assert_eq!(std::fs::read_dir(addon.parent().unwrap()).unwrap().count(), 2);
        // A Blender that cannot save says why, in the checklist's words.
        let fails = [("FAKE_BLENDER_CONFIG", config_text.as_str()), ("FAKE_BLENDER_FAILS", "1")];
        assert!(install_with(&[program.clone()], &second, 9876, &fails).await.unwrap_err().to_string().contains("read-only"));
        // A Blender that will not switch the helper on is never reported as done.
        let refuses = [("FAKE_BLENDER_CONFIG", config_text.as_str()), ("FAKE_BLENDER_REFUSES", "1")];
        assert!(install_with(&[program.clone()], &second, 9876, &refuses).await.unwrap_err().to_string().contains("did not switch the PlazCode helper on"));
        assert!(install_with(&[root.join("missing-blender")], &second, 9876, &envs).await.unwrap_err().to_string().contains("could not be started"));
        assert!(install_with(&[], &second, 9876, &envs).await.is_err());
        // Disconnect removes only PlazCode's folder.
        remove_with(&[program.clone()], &envs).await;
        assert!(!addon.exists() && backups[0].path().is_dir());
        assert!(std::fs::read_to_string(config.join("addons-log")).unwrap().ends_with("disable plazcode_blender True\n"));
        remove_with(&[program], &envs).await; // nothing there: still fine
        let _ = std::fs::remove_dir_all(root);
    }

    /// The real setup script in a real Blender: Blender names its add-ons folder, the helper is switched on in Blender's
    /// own settings, then taken out again. Blender's settings go to a scratch folder, never the real ones.
    /// `PLAZCODE_BLENDER=<blender> cargo test real_blender -- --ignored`
    #[cfg(unix)]
    #[tokio::test] #[ignore] async fn real_blender_adds_and_removes_the_helper() {
        let program = std::path::PathBuf::from(std::env::var("PLAZCODE_BLENDER").expect("set PLAZCODE_BLENDER to a Blender program"));
        let root = std::env::temp_dir().join(format!("plazcode-helper-real-install-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let (scripts, config) = (root.join("scripts"), root.join("config"));
        std::fs::create_dir_all(&scripts).unwrap(); std::fs::create_dir_all(&config).unwrap();
        let (scripts_text, config_text) = (scripts.display().to_string(), config.display().to_string());
        let envs = [("BLENDER_USER_SCRIPTS", scripts_text.as_str()), ("BLENDER_USER_CONFIG", config_text.as_str())];
        let token = new_token();
        let detail = install_with(&[program.clone()], &token, 9877, &envs).await.unwrap();
        assert!(detail.starts_with("Blender "), "{detail}");
        let addon = scripts.join("addons").join(FOLDER);
        assert!(std::fs::read_to_string(addon.join("pairing.json")).unwrap().contains(&token), "Blender's own add-ons folder got the helper");
        let check = root.join("check.py");
        // Read Blender's saved settings again (the Python-module form of Blender does not read them at start).
        std::fs::write(&check, "import bpy\nbpy.ops.wm.read_userpref()\non = 'plazcode_blender' in [a.module for a in bpy.context.preferences.addons]\nprint('PZ1 {\"enabled\": %s}' % ('true' if on else 'false'))\n").unwrap();
        let ask = |envs: &[(&str, &str)]| { let mut command = std::process::Command::new(&program); command.args(["--background", "--python"]).arg(&check); for (k, v) in envs { command.env(k, v); } String::from_utf8_lossy(&command.output().unwrap().stdout).into_owned() };
        assert!(ask(&envs).contains("PZ1 {\"enabled\": true}"), "switched on in Blender's saved settings: {}", ask(&envs));
        remove_with(&[program.clone()], &envs).await;
        assert!(!addon.exists(), "Disconnect takes the helper out");
        assert!(ask(&envs).contains("PZ1 {\"enabled\": false}"));
        let _ = std::fs::remove_dir_all(root);
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
