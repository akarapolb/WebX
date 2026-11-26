//! The key control keeps its own secrets under (docs/c4-identity-plan.md, steps 3 and 4): `WEBX_CONTROL_SECRET_KEY`, base64 of 32
//! random bytes (`webx-control keygen` prints one; use another than the signing key's). Two keys are derived from it, one per use,
//! so nothing made for one purpose can be taken for the other:
//!  - an AES-256-GCM key for what control has to read back: a workspace provider's client secret (step 3), a person's authenticator
//!    secret (step 4). Each value is sealed together with what it belongs to (`client-secret:dga`, as associated data), so a value
//!    copied into another row does not open there.
//!  - an HMAC-SHA-256 key for what control only has to recognise, never read back: recovery codes (step 4).
//! Without the variable nothing that needs it can be stored or read (those routes say so), and nothing else changes.
use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD, engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

/// the first part of every sealed value, so a later format (or key) can be told apart
const VERSION: &str = "v1";
const IV_LEN: usize = 12;
const TAG_LEN: usize = 16;

pub struct SecretKey {
    cipher: Aes256Gcm,
    mac: [u8; 32],
}

/// HMAC-SHA-256 of `msg` under `key`.
pub fn hmac_sha256(key: &[u8], msg: &[u8]) -> [u8; 32] {
    let mut m = <HmacSha256 as Mac>::new_from_slice(key).expect("HMAC takes a key of any length");
    m.update(msg);
    m.finalize().into_bytes().into()
}

/// Equal, in a time that does not depend on where two values of the same length first differ.
pub fn same(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

impl SecretKey {
    /// From the variable's value: base64 that decodes to exactly 32 bytes.
    pub fn from_base64(raw: &str) -> Result<SecretKey, String> {
        let master = STANDARD.decode(raw.trim()).map_err(|_| "WEBX_CONTROL_SECRET_KEY is not base64".to_string())?;
        if master.len() != 32 {
            return Err("WEBX_CONTROL_SECRET_KEY must decode (base64) to exactly 32 bytes".into());
        }
        let enc = hmac_sha256(&master, b"webx-control/seal/v1");
        Ok(SecretKey { cipher: Aes256Gcm::new_from_slice(&enc).map_err(|e| e.to_string())?, mac: hmac_sha256(&master, b"webx-control/recognise/v1") })
    }

    /// `plain` sealed for `context` (what it belongs to, such as `client-secret:dga`): `v1.<iv>.<ciphertext and tag>`, base64url.
    pub fn seal(&self, context: &str, plain: &str) -> Result<String, String> {
        let mut iv = [0u8; IV_LEN];
        getrandom::getrandom(&mut iv).map_err(|e| e.to_string())?;
        let sealed = self.cipher.encrypt(Nonce::from_slice(&iv), Payload { msg: plain.as_bytes(), aad: context.as_bytes() }).map_err(|_| "encryption failed".to_string())?;
        Ok(format!("{VERSION}.{}.{}", B64.encode(iv), B64.encode(sealed)))
    }

    /// What was sealed for `context`. An error when the value is damaged, was sealed for something else, or under another key.
    pub fn open(&self, context: &str, sealed: &str) -> Result<String, String> {
        let not_sealed = || "not a sealed value".to_string();
        let mut parts = sealed.split('.');
        let (Some(VERSION), Some(iv), Some(ct), None) = (parts.next(), parts.next(), parts.next(), parts.next()) else { return Err(not_sealed()) };
        let (iv, ct) = (B64.decode(iv).map_err(|_| not_sealed())?, B64.decode(ct).map_err(|_| not_sealed())?);
        if iv.len() != IV_LEN || ct.len() < TAG_LEN {
            return Err(not_sealed());
        }
        let plain = self.cipher.decrypt(Nonce::from_slice(&iv), Payload { msg: &ct, aad: context.as_bytes() }).map_err(|_| "the value was sealed under another key, or for something else".to_string())?;
        String::from_utf8(plain).map_err(|_| "the sealed value is not text".to_string())
    }

    /// A tag that recognises `value` for `context` and tells nothing about it: HMAC-SHA-256 under the derived key, base64url.
    pub fn tag(&self, context: &str, value: &str) -> String {
        let mut msg = Vec::with_capacity(context.len() + 1 + value.len());
        msg.extend_from_slice(context.as_bytes());
        msg.push(0);
        msg.extend_from_slice(value.as_bytes());
        B64.encode(hmac_sha256(&self.mac, &msg))
    }

    /// Whether `tag` is the tag of `value` for `context`.
    pub fn recognises(&self, context: &str, value: &str, tag: &str) -> bool {
        same(self.tag(context, value).as_bytes(), tag.as_bytes())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn key(b: u8) -> SecretKey {
        SecretKey::from_base64(&STANDARD.encode([b; 32])).unwrap()
    }

    #[test]
    fn hmac_matches_rfc_4231() {
        // test case 2: key "Jefe", data "what do ya want for nothing?"
        let hex: String = hmac_sha256(b"Jefe", b"what do ya want for nothing?").iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(hex, "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
    }

    #[test]
    fn the_key_must_be_32_bytes_of_base64() {
        assert!(SecretKey::from_base64("not base64!").is_err());
        assert!(SecretKey::from_base64(&STANDARD.encode([1u8; 16])).is_err());
        assert!(SecretKey::from_base64(&STANDARD.encode([1u8; 32])).is_ok());
    }

    #[test]
    fn a_sealed_value_opens_only_for_its_own_context_and_key() {
        let k = key(1);
        let s = k.seal("client-secret:dga", "s3cret").unwrap();
        assert!(s.starts_with("v1.") && !s.contains("s3cret"));
        assert_eq!(k.open("client-secret:dga", &s).unwrap(), "s3cret");
        // copied into another workspace's row, it does not open
        assert!(k.open("client-secret:pea", &s).is_err());
        // nor under another key
        assert!(key(2).open("client-secret:dga", &s).is_err());
        // two seals of one value differ (a fresh IV each time)
        assert_ne!(s, k.seal("client-secret:dga", "s3cret").unwrap());
    }

    #[test]
    fn a_damaged_or_foreign_value_is_refused() {
        let k = key(1);
        let s = k.seal("x", "value").unwrap();
        let mut b = s.clone().into_bytes();
        let i = b.len() - 3;
        b[i] = if b[i] == b'A' { b'B' } else { b'A' };
        assert!(k.open("x", &String::from_utf8(b).unwrap()).is_err());
        for bad in ["", "v1", "v1..", "v2.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA", "v1.AAAA.AAAAAAAAAAAAAAAAAAAAAA", "a.b.c.d", "uWOS7y4+yzsKaLoe.isMYWE0h1XcUW0CwkM/CKc0RWQ==.09vkzS3qO7+A/Wk1z38aiw=="] {
            assert!(k.open("x", bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn tags_recognise_a_value_for_its_context_only() {
        let k = key(1);
        let t = k.tag("recovery:7", "ABCDE12345");
        assert!(k.recognises("recovery:7", "ABCDE12345", &t));
        assert!(!k.recognises("recovery:8", "ABCDE12345", &t));
        assert!(!k.recognises("recovery:7", "ABCDE12346", &t));
        assert!(!key(2).recognises("recovery:7", "ABCDE12345", &t));
        // the two derived keys differ: a tag is not the seal key's output
        assert_ne!(k.tag("a", "b"), key(1).tag("a", "c"));
    }

    #[test]
    fn same_compares_whole_values() {
        assert!(same(b"abc", b"abc"));
        assert!(!same(b"abc", b"abd"));
        assert!(!same(b"abc", b"ab"));
        assert!(same(b"", b""));
    }
}
