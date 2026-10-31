// SPDX-License-Identifier: GPL-3.0-or-later
//! Read-only access to the separately licensed, bundled starter reference packs.
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub fn catalog() -> Vec<Value> {
    serde_json::from_str(include_str!("starter-skills-index.json")).expect("validated starter index")
}
/// 1.24.30 (owner): Ro-Engineer by excaldev (MIT), modern Luau and efficient Roblox engineering, default cards.
pub fn roengineer_catalog() -> Vec<Value> {
    serde_json::from_str(include_str!("roengineer-index.json")).expect("validated Ro-Engineer index")
}
struct Pack { prefix: &'static str, folder: &'static str, resources: &'static str, default_resource: fn(&str) -> String,
    source: &'static str, source_url: &'static str, license: &'static str, adaptation: &'static str }
const PACKS: [Pack; 2] = [
    Pack { prefix: "starter-syphodev-", folder: "syphodev", resources: include_str!("starter-skills-resources.json"),
        default_resource: |name| format!("skills/{name}/SKILL.md"),
        source: "SyphoDev Roblox Skills", source_url: "https://www.youtube.com/@SyphoDev",
        license: "Original bundled LICENSE.txt; free redistribution with attribution, no sale or paid bundles.",
        adaptation: "These are reference instructions. Use actual PlazCode tools, keep personal configuration outside the bundle, copy helpers and required references into a project-owned working copy when they expect adjacent LOCAL.md, and inspect and verify this project." },
    Pack { prefix: "starter-roengineer-", folder: "ro-engineer", resources: include_str!("roengineer-resources.json"),
        default_resource: |_| "SKILL.md".into(),
        source: "Ro-Engineer by excaldev", source_url: "https://github.com/excaldev/ro-engineer",
        license: "MIT licence (bundled LICENSE): keep the copyright notice and licence with copies.",
        adaptation: "Reference standards. Read PLAZCODE-ADAPTER.md once: use the tools PlazCode lists (read_scripts for reading many scripts), skip ROTEX steps unless those tools are listed, and keep the user's request and safety settings first." },
];
pub fn is_starter(id: &str) -> bool { PACKS.iter().any(|pack| id.starts_with(pack.prefix)) }
/// The bundled folder a starter skill reads from, inside the installation's PlazCode-Extension folder.
pub fn bundle_folder(installation: &Path, id: &str) -> Option<PathBuf> {
    PACKS.iter().find(|pack| id.starts_with(pack.prefix)).map(|pack| installation.join("PlazCode-Extension/starter-skills").join(pack.folder))
}

pub fn read(root: &Path, id: &str, request: &Value) -> anyhow::Result<Value> {
    let pack = PACKS.iter().find(|pack| id.starts_with(pack.prefix)).ok_or_else(|| anyhow::anyhow!("Not a starter skill"))?;
    let name = &id[pack.prefix.len()..];
    anyhow::ensure!(catalog().iter().chain(roengineer_catalog().iter()).any(|s| s["id"] == id), "Unknown starter skill");
    let paths: Vec<String> = serde_json::from_str(pack.resources)?;
    let default = (pack.default_resource)(name);
    let relative = request["resource"].as_str().unwrap_or(&default);
    anyhow::ensure!(paths.iter().any(|p| p == relative), "Unknown starter resource");
    let root = std::fs::canonicalize(root).map_err(|_| anyhow::anyhow!("Starter reference files are missing. Extract the complete PlazCode ZIP."))?;
    let path = std::fs::canonicalize(root.join(relative))?;
    anyhow::ensure!(path.starts_with(&root), "Starter resource escapes the bundled directory");
    anyhow::ensure!(std::fs::metadata(&path)?.len() <= 1024 * 1024, "Starter resource is too large");
    let text = std::fs::read_to_string(&path).map_err(|_| anyhow::anyhow!("This resource is a binary asset; use its local path with the applicable helper."))?;
    let chars: Vec<char> = text.chars().collect();
    let offset = request["offset"].as_u64().unwrap_or(0).min(chars.len() as u64) as usize;
    let limit = request["limit"].as_u64().unwrap_or(16000).clamp(1, 24000) as usize;
    let end = (offset + limit).min(chars.len());
    Ok(json!({"resource":relative,"content":chars[offset..end].iter().collect::<String>(),"offset":offset,
        "next_offset":if end<chars.len(){Some(end)}else{None},"total_chars":chars.len(),
        "bundle_root":root,"resources":paths,"source":pack.source,"source_url":pack.source_url,
        "license":pack.license,"adaptation":pack.adaptation}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn complete_catalog_and_bounded_safe_resources() {
        let cards = catalog(); assert_eq!(cards.len(),11);
        let root=std::env::temp_dir().join(format!("plazcode-starter-{}",std::process::id()));
        std::fs::create_dir_all(root.join("skills/roblox-code")).unwrap();
        std::fs::write(root.join("skills/roblox-code/SKILL.md"),"abc😀def").unwrap();
        let first=read(&root,"starter-syphodev-roblox-code",&json!({"limit":4})).unwrap();
        assert_eq!(first["content"],"abc😀");assert_eq!(first["next_offset"],4);
        let next=read(&root,"starter-syphodev-roblox-code",&json!({"offset":4})).unwrap();
        assert_eq!(next["content"],"def");assert!(next["next_offset"].is_null());
        assert!(read(&root,"starter-syphodev-roblox-code",&json!({"resource":"../../private"})).is_err());
        assert!(read(&root,"starter-syphodev-unknown",&json!({})).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn roengineer_cards_and_files_are_complete() {
        let cards = roengineer_catalog(); assert_eq!(cards.len(), 8);
        let paths: Vec<String> = serde_json::from_str(include_str!("roengineer-resources.json")).unwrap();
        for required in ["SKILL.md","LICENSE","PLAZCODE-ADAPTER.md","references/luau-modern.md","references/sharp-edges.md"] { assert!(paths.iter().any(|p| p == required), "{required}"); }
        assert_eq!(cards.iter().filter(|c| c["enabled"] == true).count(), 1, "exactly one always-on core card");
        for card in &cards {
            let id = card["id"].as_str().unwrap(); assert!(id.starts_with("starter-roengineer-") && is_starter(id));
            assert!(card["confirmed"] == true && card["domain"] == "roblox" && card["scope"] == "");
            assert!(card["description"].as_str().unwrap().contains("excaldev"));
            for step in card["steps"].as_array().unwrap() { assert!(step.as_str().unwrap().len() <= 1000); }
        }
        let root=std::env::temp_dir().join(format!("plazcode-roe-{}",std::process::id()));let _=std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("references")).unwrap();
        std::fs::write(root.join("SKILL.md"),"core").unwrap();std::fs::write(root.join("references/luau-modern.md"),"luau").unwrap();
        assert_eq!(read(&root,"starter-roengineer-core",&json!({})).unwrap()["content"],"core");
        let luau=read(&root,"starter-roengineer-luau",&json!({"resource":"references/luau-modern.md"})).unwrap();
        assert_eq!(luau["content"],"luau");assert_eq!(luau["source_url"],"https://github.com/excaldev/ro-engineer");
        assert!(read(&root,"starter-roengineer-core",&json!({"resource":"skills/roblox-code/SKILL.md"})).is_err(),"never reads another pack's files");
        assert!(read(&root,"starter-roengineer-missing",&json!({})).is_err());
        assert_eq!(bundle_folder(Path::new("/i"),"starter-roengineer-core").unwrap(),Path::new("/i/PlazCode-Extension/starter-skills/ro-engineer"));
        assert_eq!(bundle_folder(Path::new("/i"),"starter-syphodev-roblox-code").unwrap(),Path::new("/i/PlazCode-Extension/starter-skills/syphodev"));
        std::fs::remove_dir_all(root).unwrap();
    }
    
}
