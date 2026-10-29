//! Per-profile data selection. Installation/program paths never change.
use std::{collections::HashMap, path::{Path,PathBuf}, sync::{Arc,Mutex,RwLock}};
use once_cell::sync::Lazy;

#[derive(Default)]
struct Location { initialized:bool, root:Option<PathBuf> }
static LOCATION:Lazy<RwLock<Location>>=Lazy::new(||RwLock::new(Location::default()));
pub fn legacy_data_root()->PathBuf {
    std::env::var_os("LOCALAPPDATA").or_else(||std::env::var_os("XDG_CONFIG_HOME"))
        .map(PathBuf::from).unwrap_or_else(||PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".config")).join("PlazCode")
}
pub fn data_root()->PathBuf {
    let location=LOCATION.read().unwrap_or_else(|e|e.into_inner());
    location.root.clone().unwrap_or_else(||if location.initialized {legacy_data_root().join("profiles/locked")}else{legacy_data_root()})
}
pub fn profile_root(id:&str)->anyhow::Result<PathBuf> {
    anyhow::ensure!(id.len()==36&&id.bytes().enumerate().all(|(i,b)|if matches!(i,8|13|18|23){b==b'-'}else{b.is_ascii_hexdigit()}),"Invalid profile identifier");
    Ok(legacy_data_root().join("profiles").join(id))
}
pub fn initialize(required:bool){let mut location=LOCATION.write().unwrap_or_else(|e|e.into_inner());location.initialized=required;location.root=None;}
pub fn select(root:Option<PathBuf>){let mut location=LOCATION.write().unwrap_or_else(|e|e.into_inner());location.initialized=true;location.root=root;}
pub fn initialized()->bool{LOCATION.read().unwrap_or_else(|e|e.into_inner()).initialized}
pub fn settings_path()->PathBuf {
    let location=LOCATION.read().unwrap_or_else(|e|e.into_inner());
    if location.initialized {return location.root.clone().unwrap_or_else(||legacy_data_root().join("profiles/locked")).join("plazcode-settings.json");}
    legacy_settings_path()
}
pub fn legacy_settings_path()->PathBuf {
    #[cfg(target_os="macos")]
    {return crate::platform::configuration_root().join("plazcode-settings.json");}
    #[cfg(not(target_os="macos"))]
    std::env::current_exe().ok().and_then(|p|p.parent().map(|d|d.join("plazcode-settings.json"))).unwrap_or_else(||PathBuf::from("plazcode-settings.json"))
}
/// A store is selected once per operation, not retargeted underneath an await.
pub struct Profiled<T> { stores:Mutex<HashMap<PathBuf,Arc<T>>>, leaf:&'static str, load:fn(PathBuf)->T }
impl<T> Profiled<T> {
    pub fn new(leaf:&'static str,load:fn(PathBuf)->T)->Self{Self{stores:Mutex::new(HashMap::new()),leaf,load}}
    pub fn at(&self,root:&Path)->Arc<T>{let path=root.join(self.leaf);let mut stores=self.stores.lock().unwrap_or_else(|e|e.into_inner());stores.entry(path.clone()).or_insert_with(||Arc::new((self.load)(path))).clone()}
    pub fn selected(&self)->Arc<T>{self.at(&data_root())}
    pub fn clear_cache(&self){self.stores.lock().unwrap_or_else(|e|e.into_inner()).clear();}
}
pub struct ProfiledMutex<T>{inner:Profiled<tokio::sync::Mutex<T>>}
impl<T> ProfiledMutex<T> {
    pub fn new(leaf:&'static str,load:fn(PathBuf)->tokio::sync::Mutex<T>)->Self{Self{inner:Profiled::new(leaf,load)}}
    pub async fn lock(&self)->tokio::sync::OwnedMutexGuard<T>{self.inner.selected().lock_owned().await}
    pub fn try_lock(&self)->Result<tokio::sync::OwnedMutexGuard<T>,tokio::sync::TryLockError>{self.inner.selected().try_lock_owned()}
    pub fn clear_cache(&self){self.inner.clear_cache();}
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn identifiers_cannot_escape_profile_root(){assert!(profile_root("12345678-1234-1234-1234-123456789abc").unwrap().ends_with("profiles/12345678-1234-1234-1234-123456789abc"));for id in ["../other","","a/b","12345678-1234-1234-1234-123456789ab/"]{assert!(profile_root(id).is_err());}}
 #[test]fn stores_are_isolated_and_reloaded_after_cache_clear(){let stores=Profiled::new("value",|path|Mutex::new(path));let a=stores.at(Path::new("/profile-a"));let b=stores.at(Path::new("/profile-b"));assert!(!Arc::ptr_eq(&a,&b));assert_eq!(*a.lock().unwrap(),Path::new("/profile-a/value"));assert!(Arc::ptr_eq(&a,&stores.at(Path::new("/profile-a"))));stores.clear_cache();assert!(!Arc::ptr_eq(&a,&stores.at(Path::new("/profile-a"))));}
}
