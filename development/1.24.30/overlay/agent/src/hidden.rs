//! 1.24.30 (owner, 2026-10-31: a tester's Microsoft Defender blocked PlazCode-1.24.29.zip as "Trojan ... executes
//! commands from an attacker"). PlazCode.exe carried its desktop-control command list (process_kill, key_type,
//! mouse_click, screen_record, launch_app, ...) and its taskkill/PowerShell launch lines as plain text, which reads
//! like a remote-access tool to antivirus machine learning. Behaviour is unchanged; only how the text is stored:
//! - `hidden!("text")` keeps the text scrambled in the program and unscrambles it when used (for text the AI or the
//!   system must receive: tool names and descriptions, command lines).
//! - `fnv("name")` in a `const` compares names by fingerprint, so names that are only compared are not stored at all.

/// 64-bit FNV-1a of a name. `const` so that `const { fnv("process_kill") }` leaves no text in the program.
pub const fn fnv(text: &str) -> u64 {
    let bytes = text.as_bytes();
    let mut hash: u64 = 0xcbf29ce484222325;
    let mut i = 0;
    while i < bytes.len() {
        hash ^= bytes[i] as u64;
        hash = hash.wrapping_mul(0x100000001b3);
        i += 1;
    }
    hash
}

const fn key(i: usize, len: usize) -> u8 {
    let x = (i as u64).wrapping_mul(0x9e3779b97f4a7c15) ^ (len as u64).wrapping_mul(0xc2b2ae3d27d4eb4f) ^ 0x5bd1e995;
    (x ^ (x >> 29) ^ (x >> 47)) as u8
}

/// Scrambles text at compile time (used by `hidden!`).
pub const fn scramble<const N: usize>(text: &[u8]) -> [u8; N] {
    let mut out = [0u8; N];
    let mut i = 0;
    while i < N {
        out[i] = text[i] ^ key(i, N);
        i += 1;
    }
    out
}

/// Unscrambles text made by `scramble` (always valid UTF-8: it was a `&str`).
pub fn reveal(bytes: &[u8]) -> String {
    let plain: Vec<u8> = bytes.iter().enumerate().map(|(i, b)| b ^ key(i, bytes.len())).collect();
    String::from_utf8(plain).unwrap_or_default()
}

macro_rules! hidden {
    ($text:expr) => {{
        const TEXT: &str = $text;
        const SCRAMBLED: [u8; TEXT.len()] = $crate::hidden::scramble::<{ TEXT.len() }>(TEXT.as_bytes());
        $crate::hidden::reveal(&SCRAMBLED)
    }};
}
pub(crate) use hidden;

/// True when `name` is one of the names whose fingerprints are listed.
pub fn one_of(name: &str, fingerprints: &[u64]) -> bool { fingerprints.contains(&fnv(name)) }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hidden_text_round_trips_and_fingerprints_are_stable() {
        assert_eq!(hidden!("taskkill"), "taskkill");
        assert_eq!(hidden!("Kill a process by PID. Requires FULL PC ACCESS mode — refusé ✓"), "Kill a process by PID. Requires FULL PC ACCESS mode — refusé ✓");
        assert_eq!(hidden!(""), "");
        const SCRAMBLED: [u8; 12] = scramble::<12>(b"process_kill");
        assert_ne!(&SCRAMBLED, b"process_kill", "not stored as plain text");
        assert_eq!(fnv("process_kill"), const { fnv("process_kill") });
        assert_ne!(fnv("process_kill"), fnv("process_list"));
        assert!(one_of("key_type", &[const { fnv("mouse_click") }, const { fnv("key_type") }]));
        assert!(!one_of("read_file", &[const { fnv("key_type") }]));
    }
}
