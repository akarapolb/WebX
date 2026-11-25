//! Personal data at rest (docs/target-architecture.md, track C5, decisions D6 and D12): the name, e-mail and phone a visitor
//! gives on a form are stored encrypted (PDPA), as Strapi stores them. A port of strapi-cms/src/utils/pii-crypto.ts, in the
//! same format on purpose: AES-256-GCM, a fresh 96-bit IV each time, `base64(iv).base64(ciphertext).base64(tag)`. With the
//! same key (WEBX_PII_KEY here, PII_ENCRYPTION_KEY there) a row moved from Strapi needs no re-encryption.
//!
//! Two differences from Strapi, both on purpose:
//!  - What a visitor or an editor sends is ALWAYS encrypted. Strapi skips a value that merely looks encrypted (three
//!    base64 parts), so a name such as "AAAA.AAAA.AAAA" was stored as plain text and then made every read of the list fail
//!    when it was decrypted. Only an import (a migration) keeps a value that really decrypts under this key.
//!  - A value that cannot be decrypted is an error naming the field, never an empty string (as Strapi's own comment demands).
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::{Map, Value};

pub struct Pii(Aes256Gcm);

const IV_LEN: usize = 12;
const TAG_LEN: usize = 16;

impl Pii {
    /// From a base64 key that decodes to exactly 32 bytes.
    pub fn from_base64(raw: &str) -> Result<Pii, String> {
        let key = B64.decode(raw.trim()).map_err(|_| "the PII key is not base64".to_string())?;
        if key.len() != 32 {
            return Err("the PII key must decode (base64) to exactly 32 bytes".into());
        }
        Aes256Gcm::new_from_slice(&key).map(Pii).map_err(|e| e.to_string())
    }

    pub fn encrypt(&self, plaintext: &str) -> Result<String, String> {
        let mut iv = [0u8; IV_LEN];
        getrandom::getrandom(&mut iv).map_err(|e| e.to_string())?;
        // aes-gcm appends the 16-byte tag to the ciphertext; Strapi's format keeps the three apart
        let sealed = self.0.encrypt(Nonce::from_slice(&iv), plaintext.as_bytes()).map_err(|_| "encryption failed".to_string())?;
        let (ct, tag) = sealed.split_at(sealed.len() - TAG_LEN);
        Ok(format!("{}.{}.{}", B64.encode(iv), B64.encode(ct), B64.encode(tag)))
    }

    /// Errors when the payload is malformed or its tag does not verify (the data was changed, or the key is wrong or has
    /// been rotated).
    pub fn decrypt(&self, payload: &str) -> Result<String, String> {
        let mut parts = payload.split('.');
        let (Some(iv), Some(ct), Some(tag), None) = (parts.next(), parts.next(), parts.next(), parts.next()) else {
            return Err("malformed encrypted value".into());
        };
        let (iv, mut ct, tag) = (
            B64.decode(iv).map_err(|_| "malformed encrypted value")?,
            B64.decode(ct).map_err(|_| "malformed encrypted value")?,
            B64.decode(tag).map_err(|_| "malformed encrypted value")?,
        );
        if iv.len() != IV_LEN || tag.len() != TAG_LEN || ct.is_empty() {
            return Err("malformed encrypted value".into());
        }
        ct.extend_from_slice(&tag);
        let plain = self.0.decrypt(Nonce::from_slice(&iv), ct.as_slice()).map_err(|_| "wrong key or damaged value".to_string())?;
        String::from_utf8(plain).map_err(|_| "decrypted value is not text".to_string())
    }

    /// Whether `v` is something this key encrypted.
    pub fn is_valid_ciphertext(&self, v: &str) -> bool {
        looks_encrypted(v) && self.decrypt(v).is_ok()
    }
}

/// Three non-empty base64 parts separated by dots (what `encrypt` writes).
pub fn looks_encrypted(v: &str) -> bool {
    let parts: Vec<&str> = v.split('.').collect();
    parts.len() == 3 && parts.iter().all(|p| !p.is_empty() && p.trim_end_matches('=').bytes().all(|b| b.is_ascii_alphanumeric() || b == b'+' || b == b'/') && p.bytes().filter(|&b| b == b'=').count() <= 2)
}

/// The fields of a collection that hold personal data (empty for a collection that holds none).
pub fn fields_of(collection: &str) -> &'static [&'static str] {
    match collection {
        "complaint" | "application" | "contact-message" => &["name", "email", "phone"],
        "registration" => &["email", "firstname", "lastname", "phone"],
        _ => &[],
    }
}

/// Encrypt the personal-data fields of a document that are non-empty text. With `keep_valid` (an import) a value that already
/// decrypts under this key is left as it is; otherwise (a visitor's or an editor's input) every one is encrypted.
pub fn seal(p: &Pii, collection: &str, doc: &mut Map<String, Value>, keep_valid: bool) -> Result<(), String> {
    for f in fields_of(collection) {
        if let Some(Value::String(s)) = doc.get(*f) {
            if s.is_empty() || (keep_valid && p.is_valid_ciphertext(s)) {
                continue;
            }
            let sealed = p.encrypt(s)?;
            doc.insert((*f).to_string(), Value::String(sealed));
        }
    }
    Ok(())
}

/// Decrypt the personal-data fields of a stored row in place. A value that is not ciphertext at all (a row from before
/// encryption existed, which an import leaves alone) is returned as it is; one that looks like ciphertext and does not
/// decrypt is an error naming the field.
pub fn open(p: &Pii, collection: &str, row: &mut Value) -> Result<(), String> {
    let Some(obj) = row.as_object_mut() else { return Ok(()) };
    for f in fields_of(collection) {
        if let Some(Value::String(s)) = obj.get(*f) {
            if looks_encrypted(s) {
                let plain = p.decrypt(s).map_err(|m| format!("{f}: {m}"))?;
                obj.insert((*f).to_string(), Value::String(plain));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // Strapi's own key from its CI: 0123456789abcdef0123456789abcdef (32 bytes), base64
    const KEY: &str = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
    fn pii() -> Pii {
        Pii::from_base64(KEY).unwrap()
    }

    #[test]
    fn a_value_round_trips_in_strapis_three_part_format() {
        let p = pii();
        let sealed = p.encrypt("สมชาย ใจดี").unwrap();
        assert!(looks_encrypted(&sealed));
        assert_eq!(sealed.split('.').count(), 3);
        assert_eq!(p.decrypt(&sealed).unwrap(), "สมชาย ใจดี");
        assert_ne!(sealed, p.encrypt("สมชาย ใจดี").unwrap(), "a fresh IV each time");
        assert_eq!(B64.decode(sealed.split('.').next().unwrap()).unwrap().len(), 12, "a 96-bit IV");
        assert_eq!(B64.decode(sealed.split('.').nth(2).unwrap()).unwrap().len(), 16, "a 128-bit tag, apart from the ciphertext");
    }

    #[test]
    fn values_made_by_strapis_node_code_decrypt() {
        // Made with Node's crypto the way strapi-cms/src/utils/pii-crypto.ts makes them (aes-256-gcm, 12-byte IV,
        // iv.ciphertext.tag in base64) under KEY: decrypting them is the proof that a row moved from Strapi needs no
        // re-encryption.
        let p = pii();
        assert_eq!(p.decrypt("uWOS7y4+yzsKaLoe.isMYWE0h1XcUW0CwkM/CKc0RWQ==.09vkzS3qO7+A/Wk1z38aiw==").unwrap(), "somchai@example.com");
        assert_eq!(p.decrypt("vPbVUlJIsjai/WAC.993Ts86WVXmruBOExEO2tBhDq8/j5eMUSCrslQ==.eOUOEWrkJKYK/AHAgDfVPg==").unwrap(), "สมชาย ใจดี");
        assert!(p.is_valid_ciphertext("uWOS7y4+yzsKaLoe.isMYWE0h1XcUW0CwkM/CKc0RWQ==.09vkzS3qO7+A/Wk1z38aiw=="));
    }

    #[test]
    fn a_wrong_key_or_a_changed_value_is_an_error_not_an_empty_string() {
        let p = pii();
        let other = Pii::from_base64(&B64.encode([7u8; 32])).unwrap();
        let sealed = p.encrypt("secret").unwrap();
        assert!(other.decrypt(&sealed).unwrap_err().contains("wrong key or damaged"));
        let mut parts: Vec<String> = sealed.split('.').map(str::to_string).collect();
        parts[1] = B64.encode(b"tampered");
        assert!(p.decrypt(&parts.join(".")).is_err());
        for bad in ["", "a", "a.b", "a.b.c.d", "!!!.???.***", "AAAA.AAAA.AAAA"] {
            assert!(p.decrypt(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn keys_must_be_32_bytes_of_base64() {
        assert!(Pii::from_base64(KEY).is_ok());
        assert!(Pii::from_base64("not base64!").is_err());
        assert!(Pii::from_base64(&B64.encode([1u8; 16])).is_err());
        assert!(Pii::from_base64(&B64.encode([1u8; 33])).is_err());
    }

    #[test]
    fn what_looks_encrypted() {
        assert!(looks_encrypted("AAAA.BBBB.CCCC"));
        assert!(looks_encrypted("AA==.BB=.CCCC"));
        assert!(!looks_encrypted("somchai@example.com"));
        assert!(!looks_encrypted("a.b"));
        assert!(!looks_encrypted("a..c"));
        assert!(!looks_encrypted("Mr. Smith. Jr"));
    }

    #[test]
    fn input_is_always_sealed_even_when_it_looks_like_ciphertext() {
        let p = pii();
        let mut doc = json!({"name": "AAAA.AAAA.AAAA", "email": "a@b.co", "phone": "", "subject": "keep"}).as_object().unwrap().clone();
        seal(&p, "complaint", &mut doc, false).unwrap();
        assert_ne!(doc["name"], "AAAA.AAAA.AAAA", "a value that only looks encrypted is still encrypted, so it cannot poison a later read");
        assert_eq!(p.decrypt(doc["name"].as_str().unwrap()).unwrap(), "AAAA.AAAA.AAAA");
        assert_eq!(p.decrypt(doc["email"].as_str().unwrap()).unwrap(), "a@b.co");
        assert_eq!(doc["phone"], "", "an empty value stays empty");
        assert_eq!(doc["subject"], "keep", "only the personal-data fields");
        let mut row = Value::Object(doc);
        open(&p, "complaint", &mut row).unwrap();
        assert_eq!((row["name"].as_str(), row["email"].as_str()), (Some("AAAA.AAAA.AAAA"), Some("a@b.co")));
    }

    #[test]
    fn an_import_keeps_ciphertext_that_decrypts_and_encrypts_plain_text() {
        let p = pii();
        let already = p.encrypt("x@y.z").unwrap();
        let mut doc = json!({"name": "Plain Name", "email": already.clone(), "phone": "AAAA.AAAA.AAAA"}).as_object().unwrap().clone();
        seal(&p, "complaint", &mut doc, true).unwrap();
        assert_eq!(doc["email"], Value::String(already), "valid ciphertext is kept");
        assert!(looks_encrypted(doc["name"].as_str().unwrap()) && p.decrypt(doc["name"].as_str().unwrap()).unwrap() == "Plain Name", "plain text from before encryption existed is encrypted");
        assert_eq!(p.decrypt(doc["phone"].as_str().unwrap()).unwrap(), "AAAA.AAAA.AAAA", "a look-alike is encrypted, not trusted");
    }

    #[test]
    fn opening_leaves_old_plain_rows_and_other_fields_alone_and_names_a_field_it_cannot_read() {
        let p = pii();
        let mut old = json!({"name": "Somchai", "email": "s@x.th", "subject": "hello"});
        open(&p, "complaint", &mut old).unwrap();
        assert_eq!(old["name"], "Somchai");
        let mut poisoned = json!({"name": "AAAA.AAAA.AAAA"});
        assert!(open(&p, "complaint", &mut poisoned).unwrap_err().starts_with("name: "));
        let mut other = json!({"name": p.encrypt("n").unwrap()});
        open(&p, "page-template", &mut other).unwrap();
        assert!(looks_encrypted(other["name"].as_str().unwrap()), "a collection with no personal data is left as it is");
    }

    #[test]
    fn each_form_collection_names_its_personal_data() {
        assert_eq!(fields_of("complaint"), ["name", "email", "phone"]);
        assert_eq!(fields_of("application"), ["name", "email", "phone"]);
        assert_eq!(fields_of("contact-message"), ["name", "email", "phone"]);
        assert_eq!(fields_of("registration"), ["email", "firstname", "lastname", "phone"]);
        assert!(fields_of("consent-log").is_empty() && fields_of("page-template").is_empty());
    }
}
