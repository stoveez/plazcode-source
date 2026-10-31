//! 1.24.30 (owner, 2026-10-31: "plazcode has a lot of files inside, wouldn't it be better to organize them"
//! without changing how PlazCode works). Updates only add and replace files, so folders installed from older
//! versions still hold developer files those versions shipped (about 90 test-*.js/py/ps1 files, old
//! changelogs and build records) that nothing uses. After the installation passed its signed check, this
//! removes exactly those leftovers from the top of the PlazCode folder. It never touches a file the signed
//! list of this version contains, a subfolder (except the old .github workflow copies), a link, or any
//! user file (settings, logs, skills, notes and templates live elsewhere or under other names).
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

const OLD_DEVELOPER_FILES: &[&str] = &[
    ".gitignore", "MAINTENANCE.md", "UPDATE.txt", "UPDATER.txt", "VALIDATION.txt", "DEVELOPMENT.txt",
    "package_release.py", "build-macos-bundle.py", "design-baseline.html", "production-build.json",
];

fn old_test_file(name: &str) -> bool {
    name.starts_with("test-") && [".js", ".cjs", ".mjs", ".py", ".ps1"].iter().any(|ext| name.ends_with(ext))
}

/// The leftovers in `root`, given the names this version's signed list contains.
pub fn leftovers(root: &Path, signed: &BTreeSet<String>) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let regular = |path: &Path| std::fs::symlink_metadata(path).map(|m| m.file_type().is_file()).unwrap_or(false);
    if let Ok(entries) = std::fs::read_dir(root) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if signed.contains(&name) { continue; }
            if (OLD_DEVELOPER_FILES.contains(&name.as_str()) || old_test_file(&name)) && regular(&entry.path()) {
                found.push(entry.path());
            }
        }
    }
    let workflows = root.join(".github/workflows");
    if std::fs::symlink_metadata(root.join(".github")).map(|m| m.is_dir()).unwrap_or(false) {
        if let Ok(entries) = std::fs::read_dir(&workflows) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                let relative = format!(".github/workflows/{name}");
                if !signed.contains(&relative) && (name.ends_with(".yml") || name.ends_with(".yaml")) && regular(&entry.path()) {
                    found.push(entry.path());
                }
            }
        }
    }
    found.sort();
    found
}

/// Removes the leftovers and then the old .github folders if they are empty. Returns what was removed.
pub fn remove_leftovers(root: &Path, signed: &BTreeSet<String>) -> Vec<PathBuf> {
    let removed: Vec<PathBuf> = leftovers(root, signed).into_iter().filter(|path| std::fs::remove_file(path).is_ok()).collect();
    let _ = std::fs::remove_dir(root.join(".github/workflows"));
    let _ = std::fs::remove_dir(root.join(".github"));
    removed
}

/// Background clean-up for a verified release installation; does nothing in unsigned development builds.
pub fn spawn_cleanup(root: PathBuf) {
    let _ = std::thread::Builder::new().name("plazcode-tidy".into()).spawn(move || {
        let Ok(Some(signed)) = crate::integrity::signed_names(&root) else { return };
        let removed = remove_leftovers(&root, &signed);
        if !removed.is_empty() {
            tracing::info!("Removed {} old developer files left by earlier PlazCode versions", removed.len());
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn removes_only_old_developer_files_at_the_top_of_the_installation() {
        let root = std::env::temp_dir().join(format!("plazcode-tidy-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join(".github/workflows")).unwrap();
        std::fs::create_dir_all(root.join("PlazCode-Extension")).unwrap();
        std::fs::create_dir_all(root.join("logs")).unwrap();
        let old = ["test-v118.js", "test-updater.ps1", "test-launcher.py", "MAINTENANCE.md", "UPDATE.txt", "VALIDATION.txt", ".gitignore", "package_release.py"];
        let keep = ["PlazCode.exe", "README.md", "LICENSE", "config.json", "plazcode-settings.json", "launch_studio_mcp.py", "Update-PlazCode.ps1",
            "my-notes.txt", "testing.js", "test-plan.md", "test-signed.js"];
        for name in old.iter().chain(keep.iter()) { std::fs::write(root.join(name), "x").unwrap(); }
        std::fs::write(root.join(".github/workflows/validate.yml"), "x").unwrap();
        std::fs::write(root.join("PlazCode-Extension/test-inside.js"), "x").unwrap();
        std::fs::write(root.join("logs/test-log.py"), "x").unwrap();
        // A file that this version signs is a program file, whatever its name.
        let signed: BTreeSet<String> = ["test-signed.js".to_string(), "PlazCode.exe".to_string()].into_iter().collect();
        let removed = remove_leftovers(&root, &signed);
        assert_eq!(removed.len(), old.len() + 1);
        for name in old { assert!(!root.join(name).exists(), "{name} should be removed"); }
        for name in keep { assert!(root.join(name).exists(), "{name} must stay"); }
        assert!(!root.join(".github").exists(), "empty old workflow folder removed");
        assert!(root.join("PlazCode-Extension/test-inside.js").exists() && root.join("logs/test-log.py").exists(), "subfolders are never touched");
        #[cfg(unix)] {
            std::os::unix::fs::symlink(root.join("README.md"), root.join("test-link.js")).unwrap();
            assert!(leftovers(&root, &signed).is_empty(), "links are never followed or removed");
        }
        assert!(remove_leftovers(&root, &signed).is_empty(), "nothing left to do on the next start");
        std::fs::remove_dir_all(root).unwrap();
    }
}
