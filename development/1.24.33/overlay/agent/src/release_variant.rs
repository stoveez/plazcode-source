//! Release-specific constants. Not a promise of unbreakable local protection.
use sha2::{Digest,Sha256};

const fn nibble(byte:u8)->u8 {match byte {b'0'..=b'9'=>byte-b'0',b'a'..=b'f'=>byte-b'a'+10,_=>panic!("Invalid release variant")}}
const fn decode(text:&str)->[u8;32] {
    assert!(text.len()==64,"Invalid release variant length");
    let bytes=text.as_bytes();let mut seed=[0;32];let mut i=0;
    while i<32 {seed[i]=(nibble(bytes[i*2])<<4)|nibble(bytes[i*2+1]);i+=1;}seed
}
pub const SEED:[u8;32]=decode(match option_env!("PLAZCODE_RELEASE_VARIANT") {Some(value)=>value,None=>"0000000000000000000000000000000000000000000000000000000000000000"});
pub const fn seed64(seed:&[u8;32])->u64 {let mut value=0;let mut i=0;while i<8 {value|=(seed[i] as u64)<<(i*8);i+=1;}value}
pub fn digest(domain:&str,version:&str,seed:&[u8;32])->[u8;32] {
    let mut hash=Sha256::new();hash.update(domain.as_bytes());hash.update(b"\n");hash.update(seed);hash.update(version.as_bytes());hash.finalize().into()
}
pub fn info_for(version:&str,seed:&[u8;32])->serde_json::Value {
    let mark=digest("PlazCode release mark v1",version,seed);
    serde_json::json!({"schema":1,"seed_sha256":format!("{:x}",Sha256::digest(seed)),"mark":mark[..8].iter().map(|b|format!("{b:02x}")).collect::<String>(),"layout":seed[0]%3})
}
pub fn info()->serde_json::Value {info_for(env!("CARGO_PKG_VERSION"),&SEED)}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn marks_are_stable_and_release_specific(){
        assert_eq!(info_for("1.24.33",&[1;32]),info_for("1.24.33",&[1;32]));
        assert_ne!(info_for("1.24.33",&[1;32])["mark"],info_for("1.24.34",&[1;32])["mark"]);
        assert_ne!(info_for("1.24.33",&[1;32])["mark"],info_for("1.24.33",&[2;32])["mark"]);
    }
}
