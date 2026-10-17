use std::{env, path::PathBuf};

fn windows_icon(root: &std::path::Path) {
    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") { return; }
    assert_eq!(env::var("CARGO_CFG_TARGET_ENV").unwrap(), "msvc", "Windows release requires the Microsoft resource compiler");
    let output = PathBuf::from(env::var_os("OUT_DIR").unwrap());
    let icon = root.join("assets/plazcode.ico");
    let rc_file = output.join("plazcode.rc");
    let resource = output.join("plazcode.res");
    let escaped = icon.to_string_lossy().replace('\\', "\\\\").replace('"', "\\\"");
    let version=env::var("CARGO_PKG_VERSION").unwrap();
    let mut components=version.split('.').map(|s|s.parse::<u16>().expect("numeric release version")).collect::<Vec<_>>();
    while components.len()<4 {components.push(0);}
    let numbers=components.iter().map(u16::to_string).collect::<Vec<_>>().join(",");
    let script=format!(r#"1 ICON "{escaped}"
1 VERSIONINFO
FILEVERSION {numbers}
PRODUCTVERSION {numbers}
FILEFLAGSMASK 0x3fL
FILEFLAGS 0x0L
FILEOS 0x40004L
FILETYPE 0x1L
BEGIN
 BLOCK "StringFileInfo"
 BEGIN
  BLOCK "040904B0"
  BEGIN
   VALUE "FileDescription", "PlazCode desktop agent\0"
   VALUE "FileVersion", "{version}\0"
   VALUE "InternalName", "PlazCode\0"
   VALUE "OriginalFilename", "PlazCode.exe\0"
   VALUE "ProductName", "PlazCode\0"
   VALUE "ProductVersion", "{version}\0"
  END
 END
 BLOCK "VarFileInfo"
 BEGIN
  VALUE "Translation", 0x0409, 1200
 END
END
"#);
    std::fs::write(&rc_file,script).expect("write PlazCode resource script");
    let compiler = env::var_os("RC").map(PathBuf::from).or_else(|| {
        let base = PathBuf::from(env::var_os("ProgramFiles(x86)")?).join("Windows Kits/10/bin");
        let mut versions: Vec<_> = std::fs::read_dir(base).ok()?.filter_map(Result::ok)
            .map(|entry| entry.path().join("x64/rc.exe")).filter(|path| path.is_file()).collect();
        versions.sort(); versions.pop()
    }).unwrap_or_else(|| PathBuf::from("rc.exe"));
    let status = std::process::Command::new(compiler).arg("/nologo").arg("/fo").arg(&resource).arg(&rc_file)
        .status().expect("Microsoft resource compiler is required to embed the PlazCode icon");
    assert!(status.success(), "Could not embed the PlazCode application icon");
    println!("cargo:rustc-link-arg-bin=PlazCode={}", resource.display());
}

fn main() {
    let root = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap());
    windows_icon(&root);
    println!("cargo:rerun-if-changed=assets/plazcode.ico");
    println!("cargo:rerun-if-changed=assets/plazcode.png");
    println!("cargo:rerun-if-env-changed=RC");
    let parent = root.parent().unwrap();
    let nested = parent.join("PlazCode-Extension");
    let extension = if nested.join("manifest.json").is_file() { nested } else { parent.to_owned() };
    println!("cargo:rustc-env=PLAZCODE_EXTENSION_ROOT={}", extension.display());
    println!("cargo:rerun-if-changed=build.rs");
    for name in ["skills-ui.js", "explorer-ui.js", "memory.js", "task-center.js", "templates.js", "version.js", "media.js", "headless-builder.js", "creator.js", "creator-ui.js", "creator-animations.luau"] {
        println!("cargo:rerun-if-changed={}", extension.join("core").join(name).display());
    }
    println!("cargo:rerun-if-changed={}", parent.join("PlazCode-Extension/manifest.json").display());
}
