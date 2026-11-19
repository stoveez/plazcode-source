use std::sync::Mutex;

/// OS backend that holds or releases a system-sleep inhibition while a PlazCode run is active.
pub trait PowerBackend: Send {
    fn set_awake(&mut self, awake: bool);
}

#[cfg(windows)]
pub struct OsPowerBackend {
    tx: Option<std::sync::mpsc::Sender<bool>>,
    handle: Option<std::thread::JoinHandle<()>>,
}

#[cfg(windows)]
impl OsPowerBackend {
    pub fn new() -> Self {
        Self { tx: None, handle: None }
    }

    fn ensure_thread(&mut self) -> Option<&std::sync::mpsc::Sender<bool>> {
        if self.tx.is_none() {
            const ES_CONTINUOUS: u32 = 0x8000_0000;
            const ES_SYSTEM_REQUIRED: u32 = 0x0000_0001;
            extern "system" {
                fn SetThreadExecutionState(es_flags: u32) -> u32;
            }
            let (tx, rx) = std::sync::mpsc::channel::<bool>();
            if let Ok(handle) = std::thread::Builder::new()
                .name("plazcode-keep-awake".into())
                .spawn(move || {
                    let mut held = false;
                    while let Ok(want) = rx.recv() {
                        if want == held {
                            continue;
                        }
                        let flags = if want { ES_CONTINUOUS | ES_SYSTEM_REQUIRED } else { ES_CONTINUOUS };
                        // Safety: SetThreadExecutionState is a pure kernel32 flag setter scoped to this thread.
                        unsafe {
                            SetThreadExecutionState(flags);
                        }
                        held = want;
                    }
                    if held {
                        unsafe {
                            SetThreadExecutionState(ES_CONTINUOUS);
                        }
                    }
                })
            {
                self.tx = Some(tx);
                self.handle = Some(handle);
            }
        }
        self.tx.as_ref()
    }
}

#[cfg(windows)]
impl PowerBackend for OsPowerBackend {
    fn set_awake(&mut self, awake: bool) {
        if !awake && self.tx.is_none() {
            return;
        }
        if let Some(tx) = self.ensure_thread() {
            let _ = tx.send(awake);
        }
    }
}

#[cfg(windows)]
impl Drop for OsPowerBackend {
    fn drop(&mut self) {
        if let Some(tx) = self.tx.take() {
            let _ = tx.send(false);
        }
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

#[cfg(target_os = "macos")]
pub struct OsPowerBackend {
    child: Option<std::process::Child>,
}

#[cfg(target_os = "macos")]
impl OsPowerBackend {
    pub fn new() -> Self {
        Self { child: None }
    }

    fn stop_child(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[cfg(target_os = "macos")]
impl PowerBackend for OsPowerBackend {
    fn set_awake(&mut self, awake: bool) {
        if awake {
            if let Some(child) = self.child.as_mut() {
                if matches!(child.try_wait(), Ok(None)) {
                    return;
                }
            }
            self.stop_child();
            let pid = std::process::id().to_string();
            if let Ok(child) = std::process::Command::new("/usr/bin/caffeinate")
                .args(["-i", "-w", &pid])
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn()
            {
                self.child = Some(child);
            }
        } else {
            self.stop_child();
        }
    }
}

#[cfg(target_os = "macos")]
impl Drop for OsPowerBackend {
    fn drop(&mut self) {
        self.stop_child();
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
pub struct OsPowerBackend;

#[cfg(not(any(windows, target_os = "macos")))]
impl OsPowerBackend {
    pub fn new() -> Self {
        Self
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
impl PowerBackend for OsPowerBackend {
    fn set_awake(&mut self, _awake: bool) {}
}

struct Inner<B: PowerBackend> {
    enabled: bool,
    busy: bool,
    engaged: bool,
    backend: B,
}

impl<B: PowerBackend> Inner<B> {
    fn sync(&mut self) {
        let want = self.enabled && self.busy;
        if want != self.engaged {
            self.backend.set_awake(want);
            self.engaged = want;
        }
    }
}

impl<B: PowerBackend> Drop for Inner<B> {
    fn drop(&mut self) {
        if self.engaged {
            self.backend.set_awake(false);
            self.engaged = false;
        }
    }
}

/// Prevents the computer from sleeping while a PlazCode run is active (when opted in).
pub struct KeepAwake<B: PowerBackend = OsPowerBackend> {
    inner: Mutex<Inner<B>>,
}

impl KeepAwake<OsPowerBackend> {
    pub fn new(enabled: bool) -> Self {
        Self::with_backend(enabled, OsPowerBackend::new())
    }
}

impl<B: PowerBackend> KeepAwake<B> {
    pub fn with_backend(enabled: bool, backend: B) -> Self {
        Self {
            inner: Mutex::new(Inner { enabled, busy: false, engaged: false, backend }),
        }
    }

    pub fn update(&self, enabled: bool, busy: bool) -> bool {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        inner.enabled = enabled;
        inner.busy = busy;
        inner.sync();
        inner.engaged
    }

    #[cfg(test)]
    pub fn is_engaged(&self) -> bool {
        self.inner.lock().unwrap_or_else(|e| e.into_inner()).engaged
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex as StdMutex};

    #[derive(Clone, Default)]
    struct MockBackend {
        calls: Arc<StdMutex<Vec<bool>>>,
    }

    impl PowerBackend for MockBackend {
        fn set_awake(&mut self, awake: bool) {
            self.calls.lock().unwrap().push(awake);
        }
    }

    #[test]
    fn disabled_by_default_never_engages_when_busy() {
        let mock = MockBackend::default();
        let calls = mock.calls.clone();
        let ctrl = KeepAwake::with_backend(false, mock);
        assert!(!ctrl.update(false, true));
        assert!(!ctrl.is_engaged());
        assert!(calls.lock().unwrap().is_empty());
    }

    #[test]
    fn engages_only_when_enabled_and_busy_and_releases_on_idle_or_toggle_off() {
        let mock = MockBackend::default();
        let calls = mock.calls.clone();
        let ctrl = KeepAwake::with_backend(true, mock);
        assert!(!ctrl.update(true, false));
        assert!(calls.lock().unwrap().is_empty());
        assert!(ctrl.update(true, true));
        assert!(ctrl.update(true, true)); // idempotent: no duplicate backend call
        assert!(!ctrl.update(false, true)); // user turned off mid-run -> releases immediately
        assert!(ctrl.update(true, true));
        assert!(!ctrl.update(true, false)); // run went idle -> releases
        assert_eq!(*calls.lock().unwrap(), vec![true, false, true, false]);
    }

    #[test]
    fn drop_releases_active_keep_awake() {
        let mock = MockBackend::default();
        let calls = mock.calls.clone();
        {
            let ctrl = KeepAwake::with_backend(true, mock);
            assert!(ctrl.update(true, true));
        }
        assert_eq!(*calls.lock().unwrap(), vec![true, false]);
    }
}
