use std::path::{Path,PathBuf};
pub fn installation_root_at(executable:&Path)->PathBuf {
    for ancestor in executable.ancestors().skip(1) {
        if ancestor.extension().is_some_and(|extension|extension=="app") {
            return ancestor.parent().unwrap_or_else(||Path::new(".")).to_owned();
        }
    }
    executable.parent().unwrap_or_else(||Path::new(".")).to_owned()
}
pub fn is_installation_root(root:&Path)->bool {root.join("manifest.json").is_file()||root.join("PlazCode-Extension/manifest.json").is_file()}
/// macOS Gatekeeper "App Translocation" runs a quarantined app from a random
/// read-only copy (/private/var/folders/.../AppTranslocation/<id>/d/PlazCode.app)
/// that contains only the .app, so its parent has no PlazCode files. The same
/// happens when only PlazCode.app is dragged to /Applications.
pub fn is_translocated(executable:&Path)->bool {executable.components().any(|part|part.as_os_str()=="AppTranslocation")}
/// Prefer the folder around the running app; when that is not a PlazCode
/// installation, fall back to the folder recorded by the launch scripts or an
/// earlier normal launch, provided it still contains a complete installation.
pub fn resolve_installation_root(executable:&Path,recorded:Option<PathBuf>)->PathBuf {
    resolve_installation_root_with(executable,recorded,original_app_location)
}
/// 1.24.30 (owner, 2026-10-31: "sometimes on mac when starting the plazcode app from a freshly downloaded zip"
/// it said "PlazCode program files changed or are incomplete ... No such file or directory (os error 2)").
/// A freshly downloaded app is translocated, and the only fallback was the folder recorded by an EARLIER
/// normal launch: missing on a new Mac, or an older PlazCode folder. macOS itself knows where the
/// translocated app really lives, so that folder is used first (it is this download, not an older one).
pub fn resolve_installation_root_with(executable:&Path,recorded:Option<PathBuf>,original:impl Fn(&Path)->Option<PathBuf>)->PathBuf {
    let direct=installation_root_at(executable);
    if is_installation_root(&direct) { return direct; }
    let usable=|root:&Path| root.is_absolute()&&is_installation_root(root)&&root.join("PlazCode.app").is_dir();
    if is_translocated(executable) {
        let bundle=executable.ancestors().find(|a|a.extension().is_some_and(|e|e=="app")).map(Path::to_path_buf);
        if let Some(root)=bundle.and_then(|b|original(&b)).and_then(|app|app.parent().map(Path::to_path_buf)) {
            if usable(&root) { return root; }
        }
    }
    match recorded { Some(root) if usable(&root) => root, _ => direct }
}
/// The real location of a translocated .app bundle, as reported by macOS (Security framework,
/// SecTranslocateCreateOriginalPathForURL, macOS 10.12+). None when unavailable.
#[cfg(target_os="macos")]
fn original_app_location(bundle:&Path)->Option<PathBuf> {
    use std::os::unix::ffi::{OsStrExt,OsStringExt};
    use std::ffi::c_void;
    #[link(name="CoreFoundation",kind="framework")]
    extern "C" {
        fn CFURLCreateFromFileSystemRepresentation(allocator:*const c_void,buffer:*const u8,length:isize,is_directory:u8)->*const c_void;
        fn CFURLGetFileSystemRepresentation(url:*const c_void,resolve_against_base:u8,buffer:*mut u8,max_length:isize)->u8;
        fn CFRelease(value:*const c_void);
    }
    #[link(name="Security",kind="framework")]
    extern "C" {
        fn SecTranslocateCreateOriginalPathForURL(translocated:*const c_void,error:*mut *const c_void)->*const c_void;
    }
    let raw=bundle.as_os_str().as_bytes();
    // SAFETY: plain CoreFoundation calls; every created object is released exactly once and the
    // output buffer length is passed explicitly.
    unsafe {
        let url=CFURLCreateFromFileSystemRepresentation(std::ptr::null(),raw.as_ptr(),raw.len() as isize,1);
        if url.is_null() { return None; }
        let mut error:*const c_void=std::ptr::null();
        let original=SecTranslocateCreateOriginalPathForURL(url,&mut error);
        CFRelease(url);
        if !error.is_null() { CFRelease(error); }
        if original.is_null() { return None; }
        let mut buffer=vec![0u8;4096];
        let ok=CFURLGetFileSystemRepresentation(original,1,buffer.as_mut_ptr(),buffer.len() as isize);
        CFRelease(original);
        if ok==0 { return None; }
        let end=buffer.iter().position(|b|*b==0)?;buffer.truncate(end);
        let path=PathBuf::from(std::ffi::OsString::from_vec(buffer));
        (path.is_absolute()&&!is_translocated(&path)).then_some(path)
    }
}
#[cfg(not(target_os="macos"))]
fn original_app_location(_bundle:&Path)->Option<PathBuf> {None}
#[cfg(target_os="macos")]
fn root_record()->PathBuf {configuration_root().join("install-root")}
#[cfg(target_os="macos")]
fn recorded_root()->Option<PathBuf> {std::fs::read_to_string(root_record()).ok().map(|raw|PathBuf::from(raw.trim_end_matches(['\r','\n'])))}
#[cfg(not(target_os="macos"))]
fn recorded_root()->Option<PathBuf> {None}
pub fn installation_root()->PathBuf {std::env::current_exe().ok().map(|path|resolve_installation_root(&path,recorded_root())).unwrap_or_default()}
/// Records a verified installation folder so a later translocated or moved
/// launch can still find it, and clears the download quarantine flag so macOS
/// stops translocating the app on the next launch.
#[cfg(target_os="macos")]
pub fn remember_installation_root() {
    let Ok(exe)=std::env::current_exe() else { return };
    let root=installation_root();
    if !is_installation_root(&root) { return; }
    if !is_translocated(&exe) && installation_root_at(&exe)==root {
        let record=root_record();
        if recorded_root().as_deref()!=Some(root.as_path()) {
            if let Some(parent)=record.parent() { let _=std::fs::create_dir_all(parent); }
            let pending=record.with_extension("pending");
            if std::fs::write(&pending,format!("{}\n",root.display())).is_ok() { let _=std::fs::rename(&pending,&record); }
        }
    }
    let _=std::process::Command::new("/usr/bin/xattr").arg("-dr").arg("com.apple.quarantine").arg(&root)
        .stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).spawn();
}
#[cfg(target_os="macos")]
pub fn configuration_root()->PathBuf {PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join("Library/Application Support/PlazCode")}
#[cfg(test)]mod tests{use super::*;#[test]fn bundle_root_is_outside_signed_app(){assert_eq!(installation_root_at(Path::new("/Applications/PlazCode/PlazCode.app/Contents/MacOS/PlazCode")),Path::new("/Applications/PlazCode"));assert_eq!(installation_root_at(Path::new("/opt/PlazCode/PlazCode")),Path::new("/opt/PlazCode"));}}

#[cfg(test)] mod ordinary_installation_tests {
    use super::*;
    #[test] fn ordinary_app_named_folders_do_not_retarget_the_signed_installation() {
        for root in ["/Downloads/PlazCode.app", "/Downloads/innocent.app/PlazCode", "/Downloads/innocent.app/another.app/PlazCode"] {
            let executable=Path::new(root).join("PlazCode.exe");
            assert_eq!(installation_root_at(&executable),Path::new(root),"an ordinary directory name cannot move the program's signed root");
        }
    }
}

#[cfg(target_os="macos")]
pub fn prepare_application_path() {
    // Finder does not inherit a user's interactive shell PATH.
    let mut paths=vec![PathBuf::from("/opt/homebrew/bin"),PathBuf::from("/usr/local/bin")];
    if let Some(home)=std::env::var_os("HOME") { paths.push(PathBuf::from(home).join(".local/bin")); }
    if let Some(existing)=std::env::var_os("PATH") { paths.extend(std::env::split_paths(&existing)); }
    if let Ok(path)=std::env::join_paths(paths) { std::env::set_var("PATH",path); }
}

// The helper waits for this marker after the WebView reports its UI loaded.
pub fn write_update_ready(path: &Path) -> std::io::Result<()> {
    let temporary = path.with_extension("pending");
    let payload = serde_json::json!({"version":env!("CARGO_PKG_VERSION"),"pid":std::process::id(),"desktop_ready":true});
    std::fs::write(&temporary, payload.to_string())?;
    std::fs::rename(temporary, path)
}
#[cfg(test)] mod update_ready_tests {
    #[test] fn ready_marker_identifies_the_running_build_and_is_atomic() {
        let root=std::env::temp_dir().join(format!("plazcode-ready-{}",std::process::id()));std::fs::create_dir_all(&root).unwrap();
        let path=root.join("ready.json");super::write_update_ready(&path).unwrap();
        let value:serde_json::Value=serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(value["version"],env!("CARGO_PKG_VERSION"));assert_eq!(value["pid"],std::process::id());assert_eq!(value["desktop_ready"],true);assert!(!path.with_extension("pending").exists());std::fs::remove_dir_all(root).unwrap();
    }
}
#[cfg(test)] mod translocation_tests {
    use super::*;
    fn install(root:&Path){std::fs::create_dir_all(root.join("PlazCode.app/Contents/MacOS")).unwrap();std::fs::write(root.join("manifest.json"),"{}").unwrap();}
    #[test] fn translocated_launch_uses_recorded_installation() {
        let base=std::env::temp_dir().join(format!("plazcode-transloc-{}",std::process::id()));let _=std::fs::remove_dir_all(&base);
        let real=base.join("Downloads/PlazCode");install(&real);
        let exe=base.join("private/var/folders/x/T/AppTranslocation/ABC/d/PlazCode.app/Contents/MacOS/PlazCode");std::fs::create_dir_all(exe.parent().unwrap()).unwrap();
        assert!(is_translocated(&exe));
        assert_eq!(resolve_installation_root(&exe,Some(real.clone())),real);
        // Without a usable record the original location is reported unchanged.
        assert_eq!(resolve_installation_root(&exe,None),base.join("private/var/folders/x/T/AppTranslocation/ABC/d"));
        assert_eq!(resolve_installation_root(&exe,Some(base.join("missing"))),base.join("private/var/folders/x/T/AppTranslocation/ABC/d"));
        assert_eq!(resolve_installation_root(&exe,Some(PathBuf::from("relative/PlazCode"))),base.join("private/var/folders/x/T/AppTranslocation/ABC/d"));
        std::fs::remove_dir_all(base).unwrap();
    }
    #[test] fn fresh_download_uses_the_folder_macos_reports_before_any_record() {
        let base=std::env::temp_dir().join(format!("plazcode-fresh-{}",std::process::id()));let _=std::fs::remove_dir_all(&base);
        let fresh=base.join("Downloads/PlazCode");install(&fresh);
        let older=base.join("Applications/PlazCode");install(&older);
        let exe=base.join("private/var/folders/x/T/AppTranslocation/ABC/d/PlazCode.app/Contents/MacOS/PlazCode");std::fs::create_dir_all(exe.parent().unwrap()).unwrap();
        let reported=|bundle:&Path|{assert!(bundle.ends_with("d/PlazCode.app"));Some(fresh.join("PlazCode.app"))};
        // No earlier launch on this Mac: this used to fail with os error 2.
        assert_eq!(resolve_installation_root_with(&exe,None,reported),fresh);
        // An older recorded folder must not win over this download.
        assert_eq!(resolve_installation_root_with(&exe,Some(older.clone()),reported),fresh);
        // macOS cannot tell: the recorded folder is still the fallback.
        assert_eq!(resolve_installation_root_with(&exe,Some(older.clone()),|_:&Path|None),older);
        // A reported folder without PlazCode files is ignored.
        assert_eq!(resolve_installation_root_with(&exe,Some(older.clone()),|_:&Path|Some(base.join("Empty/PlazCode.app"))),older);
        // A normal (not translocated) launch never asks macOS.
        let normal=fresh.join("PlazCode.app/Contents/MacOS/PlazCode");
        assert_eq!(resolve_installation_root_with(&normal,Some(older),|_:&Path|panic!("not translocated")),fresh);
        std::fs::remove_dir_all(base).unwrap();
    }
    #[test] fn normal_launch_ignores_record() {
        let base=std::env::temp_dir().join(format!("plazcode-normal-{}",std::process::id()));let _=std::fs::remove_dir_all(&base);
        let a=base.join("A");let b=base.join("B");install(&a);install(&b);
        let exe=a.join("PlazCode.app/Contents/MacOS/PlazCode");
        assert!(!is_translocated(&exe));
        assert_eq!(resolve_installation_root(&exe,Some(b)),a);
        std::fs::remove_dir_all(base).unwrap();
    }
    #[test] fn app_moved_to_applications_uses_record() {
        let base=std::env::temp_dir().join(format!("plazcode-moved-{}",std::process::id()));let _=std::fs::remove_dir_all(&base);
        let real=base.join("PlazCode");install(&real);
        let exe=base.join("Applications/PlazCode.app/Contents/MacOS/PlazCode");std::fs::create_dir_all(exe.parent().unwrap()).unwrap();
        assert_eq!(resolve_installation_root(&exe,Some(real.clone())),real);
        std::fs::remove_dir_all(base).unwrap();
    }
}
