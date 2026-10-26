//! Test-only harness: compile the real overlay preferences module unchanged.
#![allow(dead_code)]

#[path = "../../overlay/agent/src/preferences.rs"]
mod preferences;

// The module tests use explicit temporary paths, never the production settings path.
// Supply only the macOS platform symbol needed to compile this isolated module.
#[cfg(target_os = "macos")]
mod platform {
    pub fn configuration_root() -> std::path::PathBuf {
        panic!("isolated preference tests must use explicit temporary settings paths")
    }
}
